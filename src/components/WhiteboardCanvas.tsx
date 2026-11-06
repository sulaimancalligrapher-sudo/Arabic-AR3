import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { BoardStyle, PenType, Stroke, Point, DrawingTemplate, GuideColor, LessonStep } from '../types/drawing';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { getArabicOrdinal, getStepAudioPrompt } from '../services/sheetService';
import { AlertCircle, CheckCircle2, Volume2, RotateCcw, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface WhiteboardCanvasRef {
  clearCanvas: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportImage: (includeBackground?: boolean) => string;
  recalculateAccuracy: () => number;
}

interface WhiteboardCanvasProps {
  boardStyle: BoardStyle;
  penType: PenType;
  penColor: string;
  penSize: number;
  template: DrawingTemplate | null;
  templateOpacity: number;
  guideColor: GuideColor;
  isARMode: boolean;
  videoElement: HTMLVideoElement | null;
  virtualCursor: { x: number; y: number } | null;
  isAirDrawing: boolean;
  calligraphyAngle?: number;
  onAccuracyUpdate?: (accuracy: number) => void;
  onGoalAchieved?: (accuracy: number) => void;
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasRef, WhiteboardCanvasProps>(({
  boardStyle,
  penType,
  penColor,
  penSize,
  template,
  templateOpacity,
  guideColor,
  isARMode,
  videoElement,
  virtualCursor,
  isAirDrawing,
  calligraphyAngle = 45,
  onAccuracyUpdate,
  onGoalAchieved,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templateCanvasRef = useRef<HTMLCanvasElement>(null);

  // Stroke histories for Undo / Redo
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const activePointerStrokeRef = useRef<Stroke | null>(null);
  const activeAirStrokeRef = useRef<Stroke | null>(null);

  // Sequential Step-by-Step Learning State
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepAlert, setStepAlert] = useState<{ type: 'error' | 'success'; message: string; timestamp: number } | null>(null);
  const activeStepPointsRef = useRef<{
    sx: number;
    sy: number;
    ex: number;
    ey: number;
    step: LessonStep;
    stepIndex: number;
  } | null>(null);
  const strokeStartedAtGreenRef = useRef(false);

  // Template guide points cache for accuracy evaluation
  const guidePointsRef = useRef<{ x: number; y: number }[]>([]);
  const hasAchievedGoalRef = useRef(false);

  // Canvas dimensions
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update canvas size on container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Sync canvas width/height attributes with display dimensions and step index
  useEffect(() => {
    const canvas = canvasRef.current;
    const tCanvas = templateCanvasRef.current;
    if (canvas && tCanvas) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      tCanvas.width = dimensions.width;
      tCanvas.height = dimensions.height;
      redrawCanvas();
      drawTemplateGuide();
    }
  }, [dimensions, template, guideColor, templateOpacity, currentStepIndex]);

  // Reset goal achieved state and step progression when template changes
  useEffect(() => {
    hasAchievedGoalRef.current = false;
    setCurrentStepIndex(0);
    setStepAlert(null);
    strokeStartedAtGreenRef.current = false;
    activeStepPointsRef.current = null;
    drawTemplateGuide();

    if (template?.steps && template.steps.length > 0) {
      const firstStep = template.steps[0];
      const timer = setTimeout(() => {
        if (firstStep) {
          const prompt = getStepAudioPrompt(firstStep);
          audioService.speakArabic(prompt);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [template]);

  // Auto-dismiss transient step alerts
  useEffect(() => {
    if (!stepAlert) return;
    const timer = setTimeout(() => {
      setStepAlert(null);
    }, 3800);
    return () => clearTimeout(timer);
  }, [stepAlert]);

  // Redraw all strokes onto canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach(stroke => {
      renderStroke(ctx, stroke);
    });
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Render a single stroke
  const renderStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length === 0) return;

    ctx.save();

    if (stroke.penType === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = stroke.size * 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = stroke.color;
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = stroke.opacity;

    if (stroke.penType === 'calligraphy') {
      // Authentic Arabic Qalam (Chiseled Reed Pen at 45° angle)
      const angle = (stroke.nibAngle || 45) * (Math.PI / 180);
      const halfSize = stroke.size * 0.9;
      const cos = Math.cos(angle) * halfSize;
      const sin = Math.sin(angle) * halfSize;

      for (let i = 0; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        const pSize = pt.pressure ? Math.max(0.6, pt.pressure) : 1;
        const curCos = cos * pSize;
        const curSin = sin * pSize;

        if (i === 0) {
          // Draw start nib slice
          ctx.beginPath();
          ctx.moveTo(pt.x - curCos, pt.y - curSin);
          ctx.lineTo(pt.x + curCos, pt.y + curSin);
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Connect consecutive slices into a ribbon polygon
          const prevPt = stroke.points[i - 1];
          const prevPSize = prevPt.pressure ? Math.max(0.6, prevPt.pressure) : 1;
          const prevCos = cos * prevPSize;
          const prevSin = sin * prevPSize;

          ctx.beginPath();
          ctx.moveTo(prevPt.x - prevCos, prevPt.y - prevSin);
          ctx.lineTo(prevPt.x + prevCos, prevPt.y + prevSin);
          ctx.lineTo(pt.x + curCos, pt.y + curSin);
          ctx.lineTo(pt.x - curCos, pt.y - curSin);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (stroke.penType === 'brush') {
      // Soft airbrush / coloring brush
      ctx.lineWidth = stroke.size * 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = stroke.size * 0.4;
      ctx.shadowColor = stroke.color;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else {
      // Standard ink marker
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    ctx.restore();
  };

  // Helper to draw ONLY the active step markers (Green Start Dot 🟢 and Red End Dot 🔴)
  // Strictly NO ARROWS, NO CONNECTING LINES, NO LETTERS LABELS ON CANVAS.
  const drawActiveStepMarker = (
    ctx: CanvasRenderingContext2D,
    steps: LessonStep[],
    stepIndex: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number
  ) => {
    if (!steps || steps.length === 0 || stepIndex >= steps.length) {
      activeStepPointsRef.current = null;
      return;
    }

    const s = steps[stepIndex];
    const sx = drawX + s.startX * drawW;
    const sy = drawY + s.startY * drawH;
    const ex = drawX + s.endX * drawW;
    const ey = drawY + s.endY * drawH;

    // Cache exact canvas coordinates for stroke constraint checking
    activeStepPointsRef.current = {
      sx,
      sy,
      ex,
      ey,
      step: s,
      stepIndex
    };

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;

    // 1. End point: Small Red Dot 🔴 (نقطة حمراء لنهاية الجرة)
    // Soft red glow
    ctx.beginPath();
    ctx.arc(ex, ey, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
    ctx.fill();

    // Solid core red dot
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // 2. Start point: Small Green Dot 🟢 (نقطة خضراء لبداية الجرة)
    // Soft green glow
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.fill();

    // Solid core green dot
    ctx.beginPath();
    ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  };

  // Draw Template Guide Layer (Supports both Google Drive image links and SVG data)
  const drawTemplateGuide = () => {
    const tCanvas = templateCanvasRef.current;
    if (!tCanvas) return;
    const ctx = tCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    guidePointsRef.current = [];

    if (!template) {
      activeStepPointsRef.current = null;
      return;
    }

    const colorHexMap: Record<GuideColor, string> = {
      yellow: '#facc15',
      green: '#4ade80',
      white: '#ffffff',
      cyan: '#38bdf8',
      black: '#0f172a'
    };

    const activeColor = colorHexMap[guideColor] || '#facc15';

    // 1. Direct Image URL (Google Drive transparent PNG or web URL)
    if (template.imageUrl && template.imageUrl.trim()) {
      const directUrl = formatDirectImageUrl(template.imageUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = directUrl;

      img.onload = () => {
        ctx.save();
        ctx.globalAlpha = templateOpacity;

        const padding = Math.min(tCanvas.width, tCanvas.height) * 0.08;
        const availW = tCanvas.width - padding * 2;
        const availH = tCanvas.height - padding * 2;
        const scale = Math.min(availW / (img.width || 500), availH / (img.height || 500));
        const drawW = (img.width || 500) * scale;
        const drawH = (img.height || 500) * scale;
        const drawX = (tCanvas.width - drawW) / 2;
        const drawY = (tCanvas.height - drawH) / 2;

        // Draw image onto an offscreen canvas to tint black calligraphy lines into active guide color
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = drawW;
          offscreen.height = drawH;
          const offCtx = offscreen.getContext('2d');
          if (offCtx) {
            offCtx.drawImage(img, 0, 0, drawW, drawH);
            offCtx.globalCompositeOperation = 'source-in';
            offCtx.fillStyle = activeColor;
            offCtx.fillRect(0, 0, drawW, drawH);
            ctx.drawImage(offscreen, drawX, drawY);
          } else {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
          }
        } catch {
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }

        ctx.restore();

        // Render ONLY the active step marker (No arrows, green start dot & red end dot)
        if (template.steps && template.steps.length > 0) {
          drawActiveStepMarker(ctx, template.steps, currentStepIndex, drawX, drawY, drawW, drawH);
        }

        // Sample guide points for accuracy evaluation
        try {
          const imgData = ctx.getImageData(0, 0, tCanvas.width, tCanvas.height);
          const data = imgData.data;
          const pts: { x: number; y: number }[] = [];
          for (let y = 0; y < tCanvas.height; y += 8) {
            for (let x = 0; x < tCanvas.width; x += 8) {
              const idx = (y * tCanvas.width + x) * 4;
              if (data[idx + 3] > 35) {
                pts.push({ x, y });
              }
            }
          }
          guidePointsRef.current = pts;
        } catch (err) {
          console.warn('Guide point sampling error (CORS or empty):', err);
        }
      };
      return;
    }

    // 2. SVG Vector Code
    if (template.svgData && template.svgData.trim()) {
      let coloredSvg = template.svgData
        .replace(/stroke="currentColor"/g, `stroke="${activeColor}"`)
        .replace(/fill="currentColor"/g, `fill="${activeColor}"`);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(coloredSvg);

      img.onload = () => {
        ctx.save();
        ctx.globalAlpha = templateOpacity;

        const padding = Math.min(tCanvas.width, tCanvas.height) * 0.08;
        const availW = tCanvas.width - padding * 2;
        const availH = tCanvas.height - padding * 2;
        const scale = Math.min(availW / (img.width || 500), availH / (img.height || 500));
        const drawW = (img.width || 500) * scale;
        const drawH = (img.height || 500) * scale;
        const drawX = (tCanvas.width - drawW) / 2;
        const drawY = (tCanvas.height - drawH) / 2;

        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 8;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();

        // Render ONLY the active step marker (No arrows, green start dot & red end dot)
        if (template.steps && template.steps.length > 0) {
          drawActiveStepMarker(ctx, template.steps, currentStepIndex, drawX, drawY, drawW, drawH);
        }

        try {
          const imgData = ctx.getImageData(0, 0, tCanvas.width, tCanvas.height);
          const data = imgData.data;
          const pts: { x: number; y: number }[] = [];
          for (let y = 0; y < tCanvas.height; y += 8) {
            for (let x = 0; x < tCanvas.width; x += 8) {
              const idx = (y * tCanvas.width + x) * 4;
              if (data[idx + 3] > 40) {
                pts.push({ x, y });
              }
            }
          }
          guidePointsRef.current = pts;
        } catch (err) {
          console.warn('Guide point sampling error:', err);
        }
      };
    }
  };

  // Evaluate drawing accuracy against template
  const calculateAccuracy = useCallback((): number => {
    const guidePts = guidePointsRef.current;
    if (guidePts.length === 0 || !template || template.category === 'freehand') return 0;

    // Collect all drawn points
    const drawnPts: { x: number; y: number }[] = [];
    strokes.forEach(stroke => {
      if (stroke.penType !== 'eraser') {
        stroke.points.forEach(p => drawnPts.push({ x: p.x, y: p.y }));
      }
    });

    if (drawnPts.length === 0) return 0;

    // Radius of tolerance
    const tolerance = 32;
    let coveredCount = 0;

    // Check how many guide points are covered by drawn points
    for (const gPt of guidePts) {
      let isCovered = false;
      for (const dPt of drawnPts) {
        const dist = Math.hypot(gPt.x - dPt.x, gPt.y - dPt.y);
        if (dist <= tolerance) {
          isCovered = true;
          break;
        }
      }
      if (isCovered) coveredCount++;
    }

    const accuracyPercent = Math.min(100, Math.round((coveredCount / guidePts.length) * 100));

    if (onAccuracyUpdate) {
      onAccuracyUpdate(accuracyPercent);
    }

    // Check if goal achieved
    const target = template.targetAccuracy || 70;
    if (accuracyPercent >= target && !hasAchievedGoalRef.current) {
      hasAchievedGoalRef.current = true;
      if (onGoalAchieved) {
        onGoalAchieved(accuracyPercent);
      }
      // Confetti & Audio celebration
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      audioService.playSuccessFanfare();
      audioService.speakArabic('أحسنت! رسم دقيق ورائع جداً');
    }

    return accuracyPercent;
  }, [strokes, template, onAccuracyUpdate, onGoalAchieved]);

  // Recalculate whenever strokes change
  useEffect(() => {
    calculateAccuracy();
  }, [strokes, calculateAccuracy]);

  // Handle pointer down (Mouse, Finger Touch, Apple Pencil Stylus)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 1;

    // Step constraint check: Student must start at the green launch dot 🟢
    if (template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
      const active = activeStepPointsRef.current;
      const startDist = Math.hypot(x - active.sx, y - active.sy);
      const startThreshold = Math.max(38, penSize * 2.2);

      if (startDist <= startThreshold) {
        strokeStartedAtGreenRef.current = true;
        setStepAlert(null);
        audioService.playStrokeStart();
      } else {
        strokeStartedAtGreenRef.current = false;
        audioService.playErrorSound();
        setStepAlert({
          type: 'error',
          message: 'تنبيه: ابدأ الرسم من النقطة الخضراء 🟢',
          timestamp: Date.now()
        });
        audioService.speakArabic('ابدأ من النقطة الخضراء');
      }
    } else {
      strokeStartedAtGreenRef.current = true;
      audioService.playStrokeStart();
    }

    const newStroke: Stroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      points: [{ x, y, pressure, time: Date.now() }],
      penType,
      color: penColor,
      size: penSize,
      opacity: penType === 'brush' ? 0.65 : 1,
      nibAngle: calligraphyAngle
    };

    activePointerStrokeRef.current = newStroke;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderStroke(ctx, newStroke);
    }
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!activePointerStrokeRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 1;

    const curStroke = activePointerStrokeRef.current;
    const lastPt = curStroke.points[curStroke.points.length - 1];

    // Filter tiny micro-movements for smooth performance
    if (Math.hypot(x - lastPt.x, y - lastPt.y) < 2) return;

    curStroke.points.push({ x, y, pressure, time: Date.now() });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderStroke(ctx, {
        ...curStroke,
        points: curStroke.points.slice(-3) // Fast incremental draw
      });
    }
  };

  // Handle pointer up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (activePointerStrokeRef.current) {
      const finishedStroke = activePointerStrokeRef.current;
      setStrokes(prev => [...prev, finishedStroke]);
      setRedoStack([]); // Clear redo history on new stroke
      activePointerStrokeRef.current = null;
      redrawCanvas();

      // Step constraint check: Validate reaching the red target dot 🔴
      if (template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
        if (strokeStartedAtGreenRef.current) {
          const active = activeStepPointsRef.current;
          const lastPt = finishedStroke.points[finishedStroke.points.length - 1];
          const endDist = Math.hypot(lastPt.x - active.ex, lastPt.y - active.ey);
          const endThreshold = Math.max(40, penSize * 2.4);

          if (endDist <= endThreshold) {
            // Reached red dot successfully!
            audioService.playStepSuccessSound();
            const nextIdx = currentStepIndex + 1;
            if (nextIdx < template.steps.length) {
              setCurrentStepIndex(nextIdx);
              const nextStep = template.steps[nextIdx];
              const stepName = getArabicOrdinal(currentStepIndex + 1);
              setStepAlert({
                type: 'success',
                message: `رائع! أتممت ${stepName} بنجاح ✓`,
                timestamp: Date.now()
              });
              const nextPrompt = getStepAudioPrompt(nextStep);
              setTimeout(() => {
                audioService.speakArabic(nextPrompt);
              }, 400);
            } else {
              // All steps completed!
              confetti({
                particleCount: 90,
                spread: 75,
                origin: { y: 0.6 }
              });
              audioService.playSuccessFanfare();
              audioService.speakArabic('ممتاز جداً! أتممت رسم جميع خطوات الحرف بنجاح');
              setStepAlert({
                type: 'success',
                message: 'مبارك! أتممت جميع خطوات كتابة الحرف بنجاح 🎉',
                timestamp: Date.now()
              });
              if (onGoalAchieved) {
                onGoalAchieved(100);
              }
            }
          } else {
            // Stroke did not reach red dot
            audioService.playErrorSound();
            setStepAlert({
              type: 'error',
              message: 'تنبيه: يجب إيصال القلم إلى النقطة الحمراء 🔴 لإكمال الخطوة',
              timestamp: Date.now()
            });
            audioService.speakArabic('واصل الرسم حتى النقطة الحمراء');
          }
        }
        strokeStartedAtGreenRef.current = false;
      }
    }
  };

  // Handle Air-Drawing from AR Hand Tracking
  useEffect(() => {
    if (!isARMode || !virtualCursor) {
      if (activeAirStrokeRef.current) {
        setStrokes(prev => [...prev, activeAirStrokeRef.current!]);
        activeAirStrokeRef.current = null;
        redrawCanvas();
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const x = virtualCursor.x * dimensions.width;
    const y = virtualCursor.y * dimensions.height;

    if (isAirDrawing) {
      if (!activeAirStrokeRef.current) {
        // Start air stroke - validate green dot start
        if (template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
          const active = activeStepPointsRef.current;
          const startDist = Math.hypot(x - active.sx, y - active.sy);
          const startThreshold = Math.max(50, penSize * 2.8);
          if (startDist <= startThreshold) {
            strokeStartedAtGreenRef.current = true;
            setStepAlert(null);
            audioService.playStrokeStart();
          } else {
            strokeStartedAtGreenRef.current = false;
            audioService.playErrorSound();
            setStepAlert({
              type: 'error',
              message: 'تنبيه: ابدأ الرسم من النقطة الخضراء 🟢',
              timestamp: Date.now()
            });
            audioService.speakArabic('ابدأ من النقطة الخضراء');
          }
        } else {
          strokeStartedAtGreenRef.current = true;
          audioService.playStrokeStart();
        }

        activeAirStrokeRef.current = {
          id: `air_stroke_${Date.now()}`,
          points: [{ x, y, pressure: 1, time: Date.now() }],
          penType,
          color: penColor,
          size: penSize,
          opacity: penType === 'brush' ? 0.65 : 1,
          nibAngle: calligraphyAngle
        };
      } else {
        // Continue air stroke
        const curStroke = activeAirStrokeRef.current;
        const lastPt = curStroke.points[curStroke.points.length - 1];
        if (Math.hypot(x - lastPt.x, y - lastPt.y) >= 3) {
          curStroke.points.push({ x, y, pressure: 1, time: Date.now() });
          const ctx = canvas.getContext('2d');
          if (ctx) {
            renderStroke(ctx, {
              ...curStroke,
              points: curStroke.points.slice(-3)
            });
          }
        }
      }
    } else {
      if (activeAirStrokeRef.current) {
        const finishedAirStroke = activeAirStrokeRef.current;
        setStrokes(prev => [...prev, finishedAirStroke]);
        activeAirStrokeRef.current = null;
        redrawCanvas();

        // Validate red dot finish for air stroke
        if (template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
          if (strokeStartedAtGreenRef.current) {
            const active = activeStepPointsRef.current;
            const lastPt = finishedAirStroke.points[finishedAirStroke.points.length - 1];
            const endDist = Math.hypot(lastPt.x - active.ex, lastPt.y - active.ey);
            const endThreshold = Math.max(52, penSize * 3);

            if (endDist <= endThreshold) {
              audioService.playStepSuccessSound();
              const nextIdx = currentStepIndex + 1;
              if (nextIdx < template.steps.length) {
                setCurrentStepIndex(nextIdx);
                const nextStep = template.steps[nextIdx];
                const stepName = getArabicOrdinal(currentStepIndex + 1);
                setStepAlert({
                  type: 'success',
                  message: `رائع! أتممت ${stepName} بنجاح ✓`,
                  timestamp: Date.now()
                });
                const nextPrompt = getStepAudioPrompt(nextStep);
                setTimeout(() => {
                  audioService.speakArabic(nextPrompt);
                }, 400);
              } else {
                confetti({
                  particleCount: 90,
                  spread: 75,
                  origin: { y: 0.6 }
                });
                audioService.playSuccessFanfare();
                audioService.speakArabic('ممتاز جداً! أتممت رسم جميع خطوات الحرف بنجاح');
                setStepAlert({
                  type: 'success',
                  message: 'مبارك! أتممت جميع خطوات كتابة الحرف بنجاح 🎉',
                  timestamp: Date.now()
                });
                if (onGoalAchieved) onGoalAchieved(100);
              }
            } else {
              audioService.playErrorSound();
              setStepAlert({
                type: 'error',
                message: 'تنبيه: يجب إيصال القلم إلى النقطة الحمراء 🔴 لإكمال الخطوة',
                timestamp: Date.now()
              });
              audioService.speakArabic('واصل الرسم حتى النقطة الحمراء');
            }
          }
          strokeStartedAtGreenRef.current = false;
        }
      }
    }
  }, [virtualCursor, isAirDrawing, isARMode, dimensions, penType, penColor, penSize, calligraphyAngle, redrawCanvas, currentStepIndex, template, onGoalAchieved]);

  // Imperative actions exposed to parent component
  useImperativeHandle(ref, () => ({
    clearCanvas: () => {
      audioService.playEraserSound();
      setStrokes([]);
      setRedoStack([]);
      activePointerStrokeRef.current = null;
      activeAirStrokeRef.current = null;
      hasAchievedGoalRef.current = false;
      setCurrentStepIndex(0);
      setStepAlert(null);
      strokeStartedAtGreenRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (onAccuracyUpdate) onAccuracyUpdate(0);
      if (template?.steps && template.steps.length > 0) {
        const prompt = getStepAudioPrompt(template.steps[0]);
        audioService.speakArabic(prompt);
      }
    },
    undo: () => {
      if (strokes.length === 0) return;
      audioService.playChime(420, 0.1);
      const last = strokes[strokes.length - 1];
      setStrokes(prev => prev.slice(0, -1));
      setRedoStack(prev => [...prev, last]);
    },
    redo: () => {
      if (redoStack.length === 0) return;
      audioService.playChime(620, 0.1);
      const next = redoStack[redoStack.length - 1];
      setRedoStack(prev => prev.slice(0, -1));
      setStrokes(prev => [...prev, next]);
    },
    canUndo: strokes.length > 0,
    canRedo: redoStack.length > 0,
    exportImage: (includeBackground = true) => {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = dimensions.width;
      exportCanvas.height = dimensions.height;
      const ctx = exportCanvas.getContext('2d')!;

      if (includeBackground) {
        if (boardStyle === 'white') {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        } else if (boardStyle === 'dark') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        } else if (boardStyle === 'green') {
          ctx.fillStyle = '#064e3b';
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        } else if (boardStyle === 'grid') {
          ctx.fillStyle = '#fdfbf7';
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        }
      }

      // Draw template
      if (templateCanvasRef.current) {
        ctx.drawImage(templateCanvasRef.current, 0, 0);
      }

      // Draw user drawing
      if (canvasRef.current) {
        ctx.drawImage(canvasRef.current, 0, 0);
      }

      return exportCanvas.toDataURL('image/png');
    },
    recalculateAccuracy: () => calculateAccuracy()
  }), [strokes, redoStack, dimensions, boardStyle, calculateAccuracy, onAccuracyUpdate, template]);

  // Board background classes and styles
  const getBoardBgStyle = () => {
    switch (boardStyle) {
      case 'white':
        return 'bg-slate-50 border-slate-300 shadow-inner';
      case 'dark':
        return 'bg-slate-900 border-slate-800 shadow-2xl';
      case 'green':
        return 'bg-[#064e3b] border-emerald-950 shadow-2xl';
      case 'grid':
        return 'bg-[#fdfbf7] border-amber-200 shadow-inner';
      case 'ar_camera':
        return 'bg-transparent';
      default:
        return 'bg-slate-900 border-slate-800';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[380px] sm:min-h-[460px] md:min-h-[540px] rounded-2xl overflow-hidden flex items-center justify-center border select-none transition-all duration-300 ${getBoardBgStyle()}`}
    >
      {/* Calligraphy Guide Grid Lines Pattern */}
      {boardStyle === 'grid' && (
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(217, 119, 6, 0.25) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(217, 119, 6, 0.25) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(220, 38, 38, 0.35) 1.5px, transparent 1.5px)
            `,
            backgroundSize: '40px 40px, 40px 40px, 40px 120px'
          }}
        />
      )}

      {/* AR Live Video Camera Stream */}
      {isARMode && videoElement && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Note: Video element is attached via ref in ARCameraOverlay */}
        </div>
      )}

      {/* Layer 1: Template Guide Layer */}
      <canvas
        ref={templateCanvasRef}
        className="absolute inset-0 pointer-events-none z-10"
      />

      {/* Layer 2: Interactive User Drawing Layer */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute inset-0 z-20 cursor-crosshair touch-none"
      />

      {/* Layer 3: Floating Step Guidance Bar (When Lesson Has Steps) */}
      {template?.steps && template.steps.length > 0 && (
        <div className="absolute top-3 inset-x-3 z-30 pointer-events-none flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 px-3.5 py-1.5 sm:py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl text-white">
            {/* Step Counter Badge */}
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 font-bold text-xs sm:text-sm">
                {getArabicOrdinal(currentStepIndex + 1)}
              </span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                من {template.steps.length}
              </span>
            </div>

            {/* Step Progress Dots */}
            <div className="flex items-center gap-1">
              {template.steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx < currentStepIndex
                      ? 'bg-emerald-500 scale-100'
                      : idx === currentStepIndex
                      ? 'bg-amber-400 scale-125 ring-2 ring-amber-400/40'
                      : 'bg-slate-700 scale-90'
                  }`}
                />
              ))}
            </div>

            {/* Visual start / end reminder */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-300 border-r border-l border-slate-700/80 px-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_6px_#10b981]" />
              <span>ابدأ</span>
              <span className="text-slate-500">←</span>
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block shadow-[0_0_6px_#ef4444]" />
              <span>انتهِ</span>
            </div>

            {/* Audio Voice Guidance Button */}
            <button
              type="button"
              onClick={() => {
                if (template.steps && template.steps[currentStepIndex]) {
                  const prompt = getStepAudioPrompt(template.steps[currentStepIndex]);
                  audioService.speakArabic(prompt);
                }
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-colors"
              title="استمع لتوجيه الخطوة"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>

            {/* Reset Step Progress Button */}
            <button
              type="button"
              onClick={() => {
                setCurrentStepIndex(0);
                setStepAlert(null);
                strokeStartedAtGreenRef.current = false;
                if (template.steps && template.steps[0]) {
                  const prompt = getStepAudioPrompt(template.steps[0]);
                  audioService.speakArabic(prompt);
                }
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="إعادة من الخطوة الأولى"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Layer 4: Interactive Alert & Feedback Banner */}
      {stepAlert && (
        <div className="absolute bottom-4 inset-x-4 z-40 flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm shadow-xl backdrop-blur-sm pointer-events-auto transition-all ${
              stepAlert.type === 'error'
                ? 'bg-rose-600/95 text-white border border-rose-400/40'
                : 'bg-emerald-600/95 text-white border border-emerald-400/40'
            }`}
          >
            {stepAlert.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-white" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
            )}
            <span>{stepAlert.message}</span>
          </div>
        </div>
      )}

      {/* Layer 5: Virtual Air-Cursor Overlay (for AR Hand Tracking) */}
      {isARMode && virtualCursor && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            left: `${virtualCursor.x * 100}%`,
            top: `${virtualCursor.y * 100}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-150 ${
            isAirDrawing
              ? 'bg-amber-500/80 border-white shadow-[0_0_20px_#f59e0b] scale-125 animate-pulse'
              : 'bg-white/40 border-amber-400 shadow-[0_0_12px_rgba(255,255,255,0.8)] scale-100'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isAirDrawing ? 'bg-white' : 'bg-amber-400'}`} />
            {isAirDrawing && (
              <span className="absolute -top-7 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950 whitespace-nowrap shadow-md">
                ✍️ يرسم
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

WhiteboardCanvas.displayName = 'WhiteboardCanvas';
