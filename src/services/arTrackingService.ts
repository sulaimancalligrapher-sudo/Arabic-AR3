/**
 * Unified AR Tracking Service
 * Direct camera streaming + MediaPipe Hands + MediaPipe FaceMesh
 */

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface SingleHandData {
  index: number;
  cursor: { x: number; y: number }; // Raw normalized [0, 1]
  isPinching: boolean;
  pinchDistance: number;
  landmarks: HandLandmark[]; // Raw normalized [0, 1]
  handedness: 'Right' | 'Left';
}

export interface FaceData {
  detected: boolean;
  headTop: { x: number; y: number }; // Landmark 10 (raw normalized [0, 1])
  forehead: { x: number; y: number }; // Landmark 151
  leftEar: { x: number; y: number }; // Landmark 234
  rightEar: { x: number; y: number }; // Landmark 454
  headWidth: number; // In raw normalized units
  tiltAngle: number; // In radians
}

export interface ARTrackingState {
  hands: SingleHandData[];
  face: FaceData | null;
  cursor: { x: number; y: number } | null;
  isPinching: boolean;
  videoWidth: number;
  videoHeight: number;
  fps: number;
}

export type ARTrackingCallback = (state: ARTrackingState) => void;

class ARTrackingService {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;

  private handsInstance: any = null;
  private faceMeshInstance: any = null;

  private facingMode: 'user' | 'environment' = 'user';
  private isMirrored: boolean = true;
  private trackFace: boolean = true;
  private trackHands: boolean = true;

  private listeners: Set<ARTrackingCallback> = new Set();
  private smoothedCursor = { x: 0.5, y: 0.5 };
  private hasInitialCursor: boolean = false;
  private activeDrawingHand: SingleHandData | null = null;
  private lastTimestamp: number = 0;
  private currentFps: number = 0;

  private latestHands: SingleHandData[] = [];
  private latestFace: FaceData | null = null;

  // Stability & anti-false-draw tracking states
  private previousPinchMap: Map<number, boolean> = new Map();
  private handPresenceMap: Map<number, {
    stableFrames: number;
    hasSeenOpen: boolean;
    pinchFrames: number;
    releaseFrames: number;
  }> = new Map();
  private missedHandFrames: number = 0;
  private readonly MAX_MISSED_HAND_FRAMES = 5;

  public setMirrored(mirrored: boolean) {
    this.isMirrored = mirrored;
  }

  public getIsMirrored(): boolean {
    return this.isMirrored;
  }

  public setTrackFace(enabled: boolean) {
    this.trackFace = enabled;
    if (!enabled) this.latestFace = null;
  }

  public setTrackHands(enabled: boolean) {
    this.trackHands = enabled;
    if (!enabled) this.latestHands = [];
  }

  private async ensureScript(src: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (document.querySelector(`script[src="${src}"]`)) return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(true);
      script.onerror = () => {
        console.warn(`Could not load script ${src}`);
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  private isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      /Android|iPhone|iPad|iPod|Tablet/i.test(navigator.userAgent) ||
      (Boolean(navigator.maxTouchPoints) && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024)
    );
  }

  public async initMediaPipe(): Promise<void> {
    try {
      await Promise.all([
        this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
        this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'),
        this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'),
      ]);

      const isMobile = this.isMobileDevice();

      if ((window as any).Hands && !this.handsInstance) {
        const HandsClass = (window as any).Hands;
        this.handsInstance = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        this.handsInstance.setOptions({
          maxNumHands: 2,
          modelComplexity: isMobile ? 0 : 1, // modelComplexity 0 (Lite) is 3x faster and designed for mobile GPUs
          minDetectionConfidence: 0.74, // Raised from 0.50 to eliminate phantom hands on face/clothing
          minTrackingConfidence: 0.72
        });
        this.handsInstance.onResults(this.onHandsResults.bind(this));
      }

      if ((window as any).FaceMesh && !this.faceMeshInstance) {
        const FaceMeshClass = (window as any).FaceMesh;
        this.faceMeshInstance = new FaceMeshClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        this.faceMeshInstance.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        this.faceMeshInstance.onResults(this.onFaceMeshResults.bind(this));
      }
    } catch (err) {
      console.warn('MediaPipe initialization notice:', err);
    }
  }

  public async start(
    videoElement: HTMLVideoElement,
    facingMode: 'user' | 'environment' = 'user',
    isMirrored: boolean = true,
    onUpdateCallback?: ARTrackingCallback
  ): Promise<boolean> {
    if (onUpdateCallback) {
      this.listeners.add(onUpdateCallback);
    }

    this.videoElement = videoElement;
    this.facingMode = facingMode;
    this.isMirrored = isMirrored;

    this.stopCameraStreamOnly();
    this.resetHandTrackingState();

    try {
      let stream: MediaStream | null = null;
      const isMobile = this.isMobileDevice();

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: this.facingMode,
            // 640x480 on mobile cuts memory bandwidth and GPU load drastically, eliminating tracking lag
            width: { ideal: isMobile ? 640 : 1280 },
            height: { ideal: isMobile ? 480 : 720 }
          },
          audio: false
        });
      } catch (err) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      this.stream = stream;
      videoElement.srcObject = stream;
      videoElement.playsInline = true;
      videoElement.muted = true;
      await videoElement.play();

      this.isRunning = true;
      this.startProcessingLoop();
      this.initMediaPipe();

      return true;
    } catch (err) {
      console.error('Camera start failed:', err);
      return false;
    }
  }

  private resetHandTrackingState() {
    this.latestHands = [];
    this.activeDrawingHand = null;
    this.hasInitialCursor = false;
    this.previousPinchMap.clear();
    this.handPresenceMap.clear();
    this.missedHandFrames = 0;
  }

  private startProcessingLoop() {
    let lastHandProcess = 0;
    let lastFaceProcess = 0;

    const loop = async (timestamp: number) => {
      if (!this.isRunning || !this.videoElement) return;

      if (this.videoElement.readyState >= 2) {
        const isMobile = this.isMobileDevice();
        // Hands tracking interval: full frame rate
        const handInterval = isMobile ? 25 : 30;
        // Face tracking interval (Crown): on mobile, run at ~6-7 FPS to free GPU/CPU for finger tracing
        const faceInterval = isMobile ? 150 : 45;

        if (this.trackHands && this.handsInstance && timestamp - lastHandProcess >= handInterval) {
          lastHandProcess = timestamp;
          try {
            await this.handsInstance.send({ image: this.videoElement });
          } catch {}
        }

        if (this.trackFace && this.faceMeshInstance && timestamp - lastFaceProcess >= faceInterval) {
          lastFaceProcess = timestamp;
          try {
            await this.faceMeshInstance.send({ image: this.videoElement });
          } catch {}
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private onHandsResults(results: any) {
    const now = performance.now();
    if (this.lastTimestamp) {
      this.currentFps = Math.round(1000 / (now - this.lastTimestamp));
    }
    this.lastTimestamp = now;

    const rawList: HandLandmark[][] = results.multiHandLandmarks || [];
    const parsedHands: SingleHandData[] = [];

    for (let hIdx = 0; hIdx < rawList.length; hIdx++) {
      // 1. Per-hand classification confidence filter (reject phantom hands < 72%)
      const handednessInfo = results.multiHandedness?.[hIdx];
      if (handednessInfo && typeof handednessInfo.score === 'number' && handednessInfo.score < 0.72) {
        continue;
      }

      const rawLandmarks: HandLandmark[] = rawList[hIdx];
      if (!rawLandmarks || rawLandmarks.length < 21) continue;

      const thumbTip = rawLandmarks[4];
      const indexTip = rawLandmarks[8];
      const wrist = rawLandmarks[0];
      const indexMcp = rawLandmarks[5];
      const middleKnuckle = rawLandmarks[9];

      // 2. Logical palm size filter (reject tiny noise blobs on face/shirt/background)
      const palmLength = Math.hypot(middleKnuckle.x - wrist.x, middleKnuckle.y - wrist.y);
      const knuckleSpan = Math.hypot(middleKnuckle.x - indexMcp.x, middleKnuckle.y - indexMcp.y);
      if (!isFinite(palmLength) || palmLength < 0.055 || palmLength > 0.65 || knuckleSpan < 0.015) {
        continue;
      }

      // 3. Depth-assisted pinch ratio (dampened z reduces false pinch when hand tilts toward camera)
      const dx = thumbTip.x - indexTip.x;
      const dy = thumbTip.y - indexTip.y;
      const dz = ((thumbTip.z || 0) - (indexTip.z || 0)) * 0.35;
      const directDist = Math.hypot(dx, dy, dz);
      const normalizedDistance = directDist / palmLength;

      // 4. Open-before-pinch gate + temporal debounce to eliminate accidental auto-drawing
      const prevPinch = this.previousPinchMap.get(hIdx) || false;
      const presence = this.handPresenceMap.get(hIdx) || {
        stableFrames: 0,
        hasSeenOpen: false,
        pinchFrames: 0,
        releaseFrames: 0
      };

      presence.stableFrames = Math.min(30, presence.stableFrames + 1);

      // Require fingers visibly open at least once (>= 0.27) before any drawing can begin
      if (normalizedDistance >= 0.27) {
        presence.hasSeenOpen = true;
      }

      let isPinching = prevPinch;

      if (!prevPinch) {
        // Trying to start pinching: must be stable (>= 4 frames), opened first, and pinched cleanly (< 0.20) for 2 frames
        if (presence.stableFrames >= 4 && presence.hasSeenOpen && normalizedDistance < 0.20) {
          presence.pinchFrames++;
          if (presence.pinchFrames >= 2) {
            isPinching = true;
            presence.releaseFrames = 0;
          }
        } else {
          presence.pinchFrames = 0;
        }
      } else {
        // Currently drawing: require >= 3 consecutive open frames (> 0.30) to finish stroke (prevents mid-stroke cuts)
        if (normalizedDistance > 0.30) {
          presence.releaseFrames++;
          if (presence.releaseFrames >= 3) {
            isPinching = false;
            presence.pinchFrames = 0;
          }
        } else {
          presence.releaseFrames = 0;
        }
      }

      this.handPresenceMap.set(hIdx, presence);
      this.previousPinchMap.set(hIdx, isPinching);

      let handedness: 'Right' | 'Left' = 'Right';
      if (handednessInfo?.label) {
        handedness = handednessInfo.label as 'Right' | 'Left';
      }

      parsedHands.push({
        index: parsedHands.length,
        cursor: { x: indexTip.x, y: indexTip.y },
        isPinching,
        pinchDistance: normalizedDistance,
        landmarks: rawLandmarks,
        handedness
      });
    }

    if (parsedHands.length === 0) {
      // Grace period buffer (up to 5 frames ~ 150ms) before cutting an active hand/stroke
      if (this.latestHands.length > 0 && this.missedHandFrames < this.MAX_MISSED_HAND_FRAMES) {
        this.missedHandFrames++;
        this.emitUpdate();
        return;
      }

      this.resetHandTrackingState();
      this.emitUpdate();
      return;
    }

    // Valid hand(s) present -> reset missed frame counter & prune unused indices
    this.missedHandFrames = 0;
    for (const key of Array.from(this.handPresenceMap.keys())) {
      if (key >= rawList.length) {
        this.handPresenceMap.delete(key);
        this.previousPinchMap.delete(key);
      }
    }

    this.latestHands = parsedHands;

    // Prioritize the pinching hand (drawing), otherwise prefer right hand or first detected
    const pinchingHand = parsedHands.find(h => h.isPinching);
    const primary = pinchingHand || (parsedHands.length > 1 && parsedHands[1].handedness === 'Right' ? parsedHands[1] : parsedHands[0]);
    this.activeDrawingHand = primary;

    const targetX = primary.cursor.x;
    const targetY = primary.cursor.y;

    const dist = Math.hypot(targetX - this.smoothedCursor.x, targetY - this.smoothedCursor.y);
    if (dist > 0.25 || !this.hasInitialCursor) {
      // Snap cleanly on first entry or genuine hand swap
      this.smoothedCursor.x = targetX;
      this.smoothedCursor.y = targetY;
      this.hasInitialCursor = true;
    } else {
      // Velocity-adaptive smoothing: steady on tiny jitter, fast on sweeping strokes
      const alpha = dist < 0.008 ? 0.35 : dist < 0.06 ? 0.65 : 0.88;
      this.smoothedCursor.x += (targetX - this.smoothedCursor.x) * alpha;
      this.smoothedCursor.y += (targetY - this.smoothedCursor.y) * alpha;
    }

    this.emitUpdate();
  }

  private onFaceMeshResults(results: any) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.latestFace = null;
      this.emitUpdate();
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const ptTop = landmarks[10]; // Hairline / top of head
    const ptForehead = landmarks[151] || landmarks[10];
    const ptLeft = landmarks[234]; // Left ear/temple in raw image
    const ptRight = landmarks[454]; // Right ear/temple in raw image

    if (!ptTop || !ptLeft || !ptRight) return;

    // In raw video space: ptRight.x > ptLeft.x always!
    const dx = ptRight.x - ptLeft.x;
    const dy = ptRight.y - ptLeft.y;
    const headWidth = Math.hypot(dx, dy);
    // Natural head tilt angle in raw image
    const tiltAngle = Math.atan2(dy, dx);

    this.latestFace = {
      detected: true,
      headTop: { x: ptTop.x, y: ptTop.y },
      forehead: { x: ptForehead.x, y: ptForehead.y },
      leftEar: { x: ptLeft.x, y: ptLeft.y },
      rightEar: { x: ptRight.x, y: ptRight.y },
      headWidth,
      tiltAngle
    };

    this.emitUpdate();
  }

  private emitUpdate() {
    const primaryHand = this.latestHands.length > 0 ? (this.activeDrawingHand || this.latestHands[0]) : null;
    const vw = this.videoElement?.videoWidth || 640;
    const vh = this.videoElement?.videoHeight || 480;

    const state: ARTrackingState = {
      hands: this.latestHands,
      face: this.latestFace,
      cursor: (primaryHand && this.hasInitialCursor) ? { x: this.smoothedCursor.x, y: this.smoothedCursor.y } : null,
      isPinching: primaryHand ? primaryHand.isPinching : false,
      videoWidth: vw,
      videoHeight: vh,
      fps: this.currentFps
    };

    this.listeners.forEach(fn => fn(state));
  }

  public subscribe(callback: ARTrackingCallback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private stopCameraStreamOnly() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public stop() {
    this.isRunning = false;
    this.stopCameraStreamOnly();
    this.resetHandTrackingState();
    this.latestFace = null;
  }

  public getIsRunning() {
    return this.isRunning;
  }
}

export const arTrackingService = new ARTrackingService();
