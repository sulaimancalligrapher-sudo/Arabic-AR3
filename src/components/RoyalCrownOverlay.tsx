import React, { useEffect, useRef } from 'react';
import { FaceData } from '../services/arTrackingService';

interface RoyalCrownOverlayProps {
  face: FaceData | null;
  videoWidth: number;
  videoHeight: number;
  isMirrored: boolean;
  showCrown: boolean;
}

export const RoyalCrownOverlay: React.FC<RoyalCrownOverlayProps> = ({
  face,
  videoWidth = 640,
  videoHeight = 480,
  isMirrored,
  showCrown,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      return;
    }

    // 1:1 Pixel mapping on video frame
    const topX = face.headTop.x * canvas.width;
    const topY = face.headTop.y * canvas.height;
    const headWidth = Math.max(70, face.headWidth * canvas.width);

    // Crown proportions
    const crownWidth = Math.max(110, headWidth * 1.35);
    const crownHeight = crownWidth * 0.65;

    // Center anchor: base of crown sits right on top of head
    const crownCenterX = topX;
    const crownCenterY = topY - crownHeight * 0.45;

    ctx.save();
    ctx.translate(crownCenterX, crownCenterY);
    ctx.rotate(face.tiltAngle || 0);

    const hw = crownWidth / 2;
    const hh = crownHeight / 2;

    // 1. Golden Aura Glow behind crown
    const glowGrad = ctx.createRadialGradient(0, 0, hw * 0.15, 0, 0, hw * 1.1);
    glowGrad.addColorStop(0, 'rgba(250, 204, 21, 0.55)');
    glowGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.22)');
    glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, -hh * 0.2, hw * 1.1, 0, Math.PI * 2);
    ctx.fill();

    // 2. Crown Base Arch (bottom curved band)
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

    // 3. Crown Spikes / Peaks (5 Regal Islamic Golden Spikes)
    const crownPath = new Path2D();
    crownPath.moveTo(-hw * 0.85, hh * 0.45);
    // Left outer peak
    crownPath.lineTo(-hw * 0.9, -hh * 0.2);
    crownPath.lineTo(-hw * 0.6, hh * 0.15);
    // Left inner peak
    crownPath.lineTo(-hw * 0.45, -hh * 0.6);
    crownPath.lineTo(-hw * 0.2, hh * 0.1);
    // Center supreme peak
    crownPath.lineTo(0, -hh * 0.95);
    crownPath.lineTo(hw * 0.2, hh * 0.1);
    // Right inner peak
    crownPath.lineTo(hw * 0.45, -hh * 0.6);
    crownPath.lineTo(hw * 0.6, hh * 0.15);
    // Right outer peak
    crownPath.lineTo(hw * 0.9, -hh * 0.2);
    crownPath.lineTo(hw * 0.85, hh * 0.45);
    crownPath.closePath();

    // Gold Gradient Fill
    const goldGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    goldGrad.addColorStop(0, '#fef08a');
    goldGrad.addColorStop(0.25, '#f59e0b');
    goldGrad.addColorStop(0.5, '#fef3c7');
    goldGrad.addColorStop(0.75, '#d97706');
    goldGrad.addColorStop(1, '#fbbf24');

    ctx.fillStyle = goldGrad;
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 18;
    ctx.fill(crownPath);

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#78350f';
    ctx.stroke(crownPath);

    // 4. Jewels & Rubies on Peaks
    const peakGems = [
      { x: -hw * 0.9, y: -hh * 0.2, r: 7, color: '#ef4444' }, // Ruby
      { x: -hw * 0.45, y: -hh * 0.6, r: 9, color: '#3b82f6' }, // Sapphire
      { x: 0, y: -hh * 0.95, r: 13, color: '#10b981' }, // Emerald center
      { x: hw * 0.45, y: -hh * 0.6, r: 9, color: '#3b82f6' }, // Sapphire
      { x: hw * 0.9, y: -hh * 0.2, r: 7, color: '#ef4444' } // Ruby
    ];

    peakGems.forEach(gem => {
      ctx.beginPath();
      ctx.arc(gem.x, gem.y, gem.r + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = gem.color;
      ctx.shadowBlur = 12;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(gem.x, gem.y, gem.r, 0, Math.PI * 2);
      ctx.fillStyle = gem.color;
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(gem.x - gem.r * 0.3, gem.y - gem.r * 0.3, gem.r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });

    // 5. Crown Headband Pearls
    const pearlCount = 7;
    for (let i = 0; i < pearlCount; i++) {
      const t = (i / (pearlCount - 1)) * 2 - 1;
      const px = t * hw * 0.75;
      const py = hh * 0.48 + (1 - t * t) * (hh * 0.08);

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#dc2626';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.fill();
    }

    // 6. Floating Title "👑 بطل الخط العربي 🌟"
    ctx.font = 'bold 13px "Cairo", sans-serif';
    const bannerText = '👑 بطل الخط العربي 🌟';
    const textW = ctx.measureText(bannerText).width;
    const bW = textW + 20;
    const bH = 26;
    const bY = -hh * 1.35;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-bW / 2, bY, bW, bH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;

    // Flip text locally if canvas is mirrored so it's readable
    if (isMirrored) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.fillText(bannerText, 0, bY + bH / 2);
      ctx.restore();
    } else {
      ctx.fillText(bannerText, 0, bY + bH / 2);
    }

    ctx.restore();
  }, [face, videoWidth, videoHeight, isMirrored, showCrown]);

  if (!showCrown || !face || !face.detected) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none z-35 transition-opacity duration-200"
      style={{
        transform: isMirrored ? 'scaleX(-1)' : 'none',
      }}
    />
  );
};
