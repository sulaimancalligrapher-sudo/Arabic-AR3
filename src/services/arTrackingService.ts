import { isMobileOrTabletDevice } from '../utils/devicePerformance';

/**
 * Unified AR Tracking Service
 * Direct camera streaming + MediaPipe Hands + MediaPipe FaceMesh
 * Optimized for smooth mobile/tablet performance.
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
  private modelInitPromise: Promise<void> = Promise.resolve();
  private isModelBusy: boolean = false;
  private busySince: number = 0;

  // Lightweight offscreen canvas to downscale video frames before MediaPipe upload on mobile/tablet
  private inferCanvas: HTMLCanvasElement | null = null;
  private inferCtx: CanvasRenderingContext2D | null = null;

  private facingMode: 'user' | 'environment' = 'user';
  private isMirrored: boolean = true;
  private trackFace: boolean = true;
  private trackHands: boolean = true;
  private maxHands: 1 | 2 = 1;

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

  public setMaxHands(count: 1 | 2) {
    if (this.maxHands === count) return;
    this.maxHands = count;
    if (this.handsInstance) {
      try {
        this.handsInstance.setOptions({ maxNumHands: count });
      } catch {}
    }
  }

  public setTrackFace(enabled: boolean) {
    const changed = this.trackFace !== enabled;
    this.trackFace = enabled;
    if (!enabled) {
      if (this.latestFace !== null) {
        this.latestFace = null;
        this.emitUpdate();
      }
    } else if (changed && this.isRunning && !this.faceMeshInstance) {
      void this.ensureFaceMeshInitialized();
    }
  }

  public setTrackHands(enabled: boolean) {
    const changed = this.trackHands !== enabled;
    this.trackHands = enabled;
    if (!enabled) {
      if (this.latestHands.length > 0 || this.hasInitialCursor) {
        this.resetHandTrackingState();
        this.emitUpdate();
      }
    } else if (changed && this.isRunning && !this.handsInstance) {
      void this.ensureHandsInitialized();
    }
  }

  private async ensureScript(src: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      // Wait briefly if script tag exists and is still loading
      if (
        (src.includes('hands') && !(window as any).Hands) ||
        (src.includes('face_mesh') && !(window as any).FaceMesh)
      ) {
        return new Promise((resolve) => {
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', () => resolve(false), { once: true });
          setTimeout(() => resolve(true), 2500);
        });
      }
      return true;
    }
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
    return isMobileOrTabletDevice();
  }

  private ensureHandsInitialized(): Promise<void> {
    if (this.handsInstance) return Promise.resolve();
    this.modelInitPromise = this.modelInitPromise.then(async () => {
      if (this.handsInstance) return;
      try {
        await this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        if ((window as any).Hands && !this.handsInstance) {
          const isMobile = this.isMobileDevice();
          const HandsClass = (window as any).Hands;
          const instance = new HandsClass({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
          });
          instance.setOptions({
            maxNumHands: this.maxHands,
            modelComplexity: isMobile ? 0 : 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.68
          });
          instance.onResults(this.onHandsResults.bind(this));
          this.handsInstance = instance;
        }
      } catch (err) {
        console.warn('MediaPipe Hands init notice:', err);
      }
    });
    return this.modelInitPromise;
  }

  private ensureFaceMeshInitialized(): Promise<void> {
    if (this.faceMeshInstance) return Promise.resolve();
    this.modelInitPromise = this.modelInitPromise.then(async () => {
      if (this.faceMeshInstance) return;
      try {
        await this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
        if ((window as any).FaceMesh && !this.faceMeshInstance) {
          const FaceMeshClass = (window as any).FaceMesh;
          const instance = new FaceMeshClass({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });
          instance.setOptions({
            maxNumFaces: 1,
            refineLandmarks: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });
          instance.onResults(this.onFaceMeshResults.bind(this));
          this.faceMeshInstance = instance;
        }
      } catch (err) {
        console.warn('MediaPipe FaceMesh init notice:', err);
      }
    });
    return this.modelInitPromise;
  }

  public async initMediaPipe(): Promise<void> {
    if (this.trackHands) {
      await this.ensureHandsInitialized();
    }
    if (this.trackFace) {
      await this.ensureFaceMeshInitialized();
    }
  }

  /**
   * Produces a downscaled 416px-wide frame on mobile/tablet so MediaPipe WebGL uploads
   * significantly fewer pixels while keeping faces crisp enough at normal desk distance.
   */
  private getInferenceSource(video: HTMLVideoElement, isMobile: boolean): HTMLVideoElement | HTMLCanvasElement {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!isMobile || vw <= 0 || vh <= 0 || vw <= 440) {
      return video;
    }

    const targetW = 416;
    const targetH = Math.max(234, Math.round((vh / vw) * targetW));

    if (!this.inferCanvas) {
      this.inferCanvas = document.createElement('canvas');
      this.inferCtx = this.inferCanvas.getContext('2d', { desynchronized: true });
    }
    if (this.inferCanvas.width !== targetW || this.inferCanvas.height !== targetH) {
      this.inferCanvas.width = targetW;
      this.inferCanvas.height = targetH;
    }
    if (this.inferCtx) {
      this.inferCtx.drawImage(video, 0, 0, targetW, targetH);
      return this.inferCanvas;
    }
    return video;
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
    this.isModelBusy = false;
    this.busySince = 0;

    try {
      let stream: MediaStream | null = null;
      const isMobile = this.isMobileDevice();

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: this.facingMode,
            width: { ideal: isMobile ? 640 : 1280 },
            height: { ideal: isMobile ? 480 : 720 },
            frameRate: { ideal: isMobile ? 24 : 30, max: 30 }
          },
          audio: false
        });
      } catch {
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
      void this.initMediaPipe();

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
    let lastTurn: 'hands' | 'face' = 'face';

    const loop = (timestamp: number) => {
      if (!this.isRunning || !this.videoElement) return;

      // Safety watchdog: release lock if a model call ever stalled > 4.5s
      if (this.isModelBusy && timestamp - this.busySince > 4500) {
        this.isModelBusy = false;
      }

      const video = this.videoElement;
      if (!this.isModelBusy && video.readyState >= 2 && video.videoWidth > 0) {
        const isMobile = this.isMobileDevice();
        const handInterval = isMobile ? 45 : 30;
        const faceInterval = isMobile ? 200 : 85;

        const handsDue =
          this.trackHands &&
          Boolean(this.handsInstance) &&
          timestamp - lastHandProcess >= handInterval;

        const faceDue =
          this.trackFace &&
          Boolean(this.faceMeshInstance) &&
          timestamp - lastFaceProcess >= faceInterval;

        // Fair turn-taking: run at most ONE model per frame so Hands and FaceMesh never collide
        // and guarantee FaceMesh gets its periodic turn even when Hands is busy on mobile.
        const runFaceNow =
          faceDue && (!handsDue || lastTurn === 'hands' || lastFaceProcess === 0);

        if (runFaceNow) {
          lastFaceProcess = timestamp;
          lastTurn = 'face';
          this.isModelBusy = true;
          this.busySince = timestamp;
          const img = this.getInferenceSource(video, isMobile);
          Promise.resolve(this.faceMeshInstance.send({ image: img }))
            .catch(() => {})
            .finally(() => {
              this.isModelBusy = false;
            });
        } else if (handsDue) {
          lastHandProcess = timestamp;
          lastTurn = 'hands';
          this.isModelBusy = true;
          this.busySince = timestamp;
          const img = this.getInferenceSource(video, isMobile);
          Promise.resolve(this.handsInstance.send({ image: img }))
            .catch(() => {})
            .finally(() => {
              this.isModelBusy = false;
            });
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
      if (this.latestHands.length === 0) {
        return;
      }
      // Grace period buffer (up to 5 frames) before cutting an active hand/stroke
      if (this.missedHandFrames < this.MAX_MISSED_HAND_FRAMES) {
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
    if (!this.trackFace) return;

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      if (this.latestFace !== null) {
        this.latestFace = null;
        this.emitUpdate();
      }
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

    const prev = this.latestFace;
    if (prev && Math.hypot(ptTop.x - prev.headTop.x, ptTop.y - prev.headTop.y) < 0.16) {
      const a = 0.72;
      this.latestFace = {
        detected: true,
        headTop: {
          x: prev.headTop.x + (ptTop.x - prev.headTop.x) * a,
          y: prev.headTop.y + (ptTop.y - prev.headTop.y) * a
        },
        forehead: {
          x: prev.forehead.x + (ptForehead.x - prev.forehead.x) * a,
          y: prev.forehead.y + (ptForehead.y - prev.forehead.y) * a
        },
        leftEar: {
          x: prev.leftEar.x + (ptLeft.x - prev.leftEar.x) * a,
          y: prev.leftEar.y + (ptLeft.y - prev.leftEar.y) * a
        },
        rightEar: {
          x: prev.rightEar.x + (ptRight.x - prev.rightEar.x) * a,
          y: prev.rightEar.y + (ptRight.y - prev.rightEar.y) * a
        },
        headWidth: prev.headWidth + (headWidth - prev.headWidth) * a,
        tiltAngle: prev.tiltAngle + (tiltAngle - prev.tiltAngle) * a
      };
    } else {
      this.latestFace = {
        detected: true,
        headTop: { x: ptTop.x, y: ptTop.y },
        forehead: { x: ptForehead.x, y: ptForehead.y },
        leftEar: { x: ptLeft.x, y: ptLeft.y },
        rightEar: { x: ptRight.x, y: ptRight.y },
        headWidth,
        tiltAngle
      };
    }

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
