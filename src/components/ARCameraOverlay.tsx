import React, { useEffect, useRef, useState } from 'react';
import { arTrackingService, ARTrackingState } from '../services/arTrackingService';
import { HandSkeletonOverlay } from './HandSkeletonOverlay';
import { RoyalCrownOverlay } from './RoyalCrownOverlay';
import { getScreenPointFromVideo } from '../utils/arProjection';
import { HandTrackingDisplayMode } from '../types/drawing';
import { ARRewardTier } from '../services/arRewardsService';
import { AlertCircle } from 'lucide-react';

interface ARCameraOverlayProps {
  isARMode: boolean;
  trackingMode: HandTrackingDisplayMode;
  showCrown: boolean;
  activeReward?: ARRewardTier | null;
  facingMode: 'user' | 'environment';
  isMirrored: boolean;
  onCursorUpdate: (cursor: { x: number; y: number } | null, isPinching: boolean) => void;
  onVideoElementReady: (video: HTMLVideoElement | null) => void;
  onCrownCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onDetectionUpdate?: (status: { handsCount: number; isPinching: boolean; faceDetected: boolean; fps: number }) => void;
}

export const ARCameraOverlay: React.FC<ARCameraOverlayProps> = React.memo(({
  isARMode,
  trackingMode,
  showCrown,
  activeReward = null,
  facingMode,
  isMirrored,
  onCursorUpdate,
  onVideoElementReady,
  onCrownCanvasReady,
  onDetectionUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [arState, setArState] = useState<ARTrackingState>({
    hands: [],
    face: null,
    cursor: null,
    isPinching: false,
    videoWidth: 1280,
    videoHeight: 720,
    fps: 0,
  });

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const dimsRef = useRef(dimensions);
  dimsRef.current = dimensions;
  const isMirroredRef = useRef(isMirrored);
  isMirroredRef.current = isMirrored;
  const trackingModeRef = useRef(trackingMode);
  trackingModeRef.current = trackingMode;
  const showCrownRef = useRef(showCrown);
  showCrownRef.current = showCrown;
  const cursorCallbackRef = useRef(onCursorUpdate);
  cursorCallbackRef.current = onCursorUpdate;
  const detectionCallbackRef = useRef(onDetectionUpdate);
  detectionCallbackRef.current = onDetectionUpdate;
  const lastDetectionEmitRef = useRef<{
    time: number;
    handsCount: number;
    isPinching: boolean;
    faceDetected: boolean;
  }>({ time: 0, handsCount: -1, isPinching: false, faceDetected: false });
  const hadOverlayRenderRef = useRef(false);

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Update tracking service preferences when props change
  useEffect(() => {
    arTrackingService.setMirrored(isMirrored);
  }, [isMirrored]);

  useEffect(() => {
    arTrackingService.setTrackHands(trackingMode !== 'off');
    arTrackingService.setMaxHands(trackingMode === 'two_hands' ? 2 : 1);
    if (trackingMode === 'off') {
      cursorCallbackRef.current(null, false);
    }
  }, [trackingMode]);

  useEffect(() => {
    arTrackingService.setTrackFace(showCrown);
  }, [showCrown]);

  // Initialize camera ONLY when isARMode or facingMode changes
  useEffect(() => {
    if (!isARMode) {
      arTrackingService.stop();
      cursorCallbackRef.current(null, false);
      hadOverlayRenderRef.current = false;
      setArState({
        hands: [],
        face: null,
        cursor: null,
        isPinching: false,
        videoWidth: 1280,
        videoHeight: 720,
        fps: 0
      });
      return;
    }

    let isCurrent = true;
    setIsStarting(true);
    setCameraError(null);

    const startCamera = async () => {
      const video = videoRef.current;
      if (!video) return;

      onVideoElementReady(video);

      const success = await arTrackingService.start(
        video,
        facingMode,
        isMirroredRef.current,
        (state: ARTrackingState) => {
          if (!isCurrent) return;

          const hasHands = trackingModeRef.current !== 'off' && state.hands.length > 0;
          const hasFace = showCrownRef.current && Boolean(state.face?.detected);
          const hasOverlayNow = hasHands || hasFace;

          if (hasOverlayNow || hadOverlayRenderRef.current) {
            hadOverlayRenderRef.current = hasOverlayNow;
            setArState(state);
          }

          // Throttle toolbar status badge updates so UI doesn't re-render 30x/sec
          if (detectionCallbackRef.current) {
            const now = performance.now();
            const handsCount = state.hands.length;
            const faceDetected = !!state.face?.detected;
            const last = lastDetectionEmitRef.current;
            const discreteChanged =
              handsCount !== last.handsCount ||
              state.isPinching !== last.isPinching ||
              faceDetected !== last.faceDetected;

            if (discreteChanged || now - last.time >= 600) {
              lastDetectionEmitRef.current = {
                time: now,
                handsCount,
                isPinching: state.isPinching,
                faceDetected,
              };
              detectionCallbackRef.current({
                handsCount,
                isPinching: state.isPinching,
                faceDetected,
                fps: state.fps
              });
            }
          }

          if (trackingModeRef.current === 'off') {
            return;
          }

          // Exact pixel-perfect projection from video element space to screen container
          const vid = videoRef.current;
          const containerW = vid && vid.clientWidth > 0 ? vid.clientWidth : (dimsRef.current.width || 800);
          const containerH = vid && vid.clientHeight > 0 ? vid.clientHeight : (dimsRef.current.height || 600);
          const videoW = (vid && vid.videoWidth > 0) ? vid.videoWidth : (state.videoWidth || 1280);
          const videoH = (vid && vid.videoHeight > 0) ? vid.videoHeight : (state.videoHeight || 720);

          // If no hands detected, immediately clear cursor and stop any air drawing
          if (!state.hands || state.hands.length === 0) {
            cursorCallbackRef.current(null, false);
            return;
          }

          // Get active drawing hand (prefer pinching hand, then right hand, then first detected)
          const activeHand = state.hands.find(h => h.isPinching) ||
            (state.hands.length > 1 && state.hands[1].handedness === 'Right' ? state.hands[1] : state.hands[0]);

          if (!activeHand || !activeHand.landmarks || !activeHand.landmarks[8]) {
            cursorCallbackRef.current(null, false);
            return;
          }

          // Prefer adaptive smoothed cursor from tracking service, fallback to index tip landmark 8
          const targetPoint = state.cursor || activeHand.landmarks[8];

          const screenCursor = getScreenPointFromVideo(
            targetPoint,
            containerW,
            containerH,
            videoW,
            videoH,
            isMirroredRef.current
          );

          cursorCallbackRef.current(screenCursor, activeHand.isPinching);
        }
      );

      if (isCurrent) {
        setIsStarting(false);
        if (!success) {
          setCameraError('تعذر فتح الكاميرا. يرجى التأكد من منح الإذن للمتصفح والمحاولة مجدداً');
        }
      }
    };

    startCamera();

    return () => {
      isCurrent = false;
      arTrackingService.stop();
    };
  }, [isARMode, facingMode, onVideoElementReady]);

  if (!isARMode) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-0">
      {/* Live Video Feed Element */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="w-full h-full object-cover absolute inset-0"
        style={{
          transform: isMirrored ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* AR Hand Skeleton Overlay (Pixel-perfect matching video) */}
      <HandSkeletonOverlay
        hands={arState.hands}
        videoWidth={arState.videoWidth}
        videoHeight={arState.videoHeight}
        isMirrored={isMirrored}
        trackingMode={trackingMode}
      />

      {/* AR Royal Crown / Tiered Reward Overlay over Student Head (Pixel-perfect matching video) */}
      <RoyalCrownOverlay
        face={arState.face}
        videoWidth={arState.videoWidth}
        videoHeight={arState.videoHeight}
        isMirrored={isMirrored}
        showCrown={showCrown}
        activeReward={activeReward}
        onCanvasReady={onCrownCanvasReady}
      />

      {/* Camera Loading Overlay */}
      {isStarting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm z-30 pointer-events-auto">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-amber-400 font-semibold text-sm">جاري تشغيل كاميرا الواقع المعزز...</p>
        </div>
      )}

      {/* Camera Error Message */}
      {cameraError && (
        <div className="absolute top-4 left-4 right-4 bg-red-950/90 border border-red-500/50 rounded-xl p-3 flex items-center gap-3 text-red-200 text-xs sm:text-sm z-40 pointer-events-auto shadow-xl">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">{cameraError}</div>
          <button
            onClick={() => {
              setCameraError(null);
            }}
            className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
    </div>
  );
});

ARCameraOverlay.displayName = 'ARCameraOverlay';

