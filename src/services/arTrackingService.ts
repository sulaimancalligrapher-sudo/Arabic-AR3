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

  public async initMediaPipe(): Promise<void> {
    try {
      await Promise.all([
        this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
        this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'),
        this.ensureScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'),
      ]);

      if ((window as any).Hands && !this.handsInstance) {
        const HandsClass = (window as any).Hands;
        this.handsInstance = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        this.handsInstance.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
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

    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: this.facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
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

  private startProcessingLoop() {
    let lastHandProcess = 0;
    let lastFaceProcess = 0;

    const loop = async (timestamp: number) => {
      if (!this.isRunning || !this.videoElement) return;

      if (this.videoElement.readyState >= 2) {
        if (this.trackHands && this.handsInstance && timestamp - lastHandProcess >= 32) {
          lastHandProcess = timestamp;
          try {
            await this.handsInstance.send({ image: this.videoElement });
          } catch {}
        }

        if (this.trackFace && this.faceMeshInstance && timestamp - lastFaceProcess >= 45) {
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

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.latestHands = [];
      this.emitUpdate();
      return;
    }

    const parsedHands: SingleHandData[] = [];

    for (let hIdx = 0; hIdx < results.multiHandLandmarks.length; hIdx++) {
      const rawLandmarks: HandLandmark[] = results.multiHandLandmarks[hIdx];
      const thumbTip = rawLandmarks[4];
      const indexTip = rawLandmarks[8];
      const wrist = rawLandmarks[0];
      const middleKnuckle = rawLandmarks[9];

      const palmLength = Math.hypot(middleKnuckle.x - wrist.x, middleKnuckle.y - wrist.y) || 0.2;
      const dx = thumbTip.x - indexTip.x;
      const dy = thumbTip.y - indexTip.y;
      const directDist = Math.hypot(dx, dy);
      const normalizedDistance = directDist / palmLength;
      const isPinching = normalizedDistance < 0.38;

      let handedness: 'Right' | 'Left' = 'Right';
      if (results.multiHandedness && results.multiHandedness[hIdx]) {
        handedness = results.multiHandedness[hIdx].label as 'Right' | 'Left';
      }

      // Preserve raw coordinates in video frame space!
      parsedHands.push({
        index: hIdx,
        cursor: { x: indexTip.x, y: indexTip.y },
        isPinching,
        pinchDistance: normalizedDistance,
        landmarks: rawLandmarks,
        handedness
      });
    }

    this.latestHands = parsedHands;

    if (parsedHands.length > 0) {
      // Prioritize the pinching hand (drawing), otherwise prefer right hand or first detected
      const pinchingHand = parsedHands.find(h => h.isPinching);
      const primary = pinchingHand || (parsedHands.length > 1 && parsedHands[1].handedness === 'Right' ? parsedHands[1] : parsedHands[0]);
      this.activeDrawingHand = primary;

      const targetX = primary.cursor.x;
      const targetY = primary.cursor.y;

      const dist = Math.hypot(targetX - this.smoothedCursor.x, targetY - this.smoothedCursor.y);
      if (dist > 0.08 || !this.hasInitialCursor) {
        // Snap immediately when hand jumps or first enters
        this.smoothedCursor.x = targetX;
        this.smoothedCursor.y = targetY;
        this.hasInitialCursor = true;
      } else {
        // High responsiveness factor (0.85) to eliminate any lagging behind index finger
        const alpha = 0.85;
        this.smoothedCursor.x += (targetX - this.smoothedCursor.x) * alpha;
        this.smoothedCursor.y += (targetY - this.smoothedCursor.y) * alpha;
      }
    } else {
      this.hasInitialCursor = false;
      this.activeDrawingHand = null;
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
    const primaryHand = this.activeDrawingHand || this.latestHands[0];
    const vw = this.videoElement?.videoWidth || 640;
    const vh = this.videoElement?.videoHeight || 480;

    const state: ARTrackingState = {
      hands: this.latestHands,
      face: this.latestFace,
      cursor: primaryHand ? { x: this.smoothedCursor.x, y: this.smoothedCursor.y } : null,
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
    this.latestHands = [];
    this.latestFace = null;
  }

  public getIsRunning() {
    return this.isRunning;
  }
}

export const arTrackingService = new ARTrackingService();
