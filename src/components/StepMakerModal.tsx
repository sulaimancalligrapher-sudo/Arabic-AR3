import React, { useState, useRef, useEffect } from 'react';
import { DrawingTemplate, LessonStep } from '../types/drawing';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { audioService } from '../services/audioService';
import {
  X,
  Play,
  Save,
  Volume2,
  Sparkles,
  Info,
  CheckCircle2,
  RotateCcw,
  Check,
  Trash2
} from 'lucide-react';

interface StepMakerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: DrawingTemplate;
  onSaveSteps: (updatedLesson: DrawingTemplate) => void;
}

export const StepMakerModal: React.FC<StepMakerModalProps> = ({
  isOpen,
  onClose,
  lesson,
  onSaveSteps,
}) => {
  const [steps, setSteps] = useState<LessonStep[]>(() => {
    if (lesson.steps && lesson.steps.length > 0) return lesson.steps;
    if (lesson.stepsData) {
      try {
        const parsed = JSON.parse(lesson.stepsData);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  // Pending start point in image-relative coordinates [0, 1]
  const [pendingStartRel, setPendingStartRel] = useState<{ x: number; y: number } | null>(null);
  const [activeStepTitle, setActiveStepTitle] = useState('');
  const [activeStepAudioHint, setActiveStepAudioHint] = useState('');
  const [previewingStepIndex, setPreviewingStepIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Exact image rectangle on canvas
  const imgBoundsRef = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 40,
    y: 40,
    width: 420,
    height: 420
  });

  const directImgUrl = formatDirectImageUrl(lesson.imageUrl);

  // Load image
  useEffect(() => {
    if (directImgUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = directImgUrl;
      img.onload = () => {
        imageRef.current = img;
        drawCanvas();
      };
    } else {
      imageRef.current = null;
    }
  }, [directImgUrl]);

  // Redraw whenever steps, pendingStartRel, or previewingStepIndex changes
  useEffect(() => {
    drawCanvas();
  }, [steps, pendingStartRel, previewingStepIndex]);

  if (!isOpen) return null;

  // Draw on Canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Crisp white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 2. Subtle grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 35) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Compute exact image draw bounds
    const pad = 40;
    const availW = width - pad * 2;
    const availH = height - pad * 2;

    let dw = availW;
    let dh = availH;
    let dx = pad;
    let dy = pad;

    if (imageRef.current) {
      const img = imageRef.current;
      const nw = img.width || 500;
      const nh = img.height || 500;
      const scale = Math.min(availW / nw, availH / nh);
      dw = nw * scale;
      dh = nh * scale;
      dx = (width - dw) / 2;
      dy = (height - dh) / 2;

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else if (lesson.svgData) {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lesson.svgData);
      img.onload = () => {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
      };
    }

    imgBoundsRef.current = { x: dx, y: dy, width: dw, height: dh };

    // Draw image outline bounds softly
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx, dy, dw, dh);

    // 4. Draw existing steps: GREEN DOT (start), RED DOT (end), STEP BADGE (outside) - NO ARROWS!
    steps.forEach((s, idx) => {
      const isHighlighted = previewingStepIndex === idx;

      // Transform image-relative [0, 1] coordinates into canvas pixels
      const sx = dx + s.startX * dw;
      const sy = dy + s.startY * dh;
      const ex = dx + s.endX * dw;
      const ey = dy + s.endY * dh;

      drawStepPoints(ctx, sx, sy, ex, ey, s.stepNumber, isHighlighted);
    });

    // 5. Draw pending start point if waiting for second click
    if (pendingStartRel) {
      const psx = dx + pendingStartRel.x * dw;
      const psy = dy + pendingStartRel.y * dh;

      ctx.save();
      // Glowing green start dot
      ctx.shadowColor = 'rgba(16, 185, 129, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(psx, psy, 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number badge next to it
      drawStepBadge(ctx, psx, psy, steps.length + 1, true);
      ctx.restore();
    }
  };

  // Helper to draw clean dots and outer step number badge without any arrows
  const drawStepPoints = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    stepNum: number,
    isHighlighted: boolean
  ) => {
    ctx.save();

    // 1. Ultra-thin faint dashed guide line between start and end (very subtle, non-intrusive)
    ctx.strokeStyle = isHighlighted ? 'rgba(244, 63, 94, 0.5)' : 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = isHighlighted ? 1.5 : 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // 2. Start Point: Small Green Dot 🟢
    ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
    ctx.shadowBlur = isHighlighted ? 8 : 4;
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 3. End Point: Small Red Dot 🔴
    ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
    ctx.shadowBlur = isHighlighted ? 8 : 4;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ex, ey, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Step Number Badge: Sits OUTSIDE the green dot (above/offset)
    drawStepBadge(ctx, sx, sy, stepNum, isHighlighted);

    ctx.restore();
  };

  // Draw clean circular step number badge outside the start dot
  const drawStepBadge = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    num: number,
    isHighlighted: boolean
  ) => {
    const badgeX = sx - 16;
    const badgeY = sy - 14;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;

    ctx.fillStyle = isHighlighted ? '#e11d48' : '#0f172a';
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isHighlighted ? '#fda4af' : '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), badgeX, badgeY);

    ctx.restore();
  };

  // Canvas Click: Computes coordinates RELATIVE TO THE IMAGE BOUNDS [0, 1]
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const b = imgBoundsRef.current;
    // Map to normalized image coordinates [0, 1]
    const relX = Math.max(0, Math.min(1, (clickX - b.x) / b.width));
    const relY = Math.max(0, Math.min(1, (clickY - b.y) / b.height));

    if (!pendingStartRel) {
      // First click: Start Point (Green)
      setPendingStartRel({ x: relX, y: relY });
      audioService.playStrokeStart();
    } else {
      // Second click: End Point (Red) -> Create Step
      const newStepNumber = steps.length + 1;
      const defaultTitle = `الخطوة ${newStepNumber}`;
      const title = activeStepTitle.trim() || defaultTitle;
      const audioHint = activeStepAudioHint.trim() || `الخطوة ${newStepNumber}، ابدأ من النقطة الخضراء وانتهِ عند النقطة الحمراء`;

      const newStep: LessonStep = {
        id: `step_${Date.now()}_${newStepNumber}`,
        stepNumber: newStepNumber,
        title,
        startX: pendingStartRel.x,
        startY: pendingStartRel.y,
        endX: relX,
        endY: relY,
        audioHint
      };

      setSteps([...steps, newStep]);
      setPendingStartRel(null);
      setActiveStepTitle('');
      setActiveStepAudioHint('');
      audioService.speakArabic(`تمت إضافة ${title}`);
    }
  };

  // Preview steps
  const handlePreviewSteps = () => {
    if (steps.length === 0) {
      audioService.speakArabic('لم تقم بإضافة أي خطوات بعد');
      return;
    }

    let idx = 0;
    const playNext = () => {
      if (idx < steps.length) {
        setPreviewingStepIndex(idx);
        const s = steps[idx];
        audioService.speakArabic(s.audioHint || s.title);
        idx++;
        setTimeout(playNext, 2200);
      } else {
        setPreviewingStepIndex(null);
        audioService.speakArabic('اكتملت معاينة خطوات الحرف');
      }
    };

    playNext();
  };

  // Delete single step
  const handleDeleteStep = (stepId: string) => {
    const filtered = steps.filter(s => s.id !== stepId);
    const renumbered = filtered.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setSteps(renumbered);
    audioService.speakArabic('تم حذف الخطوة');
  };

  // Reset all
  const handleResetAll = () => {
    if (window.confirm('هل تريد مسح جميع الخطوات المحددة؟')) {
      setSteps([]);
      setPendingStartRel(null);
    }
  };

  // Save Steps to draft lesson
  const handleSave = () => {
    const updatedLesson: DrawingTemplate = {
      ...lesson,
      steps,
      stepsData: JSON.stringify(steps)
    };
    onSaveSteps(updatedLesson);
    audioService.speakArabic(`تم اعتماد ${steps.length} خطوات للحرف بنجاح`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-amber-400 flex items-center gap-2">
                <span>صانع خطوات الحرف (Step Maker)</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {lesson.title || 'درس جديد'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                حدد نقطة البداية الخضراء 🟢 ونقطة النهاية الحمراء 🔴 لكل جزء بدقة مليمترية دون أي أسهم مشوشة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>اعتماد الخطوات ({steps.length})</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 sm:p-5">
          
          {/* Canvas Interactive Area (Left/Center - 7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-950/60 rounded-2xl border border-slate-800 p-3 sm:p-4 relative overflow-hidden">
            
            {/* Guide Instructions Banner */}
            <div className="w-full mb-2.5 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {!pendingStartRel
                    ? 'انقر لتحديد نقطة البداية الخضراء 🟢 للسن الأول.'
                    : 'انقر لتحديد نقطة النهاية الحمراء 🔴 لإكمال هذا الجزء.'}
                </span>
              </div>
              {pendingStartRel && (
                <button
                  onClick={() => setPendingStartRel(null)}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold"
                >
                  إلغاء البداية
                </button>
              )}
            </div>

            {/* Visual Canvas (500x500 Crisp White) */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-slate-300 shadow-xl bg-white cursor-crosshair">
              <canvas
                ref={canvasRef}
                width={500}
                height={500}
                onClick={handleCanvasClick}
                className="w-full max-w-[420px] aspect-square object-contain block"
              />
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[11px] text-slate-300 mt-2.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                <span>نقطة الانطلاق (البداية)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white" />
                <span>نقطة الوقوف (النهاية)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white font-bold text-[9px] flex items-center justify-center border border-slate-400">
                  ١
                </span>
                <span>رقم الخطوة</span>
              </span>
            </div>
          </div>

          {/* Steps Management Panel (Right - 5 cols) */}
          <div className="lg:col-span-5 flex flex-col bg-slate-900/90 rounded-2xl border border-slate-800 p-4 overflow-hidden">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-xs sm:text-sm text-slate-100 flex items-center gap-2">
                <span>خطوات الحرف ({steps.length})</span>
              </h3>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePreviewSteps}
                  disabled={steps.length === 0}
                  title="معاينة تسلسل الخطوات"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>معاينة</span>
                </button>

                <button
                  onClick={handleResetAll}
                  disabled={steps.length === 0}
                  title="مسح كافة الخطوات"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Name and Audio Input for Next Step */}
            <div className="my-3 p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
              <span className="text-[11px] font-bold text-amber-400 block">
                تخصيص الخطوة {steps.length + 1} (اختياري قبل النقر):
              </span>
              <input
                type="text"
                value={activeStepTitle}
                onChange={(e) => setActiveStepTitle(e.target.value)}
                placeholder={`اسم الخطوة (مثال: السن الأولى، بطن الحرف)`}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
              />
              <input
                type="text"
                value={activeStepAudioHint}
                onChange={(e) => setActiveStepAudioHint(e.target.value)}
                placeholder="التوجيه الصوتي (مثال: ابدأ من السن بانحدار خفيف)"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            {/* Steps Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {steps.map((s, index) => {
                const isSelected = previewingStepIndex === index;
                return (
                  <div
                    key={s.id}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-amber-400 font-bold flex items-center justify-center text-xs shrink-0 font-mono border border-slate-700">
                        {s.stepNumber}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-100 truncate">
                          {s.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 truncate">
                          {s.audioHint || 'توجيه افتراضي'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => audioService.speakArabic(s.audioHint || s.title)}
                        title="استماع للتوجيه"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStep(s.id)}
                        title="حذف الخطوة"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {steps.length === 0 && (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <CheckCircle2 className="w-6 h-6 mx-auto text-slate-600" />
                  <p className="text-xs">لا توجد خطوات مضافة بعد.</p>
                  <p className="text-[11px] text-slate-500">
                    انقر على اللوحة لتعيين نقطة البداية 🟢 ثم نقطة النهاية 🔴
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
