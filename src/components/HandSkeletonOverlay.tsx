import React, { useEffect, useMemo, useRef } from 'react';
import { SingleHandData } from '../services/arTrackingService';
import { HandTrackingDisplayMode } from '../types/drawing';
import { isMobileOrTabletDevice } from '../utils/devicePerformance';

export type { HandTrackingDisplayMode };

interface HandSkeletonOverlayProps {
  hands: SingleHandData[];
  videoWidth: number;
  videoHeight: number;
  isMirrored: boolean;
  trackingMode: HandTrackingDisplayMode;
}

// MediaPipe 21 Hand Connections (Bones)
const HAND_CONNECTIONS: [number, number][] = [
  // Palm base / Knuckles
  [0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
  // Thumb
  [1, 2], [2, 3], [3, 4],
  // Index Finger
  [5, 6], [6, 7], [7, 8],
  // Middle Finger
  [9, 10], [10, 11], [11, 12],
  // Ring Finger
  [13, 14], [14, 15], [15, 16],
  // Pinky Finger
  [17, 18], [18, 19], [19, 20]
];

export const HandSkeletonOverlay: React.FC<HandSkeletonOverlayProps> = React.memo(({
  hands,
  videoWidth = 640,
  videoHeight = 480,
  isMirrored,
  trackingMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const badgeWidthCacheRef = useRef<Record<string, number>>({});
  const isLightweight = useMemo(() => isMobileOrTabletDevice(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const vw = Math.max(320, videoWidth || 640);
    const vh = Math.max(240, videoHeight || 480);

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (trackingMode === 'off' || !hands || hands.length === 0) {
      return;
    }

    // Determine how many hands to display based on selected mode
    const handsToRender = trackingMode === 'two_hands'
      ? hands.slice(0, 2)
      : hands.slice(0, 1);

    ctx.save();
    ctx.shadowBlur = 0;

    handsToRender.forEach((hand) => {
      const landmarks = hand.landmarks;
      if (!landmarks || landmarks.length < 21) return;

      const isPinching = hand.isPinching;
      const isRightHand = hand.handedness === 'Right';
      const baseNeon = isRightHand ? 'rgba(56, 189, 248, 0.9)' : 'rgba(168, 85, 247, 0.9)';
      const haloColor = isPinching ? 'rgba(245, 158, 11, 0.35)' : (isRightHand ? 'rgba(56, 189, 248, 0.28)' : 'rgba(168, 85, 247, 0.28)');
      const activeNeon = '#f59e0b';

      // 1:1 Pixel mapping on video frame
      const pts = landmarks.map(p => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height
      }));

      // ==========================================
      // MODE 1: FINGER ONLY (السبابة فقط)
      // ==========================================
      if (trackingMode === 'finger_only') {
        const indexPt = pts[8];
        const thumbPt = pts[4];

        if (indexPt) {
          if (isLightweight) {
            ctx.beginPath();
            ctx.arc(indexPt.x, indexPt.y, isPinching ? 20 : 15, 0, Math.PI * 2);
            ctx.fillStyle = haloColor;
            ctx.fill();
          } else {
            ctx.shadowColor = isPinching ? '#f59e0b' : baseNeon;
            ctx.shadowBlur = isPinching ? 16 : 10;
          }

          ctx.beginPath();
          ctx.arc(indexPt.x, indexPt.y, isPinching ? 10 : 8, 0, Math.PI * 2);
          ctx.fillStyle = isPinching ? '#ffffff' : (isRightHand ? '#f59e0b' : '#c084fc');
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Outer targeting reticle
          ctx.beginPath();
          ctx.arc(indexPt.x, indexPt.y, isPinching ? 18 : 14, 0, Math.PI * 2);
          ctx.strokeStyle = isPinching ? '#f59e0b' : baseNeon;
          ctx.lineWidth = 2;
          ctx.stroke();

          if (thumbPt && isPinching) {
            ctx.beginPath();
            ctx.moveTo(indexPt.x, indexPt.y);
            ctx.lineTo(thumbPt.x, thumbPt.y);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3.5;
            if (!isLightweight) {
              ctx.shadowColor = '#f59e0b';
              ctx.shadowBlur = 12;
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
        return; // continue to next hand
      }

      // ==========================================
      // MODE 2 & 3: FULL SKELETON (يد واحدة أو يدين)
      // ==========================================

      // 1. Draw bones (fast batched stroke on mobile/tablet, glow on desktop)
      ctx.lineCap = 'round';
      if (isLightweight) {
        ctx.beginPath();
        HAND_CONNECTIONS.forEach(([i, j]) => {
          const p1 = pts[i];
          const p2 = pts[j];
          if (p1 && p2) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
        });
        ctx.strokeStyle = haloColor;
        ctx.lineWidth = isPinching ? 8 : 6;
        ctx.stroke();

        ctx.strokeStyle = isPinching ? activeNeon : baseNeon;
        ctx.lineWidth = isPinching ? 3.5 : 2.8;
        ctx.stroke();
      } else {
        HAND_CONNECTIONS.forEach(([i, j]) => {
          const p1 = pts[i];
          const p2 = pts[j];
          if (!p1 || !p2) return;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);

          if (isPinching) {
            ctx.strokeStyle = activeNeon;
            ctx.lineWidth = 4;
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 12;
          } else {
            ctx.strokeStyle = baseNeon;
            ctx.lineWidth = 3;
            ctx.shadowColor = baseNeon;
            ctx.shadowBlur = 6;
          }
          ctx.stroke();
        });
        ctx.shadowBlur = 0;
      }

      // 2. Pinch Energy Bridge
      const thumb = pts[4];
      const index = pts[8];
      if (thumb && index) {
        ctx.beginPath();
        ctx.moveTo(thumb.x, thumb.y);
        ctx.lineTo(index.x, index.y);

        if (isPinching) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          if (!isLightweight) {
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 14;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          const midX = (thumb.x + index.x) / 2;
          const midY = (thumb.y + index.y) / 2;
          ctx.beginPath();
          ctx.arc(midX, midY, 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 3. Draw 21 joint nodes (zero shadowBlur on mobile/tablet)
      pts.forEach((pt, idx) => {
        ctx.beginPath();

        if (idx === 8) {
          ctx.arc(pt.x, pt.y, isPinching ? 8 : 6.5, 0, Math.PI * 2);
          ctx.fillStyle = isPinching ? '#ffffff' : (isRightHand ? '#f59e0b' : '#c084fc');
          if (!isLightweight) {
            ctx.shadowColor = isPinching ? '#f59e0b' : baseNeon;
            ctx.shadowBlur = 10;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isPinching ? 15 : 12, 0, Math.PI * 2);
          ctx.strokeStyle = isPinching ? '#f59e0b' : baseNeon;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (idx === 4) {
          ctx.arc(pt.x, pt.y, isPinching ? 7 : 5.5, 0, Math.PI * 2);
          ctx.fillStyle = isPinching ? '#ffffff' : '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (idx === 0) {
          ctx.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
          ctx.fillStyle = isRightHand ? '#38bdf8' : '#a855f7';
          ctx.fill();
        } else {
          ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = isPinching ? '#fef08a' : '#e0f2fe';
          ctx.fill();
        }
      });

      // 4. Handedness Badge at Wrist (cached measurement)
      const wrist = pts[0];
      if (wrist) {
        const label = isRightHand ? 'اليد اليمنى ✋' : 'اليد اليسرى ✋';
        ctx.font = 'bold 12px "Cairo", sans-serif';
        let textW = badgeWidthCacheRef.current[label];
        if (!textW) {
          textW = ctx.measureText(label).width;
          badgeWidthCacheRef.current[label] = textW;
        }
        const bgW = textW + 16;
        const bgH = 22;
        const bgX = wrist.x - bgW / 2;
        const bgY = Math.min(canvas.height - 25, wrist.y + 16);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = isRightHand ? 'rgba(56, 189, 248, 0.6)' : 'rgba(168, 85, 247, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isRightHand ? '#38bdf8' : '#c084fc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isMirrored) {
          ctx.save();
          ctx.translate(wrist.x, bgY + bgH / 2);
          ctx.scale(-1, 1);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(label, wrist.x, bgY + bgH / 2);
        }
      }
    });

    ctx.restore();
  }, [hands, videoWidth, videoHeight, isMirrored, trackingMode, isLightweight]);

  if (trackingMode === 'off' || !hands || hands.length === 0) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none z-25"
      style={{
        transform: isMirrored ? 'scaleX(-1)' : 'none',
      }}
    />
  );
});

HandSkeletonOverlay.displayName = 'HandSkeletonOverlay';

