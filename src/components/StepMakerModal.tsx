import React, { useState, useRef, useEffect } from 'react';
import { DrawingTemplate, LessonStep } from '../types/drawing';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { audioService } from '../services/audioService';
import {
  X,
  Plus,
  Trash2,
  Play,
  Save,
  Volume2,
  Sparkles,
  ArrowRight,
  Info,
  CheckCircle2,
  HelpCircle,
  RotateCcw
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

  // Current draft step being placed
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [activeStepTitle, setActiveStepTitle] = useState('');
  const [activeStepAudioHint, setActiveStepAudioHint] = useState('');
  const [previewingStepIndex, setPreviewingStepIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const directImgUrl = formatDirectImageUrl(lesson.imageUrl);

  // Load image once
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

  // Redraw whenever steps, pendingStart, or preview changes
  useEffect(() => {
    drawCanvas();
  }, [steps, pendingStart, previewingStepIndex]);

  if (!isOpen) return null;

  // Main Drawing Function on Canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear background to crisp white so black calligraphy strokes contrast sharply
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 2. Subtle calligraphy grid guidelines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Draw lesson image or SVG
    if (imageRef.current) {
      const img = imageRef.current;
      const pad = 40;
      const availW = width - pad * 2;
      const availH = height - pad * 2;
      const scale = Math.min(availW / (img.width || 500), availH / (img.height || 500));
      const dw = (img.width || 500) * scale;
      const dh = (img.height || 500) * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else if (lesson.svgData) {
      // SVG rendering fallback
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lesson.svgData);
      img.onload = () => {
        ctx.save();
        ctx.globalAlpha = 0.85;
        const pad = 40;
        const availW = width - pad * 2;
        const availH = height - pad * 2;
        const scale = Math.min(availW / 500, availH / 500);
        const dw = 500 * scale;
        const dh = 500 * scale;
        ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
        ctx.restore();
      };
    }

    // 4. Draw existing steps
    steps.forEach((s, idx) => {
      const isHighlighted = previewingStepIndex === idx;
      const sx = s.startX * width;
      const sy = s.startY * height;
      const ex = s.endX * width;
      const ey = s.endY * height;

      drawStepArrow(ctx, sx, sy, ex, ey, s.stepNumber, isHighlighted);
    });

    // 5. Draw pending start point if waiting for second click
    if (pendingStart) {
      const px = pendingStart.x * width;
      const py = pendingStart.y * height;

      // Glowing pulsing start marker
      ctx.save();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(steps.length + 1), px, py);
      ctx.restore();
    }
  };

  // Helper to draw clean directional step arrow
  const drawStepArrow = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    stepNum: number,
    isHighlighted: boolean
  ) => {
    const mainColor = isHighlighted ? '#e11d48' : '#2563eb';
    const badgeColor = isHighlighted ? '#f43f5e' : '#10b981';

    ctx.save();

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 6;

    // Draw connecting path line
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = isHighlighted ? 6 : 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead at (ex, ey)
    const angle = Math.atan2(ey - sy, ex - sx);
    const arrowLen = 16;
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - arrowLen * Math.cos(angle - Math.PI / 6),
      ey - arrowLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      ex - arrowLen * Math.cos(angle + Math.PI / 6),
      ey - arrowLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Start Circle with Step Number
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(stepNum), sx, sy);

    ctx.restore();
  };

  // Canvas Click Handler: First click sets start, Second click sets end
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (!pendingStart) {
      // First click: Start Point
      setPendingStart({ x, y });
      audioService.playStrokeStart();
    } else {
      // Second click: End Point -> Create Step
      const newStepNumber = steps.length + 1;
      const defaultTitle = `الخطوة ${newStepNumber}`;
      const title = activeStepTitle.trim() || defaultTitle;
      const audioHint = activeStepAudioHint.trim() || `الخطوة ${newStepNumber}، ابدأ من النقطة الخضراء باتجاه السهم`;

      const newStep: LessonStep = {
        id: `step_${Date.now()}_${newStepNumber}`,
        stepNumber: newStepNumber,
        title,
        startX: pendingStart.x,
        startY: pendingStart.y,
        endX: x,
        endY: y,
        audioHint
      };

      setSteps([...steps, newStep]);
      setPendingStart(null);
      setActiveStepTitle('');
      setActiveStepAudioHint('');
      audioService.speakArabic(`تمت إضافة ${title}`);
    }
  };

  // Preview all steps sequentially
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
        setTimeout(playNext, 2400);
      } else {
        setPreviewingStepIndex(null);
        audioService.speakArabic('اكتملت معاينة خطوات الحرف');
      }
    };

    playNext();
  };

  // Delete single step and re-number
  const handleDeleteStep = (stepId: string) => {
    const filtered = steps.filter(s => s.id !== stepId);
    const renumbered = filtered.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setSteps(renumbered);
    audioService.speakArabic('تم حذف الخطوة');
  };

  // Reset all steps
  const handleResetAll = () => {
    if (window.confirm('هل تريد مسح جميع الخطوات المحددة؟')) {
      setSteps([]);
      setPendingStart(null);
    }
  };

  // Save Steps
  const handleSave = () => {
    const updatedLesson: DrawingTemplate = {
      ...lesson,
      steps,
      stepsData: JSON.stringify(steps)
    };
    onSaveSteps(updatedLesson);
    audioService.speakArabic(`تم حفظ ${steps.length} خطوات للحرف بنجاح`);
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
                  {lesson.title}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                حدد نقطة الانطلاق وسهم الاتجاه لكل جزء من أجزاء الحرف لتدريب الطلاب خطوة بخطوة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>حفظ الخطوات ({steps.length})</span>
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
                  {!pendingStart
                    ? 'الخطوة ١: انقر على اللوحة لتحديد نقطة بداية الجزء (السن الأولى).'
                    : 'الخطوة ٢: انقر على نقطة النهاية لرسم سهم مسار الحركة.'}
                </span>
              </div>
              {pendingStart && (
                <button
                  onClick={() => setPendingStart(null)}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold"
                >
                  إلغاء
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

            <p className="text-[11px] text-slate-400 mt-2 text-center">
              💡 يظهر الحرف باللون الأسود على خلفية بيضاء لضبط نقاط وسهام الحركة بدقة تامة.
            </p>
          </div>

          {/* Steps Management Panel (Right - 5 cols) */}
          <div className="lg:col-span-5 flex flex-col bg-slate-900/90 rounded-2xl border border-slate-800 p-4 overflow-hidden">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-xs sm:text-sm text-slate-100 flex items-center gap-2">
                <span>قائمة الخطوات المحددة</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-mono">
                  {steps.length}
                </span>
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
                تخصيص الخطوة التالية (اختياري قبل النقر):
              </span>
              <input
                type="text"
                value={activeStepTitle}
                onChange={(e) => setActiveStepTitle(e.target.value)}
                placeholder={`اسم الخطوة (مثال: الخطوة ${steps.length + 1} - رأس الحرف)`}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
              />
              <input
                type="text"
                value={activeStepAudioHint}
                onChange={(e) => setActiveStepAudioHint(e.target.value)}
                placeholder="التوجيه الصوتي (مثال: انزل بانحدار رشيق)"
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
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0 font-mono">
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
                    انقر على اللوحة لتعيين نقطة انطلاق وسهم اتجاه الخطوة الأولى!
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
