/**
 * Hand Tracking Service using MediaPipe Hands (Loaded safely via CDN)
 * Supports AR Air-Drawing, Full 21-Joint Hand Skeleton, and Pinch Gestures
 */

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandTrackingResult {
  cursor: { x: number; y: number } | null;
  isPinching: boolean;
  handDetected: boolean;
  pinchDistance: number;
  landmarks: HandLandmark[] | null;
  handedness?: 'Right' | 'Left';
  fps: number;
}

export type HandCallback = (result: HandTrackingResult) => void;

class HandTrackingService {
  private videoElement: HTMLVideoElement | null = null;
  private cameraInstance: any = null;
  private handsInstance: any = null;
  private isRunning: boolean = false;
  private listeners: Set<HandCallback> = new Set();
  private smoothedCursor = { x: 0.5, y: 0.5 };
  private facingMode: 'user' | 'environment' = 'user';
  private isMirrored: boolean = true;
  private lastTimestamp: number = 0;
  private currentFps: number = 0;

  /**
   * Check if device has camera support
   */
  public async checkCameraSupport(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(d => d.kind === 'videoinput');
    } catch {
      return false;
    }
  }

  /**
   * Dynamically load MediaPipe scripts from CDN
   */
  public async ensureMediaPipeLoaded(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if ((window as any).Hands && (window as any).Camera) {
      return true;
    }

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
      return !!((window as any).Hands);
    } catch (err) {
      console.warn('MediaPipe CDN load warning:', err);
      return false;
    }
  }

  /**
   * Set mirror mode explicitly
   */
  public setMirrored(mirrored: boolean) {
    this.isMirrored = mirrored;
  }

  public getIsMirrored(): boolean {
    return this.isMirrored;
  }

  /**
   * Start video stream and MediaPipe Hands
   */
  public async start(
    videoElement: HTMLVideoElement,
    facingMode: 'user' | 'environment' = 'user',
    isMirrored: boolean = true,
    onFrameCallback?: HandCallback
  ): Promise<boolean> {
    if (onFrameCallback) {
      this.listeners.add(onFrameCallback);
    }

    this.videoElement = videoElement;
    this.facingMode = facingMode;
    this.isMirrored = isMirrored;

    try {
      const hasMediaPipe = await this.ensureMediaPipeLoaded();

      // If MediaPipe is loaded, initialize it
      if (hasMediaPipe && (window as any).Hands) {
        const HandsClass = (window as any).Hands;
        this.handsInstance = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55
        });

        this.handsInstance.onResults(this.onMediaPipeResults.bind(this));
      }

      // Initialize camera video stream
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = stream;
      videoElement.playsInline = true;
      videoElement.muted = true;
      await videoElement.play();

      this.isRunning = true;

      // Start processing frames if MediaPipe is available
      if (this.handsInstance && (window as any).Camera) {
        const CameraClass = (window as any).Camera;
        this.cameraInstance = new CameraClass(videoElement, {
          onFrame: async () => {
            if (this.isRunning && this.handsInstance && videoElement.readyState >= 2) {
              await this.handsInstance.send({ image: videoElement });
            }
          },
          width: 640,
          height: 480
        });
        await this.cameraInstance.start();
      }

      return true;
    } catch (err) {
      console.error('Failed to start camera or hand tracking:', err);
      return false;
    }
  }

  /**
   * Process results from MediaPipe Hands
   */
  private onMediaPipeResults(results: any) {
    const now = performance.now();
    if (this.lastTimestamp) {
      this.currentFps = Math.round(1000 / (now - this.lastTimestamp));
    }
    this.lastTimestamp = now;

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.notifyListeners({
        cursor: null,
        isPinching: false,
        handDetected: false,
        pinchDistance: 1,
        landmarks: null,
        fps: this.currentFps
      });
      return;
    }

    const rawLandmarks: HandLandmark[] = results.multiHandLandmarks[0];
    const thumbTip = rawLandmarks[4];
    const indexTip = rawLandmarks[8];
    const wrist = rawLandmarks[0];
    const middleKnuckle = rawLandmarks[9];

    // Reference scale: palm length
    const palmLength = Math.hypot(middleKnuckle.x - wrist.x, middleKnuckle.y - wrist.y) || 0.2;

    // Euclidean distance between Thumb Tip and Index Tip
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const directDistance = Math.hypot(dx, dy);
    const normalizedDistance = directDistance / palmLength;

    // Pinch threshold (relative to hand size)
    const isPinching = normalizedDistance < 0.38;

    // Transform ALL landmarks according to current mirror mode
    // When mirrored (e.g. selfie/mirror): x = 1 - rawX so user's right hand is on right side
    // When unmirrored: x = rawX
    const mirrored = this.isMirrored;

    const transformedLandmarks: HandLandmark[] = rawLandmarks.map(p => ({
      x: mirrored ? (1 - p.x) : p.x,
      y: p.y,
      z: p.z
    }));

    // Target cursor at index tip with same mirroring
    const rawX = mirrored ? (1 - indexTip.x) : indexTip.x;
    const rawY = indexTip.y;

    // Smoothing filter
    const alpha = 0.4;
    this.smoothedCursor.x += (rawX - this.smoothedCursor.x) * alpha;
    this.smoothedCursor.y += (rawY - this.smoothedCursor.y) * alpha;

    // Detected Handedness (Left/Right)
    let handedness: 'Right' | 'Left' | undefined = undefined;
    if (results.multiHandedness && results.multiHandedness.length > 0) {
      const label = results.multiHandedness[0].label; // 'Right' or 'Left'
      // If mirrored view, MediaPipe's label is inverted relative to visual perception
      if (mirrored) {
        handedness = label === 'Right' ? 'Left' : 'Right';
      } else {
        handedness = label as 'Right' | 'Left';
      }
    }

    this.notifyListeners({
      cursor: { x: this.smoothedCursor.x, y: this.smoothedCursor.y },
      isPinching,
      handDetected: true,
      pinchDistance: normalizedDistance,
      landmarks: transformedLandmarks,
      handedness,
      fps: this.currentFps
    });
  }

  public subscribe(callback: HandCallback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(data: HandTrackingResult) {
    this.listeners.forEach(fn => fn(data));
  }

  public stop() {
    this.isRunning = false;
    if (this.cameraInstance) {
      try {
        this.cameraInstance.stop();
      } catch {}
      this.cameraInstance = null;
    }

    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }

    if (this.handsInstance) {
      try {
        this.handsInstance.close();
      } catch {}
      this.handsInstance = null;
    }
  }

  public getIsRunning() {
    return this.isRunning;
  }
}

export const handTrackingService = new HandTrackingService();
