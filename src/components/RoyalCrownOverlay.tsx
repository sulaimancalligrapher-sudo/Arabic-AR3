import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaceData } from '../services/arTrackingService';
import { ARRewardTier } from '../services/arRewardsService';
import { isMobileOrTabletDevice } from '../utils/devicePerformance';

interface RoyalCrownOverlayProps {
  face: FaceData | null;
  videoWidth: number;
  videoHeight: number;
  isMirrored: boolean;
  showCrown: boolean;
  activeReward?: ARRewardTier | null;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

export const RoyalCrownOverlay: React.FC<RoyalCrownOverlayProps> = React.memo(({
  face,
  videoWidth = 640,
  videoHeight = 480,
  isMirrored,
  showCrown,
  activeReward = null,
  onCanvasReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bannerWidthCacheRef = useRef<Record<string, number>>({});
  const lastReadyRef = useRef<HTMLCanvasElement | null>(null);
  const [loadedRewardImg, setLoadedRewardImg] = useState<HTMLImageElement | null>(null);
  const isLightweight = useMemo(() => isMobileOrTabletDevice(), []);

  // Preload custom or preset reward image cleanly (origin-safe data URLs or CORS-safe URLs)
  useEffect(() => {
    if (!activeReward?.imageUrl) {
      setLoadedRewardImg(null);
      return;
    }

    let cancelled = false;
    const loadImg = (useCors: boolean) => {
      const img = new Image();
      if (!activeReward.imageUrl.startsWith('data:')) {
        img.referrerPolicy = 'no-referrer';
        if (useCors) {
          img.crossOrigin = 'anonymous';
        }
      }
      img.onload = () => {
        if (!cancelled) {
          setLoadedRewardImg(img);
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        if (useCors && !activeReward.imageUrl.startsWith('data:')) {
          loadImg(false);
        } else {
          setLoadedRewardImg(null);
        }
      };
      img.src = activeReward.imageUrl;
    };

    loadImg(!activeReward.imageUrl.startsWith('data:'));

    return () => {
      cancelled = true;
    };
  }, [activeReward?.imageUrl]);

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

    if (!showCrown || !face || !face.detected) {
      if (lastReadyRef.current !== null) {
        lastReadyRef.current = null;
        onCanvasReady?.(null);
      }
      return;
    }

    if (lastReadyRef.current !== canvas) {
      lastReadyRef.current = canvas;
      onCanvasReady?.(canvas);
    }

    // 1:1 Pixel mapping on video frame
    const topX = face.headTop.x * canvas.width;
    const topY = face.headTop.y * canvas.height;
    const headWidth = Math.max(70, face.headWidth * canvas.width);

    const scaleRatio = activeReward?.scaleRatio ?? 1.35;
    const offsetYRatio = activeReward?.offsetYRatio ?? -0.45;
    const aspect = loadedRewardImg && loadedRewardImg.naturalWidth > 0 && loadedRewardImg.naturalHeight > 0
      ? loadedRewardImg.naturalHeight / loadedRewardImg.naturalWidth
      : 0.65;

    const crownWidth = Math.max(96, headWidth * scaleRatio);
    const crownHeight = Math.max(60, crownWidth * aspect);

    const crownCenterX = topX;
    const crownCenterY = topY + crownHeight * offsetYRatio;

    ctx.save();
    ctx.translate(crownCenterX, crownCenterY);
    ctx.rotate(face.tiltAngle || 0);

    const hw = crownWidth / 2;
    const hh = crownHeight / 2;

    // 1. Subtle Golden Aura Glow behind reward graphic (lightweight flat circle on mobile/tablet)
    if (isLightweight) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, hw * 0.92, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const glowGrad = ctx.createRadialGradient(0, 0, hw * 0.12, 0, 0, hw * 1.15);
      glowGrad.addColorStop(0, 'rgba(250, 204, 21, 0.45)');
      glowGrad.addColorStop(0.55, 'rgba(245, 158, 11, 0.18)');
      glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, hw * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Render Loaded Reward Image (or fallback Royal Vector Crown)
    if (loadedRewardImg && loadedRewardImg.complete && loadedRewardImg.naturalWidth > 0) {
      if (!isLightweight) {
        ctx.save();
        ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
        ctx.shadowBlur = 12;
        ctx.drawImage(loadedRewardImg, -hw, -hh, crownWidth, crownHeight);
        ctx.restore();
      } else {
        ctx.drawImage(loadedRewardImg, -hw, -hh, crownWidth, crownHeight);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(-hw * 0.85, hh * 0.45);
      ctx.quadraticCurveTo(0, hh * 0.65, hw * 0.85, hh * 0.45);
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#d97706';
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-hw * 0.85, hh * 0.45);
      ctx.quadraticCurveTo(0, hh * 0.65, hw * 0.85, hh * 0.45);
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#fef08a';
      ctx.stroke();

      const crownPath = new Path2D();
      crownPath.moveTo(-hw * 0.85, hh * 0.45);
      crownPath.lineTo(-hw * 0.9, -hh * 0.2);
      crownPath.lineTo(-hw * 0.6, hh * 0.15);
      crownPath.lineTo(-hw * 0.45, -hh * 0.6);
      crownPath.lineTo(-hw * 0.2, hh * 0.1);
      crownPath.lineTo(0, -hh * 0.95);
      crownPath.lineTo(hw * 0.2, hh * 0.1);
      crownPath.lineTo(hw * 0.45, -hh * 0.6);
      crownPath.lineTo(hw * 0.6, hh * 0.15);
      crownPath.lineTo(hw * 0.9, -hh * 0.2);
      crownPath.lineTo(hw * 0.85, hh * 0.45);
      crownPath.closePath();

      if (isLightweight) {
        ctx.fillStyle = '#fbbf24';
        ctx.fill(crownPath);
      } else {
        const goldGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
        goldGrad.addColorStop(0, '#fef08a');
        goldGrad.addColorStop(0.25, '#f59e0b');
        goldGrad.addColorStop(0.5, '#fef3c7');
        goldGrad.addColorStop(0.75, '#d97706');
        goldGrad.addColorStop(1, '#fbbf24');

        ctx.fillStyle = goldGrad;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
        ctx.fill(crownPath);
        ctx.shadowBlur = 0;
      }

      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#78350f';
      ctx.stroke(crownPath);
    }

    // 3. Floating Title Banner
    const bannerText = activeReward ? activeReward.title.trim() : '👑 بطل الخط العربي 🌟';
    if (bannerText) {
      ctx.font = 'bold 13px "Cairo", sans-serif';
      let textW = bannerWidthCacheRef.current[bannerText];
      if (!textW) {
        textW = ctx.measureText(bannerText).width;
        bannerWidthCacheRef.current[bannerText] = textW;
      }
      const bW = textW + 22;
      const bH = 26;
      const bY = -hh - bH - 8;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-bW / 2, bY, bW, bH, 8);
      } else {
        ctx.rect(-bW / 2, bY, bW, bH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;

      if (isMirrored) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.fillText(bannerText, 0, bY + bH / 2);
        ctx.restore();
      } else {
        ctx.fillText(bannerText, 0, bY + bH / 2);
      }
    }

    ctx.restore();
  }, [face, videoWidth, videoHeight, isMirrored, showCrown, activeReward, loadedRewardImg, onCanvasReady, isLightweight]);

  useEffect(() => {
    if (!showCrown || !face || !face.detected) {
      if (lastReadyRef.current !== null) {
        lastReadyRef.current = null;
        onCanvasReady?.(null);
      }
    } else if (canvasRef.current && lastReadyRef.current !== canvasRef.current) {
      lastReadyRef.current = canvasRef.current;
      onCanvasReady?.(canvasRef.current);
    }
    return () => {
      if (lastReadyRef.current !== null) {
        lastReadyRef.current = null;
        onCanvasReady?.(null);
      }
    };
  }, [showCrown, face?.detected, onCanvasReady]);

  if (!showCrown || !face || !face.detected) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none z-35"
      style={{
        transform: isMirrored ? 'scaleX(-1)' : 'none',
      }}
    />
  );
});

RoyalCrownOverlay.displayName = 'RoyalCrownOverlay';

