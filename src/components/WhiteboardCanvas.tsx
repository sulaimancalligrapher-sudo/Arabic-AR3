import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { BoardStyle, PenType, Stroke, Point, DrawingTemplate, GuideColor, LessonStep } from '../types/drawing';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { getArabicOrdinal, getArabicDrawingOrdinal, getStepAudioPrompt, RegistrantUser, sheetService } from '../services/sheetService';
import {
  AlertCircle,
  CheckCircle2,
  Volume2,
  RotateCcw,
  Repeat,
  HelpCircle,
  Maximize2,
  Minimize2,
  Award,
  X,
  Camera,
  BookOpen,
  FolderOpen,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Move,
  Plus,
  Minus,
  Crosshair,
  Pin,
  PinOff,
  Star,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  SlidersHorizontal
} from 'lucide-react';
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
  crownCanvas?: HTMLCanvasElement | null;
  isMirrored?: boolean;
  saveArCameraPhoto?: boolean;
  virtualCursor: { x: number; y: number } | null;
  isAirDrawing: boolean;
  isAirPenLocked?: boolean;
  onToggleAirPenLock?: () => void;
  calligraphyAngle?: number;
  currentRepetition?: number;
  isFullscreen?: boolean;
  isMobileLandscape?: boolean;
  isLandscapeToolbarOpen?: boolean;
  onToggleLandscapeToolbar?: () => void;
  currentUser?: RegistrantUser | null;
  totalLessonsInTopic?: number;
  onToggleFullscreen?: () => void;
  onOpenHelp?: () => void;
  onOpenLibrary?: () => void;
  onClearSideEffects?: () => void;
  onNextRepetition?: () => void;
  onResetRepetition?: () => void;
  onAccuracyUpdate?: (accuracy: number) => void;
  onGoalAchieved?: (accuracy: number) => void;
}

interface TemplateTransform {
  offsetX: number; // fraction of canvas width [-0.42, 0.42]
  offsetY: number; // fraction of canvas height [-0.42, 0.42]
  scale: number;   // multiplier [0.55, 1.60]
}

const DEFAULT_TEMPLATE_TRANSFORM: TemplateTransform = { offsetX: 0, offsetY: 0, scale: 1 };
const LOCK_TRANSFORM_KEY = 'arabic_calligraphy_lock_transform_v1';
const SAVED_TRANSFORM_KEY = 'arabic_calligraphy_saved_transform_v1';

type LessonEvalMode = 'steps' | 'guide_only' | 'freehand';

const getLessonEvalMode = (tpl: DrawingTemplate | null): LessonEvalMode => {
  if (!tpl) return 'freehand';
  const hasVisualGuide = Boolean(tpl.imageUrl?.trim() || tpl.svgData?.trim());
  const hasSteps = Boolean(tpl.steps && tpl.steps.length > 0);
  if (tpl.category === 'freehand' || (!hasVisualGuide && !hasSteps)) {
    return 'freehand';
  }
  if (!hasSteps || tpl.hideDots) {
    return 'guide_only';
  }
  return 'steps';
};

const getEarnedStars = (score: number): number => {
  if (score <= 0) return 0;
  if (score >= 95) return 10;
  return Math.max(1, Math.min(10, Math.round(score / 10)));
};

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
  crownCanvas = null,
  isMirrored = true,
  saveArCameraPhoto = true,
  virtualCursor,
  isAirDrawing,
  isAirPenLocked = false,
  onToggleAirPenLock,
  calligraphyAngle = 120,
  currentRepetition = 1,
  isFullscreen = false,
  isMobileLandscape = false,
  isLandscapeToolbarOpen = false,
  onToggleLandscapeToolbar,
  currentUser,
  totalLessonsInTopic,
  onToggleFullscreen,
  onOpenHelp,
  onOpenLibrary,
  onClearSideEffects,
  onNextRepetition,
  onResetRepetition,
  onAccuracyUpdate,
  onGoalAchieved,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templateCanvasRef = useRef<HTMLCanvasElement>(null);
  const diagnosticCanvasRef = useRef<HTMLCanvasElement>(null);

  // Stroke histories for Undo / Redo
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const activePointerStrokeRef = useRef<Stroke | null>(null);
  const activeAirStrokeRef = useRef<Stroke | null>(null);

  // Template Move & Scale Controls + Global Lock Persistence
  const [isTransformLocked, setIsTransformLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCK_TRANSFORM_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [templateTransform, setTemplateTransform] = useState<TemplateTransform>(() => {
    try {
      if (localStorage.getItem(LOCK_TRANSFORM_KEY) === 'true') {
        const raw = localStorage.getItem(SAVED_TRANSFORM_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.offsetX === 'number' && typeof parsed.offsetY === 'number' && typeof parsed.scale === 'number') {
            return parsed;
          }
        }
      }
    } catch {}
    return DEFAULT_TEMPLATE_TRANSFORM;
  });
  const [isTransformPopoverOpen, setIsTransformPopoverOpen] = useState(false);

  // Diagnostic overlay & Slim evaluation sidebar controls
  const [showDiagnosticColors, setShowDiagnosticColors] = useState(true);
  const [evalSidebarSide, setEvalSidebarSide] = useState<'right' | 'left'>('left');
  const [isEvalSidebarCollapsed, setIsEvalSidebarCollapsed] = useState(false);

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

  // Stroke point path tracking & evaluation modal
  const strokeStatsRef = useRef({
    total: 0,
    corePoints: 0,
    grazingPoints: 0,
    offPathPoints: 0,
    offPathConsecutive: 0,
    maxConsecutiveOffPath: 0,
    hasBrokenAway: false
  });
  const [isLessonStarted, setIsLessonStarted] = useState(false);
  const [pendingNextRepScore, setPendingNextRepScore] = useState<number | null>(null);
  const repetitionScoresRef = useRef<{
    rep: number;
    totalScore: number;
    startEndScore: number;
    pathScore: number;
    coverageScore: number;
  }[]>([]);
  const autoStartNextRepRef = useRef(false);
  const [evaluationModal, setEvaluationModal] = useState<{
    isOpen: boolean;
    totalScore: number;
    startEndScore: number;
    pathScore: number;
    coverageScore: number;
    feedback: string;
    evalMode: LessonEvalMode;
    repetitionBreakdown?: { rep: number; score: number }[];
  } | null>(null);

  // Two-finger vertical pan for rotated mobile/tablet viewports (avoids Android 3-finger split-screen gesture)
  const [boardPanY, setBoardPanY] = useState(0);
  const twoFingerPanRef = useRef<{ active: boolean; lastAvgY: number }>({ active: false, lastAvgY: 0 });

  // Answer submission to Google Drive and 'answers 1' sheet
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [submitAnswerResult, setSubmitAnswerResult] = useState<{
    success: boolean;
    message: string;
    imageUrl?: string;
    completionStatus?: string;
  } | null>(null);

  // Challenge Mode: Ghost overlay comparison for memory test
  const [showGhostOverlay, setShowGhostOverlay] = useState(false);

  const resetStrokeStats = useCallback(() => {
    strokeStatsRef.current = {
      total: 0,
      corePoints: 0,
      grazingPoints: 0,
      offPathPoints: 0,
      offPathConsecutive: 0,
      maxConsecutiveOffPath: 0,
      hasBrokenAway: false
    };
  }, []);

  // Template guide points cache and fast spatial letter grid for pixel-level accuracy
  const guidePointsRef = useRef<{ x: number; y: number }[]>([]);
  const letterGridRef = useRef<{
    grid: Uint8Array;
    width: number;
    height: number;
    cell: number;
    totalCells: number;
  } | null>(null);
  const drawBoundsRef = useRef<{ drawX: number; drawY: number; drawW: number; drawH: number } | null>(null);
  const stepScoresRef = useRef<{ startEnd: number; path: number; brokenAway: boolean }[]>([]);
  const hasAchievedGoalRef = useRef(false);

  // Canvas dimensions
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update canvas size on container resize (including portrait <-> landscape orientation changes)
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
          setBoardPanY(0);
        }
      }
    };

    updateSize();
    const el = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateSize());
      observer.observe(el);
    }
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Persist template transform when global lock is active
  const updateTemplateTransform = useCallback((updater: (prev: TemplateTransform) => TemplateTransform) => {
    setTemplateTransform(prev => {
      const next = updater(prev);
      if (isTransformLocked) {
        try {
          localStorage.setItem(SAVED_TRANSFORM_KEY, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, [isTransformLocked]);

  const toggleTransformLock = useCallback(() => {
    setIsTransformLocked(prev => {
      const next = !prev;
      try {
        localStorage.setItem(LOCK_TRANSFORM_KEY, String(next));
        if (next) {
          localStorage.setItem(SAVED_TRANSFORM_KEY, JSON.stringify(templateTransform));
        }
      } catch {}
      return next;
    });
  }, [templateTransform]);

  // Sync canvas width/height attributes with display dimensions and step index
  useEffect(() => {
    const canvas = canvasRef.current;
    const tCanvas = templateCanvasRef.current;
    const dCanvas = diagnosticCanvasRef.current;
    if (canvas && tCanvas) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      tCanvas.width = dimensions.width;
      tCanvas.height = dimensions.height;
      if (dCanvas) {
        dCanvas.width = dimensions.width;
        dCanvas.height = dimensions.height;
      }
      redrawCanvas();
      drawTemplateGuide();
    }
  }, [dimensions, template, guideColor, templateOpacity, currentStepIndex, showGhostOverlay, templateTransform, isMobileLandscape]);

  // Clear repetition cumulative history & apply transform lock behavior when template changes
  useEffect(() => {
    repetitionScoresRef.current = [];
    autoStartNextRepRef.current = false;
    setPendingNextRepScore(null);
    setIsTransformPopoverOpen(false);
    if (!isTransformLocked) {
      setTemplateTransform(DEFAULT_TEMPLATE_TRANSFORM);
    }
  }, [template, isTransformLocked]);

  // Reset goal achieved state and step progression when template or repetition changes
  useEffect(() => {
    hasAchievedGoalRef.current = false;
    setCurrentStepIndex(0);
    setStepAlert(null);
    setEvaluationModal(null);
    setSubmitAnswerResult(null);
    setShowGhostOverlay(false);
    setShowDiagnosticColors(true);
    setIsEvalSidebarCollapsed(false);
    setPendingNextRepScore(null);
    setBoardPanY(0);
    strokeStartedAtGreenRef.current = false;
    stepScoresRef.current = [];
    activePointerStrokeRef.current = null;
    activeAirStrokeRef.current = null;
    setStrokes([]);
    setRedoStack([]);
    resetStrokeStats();

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    const dCanvas = diagnosticCanvasRef.current;
    if (dCanvas) {
      dCanvas.getContext('2d')?.clearRect(0, 0, dCanvas.width, dCanvas.height);
    }

    if (autoStartNextRepRef.current) {
      autoStartNextRepRef.current = false;
      setIsLessonStarted(true);
      if (template?.steps && template.steps[0] && !template.hideDots && !template.hideImage) {
        const prompt = getStepAudioPrompt(template.steps[0]);
        setTimeout(() => audioService.speakArabic(prompt), 250);
      }
    } else {
      setIsLessonStarted(false);
    }

    drawTemplateGuide();
  }, [template, currentRepetition, resetStrokeStats]);

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
    drawH: number,
    shouldDrawDots = true
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

    if (!shouldDrawDots) return;

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

  // Calculate perpendicular distance from point (px, py) to line segment (x1, y1) -> (x2, y2)
  const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  // 100% Reliable Fallback: Rasterize step corridor segments into the letter grid
  const rasterizeStepCorridorsIntoGrid = (
    grid: Uint8Array,
    gw: number,
    gh: number,
    cell: number,
    steps: LessonStep[],
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    pts: { x: number; y: number }[]
  ): number => {
    let added = 0;
    const thickness = Math.max(22, drawW * 0.08);
    const radius = thickness / 2;

    steps.forEach(s => {
      const sx = drawX + s.startX * drawW;
      const sy = drawY + s.startY * drawH;
      const ex = drawX + s.endX * drawW;
      const ey = drawY + s.endY * drawH;

      const minX = Math.max(0, Math.floor((Math.min(sx, ex) - radius) / cell));
      const maxX = Math.min(gw - 1, Math.ceil((Math.max(sx, ex) + radius) / cell));
      const minY = Math.max(0, Math.floor((Math.min(sy, ey) - radius) / cell));
      const maxY = Math.min(gh - 1, Math.ceil((Math.max(sy, ey) + radius) / cell));

      for (let gy = minY; gy <= maxY; gy++) {
        const y = gy * cell;
        const rowOffset: number = gy * gw;
        for (let gx = minX; gx <= maxX; gx++) {
          const x = gx * cell;
          const idx: number = rowOffset + gx;
          if (grid[idx] === 0) {
            const d = distToSegment(x, y, sx, sy, ex, ey);
            if (d <= radius) {
              grid[idx] = 1;
              added++;
              pts.push({ x, y });
            }
          }
        }
      }
    });

    return added;
  };

  // Extract pixel-level letter grid using a dedicated sampling canvas (supports transparent PNGs AND opaque white-background images)
  const extractLetterGridFromImage = (
    img: HTMLImageElement,
    tWidth: number,
    tHeight: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    steps?: LessonStep[]
  ) => {
    const cell = 4;
    const gw = Math.ceil(tWidth / cell);
    const gh = Math.ceil(tHeight / cell);
    const grid = new Uint8Array(gw * gh);
    let totalCells = 0;
    const pts: { x: number; y: number }[] = [];

    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = tWidth;
      sampleCanvas.height = tHeight;
      const sCtx = sampleCanvas.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(img, drawX, drawY, drawW, drawH);
        const imgData = sCtx.getImageData(0, 0, tWidth, tHeight);
        const data = imgData.data;

        // Detect if the image has an opaque light/white background instead of transparency
        let opaqueCount = 0;
        let brightWhiteCount = 0;
        let sampled = 0;
        const stepSample = cell * 3;
        const xStart = Math.max(0, Math.floor(drawX));
        const xEnd = Math.min(tWidth, Math.ceil(drawX + drawW));
        const yStart = Math.max(0, Math.floor(drawY));
        const yEnd = Math.min(tHeight, Math.ceil(drawY + drawH));

        for (let sy = yStart; sy < yEnd; sy += stepSample) {
          for (let sx = xStart; sx < xEnd; sx += stepSample) {
            const pIdx = (sy * tWidth + sx) * 4;
            sampled++;
            if (data[pIdx + 3] > 200) {
              opaqueCount++;
              const lum = (data[pIdx] + data[pIdx + 1] + data[pIdx + 2]) / 3;
              if (lum > 215) brightWhiteCount++;
            }
          }
        }
        const hasOpaqueWhiteBg = sampled > 0 && opaqueCount / sampled > 0.85 && brightWhiteCount / sampled > 0.35;

        for (let y = 0; y < tHeight; y += cell) {
          const gy = Math.floor(y / cell);
          for (let x = 0; x < tWidth; x += cell) {
            const idx = (y * tWidth + x) * 4;
            const alpha = data[idx + 3];
            if (alpha > 30) {
              if (hasOpaqueWhiteBg) {
                const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                const chroma = Math.max(data[idx], data[idx + 1], data[idx + 2]) - Math.min(data[idx], data[idx + 1], data[idx + 2]);
                if (lum > 200 && chroma < 32) continue; // Skip white paper background; preserve dark strokes AND bright colored details
              }
              const gx = Math.floor(x / cell);
              grid[gy * gw + gx] = 1;
              totalCells++;
              pts.push({ x, y });
            }
          }
        }
      }
    } catch (err) {
      console.warn('Guide point sampling error (CORS or empty):', err);
    }

    if (totalCells === 0 && steps && steps.length > 0) {
      totalCells = rasterizeStepCorridorsIntoGrid(grid, gw, gh, cell, steps, drawX, drawY, drawW, drawH, pts);
    }

    guidePointsRef.current = pts;
    letterGridRef.current = { grid, width: gw, height: gh, cell, totalCells };
  };

  // Draw Template Guide Layer (Supports both Google Drive image links and SVG data)
  const drawTemplateGuide = () => {
    const tCanvas = templateCanvasRef.current;
    if (!tCanvas) return;
    const ctx = tCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    guidePointsRef.current = [];
    letterGridRef.current = null;

    if (!template) {
      activeStepPointsRef.current = null;
      drawBoundsRef.current = null;
      return;
    }

    const colorHexMap: Record<GuideColor, string> = {
      yellow: '#facc15',
      green: '#4ade80',
      white: '#ffffff',
      cyan: '#38bdf8',
      black: '#0f172a'
    };

    const isBlindMode = !!template.hideImage;
    const shouldRenderImage = !isBlindMode || showGhostOverlay;
    const shouldRenderDots = !template.hideDots && !isBlindMode;
    const activeColor = isBlindMode && showGhostOverlay ? '#f59e0b' : (colorHexMap[guideColor] || '#facc15');
    const effectiveOpacity = isBlindMode && showGhostOverlay ? 0.45 : templateOpacity;

    const computeTransformedBox = (natW: number, natH: number) => {
      const topReserved = isMobileLandscape ? 36 : 0;
      const padRatio = isMobileLandscape ? 0.04 : 0.08;
      const padding = Math.min(tCanvas.width, tCanvas.height) * padRatio;
      const availW = tCanvas.width - padding * 2;
      const availH = Math.max(80, tCanvas.height - topReserved - padding * 2);
      const baseScale = Math.min(availW / (natW || 500), availH / (natH || 500));
      const drawW = (natW || 500) * baseScale * templateTransform.scale;
      const drawH = (natH || 500) * baseScale * templateTransform.scale;
      const drawX = (tCanvas.width - drawW) / 2 + templateTransform.offsetX * tCanvas.width;
      const drawY = topReserved + ((tCanvas.height - topReserved) - drawH) / 2 + templateTransform.offsetY * tCanvas.height;
      return { drawX, drawY, drawW, drawH };
    };

    const renderLoadedImage = (img: HTMLImageElement, canReadPixels: boolean) => {
      const { drawX, drawY, drawW, drawH } = computeTransformedBox(img.width || 500, img.height || 500);
      drawBoundsRef.current = { drawX, drawY, drawW, drawH };

      if (shouldRenderImage) {
        if (canReadPixels) {
          try {
            const wPx = Math.max(1, Math.round(drawW));
            const hPx = Math.max(1, Math.round(drawH));
            const offscreen = document.createElement('canvas');
            offscreen.width = wPx;
            offscreen.height = hPx;
            const offCtx = offscreen.getContext('2d');
            if (offCtx) {
              offCtx.drawImage(img, 0, 0, wPx, hPx);
              const px = offCtx.getImageData(0, 0, wPx, hPx);
              const d = px.data;

              // Check if opaque white background -> strip ONLY neutral bright paper pixels
              let cornerOpaqueWhite = 0;
              const checkCoords = [
                0,
                (wPx - 1) * 4,
                ((hPx - 1) * wPx) * 4,
                ((hPx - 1) * wPx + wPx - 1) * 4
              ];
              checkCoords.forEach(ci => {
                if (d[ci + 3] > 200 && (d[ci] + d[ci + 1] + d[ci + 2]) / 3 > 215) {
                  cornerOpaqueWhite++;
                }
              });
              const stripWhiteBg = cornerOpaqueWhite >= 3;

              // Parse active guide hex color to RGB
              const hexClean = activeColor.replace('#', '');
              const tR = parseInt(hexClean.slice(0, 2), 16) || 250;
              const tG = parseInt(hexClean.slice(2, 4), 16) || 204;
              const tB = parseInt(hexClean.slice(4, 6), 16) || 21;

              // Dual-layer split:
              // 1. neutralData: dark/grayscale strokes recolored to activeColor (drawn with effectiveOpacity)
              // 2. coloredData: explicitly colored details (chroma >= 40) preserved at full vivid RGB & 100% opacity!
              const neutralImg = offCtx.createImageData(wPx, hPx);
              const coloredImg = offCtx.createImageData(wPx, hPx);
              const nD = neutralImg.data;
              const cD = coloredImg.data;
              let hasColoredDetails = false;

              for (let i = 0; i < d.length; i += 4) {
                const a = d[i + 3];
                if (a === 0) continue;
                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                const maxC = Math.max(r, g, b);
                const minC = Math.min(r, g, b);
                const chroma = maxC - minC;
                const avg = (r + g + b) / 3;

                if (stripWhiteBg && avg > 210 && chroma < 32) {
                  continue; // Transparent white paper background
                }

                if (chroma >= 40) {
                  // Vivid/chromatic colored stroke or marker detail -> keep exact RGB
                  cD[i] = r;
                  cD[i + 1] = g;
                  cD[i + 2] = b;
                  cD[i + 3] = a;
                  hasColoredDetails = true;
                } else {
                  // Neutral grayscale body -> tint cleanly with active guide color
                  nD[i] = tR;
                  nD[i + 1] = tG;
                  nD[i + 2] = tB;
                  nD[i + 3] = a;
                }
              }

              // Render Layer A: Neutral letter body with chosen opacity
              offCtx.putImageData(neutralImg, 0, 0);
              ctx.save();
              ctx.globalAlpha = effectiveOpacity;
              ctx.drawImage(offscreen, drawX, drawY, drawW, drawH);
              ctx.restore();

              // Render Layer B: Vivid colored accents/markers at full clarity (100% opacity)
              if (hasColoredDetails) {
                offCtx.putImageData(coloredImg, 0, 0);
                ctx.save();
                ctx.globalAlpha = 1.0;
                ctx.drawImage(offscreen, drawX, drawY, drawW, drawH);
                ctx.restore();
              }
            } else {
              ctx.save();
              ctx.globalAlpha = effectiveOpacity;
              ctx.drawImage(img, drawX, drawY, drawW, drawH);
              ctx.restore();
            }
          } catch {
            ctx.save();
            ctx.globalAlpha = effectiveOpacity;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            ctx.restore();
          }
        } else {
          ctx.save();
          ctx.globalAlpha = effectiveOpacity;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
        }
      }

      if (template.steps && template.steps.length > 0) {
        drawActiveStepMarker(ctx, template.steps, currentStepIndex, drawX, drawY, drawW, drawH, shouldRenderDots);
      }

      if (canReadPixels) {
        extractLetterGridFromImage(img, tCanvas.width, tCanvas.height, drawX, drawY, drawW, drawH, template.steps);
      } else if (template.steps && template.steps.length > 0) {
        const cell = 4;
        const gw = Math.ceil(tCanvas.width / cell);
        const gh = Math.ceil(tCanvas.height / cell);
        const grid = new Uint8Array(gw * gh);
        const pts: { x: number; y: number }[] = [];
        const totalCells = rasterizeStepCorridorsIntoGrid(grid, gw, gh, cell, template.steps, drawX, drawY, drawW, drawH, pts);
        guidePointsRef.current = pts;
        letterGridRef.current = { grid, width: gw, height: gh, cell, totalCells };
      }
    };

    // 1. Direct Image URL (Google Drive transparent PNG or web URL)
    if (template.imageUrl && template.imageUrl.trim()) {
      const directUrl = formatDirectImageUrl(template.imageUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => renderLoadedImage(img, true);
      img.onerror = () => {
        // Fallback: retry without crossOrigin if host blocks CORS so drawing & step-corridor grid still work
        const fallbackImg = new Image();
        fallbackImg.onload = () => renderLoadedImage(fallbackImg, false);
        fallbackImg.onerror = () => {
          // Last-resort fallback: build bounds & grid purely from lesson steps if present
          const { drawX, drawY, drawW, drawH } = computeTransformedBox(500, 500);
          drawBoundsRef.current = { drawX, drawY, drawW, drawH };
          if (template.steps && template.steps.length > 0) {
            drawActiveStepMarker(ctx, template.steps, currentStepIndex, drawX, drawY, drawW, drawH, shouldRenderDots);
            const cell = 4;
            const gw = Math.ceil(tCanvas.width / cell);
            const gh = Math.ceil(tCanvas.height / cell);
            const grid = new Uint8Array(gw * gh);
            const pts: { x: number; y: number }[] = [];
            const totalCells = rasterizeStepCorridorsIntoGrid(grid, gw, gh, cell, template.steps, drawX, drawY, drawW, drawH, pts);
            guidePointsRef.current = pts;
            letterGridRef.current = { grid, width: gw, height: gh, cell, totalCells };
          }
        };
        fallbackImg.src = directUrl;
      };
      img.src = directUrl;
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
        const { drawX, drawY, drawW, drawH } = computeTransformedBox(img.width || 500, img.height || 500);
        drawBoundsRef.current = { drawX, drawY, drawW, drawH };

        if (shouldRenderImage) {
          ctx.save();
          ctx.globalAlpha = effectiveOpacity;
          ctx.shadowColor = activeColor;
          ctx.shadowBlur = 8;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
        }

        // Render ONLY the active step marker (No arrows, green start dot & red end dot) if enabled
        if (template.steps && template.steps.length > 0) {
          drawActiveStepMarker(ctx, template.steps, currentStepIndex, drawX, drawY, drawW, drawH, shouldRenderDots);
        }

        extractLetterGridFromImage(img, tCanvas.width, tCanvas.height, drawX, drawY, drawW, drawH, template.steps);
      };
    }
  };

  // Fast helper: Check if (x, y) is inside the letter body (black ink mask) within a given margin
  const isPointOnLetter = useCallback((x: number, y: number, margin = 0): boolean => {
    const lg = letterGridRef.current;
    if (!lg || lg.totalCells === 0) return true; // Fallback if no grid available

    const cell = lg.cell;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const cellMargin = Math.ceil(margin / cell);

    if (cellMargin <= 0) {
      if (gx < 0 || gx >= lg.width || gy < 0 || gy >= lg.height) return false;
      return lg.grid[gy * lg.width + gx] === 1;
    }

    const minX = Math.max(0, gx - cellMargin);
    const maxX = Math.min(lg.width - 1, gx + cellMargin);
    const minY = Math.max(0, gy - cellMargin);
    const maxY = Math.min(lg.height - 1, gy + cellMargin);

    for (let py = minY; py <= maxY; py++) {
      const rowOffset: number = py * lg.width;
      for (let px = minX; px <= maxX; px++) {
        if (lg.grid[rowOffset + px] === 1) {
          const dx = (px - gx) * cell;
          const dy = (py - gy) * cell;
          if (dx * dx + dy * dy <= margin * margin) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  // Classify drawn point relative to the letter calligraphy body:
  // - 'core': inside the primary letter ink / thickness (high fidelity)
  // - 'grazing': touching / brushing the outer contour
  // - 'off': deviated into outside empty space
  const classifyPoint = useCallback((x: number, y: number): 'core' | 'grazing' | 'off' => {
    // Within 4px of letter ink = core
    if (isPointOnLetter(x, y, 4)) return 'core';
    // Touching the outside contour = grazing
    const grazingMargin = Math.max(10, penSize * 0.75);
    if (isPointOnLetter(x, y, grazingMargin)) return 'grazing';
    return 'off';
  }, [isPointOnLetter, penSize]);

  // Fast check whether point is on or touching the letter
  const checkPointOnPath = useCallback((x: number, y: number): boolean => {
    return classifyPoint(x, y) !== 'off';
  }, [classifyPoint]);

  // Evaluate drawing thickness coverage against the letter body (fill of letter width)
  const calculateCoverageScore = useCallback((strokesOverride?: Stroke[]): number => {
    let lg = letterGridRef.current;

    // Lazy fallback: if letterGridRef wasn't populated (e.g. image still loading or blocked CORS), rasterize from steps
    if ((!lg || lg.totalCells === 0) && template?.steps && template.steps.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
      const cell = 4;
      const gw = Math.ceil(dimensions.width / cell);
      const gh = Math.ceil(dimensions.height / cell);
      const grid = new Uint8Array(gw * gh);
      const pts: { x: number; y: number }[] = [];
      const topReserved = isMobileLandscape ? 36 : 0;
      const padRatio = isMobileLandscape ? 0.04 : 0.08;
      const pad = Math.min(dimensions.width, dimensions.height) * padRatio;
      const bounds = drawBoundsRef.current || {
        drawX: pad,
        drawY: topReserved + pad,
        drawW: dimensions.width - pad * 2,
        drawH: Math.max(80, dimensions.height - topReserved - pad * 2)
      };
      const totalCells = rasterizeStepCorridorsIntoGrid(grid, gw, gh, cell, template.steps, bounds.drawX, bounds.drawY, bounds.drawW, bounds.drawH, pts);
      if (totalCells > 0) {
        lg = { grid, width: gw, height: gh, cell, totalCells };
        letterGridRef.current = lg;
        if (guidePointsRef.current.length === 0) guidePointsRef.current = pts;
      }
    }

    if (!lg || lg.totalCells === 0 || !template || getLessonEvalMode(template) === 'freehand') return 0;

    const targetStrokes = strokesOverride || strokes;

    // Must allocate matching the entire spatial grid dimensions (width * height)
    // so indexing cy * width + cx never exceeds array bounds
    const covered = new Uint8Array(lg.grid.length);
    let coveredCount = 0;

    targetStrokes.forEach(stroke => {
      if (stroke.penType !== 'eraser') {
        const strokePenRadius = Math.max(3, (stroke.size || penSize) * 0.6);
        const strokeCellRadius = Math.ceil(strokePenRadius / lg!.cell);

        stroke.points.forEach(p => {
          const gx = Math.floor(p.x / lg!.cell);
          const gy = Math.floor(p.y / lg!.cell);

          const minX = Math.max(0, gx - strokeCellRadius);
          const maxX = Math.min(lg!.width - 1, gx + strokeCellRadius);
          const minY = Math.max(0, gy - strokeCellRadius);
          const maxY = Math.min(lg!.height - 1, gy + strokeCellRadius);

          for (let cy = minY; cy <= maxY; cy++) {
            const rowOffset: number = cy * lg!.width;
            for (let cx = minX; cx <= maxX; cx++) {
              const idx: number = rowOffset + cx;
              if (lg!.grid[idx] === 1 && covered[idx] === 0) {
                const dx = (cx - gx) * lg!.cell;
                const dy = (cy - gy) * lg!.cell;
                if (dx * dx + dy * dy <= strokePenRadius * strokePenRadius) {
                  covered[idx] = 1;
                  coveredCount++;
                }
              }
            }
          }
        });
      }
    });

    const percent = Math.min(100, Math.round((coveredCount / lg.totalCells) * 100));
    if (onAccuracyUpdate) {
      onAccuracyUpdate(percent);
    }
    return percent;
  }, [strokes, template, penSize, dimensions, onAccuracyUpdate]);

  // Recalculate whenever strokes change
  useEffect(() => {
    calculateCoverageScore();
  }, [strokes, calculateCoverageScore]);

  // Render Visual Diagnostic Overlay (Green = On-Path, Red = Off-Path, Yellow = Uncovered Thickness)
  useEffect(() => {
    const dCanvas = diagnosticCanvasRef.current;
    if (!dCanvas) return;
    const ctx = dCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, dCanvas.width, dCanvas.height);

    if (!evaluationModal || !showDiagnosticColors || !template || evaluationModal.evalMode === 'freehand') {
      return;
    }

    const lg = letterGridRef.current;
    const userStrokes = strokes.filter(s => s.penType !== 'eraser' && s.points.length > 0);

    // 1. Highlight uncovered letter thickness in soft golden yellow (skip if blind mode had no grid)
    if (lg && lg.totalCells > 0) {
      const covered = new Uint8Array(lg.grid.length);
      userStrokes.forEach(stroke => {
        const strokePenRadius = Math.max(4, (stroke.size || penSize) * 0.65);
        const strokeCellRadius = Math.ceil(strokePenRadius / lg.cell);
        stroke.points.forEach(p => {
          const gx = Math.floor(p.x / lg.cell);
          const gy = Math.floor(p.y / lg.cell);
          const minX = Math.max(0, gx - strokeCellRadius);
          const maxX = Math.min(lg.width - 1, gx + strokeCellRadius);
          const minY = Math.max(0, gy - strokeCellRadius);
          const maxY = Math.min(lg.height - 1, gy + strokeCellRadius);
          for (let cy = minY; cy <= maxY; cy++) {
            const rowOffset: number = cy * lg.width;
            for (let cx = minX; cx <= maxX; cx++) {
              const idx: number = rowOffset + cx;
              if (lg.grid[idx] === 1 && covered[idx] === 0) {
                const dx = (cx - gx) * lg.cell;
                const dy = (cy - gy) * lg.cell;
                if (dx * dx + dy * dy <= strokePenRadius * strokePenRadius) {
                  covered[idx] = 1;
                }
              }
            }
          }
        });
      });

      const off = document.createElement('canvas');
      off.width = lg.width;
      off.height = lg.height;
      const oCtx = off.getContext('2d');
      if (oCtx) {
        const imgData = oCtx.createImageData(lg.width, lg.height);
        const d = imgData.data;
        for (let i = 0; i < lg.grid.length; i++) {
          if (lg.grid[i] === 1 && covered[i] === 0) {
            const p = i * 4;
            d[p] = 250;
            d[p + 1] = 204;
            d[p + 2] = 21;
            d[p + 3] = 115; // Soft yellow highlight for missed letter fill
          }
        }
        oCtx.putImageData(imgData, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, 0, 0, lg.width * lg.cell, lg.height * lg.cell);
        ctx.restore();
      }
    }

    // 2. Overlay Green (Inside Letter) vs Red (Off-Path) segments over student strokes
    if (lg && lg.totalCells > 0 && userStrokes.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      userStrokes.forEach(stroke => {
        const w = Math.max(4, Math.min(12, (stroke.size || penSize) * 0.42));
        ctx.lineWidth = w;
        for (let i = 1; i < stroke.points.length; i++) {
          const p1 = stroke.points[i - 1];
          const p2 = stroke.points[i];
          const midX = (p1.x + p2.x) * 0.5;
          const midY = (p1.y + p2.y) * 0.5;
          const cls = classifyPoint(midX, midY);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = cls === 'off' ? 'rgba(244, 63, 94, 0.88)' : 'rgba(16, 185, 129, 0.78)';
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  }, [evaluationModal, showDiagnosticColors, template, strokes, penSize, dimensions, classifyPoint]);

  // Helper to draw a crisp 5-point vector star on Canvas for Drive PNG stamping
  const drawCanvasStar = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    filled: boolean
  ) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fef3c7';
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.stroke();
    }
  };

  // Capture composite board image safely as Base64 PNG with stars badge, diagnostic overlay & bottom stamp bar
  const captureBoardBase64 = useCallback((stampInfo?: {
    studentName: string;
    studentId: string;
    lessonTitle: string;
    totalScore: number;
    startEndScore: number;
    pathScore: number;
    coverageScore: number;
    feedback?: string;
    stars?: number;
    isBlindMode?: boolean;
    evalMode?: LessonEvalMode;
  }): string => {
    const exportWidth = Math.max(780, Math.min(1200, dimensions.width || 800));
    const scale = exportWidth / Math.max(1, dimensions.width || 800);
    const boardHeight = Math.max(1, Math.round((dimensions.height || 500) * scale));
    const footerHeight = stampInfo ? 104 : 0;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportWidth;
    exportCanvas.height = boardHeight + footerHeight;
    const ctx = exportCanvas.getContext('2d')!;

    if (isARMode && saveArCameraPhoto && videoElement && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      // Composite live AR camera + Royal Crown using object-cover crop & mirror transform
      const drawCoverMedia = (
        source: HTMLVideoElement | HTMLCanvasElement,
        srcW: number,
        srcH: number
      ) => {
        const srcRatio = srcW / srcH;
        const dstRatio = exportWidth / boardHeight;
        let sx = 0;
        let sy = 0;
        let sWidth = srcW;
        let sHeight = srcH;

        if (srcRatio > dstRatio) {
          sWidth = srcH * dstRatio;
          sx = (srcW - sWidth) / 2;
        } else {
          sHeight = srcW / dstRatio;
          sy = (srcH - sHeight) / 2;
        }

        ctx.save();
        if (isMirrored) {
          ctx.translate(exportWidth, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, exportWidth, boardHeight);
        ctx.restore();
      };

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, exportWidth, boardHeight);
      try {
        drawCoverMedia(videoElement, videoElement.videoWidth, videoElement.videoHeight);
      } catch {}

      if (crownCanvas && crownCanvas.width > 0 && crownCanvas.height > 0) {
        try {
          drawCoverMedia(crownCanvas, crownCanvas.width, crownCanvas.height);
        } catch {}
      }
    } else {
      if (boardStyle === 'dark' || (isARMode && !saveArCameraPhoto)) {
        ctx.fillStyle = '#0f172a';
      } else if (boardStyle === 'green') {
        ctx.fillStyle = '#064e3b';
      } else if (boardStyle === 'grid') {
        ctx.fillStyle = '#fdfbf7';
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(0, 0, exportWidth, boardHeight);
    }

    // Check if templateCanvasRef is origin-clean BEFORE drawing it onto exportCanvas
    if (templateCanvasRef.current && (!template?.hideImage || showGhostOverlay)) {
      try {
        templateCanvasRef.current.toDataURL('image/png');
        ctx.drawImage(templateCanvasRef.current, 0, 0, exportWidth, boardHeight);
      } catch {
        // Template image is cross-origin tainted; skip it so exportCanvas stays clean and exports user strokes
      }
    }

    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 0, 0, exportWidth, boardHeight);
    }

    if (showDiagnosticColors && diagnosticCanvasRef.current && stampInfo?.evalMode !== 'freehand') {
      try {
        ctx.drawImage(diagnosticCanvasRef.current, 0, 0, exportWidth, boardHeight);
      } catch {}
    }

    // Draw 10 Honor Stars Badge at top-right corner of the captured board
    if (stampInfo) {
      const starsCount = typeof stampInfo.stars === 'number' ? stampInfo.stars : getEarnedStars(stampInfo.totalScore);
      const badgeW = 286;
      const badgeH = 38;
      const badgeX = exportWidth - badgeW - 18;
      const badgeY = 16;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();

      for (let s = 0; s < 10; s++) {
        drawCanvasStar(ctx, badgeX + 21 + s * 27, badgeY + 19, 10, 4.5, s < starsCount);
      }
      ctx.restore();
    }

    // Stamp student info, score badge, breakdown, and comment on crisp bottom band
    if (stampInfo) {
      const padX = 20;
      const yTop = boardHeight;

      // Dark slate footer background + gold top border
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, yTop, exportWidth, footerHeight);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, yTop, exportWidth, 2.5);

      ctx.direction = 'rtl';
      ctx.textBaseline = 'middle';

      // Row 1: Student Name & ID (right) | Lesson Title & Date (left)
      const row1Y = yTop + 21;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px Cairo, Tahoma, sans-serif';
      const safeName = (stampInfo.studentName || '').slice(0, 32);
      const safeId = (stampInfo.studentId || '').slice(0, 20);
      ctx.fillText(`المشترك: ${safeName}   •   رقم التسجيل: ${safeId}`, exportWidth - padX, row1Y);

      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const safeTitle = (stampInfo.lessonTitle || '').slice(0, 26);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 13px Cairo, Tahoma, sans-serif';
      ctx.fillText(`${safeTitle}  |  ${dateStr}`, padX, row1Y);

      // Subtle divider between rows
      ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.fillRect(padX, yTop + 38, exportWidth - padX * 2, 1);

      // Row 2: Final Score Badge (right) | Detailed Breakdown (left)
      const row2Y = yTop + 56;
      const scoreVal = Math.round(stampInfo.totalScore);
      const badgeColor = scoreVal >= 75 ? '#10b981' : scoreVal >= 50 ? '#f59e0b' : '#f43f5e';
      const badgeBg = scoreVal >= 75 ? 'rgba(16, 185, 129, 0.16)' : scoreVal >= 50 ? 'rgba(245, 158, 11, 0.16)' : 'rgba(244, 63, 94, 0.18)';

      const scoreLabel = `الدرجة النهائية: ${scoreVal}%`;
      ctx.font = 'bold 14px Cairo, Tahoma, sans-serif';
      const pillWidth = Math.ceil(ctx.measureText(scoreLabel).width) + 24;
      const pillHeight = 25;
      const pillX = exportWidth - padX - pillWidth;
      const pillY = row2Y - pillHeight / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 8);
      } else {
        ctx.rect(pillX, pillY, pillWidth, pillHeight);
      }
      ctx.fillStyle = badgeBg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = badgeColor;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = badgeColor;
      ctx.fillText(scoreLabel, pillX + pillWidth / 2, row2Y + 1);

      // Score breakdown on the left side of Row 2
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 13px Cairo, Tahoma, sans-serif';
      const breakdownText = stampInfo.evalMode === 'freehand'
        ? `ثبات اليد: ${stampInfo.startEndScore}%  •  توازن اللوحة: ${stampInfo.pathScore}%  •  ثراء التفاصيل: ${stampInfo.coverageScore}%`
        : stampInfo.evalMode === 'guide_only'
        ? (stampInfo.isBlindMode
            ? `تطابق الشكل: ${stampInfo.pathScore}%  •  تغطية المعالم: ${stampInfo.coverageScore}%`
            : `الالتزام بالشكل: ${stampInfo.pathScore}%  •  التغطية والامتلاء: ${stampInfo.coverageScore}%`)
        : stampInfo.isBlindMode
        ? `الاتزان: ${stampInfo.startEndScore}%  •  التشابه: ${stampInfo.pathScore}%  •  المعالم: ${stampInfo.coverageScore}%`
        : `البداية/النهاية: ${stampInfo.startEndScore}%  •  المسار: ${stampInfo.pathScore}%  •  السُمك: ${stampInfo.coverageScore}%`;
      ctx.fillText(breakdownText, padX, row2Y + 1);

      // Row 3: Comment & Stars Summary
      if (stampInfo.feedback) {
        const row3Y = yTop + 85;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fcd34d';
        ctx.font = '600 12px Cairo, Tahoma, sans-serif';
        const cleanFeedback = stampInfo.feedback.slice(0, 88);
        ctx.fillText(`التقييم: ${cleanFeedback}`, exportWidth - padX, row3Y);
      }
    }

    return exportCanvas.toDataURL('image/png');
  }, [dimensions, boardStyle, template, showGhostOverlay, showDiagnosticColors, isARMode, saveArCameraPhoto, videoElement, crownCanvas, isMirrored]);

  // Build tailored evaluation text & automated voice feedback based on score, criteria & drawing mode (AR vs Normal)
  const buildSmartEvaluationFeedback = useCallback((
    finalScore: number,
    startEndScore: number,
    pathScore: number,
    coverageScore: number,
    arMode: boolean,
    blindMode: boolean,
    evalMode: LessonEvalMode
  ): { textFeedback: string; voiceFeedback: string } => {
    if (evalMode === 'freehand') {
      const weakestArt =
        coverageScore <= pathScore && coverageScore <= startEndScore
          ? 'details'
          : pathScore <= startEndScore
          ? 'balance'
          : 'steadiness';

      const artTipMap = {
        details: 'جرّب إضافة لمسات وتفاصيل متنوعة لإثراء اللوحة أكثر.',
        balance: 'احرص على توسيط وتوزيع الرسم داخل اللوحة بشكل متناغم.',
        steadiness: 'ارسم بانسيابية وهدوء ليزداد ثبات واستمرارية الخط.'
      };

      if (finalScore >= 85) {
        return {
          textFeedback: arMode
            ? 'إبداع فني مذهل بالواقع المعزز! ثبات وتوازن رائع في اللوحة 🎨👑'
            : 'لوحة إبداعية مبهرة! ثبات يد وتوازن فني متميز 🎨🌟',
          voiceFeedback: arMode
            ? `إبداع رائع بالواقع المعزز! حققت تقييم ${finalScore} في المئة في الرسم الحر، بتوازن وثبات متميز.`
            : `لوحة رائعة! حققت تقييم ${finalScore} في المئة في الرسم الحر، بثبات يد وتوازن جميل.`
        };
      }

      if (finalScore >= 70) {
        const tip = artTipMap[weakestArt];
        return {
          textFeedback: `رسم حر متوازن وجميل 🖌️ (${tip})`,
          voiceFeedback: `أحسنت! حققت تقييم ${finalScore} في المئة في الرسم الحر. ${tip}`
        };
      }

      const tip = artTipMap[weakestArt];
      return {
        textFeedback: `محاولة فنية جميلة 🎨 (${tip})`,
        voiceFeedback: `محاولة طيبة في الرسم الحر، تقييمك ${finalScore} في المئة. ${tip}`
      };
    }

    const weakest = evalMode === 'guide_only'
      ? (coverageScore <= pathScore ? 'coverage' : 'path')
      : (coverageScore <= pathScore && coverageScore <= startEndScore
          ? 'coverage'
          : pathScore <= startEndScore
          ? 'path'
          : 'startEnd');

    const adviceMap = {
      coverage: blindMode
        ? 'حاول ملء معالم الشكل ومساحته بشكل أوضح.'
        : 'حاول ملء كامل سمك وامتلاء الشكل بالقلم.',
      path: blindMode
        ? 'قارن رسمتك مع الظل الذهبي وحاول ضبط النسب والانحناء.'
        : 'التزم بحدود الرسمة دون خروج عن المسار.',
      startEnd: 'انتبه لنقطة انطلاق الحرف ونقطة نهايته بدقة.'
    };

    if (finalScore >= 85) {
      return {
        textFeedback: arMode
          ? 'ما شاء الله! أداء متقن بالواقع المعزز وتفوق رائع 👑'
          : 'ما شاء الله! خط متقن وجريان قلم متميز 🌟',
        voiceFeedback: arMode
          ? `ما شاء الله! حققت درجة ${finalScore} في المئة بالواقع المعزز، أداء متقن في الهواء.`
          : `ما شاء الله! حققت درجة ${finalScore} في المئة. خط متقن وتحكم ممتاز بالقلم، أحسنت.`
      };
    }

    if (finalScore >= 70) {
      const tip = adviceMap[weakest];
      return {
        textFeedback: arMode
          ? `أحسنت! رسم جميل بالواقع المعزز ✨ (${tip})`
          : `جيد جداً! رسم متوازن وجميل 👍 (${tip})`,
        voiceFeedback: arMode
          ? `أحسنت! حققت درجة ${finalScore} في المئة بالواقع المعزز. ${tip}`
          : `جيد جداً! حققت درجة ${finalScore} في المئة. ${tip}`
      };
    }

    if (finalScore >= 50) {
      const tip = adviceMap[weakest];
      return {
        textFeedback: arMode
          ? `محاولة طيبة بالواقع المعزز! ${tip} ✍️`
          : `محاولة طيبة! ${tip} ✍️`,
        voiceFeedback: arMode
          ? `محاولة طيبة بالواقع المعزز، درجتك ${finalScore} في المئة. ${tip}`
          : `محاولة طيبة، درجتك ${finalScore} في المئة. ${tip}`
      };
    }

    const lowTip = arMode
      ? 'ثبت يدك أمام الكاميرا وارسم ببطء وتأنٍ لتتحسن النتيجة.'
      : adviceMap[weakest];
    return {
      textFeedback: `بداية تحتاج إلى تركيز أكثر: ${lowTip} 💪`,
      voiceFeedback: `درجتك ${finalScore} في المئة. ${lowTip}`
    };
  }, []);

  // Open Evaluation Modal OR advance inline repetition bar if repeatCount > 1
  const openEvaluationResults = useCallback((
    startEndScore: number,
    pathScore: number,
    coverageScore: number,
    customFeedback?: string,
    modeOverride?: LessonEvalMode
  ) => {
    const evalMode: LessonEvalMode = modeOverride || getLessonEvalMode(template);

    const attemptScore = evalMode === 'freehand'
      ? Math.min(100, Math.max(50, Math.round(startEndScore * 0.35 + pathScore * 0.35 + coverageScore * 0.30)))
      : evalMode === 'guide_only'
      ? Math.min(100, Math.max(20, Math.round(pathScore * 0.60 + coverageScore * 0.40)))
      : Math.min(100, Math.max(20, Math.round(startEndScore * 0.20 + pathScore * 0.50 + coverageScore * 0.30)));

    const totalReps = Number(template?.repeatCount) || 1;
    const repIdx = currentRepetition || 1;

    // Store/update score for this repetition
    const existingIdx = repetitionScoresRef.current.findIndex(r => r.rep === repIdx);
    const repRecord = {
      rep: repIdx,
      totalScore: attemptScore,
      startEndScore,
      pathScore,
      coverageScore
    };
    if (existingIdx !== -1) {
      repetitionScoresRef.current[existingIdx] = repRecord;
    } else {
      repetitionScoresRef.current.push(repRecord);
    }

    // Intermediate repetition: show score + "ابدأ الرسمة التالية" + ( ابدأ ) inside top bar only!
    if (totalReps > 1 && repIdx < totalReps) {
      setIsLessonStarted(false);
      setStepAlert(null);
      setPendingNextRepScore(attemptScore);
      audioService.playStepSuccessSound();
      const nextDrawingOrdinal = getArabicDrawingOrdinal(repIdx + 1);
      audioService.speakArabic(`درجتك ${attemptScore} في المئة. انقر على زر ابدأ لترسم الرسمة ${nextDrawingOrdinal}`);
      return;
    }

    // Final repetition (or single-rep lesson): compute overall final result averaged across repetitions
    const allReps = repetitionScoresRef.current;
    const isMultiRep = totalReps > 1 && allReps.length > 1;
    const count = Math.max(1, allReps.length);

    const finalScore = isMultiRep
      ? Math.round(allReps.reduce((acc, r) => acc + r.totalScore, 0) / count)
      : attemptScore;
    const finalStartEnd = isMultiRep
      ? Math.round(allReps.reduce((acc, r) => acc + r.startEndScore, 0) / count)
      : startEndScore;
    const finalPath = isMultiRep
      ? Math.round(allReps.reduce((acc, r) => acc + r.pathScore, 0) / count)
      : pathScore;
    const finalCoverage = isMultiRep
      ? Math.round(allReps.reduce((acc, r) => acc + r.coverageScore, 0) / count)
      : coverageScore;

    const smart = buildSmartEvaluationFeedback(
      finalScore,
      finalStartEnd,
      finalPath,
      finalCoverage,
      isARMode,
      Boolean(template?.hideImage),
      evalMode
    );

    const displayFeedback = customFeedback
      ? `${customFeedback} — ${smart.textFeedback}`
      : smart.textFeedback;

    setPendingNextRepScore(null);
    setIsLessonStarted(false);
    setEvaluationModal({
      isOpen: true,
      totalScore: finalScore,
      startEndScore: finalStartEnd,
      pathScore: finalPath,
      coverageScore: finalCoverage,
      feedback: displayFeedback,
      evalMode,
      repetitionBreakdown: isMultiRep
        ? allReps.map(r => ({ rep: r.rep, score: r.totalScore }))
        : undefined
    });
    setSubmitAnswerResult(null);

    if (finalScore >= 60) {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 }
      });
      audioService.playSuccessFanfare();
    } else {
      audioService.playChime(440, 0.2);
    }

    audioService.speakArabic(
      isMultiRep
        ? `أتممت جميع التكرارات! المعدل الكلي النهائي ${finalScore} في المئة. ${smart.voiceFeedback}`
        : smart.voiceFeedback
    );

    setStepAlert({
      type: 'success',
      message: isMultiRep
        ? `النتيجة الكلية النهائية: ${finalScore}% 🎉`
        : `تم التقييم: الدرجة النهائية ${finalScore}% 🎉`,
      timestamp: Date.now()
    });
    if (onGoalAchieved) {
      onGoalAchieved(finalScore);
    }
  }, [template, currentRepetition, isARMode, buildSmartEvaluationFeedback, onGoalAchieved]);

  // Evaluate Freehand, Blind Memory Test (hideImage), or Guide-Only / No-Dots Mode
  const handleFinishChallengeEvaluation = useCallback(() => {
    const userStrokes = strokes.filter(s => s.penType !== 'eraser' && s.points.length > 0);
    if (userStrokes.length === 0) {
      audioService.playErrorSound();
      setStepAlert({
        type: 'error',
        message: '⚠️ ارسم أولاً على السبورة ثم اضغط للتقييم ✍️',
        timestamp: Date.now()
      });
      return;
    }

    const evalMode = getLessonEvalMode(template);

    // Collect all user drawn points
    const drawnPts: Point[] = [];
    userStrokes.forEach(s => s.points.forEach(p => drawnPts.push(p)));

    // 0. ABSOLUTE FREEHAND MODE (no guide image & no steps): artistic/motivational evaluation with zero path penalty
    if (evalMode === 'freehand') {
      const boardW = Math.max(1, dimensions.width);
      const boardH = Math.max(1, dimensions.height);
      const minDim = Math.max(1, Math.min(boardW, boardH));

      // A) Hand Steadiness & Continuity (direction smoothness across segments)
      let smoothSum = 0;
      let smoothWeight = 0;
      let totalPathLen = 0;
      userStrokes.forEach(stroke => {
        const pts = stroke.points;
        let prevDx = 0;
        let prevDy = 0;
        let hasPrevDir = false;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i - 1].x;
          const dy = pts[i].y - pts[i - 1].y;
          const segLen = Math.hypot(dx, dy);
          if (segLen < 2.5) continue;
          totalPathLen += segLen;
          const ux = dx / segLen;
          const uy = dy / segLen;
          if (hasPrevDir) {
            const cos = Math.max(-1, Math.min(1, prevDx * ux + prevDy * uy));
            const segSmooth = (cos + 1) * 0.5; // 1 = perfectly smooth curve/line, 0 = sharp erratic reversal
            smoothSum += segSmooth * segLen;
            smoothWeight += segLen;
          }
          prevDx = ux;
          prevDy = uy;
          hasPrevDir = true;
        }
      });
      const avgSmooth = smoothWeight > 0 ? smoothSum / smoothWeight : 0.78;
      const continuityBonus = totalPathLen > minDim * 0.25 ? 0.08 : 0;
      const steadinessScore = Math.min(98, Math.max(66, Math.round((0.55 + avgSmooth * 0.37 + continuityBonus) * 100)));

      // B) Balance & Canvas Distribution (centroid centering & comfortable visual spread)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let sumX = 0, sumY = 0;
      drawnPts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        sumX += p.x;
        sumY += p.y;
      });
      const centroidX = sumX / Math.max(1, drawnPts.length);
      const centroidY = sumY / Math.max(1, drawnPts.length);
      const centerOffset = Math.hypot(
        (centroidX - boardW / 2) / (boardW * 0.5),
        (centroidY - boardH / 2) / (boardH * 0.5)
      );
      const centerScore = Math.max(0.25, 1 - Math.min(1, centerOffset * 0.75));
      const spanRatio = Math.max((maxX - minX) / boardW, (maxY - minY) / boardH);
      const spanFit = spanRatio >= 0.18 && spanRatio <= 0.88
        ? 1
        : spanRatio < 0.18
        ? Math.max(0.35, spanRatio / 0.18)
        : 0.88;
      const balanceScore = Math.min(98, Math.max(65, Math.round((0.40 + (centerScore * 0.55 + spanFit * 0.45) * 0.58) * 100)));

      // C) Detail Richness & Variety (ink length + stroke variety + spatial grid coverage)
      const gridVisited = new Set<string>();
      drawnPts.forEach(p => {
        const gx = Math.min(3, Math.max(0, Math.floor((p.x / boardW) * 4)));
        const gy = Math.min(3, Math.max(0, Math.floor((p.y / boardH) * 4)));
        gridVisited.add(`${gx},${gy}`);
      });
      const gridFactor = Math.min(1, gridVisited.size / 6);
      const strokeCountFactor = Math.min(1, userStrokes.length / 4);
      const lenFactor = Math.min(1, totalPathLen / (minDim * 1.4));
      const detailRichnessScore = Math.min(
        98,
        Math.max(64, Math.round((0.44 + (lenFactor * 0.45 + strokeCountFactor * 0.25 + gridFactor * 0.30) * 0.54) * 100))
      );

      openEvaluationResults(steadinessScore, balanceScore, detailRichnessScore, undefined, 'freehand');
      return;
    }

    // 1. BLIND MEMORY MODE (hideImage = true): Bounding-Box & Normalized 28x28 Shape Comparison
    if (template?.hideImage) {
      const refPts = guidePointsRef.current;
      let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
      drawnPts.forEach(p => {
        if (p.x < dMinX) dMinX = p.x;
        if (p.y < dMinY) dMinY = p.y;
        if (p.x > dMaxX) dMaxX = p.x;
        if (p.y > dMaxY) dMaxY = p.y;
      });
      const dW = Math.max(20, dMaxX - dMinX);
      const dH = Math.max(20, dMaxY - dMinY);
      const dAspect = dW / dH;

      let shapeScore = 65;
      let overlapScore = 65;
      let startEndScore = 75;

      if (refPts.length > 10) {
        let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
        refPts.forEach(p => {
          if (p.x < rMinX) rMinX = p.x;
          if (p.y < rMinY) rMinY = p.y;
          if (p.x > rMaxX) rMaxX = p.x;
          if (p.y > rMaxY) rMaxY = p.y;
        });
        const rW = Math.max(20, rMaxX - rMinX);
        const rH = Math.max(20, rMaxY - rMinY);
        const rAspect = rW / rH;

        const aspectSim = Math.max(0, 1 - Math.abs(dAspect - rAspect) / Math.max(dAspect, rAspect, 1));

        // Rasterize both normalized shapes into a 28x28 grid with isotropic scaling
        const N = 28;
        const refGrid = new Uint8Array(N * N);
        const drawnGrid = new Uint8Array(N * N);

        const rMaxDim = Math.max(rW, rH);
        const rOffX = (rMaxDim - rW) / 2;
        const rOffY = (rMaxDim - rH) / 2;
        refPts.forEach(p => {
          const gx = Math.min(N - 1, Math.max(0, Math.floor(((p.x - rMinX + rOffX) / rMaxDim) * (N - 1))));
          const gy = Math.min(N - 1, Math.max(0, Math.floor(((p.y - rMinY + rOffY) / rMaxDim) * (N - 1))));
          refGrid[gy * N + gx] = 1;
        });

        const dMaxDim = Math.max(dW, dH);
        const dOffX = (dMaxDim - dW) / 2;
        const dOffY = (dMaxDim - dH) / 2;
        drawnPts.forEach(p => {
          const gx = Math.min(N - 1, Math.max(0, Math.floor(((p.x - dMinX + dOffX) / dMaxDim) * (N - 1))));
          const gy = Math.min(N - 1, Math.max(0, Math.floor(((p.y - dMinY + dOffY) / dMaxDim) * (N - 1))));
          // Dilate drawn cell slightly (+/- 1 cell) for natural calligraphy hand tolerance
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = gx + dx;
              const ny = gy + dy;
              if (nx >= 0 && nx < N && ny >= 0 && ny < N) {
                drawnGrid[ny * N + nx] = 1;
              }
            }
          }
        });

        // Compute precision & recall against reference grid (dilated by 1 for recall)
        let refTotal = 0;
        let refHit = 0;
        let drawnTotal = 0;
        let drawnHit = 0;

        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const idx = y * N + x;
            if (refGrid[idx] === 1) {
              refTotal++;
              if (drawnGrid[idx] === 1) refHit++;
            }
            if (drawnGrid[idx] === 1) {
              drawnTotal++;
              // Check if drawn cell is within 1 cell of reference
              let nearRef = false;
              for (let dy = -1; dy <= 1 && !nearRef; dy++) {
                for (let dx = -1; dx <= 1 && !nearRef; dx++) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < N && ny >= 0 && ny < N && refGrid[ny * N + nx] === 1) {
                    nearRef = true;
                  }
                }
              }
              if (nearRef) drawnHit++;
            }
          }
        }

        const recall = refTotal > 0 ? refHit / refTotal : 0;
        const precision = drawnTotal > 0 ? drawnHit / drawnTotal : 0;
        const dice = (recall + precision) > 0 ? (2 * recall * precision) / (recall + precision) : 0;

        shapeScore = Math.min(100, Math.max(15, Math.round((dice * 0.72 + aspectSim * 0.28) * 100)));
        overlapScore = Math.min(100, Math.max(15, Math.round(recall * 100)));
      }

      // Check step directional alignment in normalized bounding box only if evalMode === 'steps'
      if (evalMode === 'steps' && template.steps && template.steps.length > 0 && drawBoundsRef.current) {
        const firstUserPt = userStrokes[0].points[0];
        const lastStroke = userStrokes[userStrokes.length - 1];
        const lastUserPt = lastStroke.points[lastStroke.points.length - 1];
        const firstStep = template.steps[0];
        const lastStep = template.steps[template.steps.length - 1];

        const uStartNormX = (firstUserPt.x - dMinX) / dW;
        const uStartNormY = (firstUserPt.y - dMinY) / dH;
        const uEndNormX = (lastUserPt.x - dMinX) / dW;
        const uEndNormY = (lastUserPt.y - dMinY) / dH;

        const startErr = Math.hypot(uStartNormX - firstStep.startX, uStartNormY - firstStep.startY);
        const endErr = Math.hypot(uEndNormX - lastStep.endX, uEndNormY - lastStep.endY);
        startEndScore = Math.min(100, Math.max(20, Math.round(100 - (startErr + endErr) * 55)));
      } else {
        startEndScore = 0;
      }

      // Reveal translucent gold ghost overlay of original letter for visual comparison
      setShowGhostOverlay(true);
      openEvaluationResults(
        startEndScore,
        shapeScore,
        overlapScore,
        shapeScore >= 80
          ? 'ذاكرة بصرية مذهلة! تطابق رائع مع الحرف الأصلي 🏆'
          : shapeScore >= 60
          ? 'محاولة جيدة من الذاكرة! قارن رسمتك مع الظل الذهبي للحرف ✍️'
          : 'أحسنت المحاولة! راجع الظل الذهبي للحرف وأعد التجربة 💪',
        evalMode
      );
      return;
    }

    // 2. GUIDE-ONLY (no steps or hideDots): Evaluate strictly on Path (60%) + Coverage (40%), excluding Start/End dots
    let core = 0;
    let grazing = 0;
    drawnPts.forEach(p => {
      const cls = classifyPoint(p.x, p.y);
      if (cls === 'core') core++;
      else if (cls === 'grazing') grazing++;
    });
    const pathScore = Math.min(
      100,
      Math.max(15, Math.round(((core * 1.0 + grazing * 0.45) / Math.max(1, drawnPts.length)) * 100))
    );
    const coverageScore = calculateCoverageScore();

    openEvaluationResults(0, pathScore, coverageScore, undefined, 'guide_only');
  }, [strokes, template, dimensions, classifyPoint, calculateCoverageScore, openEvaluationResults]);

  // Submit student answer & upload drawing image to Google Drive + sheet 'answers 1'
  const handleSubmitAnswer = async () => {
    if (!evaluationModal || !template) return;
    if (!currentUser) {
      setSubmitAnswerResult({
        success: false,
        message: 'يرجى تسجيل الدخول أولاً لحفظ إجابتك'
      });
      return;
    }

    setIsSubmittingAnswer(true);
    setSubmitAnswerResult(null);

    try {
      const evalMode = evaluationModal.evalMode || getLessonEvalMode(template);
      const imageBase64 = captureBoardBase64({
        studentName: currentUser.name,
        studentId: currentUser.id,
        lessonTitle: template.title,
        totalScore: evaluationModal.totalScore,
        startEndScore: evaluationModal.startEndScore,
        pathScore: evaluationModal.pathScore,
        coverageScore: evaluationModal.coverageScore,
        feedback: evaluationModal.feedback,
        stars: getEarnedStars(evaluationModal.totalScore),
        isBlindMode: Boolean(template.hideImage),
        evalMode
      });
      const details = evalMode === 'freehand'
        ? `ثبات اليد: ${evaluationModal.startEndScore}% | توازن اللوحة: ${evaluationModal.pathScore}% | ثراء التفاصيل: ${evaluationModal.coverageScore}%`
        : evalMode === 'guide_only'
        ? `الالتزام بالشكل: ${evaluationModal.pathScore}% | التغطية والامتلاء: ${evaluationModal.coverageScore}%`
        : `البداية/النهاية: ${evaluationModal.startEndScore}% | المسار: ${evaluationModal.pathScore}% | السُمك: ${evaluationModal.coverageScore}%`;
      const res = await sheetService.submitLessonAnswer({
        studentId: currentUser.id,
        studentName: currentUser.name,
        topic: template.topic || 'خط النسخ',
        slotIndex: template.slotIndex || 1,
        category: template.category || 'حروف',
        text: template.title,
        imageBase64,
        score: evaluationModal.totalScore,
        details,
        totalLessonsInTopic: totalLessonsInTopic || 1
      });

      if (res.success) {
        if (res.driveError) {
          audioService.playErrorSound();
          setSubmitAnswerResult({
            success: false,
            message: `تم حفظ الدرجة في الورقة (${res.completionStatus || 'محفوظ'})، ولكن تعذر رفع الصورة لقوقل درايف: ${res.driveError}`,
            completionStatus: res.completionStatus
          });
        } else {
          audioService.playSuccessSound();
          setSubmitAnswerResult({
            success: true,
            message: 'تم تسجيل الإجابة',
            completionStatus: res.completionStatus
          });
        }
      } else {
        audioService.playErrorSound();
        setSubmitAnswerResult({
          success: false,
          message: res.error || 'تعذر حفظ الإجابة في Google Sheets'
        });
      }
    } catch {
      audioService.playErrorSound();
      setSubmitAnswerResult({
        success: false,
        message: 'حدث خطأ أثناء الاتصال بالخادم لرفع الإجابة'
      });
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Start exercise with voice unlock and pronunciation
  const handleStartLesson = async () => {
    if (evaluationModal) return;
    await audioService.unlockAudio();
    setPendingNextRepScore(null);
    setIsLessonStarted(true);
    setStepAlert(null);
    stepScoresRef.current = [];
    if (template?.steps && template.steps[currentStepIndex] && !template.hideDots && !template.hideImage) {
      const prompt = getStepAudioPrompt(template.steps[currentStepIndex]);
      audioService.speakArabic(prompt);
    }
  };

  // Start next repetition from inline top-bar button
  const handleStartNextRepetition = async () => {
    await audioService.unlockAudio();
    autoStartNextRepRef.current = true;
    setPendingNextRepScore(null);
    setStepAlert(null);
    if (onNextRepetition) {
      onNextRepetition();
    }
  };

  // Handle pointer down (Mouse, Finger Touch, Apple Pencil Stylus)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (twoFingerPanRef.current.active) {
      return;
    }
    if (e.pointerType === 'touch' && !e.isPrimary) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 1;

    // 1. Guard: Check if a lesson is chosen
    if (!template) {
      audioService.playErrorSound();
      setStepAlert({
        type: 'error',
        message: '⚠️ يرجى اختيار درس أولاً للبدء في التدريب 📚',
        timestamp: Date.now()
      });
      if (onOpenLibrary) {
        onOpenLibrary();
      }
      return;
    }

    // 2. Guard: Lock board drawing once evaluation results are generated until reset or new lesson
    if (evaluationModal) {
      audioService.playErrorSound();
      setStepAlert({
        type: 'error',
        message: '🔒 اكتمل التقييم! انقر (إعادة التمرين) أو اختر درساً جديداً للرسم مجدداً ✍️',
        timestamp: Date.now()
      });
      return;
    }

    // 3. Guard: Check if student has clicked ( ابدأ )
    if (!isLessonStarted) {
      audioService.playErrorSound();
      setStepAlert({
        type: 'error',
        message: '⚠️ انقر على زر ( ابدأ ) في الشريط لبدء التمرين وسماع التوجيه 🎧',
        timestamp: Date.now()
      });
      audioService.speakArabic('انقر زر ابدأ لبدء التمرين');
      return;
    }

    // Reset stroke path metrics
    strokeStatsRef.current = {
      total: 1,
      corePoints: 1,
      grazingPoints: 0,
      offPathPoints: 0,
      offPathConsecutive: 0,
      maxConsecutiveOffPath: 0,
      hasBrokenAway: false
    };

    const isChallengeMode = !!(template.hideDots || template.hideImage);

    // Step constraint check: In standard step mode, student must start at the green launch dot 🟢
    if (!isChallengeMode && template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
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
        if (isLessonStarted) {
          audioService.speakArabic('ابدأ من النقطة الخضراء');
        }
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
    if (twoFingerPanRef.current.active || !activePointerStrokeRef.current) return;

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

    const isChallengeMode = !!(template?.hideDots || template?.hideImage);

    // Track path adherence in standard guided mode
    if (!isChallengeMode && penType !== 'eraser' && template?.steps && template.steps.length > 0) {
      strokeStatsRef.current.total++;
      const classification = classifyPoint(x, y);

      if (classification === 'core') {
        strokeStatsRef.current.corePoints++;
        strokeStatsRef.current.offPathConsecutive = 0;
      } else if (classification === 'grazing') {
        strokeStatsRef.current.grazingPoints++;
        strokeStatsRef.current.offPathConsecutive = 0;
      } else {
        strokeStatsRef.current.offPathPoints++;
        strokeStatsRef.current.offPathConsecutive++;
        if (strokeStatsRef.current.offPathConsecutive > strokeStatsRef.current.maxConsecutiveOffPath) {
          strokeStatsRef.current.maxConsecutiveOffPath = strokeStatsRef.current.offPathConsecutive;
        }

        // Break-away alert (live warning for Medium and Advanced levels)
        if (strokeStatsRef.current.offPathConsecutive >= 8) {
          strokeStatsRef.current.hasBrokenAway = true;
          const difficulty = template.difficulty || 'سهل';
          if (difficulty !== 'سهل') {
            setStepAlert({
              type: 'error',
              message: '⚠️ تنبيه: خرج القلم عن مسار الحرف! التزم بالحبر',
              timestamp: Date.now()
            });
            audioService.playErrorSound();
          }
        }
      }
    }

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
      activePointerStrokeRef.current = null;

      let stepMeta: Stroke['stepMeta'] | undefined;
      const isChallengeMode = !!(template?.hideDots || template?.hideImage);

      // Step constraint check in standard step-by-step mode BEFORE committing stroke so Undo reverts step cleanly
      if (!isChallengeMode && template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
        if (strokeStartedAtGreenRef.current) {
          const active = activeStepPointsRef.current;
          const lastPt = finishedStroke.points[finishedStroke.points.length - 1];
          const endDist = Math.hypot(lastPt.x - active.ex, lastPt.y - active.ey);
          const endThreshold = Math.max(40, penSize * 2.4);

          if (endDist <= endThreshold) {
            const stats = strokeStatsRef.current;
            const total = Math.max(1, stats.total);
            const rawPathScore = Math.min(100, Math.max(25, Math.round(((stats.corePoints * 1.0 + stats.grazingPoints * 0.45) / total) * 100)));
            const difficulty = template.difficulty || 'سهل';
            const brokeAway = stats.hasBrokenAway || stats.maxConsecutiveOffPath >= 8;
            const offCenter = rawPathScore < 45;

            if ((difficulty === 'متوسط' || difficulty === 'متقدم') && (brokeAway || offCenter)) {
              audioService.playErrorSound();
              setStepAlert({
                type: 'error',
                message: brokeAway
                  ? 'تنبيه: خرج القلم عن مسار الحرف! يجب الاستمرار على المسار دون انقطاع ✍️'
                  : 'تنبيه: يجب الرسم فوق مسار خط الحرف بدقة ✍️',
                timestamp: Date.now()
              });
              if (isLessonStarted) {
                audioService.speakArabic(brokeAway ? 'خرج القلم عن مسار الحرف! التزم بالخط دون انقطاع' : 'ارسم فوق مسار الحرف بدقة');
              }
            } else {
              const effectivePathScore = (difficulty === 'سهل' && (brokeAway || offCenter))
                ? Math.min(rawPathScore, 55)
                : rawPathScore;

              const nextIdx = currentStepIndex + 1;
              const coverageScore = calculateCoverageScore([...strokes, finishedStroke]);

              // Level 3 (متقدم): On final step, enforce stroke thickness coverage >= 75%
              if (difficulty === 'متقدم' && nextIdx >= template.steps.length && coverageScore < 75) {
                setStrokes(prev => [...prev, finishedStroke]);
                setRedoStack([]);
                redrawCanvas();
                audioService.playErrorSound();
                setStepAlert({
                  type: 'error',
                  message: `⚠️ المستوى المتقدم يتطلب تغطية سُمك الحرف بنسبة 75% على الأقل (الحالي: ${coverageScore}%) — املأ عرض الحرف`,
                  timestamp: Date.now()
                });
                if (isLessonStarted) {
                  audioService.speakArabic('تغطية سمك الحرف غير مكتملة للمستوى المتقدم، حاول ملء عرض الحرف');
                }
                strokeStartedAtGreenRef.current = false;
                return;
              }

              const prevStepScore = stepScoresRef.current[currentStepIndex]
                ? { ...stepScoresRef.current[currentStepIndex] }
                : undefined;
              const newStepScore = {
                startEnd: 100,
                path: effectivePathScore,
                brokenAway: brokeAway
              };
              stepScoresRef.current[currentStepIndex] = newStepScore;

              audioService.playStepSuccessSound();

              if (nextIdx < template.steps.length) {
                stepMeta = {
                  prevStepIndex: currentStepIndex,
                  nextStepIndex: nextIdx,
                  prevStepScore,
                  nextStepScore: newStepScore,
                };
                setCurrentStepIndex(nextIdx);
                const nextStep = template.steps[nextIdx];
                const stepName = getArabicOrdinal(currentStepIndex + 1);
                const hasWarning = difficulty === 'سهل' && (brokeAway || offCenter);
                setStepAlert({
                  type: 'success',
                  message: hasWarning
                    ? `تم اجتياز ${stepName} — ملاحظة: حاول الالتزام بمسار الحرف ✍️`
                    : `رائع! أتممت ${stepName} بنجاح ✓`,
                  timestamp: Date.now()
                });
                if (isLessonStarted) {
                  const nextPrompt = getStepAudioPrompt(nextStep);
                  setTimeout(() => {
                    audioService.speakArabic(nextPrompt);
                  }, 400);
                }
              } else {
                stepMeta = {
                  prevStepIndex: currentStepIndex,
                  nextStepIndex: currentStepIndex,
                  prevStepScore,
                  nextStepScore: newStepScore,
                  completedLesson: true,
                };
                const recorded = stepScoresRef.current.filter(Boolean);
                const avgPathScore = recorded.length > 0
                  ? Math.round(recorded.reduce((acc, s) => acc + s.path, 0) / recorded.length)
                  : effectivePathScore;
                const anyBroken = recorded.some(s => s.brokenAway);
                const customNote = (difficulty === 'سهل' && anyBroken)
                  ? 'تم اجتياز النقاط بنجاح! ننصح بالالتزام بمسار الحرف أكثر في التمرين القادم ✍️'
                  : undefined;

                openEvaluationResults(100, avgPathScore, coverageScore, customNote);
              }
            }
          } else {
            audioService.playErrorSound();
            setStepAlert({
              type: 'error',
              message: 'تنبيه: يجب إيصال القلم إلى النقطة الحمراء 🔴 لإكمال الخطوة',
              timestamp: Date.now()
            });
            if (isLessonStarted) {
              audioService.speakArabic('واصل الرسم حتى النقطة الحمراء');
            }
          }
        }
        strokeStartedAtGreenRef.current = false;
      }

      const committedStroke: Stroke = stepMeta ? { ...finishedStroke, stepMeta } : finishedStroke;
      setStrokes(prev => [...prev, committedStroke]);
      setRedoStack([]);
      redrawCanvas();
    }
  };

  // Handle Air-Drawing from AR Hand Tracking
  const effectiveIsAirDrawing = isAirDrawing && !isAirPenLocked;

  useEffect(() => {
    if (!isARMode || !virtualCursor) {
      if (activeAirStrokeRef.current) {
        const lostAirStroke = activeAirStrokeRef.current;
        activeAirStrokeRef.current = null;
        setStrokes(prev => [...prev, lostAirStroke]);
        setRedoStack([]);
        redrawCanvas();
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const x = virtualCursor.x * dimensions.width;
    const y = virtualCursor.y * dimensions.height;
    const isChallengeMode = !!(template?.hideDots || template?.hideImage);

    if (effectiveIsAirDrawing) {
      if (!template) {
        if (!activeAirStrokeRef.current) {
          audioService.playErrorSound();
          setStepAlert({
            type: 'error',
            message: '⚠️ يرجى اختيار درس أولاً للبدء في التدريب 📚',
            timestamp: Date.now()
          });
          if (onOpenLibrary) onOpenLibrary();
        }
        return;
      }

      if (evaluationModal) {
        if (!activeAirStrokeRef.current) {
          audioService.playErrorSound();
          setStepAlert({
            type: 'error',
            message: '🔒 اكتمل التقييم! انقر (إعادة التمرين) أو اختر درساً جديداً للرسم مجدداً ✍️',
            timestamp: Date.now()
          });
        }
        return;
      }

      if (!isLessonStarted) {
        if (!activeAirStrokeRef.current) {
          audioService.playErrorSound();
          setStepAlert({
            type: 'error',
            message: '⚠️ انقر على زر ( ابدأ ) في الشريط لبدء التمرين 🎧',
            timestamp: Date.now()
          });
          audioService.speakArabic('انقر زر ابدأ لبدء التمرين');
        }
        return;
      }

      if (!activeAirStrokeRef.current) {
        strokeStatsRef.current = {
          total: 1,
          corePoints: 1,
          grazingPoints: 0,
          offPathPoints: 0,
          offPathConsecutive: 0,
          maxConsecutiveOffPath: 0,
          hasBrokenAway: false
        };

        // Start air stroke: only validate green dot in standard guided mode (NEVER in challenge/no-dots/blind modes)
        if (!isChallengeMode && template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
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

          // Track path adherence only in standard guided mode
          if (!isChallengeMode && penType !== 'eraser' && template?.steps && template.steps.length > 0) {
            strokeStatsRef.current.total++;
            const classification = classifyPoint(x, y);

            if (classification === 'core') {
              strokeStatsRef.current.corePoints++;
              strokeStatsRef.current.offPathConsecutive = 0;
            } else if (classification === 'grazing') {
              strokeStatsRef.current.grazingPoints++;
              strokeStatsRef.current.offPathConsecutive = 0;
            } else {
              strokeStatsRef.current.offPathPoints++;
              strokeStatsRef.current.offPathConsecutive++;
              if (strokeStatsRef.current.offPathConsecutive > strokeStatsRef.current.maxConsecutiveOffPath) {
                strokeStatsRef.current.maxConsecutiveOffPath = strokeStatsRef.current.offPathConsecutive;
              }
              if (strokeStatsRef.current.offPathConsecutive >= 8) {
                strokeStatsRef.current.hasBrokenAway = true;
                const difficulty = template.difficulty || 'سهل';
                if (difficulty !== 'سهل') {
                  setStepAlert({
                    type: 'error',
                    message: '⚠️ تنبيه: خرج القلم عن مسار الحرف! التزم بالحبر',
                    timestamp: Date.now()
                  });
                  audioService.playErrorSound();
                }
              }
            }
          }

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
        activeAirStrokeRef.current = null;
        let stepMeta: Stroke['stepMeta'] | undefined;

        // Validate red dot finish ONLY in standard guided mode (NEVER in challenge/no-dots/blind modes)
        if (!isChallengeMode && template?.steps && template.steps.length > 0 && activeStepPointsRef.current && penType !== 'eraser') {
          if (strokeStartedAtGreenRef.current) {
            const active = activeStepPointsRef.current;
            const lastPt = finishedAirStroke.points[finishedAirStroke.points.length - 1];
            const endDist = Math.hypot(lastPt.x - active.ex, lastPt.y - active.ey);
            const endThreshold = Math.max(52, penSize * 3);

            if (endDist <= endThreshold) {
              const stats = strokeStatsRef.current;
              const total = Math.max(1, stats.total);
              const rawPathScore = Math.min(100, Math.max(25, Math.round(((stats.corePoints * 1.0 + stats.grazingPoints * 0.45) / total) * 100)));
              const difficulty = template.difficulty || 'سهل';
              const brokeAway = stats.hasBrokenAway || stats.maxConsecutiveOffPath >= 8;
              const offCenter = rawPathScore < 45;

              if ((difficulty === 'متوسط' || difficulty === 'متقدم') && (brokeAway || offCenter)) {
                audioService.playErrorSound();
                setStepAlert({
                  type: 'error',
                  message: brokeAway
                    ? 'تنبيه: خرج القلم عن مسار الحرف! يجب الاستمرار على مسار الخط دون انقطاع ✍️'
                    : 'تنبيه: يجب الرسم فوق مسار خط الحرف بدقة ✍️',
                  timestamp: Date.now()
                });
                if (isLessonStarted) {
                  audioService.speakArabic(brokeAway ? 'خرج القلم عن مسار الحرف! التزم بالخط دون انقطاع' : 'ارسم فوق مسار الحرف بدقة');
                }
              } else {
                const effectivePathScore = (difficulty === 'سهل' && (brokeAway || offCenter))
                  ? Math.min(rawPathScore, 55)
                  : rawPathScore;

                const nextIdx = currentStepIndex + 1;
                const coverageScore = calculateCoverageScore([...strokes, finishedAirStroke]);

                if (difficulty === 'متقدم' && nextIdx >= template.steps.length && coverageScore < 75) {
                  setStrokes(prev => [...prev, finishedAirStroke]);
                  setRedoStack([]);
                  redrawCanvas();
                  audioService.playErrorSound();
                  setStepAlert({
                    type: 'error',
                    message: `⚠️ المستوى المتقدم يتطلب تغطية سُمك الحرف بنسبة 75% على الأقل (الحالي: ${coverageScore}%) — املأ عرض الحرف`,
                    timestamp: Date.now()
                  });
                  if (isLessonStarted) {
                    audioService.speakArabic('تغطية سمك الحرف غير مكتملة للمستوى المتقدم، حاول ملء عرض الحرف');
                  }
                  strokeStartedAtGreenRef.current = false;
                  return;
                }

                const prevStepScore = stepScoresRef.current[currentStepIndex]
                  ? { ...stepScoresRef.current[currentStepIndex] }
                  : undefined;
                const newStepScore = {
                  startEnd: 100,
                  path: effectivePathScore,
                  brokenAway: brokeAway
                };
                stepScoresRef.current[currentStepIndex] = newStepScore;

                audioService.playStepSuccessSound();

                if (nextIdx < template.steps.length) {
                  stepMeta = {
                    prevStepIndex: currentStepIndex,
                    nextStepIndex: nextIdx,
                    prevStepScore,
                    nextStepScore: newStepScore,
                  };
                  setCurrentStepIndex(nextIdx);
                  const nextStep = template.steps[nextIdx];
                  const stepName = getArabicOrdinal(currentStepIndex + 1);
                  const hasWarning = difficulty === 'سهل' && (brokeAway || offCenter);
                  setStepAlert({
                    type: 'success',
                    message: hasWarning
                      ? `تم اجتياز ${stepName} — ملاحظة: حاول الالتزام بمسار الحرف ✍️`
                      : `رائع! أتممت ${stepName} بنجاح ✓`,
                    timestamp: Date.now()
                  });
                  if (isLessonStarted) {
                    const nextPrompt = getStepAudioPrompt(nextStep);
                    setTimeout(() => {
                      audioService.speakArabic(nextPrompt);
                    }, 400);
                  }
                } else {
                  stepMeta = {
                    prevStepIndex: currentStepIndex,
                    nextStepIndex: currentStepIndex,
                    prevStepScore,
                    nextStepScore: newStepScore,
                    completedLesson: true,
                  };
                  const recorded = stepScoresRef.current.filter(Boolean);
                  const avgPathScore = recorded.length > 0
                    ? Math.round(recorded.reduce((acc, s) => acc + s.path, 0) / recorded.length)
                    : effectivePathScore;
                  const anyBroken = recorded.some(s => s.brokenAway);
                  const customNote = (difficulty === 'سهل' && anyBroken)
                    ? 'تم اجتياز النقاط بنجاح! ننصح بالالتزام بمسار الحرف أكثر في المحاولة القادمة ✍️'
                    : undefined;

                  openEvaluationResults(100, avgPathScore, coverageScore, customNote);
                }
              }
            } else {
              audioService.playErrorSound();
              setStepAlert({
                type: 'error',
                message: 'تنبيه: يجب إيصال القلم إلى النقطة الحمراء 🔴 لإكمال الخطوة',
                timestamp: Date.now()
              });
              if (isLessonStarted) {
                audioService.speakArabic('واصل الرسم حتى النقطة الحمراء');
              }
            }
          }
          strokeStartedAtGreenRef.current = false;
        }

        const committedAirStroke: Stroke = stepMeta ? { ...finishedAirStroke, stepMeta } : finishedAirStroke;
        setStrokes(prev => [...prev, committedAirStroke]);
        setRedoStack([]);
        redrawCanvas();
      }
    }
  }, [virtualCursor, effectiveIsAirDrawing, isARMode, dimensions, penType, penColor, penSize, calligraphyAngle, redrawCanvas, currentStepIndex, template, openEvaluationResults, classifyPoint, calculateCoverageScore, isLessonStarted, evaluationModal, onOpenLibrary]);

  // Unified complete board clear (matching "مسح السبورة بالكامل")
  const performFullClear = useCallback((withSound = true) => {
    if (withSound) {
      audioService.playEraserSound();
    }
    setStrokes([]);
    setRedoStack([]);
    activePointerStrokeRef.current = null;
    activeAirStrokeRef.current = null;
    hasAchievedGoalRef.current = false;
    setCurrentStepIndex(0);
    setStepAlert(null);
    setEvaluationModal(null);
    setSubmitAnswerResult(null);
    setShowGhostOverlay(false);
    setPendingNextRepScore(null);
    setBoardPanY(0);
    setIsLessonStarted(false);
    strokeStartedAtGreenRef.current = false;
    stepScoresRef.current = [];
    repetitionScoresRef.current = [];
    resetStrokeStats();
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    const dCanvas = diagnosticCanvasRef.current;
    if (dCanvas) {
      dCanvas.getContext('2d')?.clearRect(0, 0, dCanvas.width, dCanvas.height);
    }
    if (onResetRepetition) onResetRepetition();
    if (onAccuracyUpdate) onAccuracyUpdate(0);
    if (onClearSideEffects) onClearSideEffects();
  }, [onAccuracyUpdate, onClearSideEffects, onResetRepetition, resetStrokeStats]);

  // Imperative actions exposed to parent component
  useImperativeHandle(ref, () => ({
    clearCanvas: () => {
      performFullClear(true);
    },
    undo: () => {
      if (strokes.length === 0) return;
      audioService.playChime(420, 0.1);
      const last = strokes[strokes.length - 1];
      setStrokes(prev => prev.slice(0, -1));
      setRedoStack(prev => [...prev, last]);
      if (last.stepMeta) {
        if (last.stepMeta.prevStepScore) {
          stepScoresRef.current[last.stepMeta.prevStepIndex] = last.stepMeta.prevStepScore;
        } else if (last.stepMeta.nextStepScore) {
          delete stepScoresRef.current[last.stepMeta.prevStepIndex];
        }
        if (last.stepMeta.nextStepIndex !== last.stepMeta.prevStepIndex) {
          setCurrentStepIndex(last.stepMeta.prevStepIndex);
        }
        if (last.stepMeta.completedLesson) {
          setEvaluationModal(null);
          hasAchievedGoalRef.current = false;
        }
        setStepAlert(null);
      }
    },
    redo: () => {
      if (redoStack.length === 0) return;
      audioService.playChime(620, 0.1);
      const next = redoStack[redoStack.length - 1];
      setRedoStack(prev => prev.slice(0, -1));
      setStrokes(prev => [...prev, next]);
      if (next.stepMeta) {
        if (next.stepMeta.nextStepScore) {
          stepScoresRef.current[next.stepMeta.prevStepIndex] = next.stepMeta.nextStepScore;
        }
        if (next.stepMeta.nextStepIndex !== next.stepMeta.prevStepIndex) {
          setCurrentStepIndex(next.stepMeta.nextStepIndex);
        }
        setStepAlert(null);
      }
    },
    canUndo: strokes.length > 0,
    canRedo: redoStack.length > 0,
    exportImage: (includeBackground = true) => {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = dimensions.width;
      exportCanvas.height = dimensions.height;
      const ctx = exportCanvas.getContext('2d')!;

      if (includeBackground) {
        if (isARMode && saveArCameraPhoto && videoElement && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
          const drawCoverExport = (source: HTMLVideoElement | HTMLCanvasElement, srcW: number, srcH: number) => {
            const srcRatio = srcW / srcH;
            const dstRatio = exportCanvas.width / exportCanvas.height;
            let sx = 0, sy = 0, sWidth = srcW, sHeight = srcH;
            if (srcRatio > dstRatio) {
              sWidth = srcH * dstRatio;
              sx = (srcW - sWidth) / 2;
            } else {
              sHeight = srcW / dstRatio;
              sy = (srcH - sHeight) / 2;
            }
            ctx.save();
            if (isMirrored) {
              ctx.translate(exportCanvas.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, exportCanvas.width, exportCanvas.height);
            ctx.restore();
          };
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
          try {
            drawCoverExport(videoElement, videoElement.videoWidth, videoElement.videoHeight);
          } catch {}
          if (crownCanvas && crownCanvas.width > 0 && crownCanvas.height > 0) {
            try {
              drawCoverExport(crownCanvas, crownCanvas.width, crownCanvas.height);
            } catch {}
          }
        } else if (boardStyle === 'white') {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        } else if (boardStyle === 'dark' || boardStyle === 'ar_camera') {
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
      if (templateCanvasRef.current && (!template?.hideImage || showGhostOverlay)) {
        try {
          templateCanvasRef.current.toDataURL('image/png');
          ctx.drawImage(templateCanvasRef.current, 0, 0);
        } catch {}
      }

      // Draw user drawing
      if (canvasRef.current) {
        ctx.drawImage(canvasRef.current, 0, 0);
      }

      return exportCanvas.toDataURL('image/png');
    },
    recalculateAccuracy: () => calculateCoverageScore()
  }), [strokes, redoStack, dimensions, boardStyle, calculateCoverageScore, template, performFullClear, isARMode, saveArCameraPhoto, videoElement, crownCanvas, isMirrored, showGhostOverlay]);

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

  const handleContainerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      if (activePointerStrokeRef.current) {
        activePointerStrokeRef.current = null;
        redrawCanvas();
      }
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      twoFingerPanRef.current = { active: true, lastAvgY: avgY };
    }
  };

  const handleContainerTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && twoFingerPanRef.current.active) {
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const deltaY = avgY - twoFingerPanRef.current.lastAvgY;
      twoFingerPanRef.current.lastAvgY = avgY;
      setBoardPanY(prev => Math.max(-180, Math.min(180, Math.round(prev + deltaY))));
    }
  };

  const handleContainerTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      twoFingerPanRef.current.active = false;
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleContainerTouchStart}
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={handleContainerTouchEnd}
      onTouchCancel={handleContainerTouchEnd}
      className={`relative w-full h-full min-h-0 ${isMobileLandscape ? 'rounded-none border-0' : 'rounded-2xl border'} overflow-hidden flex items-center justify-center select-none transition-all duration-300 ${getBoardBgStyle()}`}
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

      {/* Translatable Board Layers Container (supports 3-finger vertical pan) */}
      <div
        className="absolute inset-0"
        style={boardPanY !== 0 ? { transform: `translateY(${boardPanY}px)` } : undefined}
      >
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

        {/* Layer 2.5: Diagnostic Coloring Overlay (Green / Red / Yellow after evaluation) */}
        <canvas
          ref={diagnosticCanvasRef}
          className="absolute inset-0 pointer-events-none z-20"
        />
      </div>

      {/* Quick Re-center Pill when vertically panned with 3 fingers */}
      {boardPanY !== 0 && (
        <button
          type="button"
          onClick={() => setBoardPanY(0)}
          className="absolute bottom-3 left-3 z-30 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-amber-500/40 text-amber-300 text-[10px] font-bold shadow-lg flex items-center gap-1 cursor-pointer hover:bg-slate-800"
        >
          <Crosshair className="w-3 h-3" />
          <span>توسيط اللوحة</span>
        </button>
      )}

      {/* Empty State Banner when no lesson is chosen */}
      {!template && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none z-20">
          <div className="pointer-events-auto max-w-sm sm:max-w-md w-full bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-100 mb-1.5">السبورة جاهزة للتدريب</h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                يرجى اختيار درس من مكتبة الدروس أولاً، ثم النقر على زر <span className="text-amber-400 font-bold">( ابدأ )</span> للبدء في كتابة الحرف وتقييم مسار القلم.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenLibrary}
              className="mt-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg hover:shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>اختيار درس من المكتبة 📚</span>
            </button>
          </div>
        </div>
      )}

      {/* Layer 3: Unified Single-Row Top Bar (الشريط الموحد المدمج على صف واحد - رفيع وملتصق بالأعلى عند التدوير الأفقي للجوال) */}
      <div className={`absolute z-30 pointer-events-none flex justify-center ${
        isMobileLandscape ? 'top-0 inset-x-0' : 'top-2 sm:top-3 inset-x-2 sm:inset-x-4'
      }`}>
        <div className={`pointer-events-auto flex items-center justify-between w-full bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl text-white ${
          isMobileLandscape
            ? 'px-2.5 py-0.5 rounded-b-xl border-t-0 gap-1.5'
            : 'max-w-5xl px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl gap-2'
        }`}>
          
          {/* Right: Topic / Lesson Title & Repetition Badge (الموضوع والتكرار فقط بدون المستوى) */}
          <div className="flex items-center gap-2 shrink-0">
            {isARMode && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-[10px] sm:text-xs shadow-md animate-pulse">
                <Camera className="w-3 h-3" />
                <span>AR</span>
              </span>
            )}
            {template ? (
              <div className="flex items-center gap-1.5 sm:gap-2 max-w-[100px] xs:max-w-[135px] sm:max-w-[210px] md:max-w-[260px] shrink-0">
                {(() => {
                  const words = (template.title || '').trim().split(/\s+/);
                  const isLong = words.length > 2 || (template.title || '').length > 16;

                  if (isLong) {
                    return (
                      <div
                        className="overflow-hidden w-[85px] xs:w-[110px] sm:w-[160px] md:w-[200px] relative select-none"
                        title={template.title}
                        dir="rtl"
                      >
                        <div className="animate-title-marquee flex items-center text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap">
                          <span>{template.title}</span>
                          <span className="mx-2 text-amber-400 font-normal opacity-70">✦</span>
                          <span>{template.title}</span>
                          <span className="mx-2 text-amber-400 font-normal opacity-70">✦</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <span
                      className="font-bold text-xs sm:text-sm text-slate-100 truncate text-right block max-w-[85px] xs:max-w-[110px] sm:max-w-none"
                      title={template.title}
                    >
                      {template.title}
                    </span>
                  );
                })()}

                {template.repeatCount && template.repeatCount > 1 ? (
                  <span className="text-[10px] sm:text-[11px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-1 sm:px-2 py-0.5 rounded-lg flex items-center gap-0.5 sm:gap-1 shrink-0">
                    <Repeat className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="sm:hidden">{currentRepetition || 1}/{template.repeatCount}</span>
                    <span className="hidden sm:inline">تكرار {currentRepetition || 1} / {template.repeatCount}</span>
                  </span>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
                title="فتح مكتبة الدروس لاختيار درس"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>اختيار درس 📚</span>
              </button>
            )}
          </div>

          {/* Center: Inline Next-Repetition Prompt OR In-Bar Smart Alert OR Step Guidance */}
          <div className="flex items-center justify-center flex-1 mx-1 sm:mx-2 overflow-hidden">
            {pendingNextRepScore !== null && template ? (
              <div className="flex items-center gap-1.5 sm:gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                <span
                  className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs sm:text-sm border shrink-0 ${
                    pendingNextRepScore >= 75
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : pendingNextRepScore >= 50
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {pendingNextRepScore}%
                </span>
                <span className="text-[11px] sm:text-xs font-bold text-slate-200 whitespace-nowrap">
                  <span className="sm:hidden">ابدأ الرسمة التالية</span>
                  <span className="hidden sm:inline">
                    ابدأ الرسمة {getArabicDrawingOrdinal((currentRepetition || 1) + 1)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleStartNextRepetition}
                  className="px-2.5 sm:px-3.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-pulse"
                  title="بدء الرسمة التالية"
                >
                  ( ابدأ )
                </button>
              </div>
            ) : stepAlert ? (
              <div
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl text-xs font-bold animate-in fade-in zoom-in-95 duration-150 truncate ${
                  stepAlert.type === 'error'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                }`}
              >
                {stepAlert.type === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                )}
                <span className="truncate">{stepAlert.message}</span>
              </div>
            ) : template ? (
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                {/* Lesson Start Button: strictly hidden while evaluationModal exists */}
                {!isLessonStarted && !evaluationModal && (
                  <button
                    type="button"
                    onClick={handleStartLesson}
                    className="px-2.5 sm:px-3.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-pulse"
                    title="بدء التمرين"
                  >
                    ( ابدأ )
                  </button>
                )}

                {/* Re-open Result Button if student minimized/closed evaluation panel */}
                {evaluationModal && !evaluationModal.isOpen && (
                  <button
                    type="button"
                    onClick={() => setEvaluationModal(prev => prev ? { ...prev, isOpen: true } : null)}
                    className="px-2.5 sm:px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                    title="إظهار نافذة التقييم"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>النتيجة {evaluationModal.totalScore}%</span>
                  </button>
                )}

                {/* Challenge Modes (hideImage or hideDots) or No-Steps Templates */}
                {(template.hideImage || template.hideDots || !template.steps || template.steps.length === 0) ? (
                  <>
                    {isLessonStarted && !evaluationModal ? (
                      <button
                        type="button"
                        onClick={handleFinishChallengeEvaluation}
                        className="px-2.5 sm:px-3.5 py-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
                        title="إنهاء الرسم وعرض التقييم"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {template.hideImage ? '( تقييم رسمة الذاكرة 🏆 )' : '( إنهاء وتقييم )'}
                        </span>
                      </button>
                    ) : !evaluationModal ? (
                      <span className="hidden sm:inline text-xs font-semibold text-amber-300/90 whitespace-nowrap">
                        {template.hideImage
                          ? '🧠 تحدي الذاكرة (سبورة بيضاء)'
                          : template.hideDots
                          ? '🎯 تحدي بدون مؤشرات'
                          : '✍️ انقر ( ابدأ ) للرسم'}
                      </span>
                    ) : null}

                    {/* Reset Challenge Button */}
                    <button
                      type="button"
                      onClick={() => performFullClear(false)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                      title="إعادة التمرين"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  /* Standard Step-by-Step Guided Mode */
                  <>
                    {/* Step Number Only: '1 من 3' on mobile to save space, 'الخطوة 1 من 3' on desktop */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-amber-400 font-bold text-xs sm:text-sm whitespace-nowrap">
                        <span className="sm:hidden">{currentStepIndex + 1} من {template.steps.length}</span>
                        <span className="hidden sm:inline">الخطوة {currentStepIndex + 1} من {template.steps.length}</span>
                      </span>
                    </div>

                    {/* Step Progress Dots */}
                    <div className="hidden sm:flex items-center gap-1">
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

                    {/* Voice Guidance Button (hidden on mobile to free space for ( ابدأ )) */}
                    <button
                      type="button"
                      onClick={async () => {
                        await audioService.unlockAudio();
                        if (!evaluationModal) {
                          setIsLessonStarted(true);
                        }
                        if (template.steps && template.steps[currentStepIndex]) {
                          const prompt = getStepAudioPrompt(template.steps[currentStepIndex]);
                          audioService.speakArabic(prompt);
                        }
                      }}
                      className="hidden sm:flex p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer shrink-0"
                      title="استمع لتوجيه الخطوة"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Reset Step Progress Button */}
                    <button
                      type="button"
                      onClick={() => performFullClear(false)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                      title="إعادة التمرين من البداية"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <span className="text-xs text-amber-300 hidden sm:inline">اختر درساً أولاً ثم انقر ( ابدأ ) لبدء الرسم</span>
            )}
          </div>

          {/* Left: Quick Action Controls (تحريك/حجم، قفل القلم الهوائي، دليل الاستخدام وتكبير الشاشة) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Air Pen Lock / Unlock quick toggle in AR mode */}
            {isARMode && onToggleAirPenLock && (
              <button
                type="button"
                onClick={onToggleAirPenLock}
                title={isAirPenLocked ? 'القلم الهوائي مقفل — انقر لفتح الرسم' : 'قفل القلم الهوائي مؤقتاً لمنع الشخبطة'}
                className={`p-1.5 sm:px-2 sm:py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0 ${
                  isAirPenLocked
                    ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                }`}
              >
                {isAirPenLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{isAirPenLocked ? 'مقفل' : 'مفعّل'}</span>
              </button>
            )}

            {/* Template Move & Resize Popover Button */}
            {template && (
              <button
                type="button"
                onClick={() => setIsTransformPopoverOpen(prev => !prev)}
                title="تحريك وتكبير/تصغير موضع الصورة"
                className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0 ${
                  isTransformPopoverOpen || isTransformLocked || templateTransform.offsetX !== 0 || templateTransform.offsetY !== 0 || templateTransform.scale !== 1
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-amber-300 border-slate-700/60'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span className="hidden md:inline">تحريك</span>
              </button>
            )}

            {/* Mobile Landscape Quick Tools Bar & Library Toggles */}
            {isMobileLandscape && onToggleLandscapeToolbar && (
              <button
                type="button"
                onClick={onToggleLandscapeToolbar}
                title={isLandscapeToolbarOpen ? 'إخفاء شريط الأدوات (ملء الشاشة)' : 'إظهار شريط الأدوات (الأقلام والواقع المعزز)'}
                className={`p-1 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0 ${
                  isLandscapeToolbarOpen
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-slate-800/85 hover:bg-slate-700 text-amber-300 border-slate-700/60'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>الأدوات</span>
              </button>
            )}

            {isMobileLandscape && template && onOpenLibrary && !isLandscapeToolbarOpen && (
              <button
                type="button"
                onClick={onOpenLibrary}
                title="تغيير الدرس / مكتبة الدروس"
                className="p-1 rounded-lg bg-slate-800/85 hover:bg-slate-700 text-sky-300 border border-slate-700/60 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Help Guide Button: hidden on mobile per user request */}
            {onOpenHelp && !isMobileLandscape && (
              <button
                type="button"
                onClick={onOpenHelp}
                title="دليل الاستخدام السريع"
                className="hidden sm:flex p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-slate-700/60 active:scale-95 transition-all cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'تصغير الشاشة' : 'تكبير الشاشة ملء العرض'}
                className={`${isMobileLandscape ? 'p-1 rounded-lg' : 'p-1.5 sm:p-2 rounded-xl'} bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 active:scale-95 transition-all cursor-pointer`}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Template Move / Scale Control Popover */}
      {isTransformPopoverOpen && template && (
        <div className={`absolute ${isMobileLandscape ? 'top-10' : 'top-14 sm:top-16'} left-2 sm:left-4 z-40 w-[238px] bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-3 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-150`}>
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Move className="w-3.5 h-3.5" />
              <span>ضبط مكان وحجم الصورة</span>
            </div>
            <button
              type="button"
              onClick={() => setIsTransformPopoverOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {strokes.length > 0 ? (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-2 text-center">
              <p>امسح الحبر أولاً قبل تحريك الحرف حتى تبقى دقة التقييم صحيحة.</p>
              <button
                type="button"
                onClick={() => performFullClear(true)}
                className="w-full py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] hover:brightness-110 cursor-pointer"
              >
                مسح الحبر للتحريك
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Directional Pad: Up / Right / Center / Left / Down */}
              <div className="grid grid-cols-3 gap-1.5 w-[132px] mx-auto">
                <div />
                <button
                  type="button"
                  onClick={() => updateTemplateTransform(p => ({ ...p, offsetY: Math.max(-0.42, +(p.offsetY - 0.04).toFixed(2)) }))}
                  title="تحريك للأعلى"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <div />

                <button
                  type="button"
                  onClick={() => updateTemplateTransform(p => ({ ...p, offsetX: Math.min(0.42, +(p.offsetX + 0.04).toFixed(2)) }))}
                  title="تحريك لليمين"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => updateTemplateTransform(() => DEFAULT_TEMPLATE_TRANSFORM)}
                  title="إرجاع للمنتصف"
                  className="p-2 rounded-xl bg-slate-700 hover:bg-emerald-500 hover:text-slate-950 border border-slate-600 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => updateTemplateTransform(p => ({ ...p, offsetX: Math.max(-0.42, +(p.offsetX - 0.04).toFixed(2)) }))}
                  title="تحريك لليسار"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div />
                <button
                  type="button"
                  onClick={() => updateTemplateTransform(p => ({ ...p, offsetY: Math.min(0.42, +(p.offsetY + 0.04).toFixed(2)) }))}
                  title="تحريك للأسفل"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <div />
              </div>

              {/* Scale +/- Controls */}
              <div className="flex items-center justify-between gap-2 bg-slate-950/70 p-1.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => updateTemplateTransform(p => ({ ...p, scale: Math.max(0.55, +(p.scale - 0.08).toFixed(2)) }))}
                  title="تصغير الصورة"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
                  {Math.round(templateTransform.scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => updateTemplateTransform(p => ({ ...p, scale: Math.min(1.60, +(p.scale + 0.08).toFixed(2)) }))}
                  title="تكبير الصورة"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Lock Across All Lessons */}
              <button
                type="button"
                onClick={toggleTransformLock}
                className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  isTransformLocked
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {isTransformLocked ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                <span>{isTransformLocked ? 'مثبت لجميع الدروس ✓' : 'تثبيت هذا الموضع لكل الصور'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Comparison Bar when inspecting Ghost Overlay outside modal */}
      {template?.hideImage && showGhostOverlay && !evaluationModal?.isOpen && (
        <div className="absolute bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/95 border border-amber-500/40 shadow-xl text-xs">
            <span className="text-amber-300 font-bold">👻 مقارنة الظل الذهبي للحرف</span>
            <button
              type="button"
              onClick={() => setShowGhostOverlay(prev => !prev)}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer flex items-center gap-1"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>إخفاء الظل</span>
            </button>
            <button
              type="button"
              onClick={() => setEvaluationModal(prev => prev ? { ...prev, isOpen: true } : null)}
              className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-bold hover:brightness-110 cursor-pointer"
            >
              العودة للتقييم
            </button>
          </div>
        </div>
      )}

      {/* Honor Stars Corner Badge & Diagnostic Coloring Toggle on Board during Evaluation */}
      {evaluationModal && (
        <>
          {/* Corner 10-Star Honor Widget (opposite side of sidebar so it never collides) */}
          <div
            className={`absolute ${isMobileLandscape ? 'top-10' : 'top-14 sm:top-16'} z-30 pointer-events-auto flex flex-wrap lg:flex-nowrap items-center justify-center max-w-[146px] lg:max-w-none gap-0.5 lg:gap-1 px-2 py-1 lg:px-2.5 lg:py-1.5 rounded-2xl bg-slate-900/90 border border-amber-500/40 shadow-xl ${
              evalSidebarSide === 'left' ? 'right-2 sm:right-4' : 'left-2 sm:left-4'
            }`}
          >
            {Array.from({ length: 10 }, (_, idx) => {
              const earned = idx < getEarnedStars(evaluationModal.totalScore);
              return (
                <Star
                  key={idx}
                  className={`w-3.5 h-3.5 lg:w-4 lg:h-4 ${
                    earned ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.7)]' : 'text-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Bottom Diagnostic Legend Strip (hidden for freehand mode since there is no reference path error) */}
          {evaluationModal.evalMode !== 'freehand' && (
            <div className="absolute bottom-2.5 inset-x-0 z-30 flex justify-center pointer-events-none px-2">
              <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 px-2.5 py-1 rounded-xl bg-slate-900/88 border border-slate-700/80 text-[10px] sm:text-[11px] text-slate-200 shadow-lg">
                {showDiagnosticColors && (
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>صحيح</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>خارج المسار</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-400" />
                      <span>فراغ السُمك</span>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowDiagnosticColors(prev => !prev)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  {showDiagnosticColors ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showDiagnosticColors ? 'إخفاء التشخيص' : 'تلوين الأخطاء'}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Layer 4: Zero-Blur Slim Vertical Results Sidebar (نافذة نتائج نحيفة بدون ضباب - للهواتف والتابليت < lg، كاملة لسطح المكتب lg+) */}
      {evaluationModal && evaluationModal.isOpen && (
        <div
          className={`absolute inset-y-0 z-40 pointer-events-none flex items-center p-1.5 sm:p-2.5 lg:p-3 animate-in fade-in duration-200 ${
            evalSidebarSide === 'left' ? 'left-0 justify-end' : 'right-0 justify-start'
          }`}
        >
          {isEvalSidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setIsEvalSidebarCollapsed(false)}
              className="pointer-events-auto px-2.5 py-2 rounded-2xl bg-slate-900/95 border border-amber-500/50 text-amber-300 shadow-2xl flex items-center gap-1.5 text-xs font-bold cursor-pointer hover:bg-slate-800"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span className="font-mono">{evaluationModal.totalScore}%</span>
              {evalSidebarSide === 'left' ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <aside className="pointer-events-auto w-[92px] sm:w-[104px] lg:w-[214px] max-h-[82vh] bg-slate-900/92 border border-amber-500/40 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] text-white text-center overflow-y-auto p-1.5 lg:p-3 flex flex-col gap-1.5 lg:gap-2">
              {/* Compact Window Controls: Swap Side / Collapse / Close */}
              <div className="flex items-center justify-between gap-0.5 lg:gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEvaluationModal(prev => prev ? { ...prev, isOpen: false } : null);
                    setIsLessonStarted(false);
                  }}
                  title="إغلاق"
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                </button>
                <div className="flex items-center gap-0.5 lg:gap-1">
                  <button
                    type="button"
                    onClick={() => setEvalSidebarSide(prev => prev === 'left' ? 'right' : 'left')}
                    title="نقل الشريط لليمين أو اليسار"
                    className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEvalSidebarCollapsed(true)}
                    title="تصغير النافذة"
                    className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  >
                    {evalSidebarSide === 'left' ? <ChevronLeft className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> : <ChevronRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 1. Icon + Label (تقييم) */}
              <div className="flex flex-col items-center gap-0.5 lg:gap-1">
                <div className="w-7 h-7 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-md">
                  <Award className="w-4 h-4 lg:w-5 lg:h-5" />
                </div>
                <h3 className="font-bold text-[11px] lg:text-sm text-amber-300 leading-tight">
                  {evaluationModal.repetitionBreakdown && evaluationModal.repetitionBreakdown.length > 1
                    ? `تقييم (${evaluationModal.repetitionBreakdown.length})`
                    : 'تقييم'}
                </h3>
              </div>

              {/* 2. Final Big Score (%) */}
              <div className="font-extrabold font-mono text-lg sm:text-xl lg:text-3xl text-white tracking-tight tabular-nums leading-none">
                {evaluationModal.totalScore}%
              </div>

              {/* 3. Concise Feedback Comment */}
              <p className="text-[9px] lg:text-[11px] font-semibold text-amber-200/95 leading-snug line-clamp-2 lg:line-clamp-3">
                {evaluationModal.feedback}
              </p>

              {/* Multi-Repetition Compact Text Summary */}
              {evaluationModal.repetitionBreakdown && evaluationModal.repetitionBreakdown.length > 1 && (
                <div className="text-[9px] lg:text-[10px] text-slate-300 leading-tight border-t border-slate-800 pt-1">
                  {evaluationModal.repetitionBreakdown.map((item, idx) => (
                    <span key={item.rep}>
                      {idx > 0 && ' · '}
                      <span className="font-mono text-amber-300 font-bold">{item.score}%</span>
                    </span>
                  ))}
                </div>
              )}

              {/* 4–6. Vertical Criteria List (Mode-aware: 2 metrics for guide_only, 3 artistic for freehand, 3 guided for steps) */}
              <div className="space-y-1 lg:space-y-1.5 bg-slate-950/55 rounded-xl border border-slate-800 p-1.5 lg:p-2 text-center">
                {evaluationModal.evalMode !== 'guide_only' && (
                  <div>
                    <div className="text-[9px] lg:text-[10px] text-slate-300 leading-tight">
                      {evaluationModal.evalMode === 'freehand'
                        ? 'ثبات اليد'
                        : template?.hideImage
                        ? 'الاتزان والبداية'
                        : 'البداية والنهاية'}
                    </div>
                    <div className="font-mono font-bold text-[11px] lg:text-xs text-emerald-400 tabular-nums">
                      {evaluationModal.startEndScore}%
                    </div>
                    <div className="hidden lg:block w-full bg-slate-800 rounded-full h-1 mt-0.5 overflow-hidden">
                      <div className="bg-emerald-500 h-1 rounded-full transition-all duration-500" style={{ width: `${evaluationModal.startEndScore}%` }} />
                    </div>
                  </div>
                )}

                <div className={evaluationModal.evalMode !== 'guide_only' ? 'border-t border-slate-800/80 pt-1' : ''}>
                  <div className="text-[9px] lg:text-[10px] text-slate-300 leading-tight">
                    {evaluationModal.evalMode === 'freehand'
                      ? 'توازن اللوحة'
                      : template?.hideImage
                      ? 'تطابق الشكل'
                      : evaluationModal.evalMode === 'guide_only'
                      ? 'الالتزام بالشكل'
                      : 'دقة المسار'}
                  </div>
                  <div className="font-mono font-bold text-[11px] lg:text-xs text-amber-400 tabular-nums">
                    {evaluationModal.pathScore}%
                  </div>
                  <div className="hidden lg:block w-full bg-slate-800 rounded-full h-1 mt-0.5 overflow-hidden">
                    <div className="bg-amber-400 h-1 rounded-full transition-all duration-500" style={{ width: `${evaluationModal.pathScore}%` }} />
                  </div>
                </div>

                <div className="border-t border-slate-800/80 pt-1">
                  <div className="text-[9px] lg:text-[10px] text-slate-300 leading-tight">
                    {evaluationModal.evalMode === 'freehand'
                      ? 'ثراء التفاصيل'
                      : template?.hideImage
                      ? 'تغطية المعالم'
                      : evaluationModal.evalMode === 'guide_only'
                      ? 'التغطية والامتلاء'
                      : 'سُمك الحرف'}
                  </div>
                  <div className="font-mono font-bold text-[11px] lg:text-xs text-sky-400 tabular-nums">
                    {evaluationModal.coverageScore}%
                  </div>
                  <div className="hidden lg:block w-full bg-slate-800 rounded-full h-1 mt-0.5 overflow-hidden">
                    <div className="bg-sky-400 h-1 rounded-full transition-all duration-500" style={{ width: `${evaluationModal.coverageScore}%` }} />
                  </div>
                </div>
              </div>

              {/* Blind Memory Mode: Quick Ghost Toggle */}
              {template?.hideImage && (
                <button
                  type="button"
                  onClick={() => setShowGhostOverlay(prev => !prev)}
                  title={showGhostOverlay ? 'إخفاء الحرف' : 'عرض الحرف'}
                  className="w-full py-1.5 px-1.5 lg:px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-[9px] lg:text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  {showGhostOverlay ? <EyeOff className="w-3.5 h-3.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 shrink-0" />}
                  <span className="hidden lg:inline">{showGhostOverlay ? 'إخفاء الحرف' : 'عرض الحرف'}</span>
                </button>
              )}

              {/* Bottom Action Buttons: Vertically stacked (Reset above Submit), icon-only on mobile & tablet (< lg) */}
              <div className="flex flex-col gap-1.5">
                {/* 7. Reset Exercise Button (إعادة التمرين) */}
                <button
                  type="button"
                  onClick={() => performFullClear(false)}
                  title="إعادة التمرين"
                  aria-label="إعادة التمرين"
                  className="w-full py-2 px-1.5 lg:px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
                  <span className="hidden lg:inline">إعادة التمرين</span>
                </button>

                {/* 8. Submit Answer Button (تسجيل الإجابة) */}
                <button
                  type="button"
                  onClick={handleSubmitAnswer}
                  disabled={isSubmittingAnswer || submitAnswerResult?.success}
                  title={isSubmittingAnswer ? 'جاري الحفظ...' : submitAnswerResult?.success ? 'تم تسجيل الإجابة' : 'تسجيل الإجابة'}
                  aria-label="تسجيل الإجابة"
                  className={`w-full py-2 px-1.5 lg:px-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer ${
                    submitAnswerResult?.success
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                      : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white active:scale-95 disabled:opacity-60'
                  }`}
                >
                  {isSubmittingAnswer ? (
                    <>
                      <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin shrink-0" />
                      <span className="hidden lg:inline">جاري الحفظ...</span>
                    </>
                  ) : submitAnswerResult?.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-emerald-400 shrink-0" />
                      <span className="hidden lg:inline">تم التسجيل</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
                      <span className="hidden lg:inline">تسجيل الإجابة</span>
                    </>
                  )}
                </button>
              </div>

              {/* Compact Upload Result Message (Short text only, no image link) */}
              {submitAnswerResult && (
                <div
                  className={`p-1.5 rounded-xl text-[9px] lg:text-[10px] font-bold text-center leading-tight ${
                    submitAnswerResult.success
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {submitAnswerResult.message}
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Layer 5: Virtual Air-Cursor Overlay with Live Path-Adherence Glow */}
      {isARMode && virtualCursor && (() => {
        const cx = virtualCursor.x * dimensions.width;
        const cy = virtualCursor.y * dimensions.height;
        const canCheckPath =
          effectiveIsAirDrawing &&
          Boolean(template) &&
          !template?.hideImage &&
          (letterGridRef.current?.totalCells || 0) > 0 &&
          penType !== 'eraser';
        const pointClass = canCheckPath ? classifyPoint(cx, cy) : null;

        let ringClass = 'bg-white/40 border-amber-400 shadow-[0_0_12px_rgba(255,255,255,0.8)] scale-100';
        let dotClass = 'bg-amber-400';
        let badgeText = '';
        let badgeClass = '';

        if (isAirPenLocked) {
          ringClass = 'bg-slate-800/75 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.45)] scale-95';
          dotClass = 'bg-rose-400';
          badgeText = '🔒 القلم مقفل';
          badgeClass = 'bg-rose-600 text-white';
        } else if (effectiveIsAirDrawing) {
          if (pointClass === 'core') {
            ringClass = 'bg-emerald-500/85 border-amber-200 shadow-[0_0_24px_rgba(16,185,129,0.95)] scale-125';
            dotClass = 'bg-white';
            badgeText = '✨ داخل الحرف';
            badgeClass = 'bg-emerald-500 text-slate-950';
          } else if (pointClass === 'grazing') {
            ringClass = 'bg-amber-500/85 border-yellow-100 shadow-[0_0_22px_rgba(245,158,11,0.95)] scale-125';
            dotClass = 'bg-white';
            badgeText = '✍️ قريب من المسار';
            badgeClass = 'bg-amber-400 text-slate-950';
          } else if (pointClass === 'off') {
            ringClass = 'bg-rose-600/90 border-white shadow-[0_0_24px_rgba(244,63,94,0.95)] scale-125';
            dotClass = 'bg-white';
            badgeText = '⚠️ خارج المسار';
            badgeClass = 'bg-rose-600 text-white';
          } else {
            ringClass = 'bg-amber-500/80 border-white shadow-[0_0_20px_#f59e0b] scale-125';
            dotClass = 'bg-white';
            badgeText = '✍️ يرسم';
            badgeClass = 'bg-amber-500 text-slate-950';
          }
        }

        return (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${virtualCursor.x * 100}%`,
              top: `${virtualCursor.y * 100}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-100 ${ringClass}`}>
              <div className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
              {badgeText && (
                <span className={`absolute -top-7 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shadow-md ${badgeClass}`}>
                  {badgeText}
                </span>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
});

WhiteboardCanvas.displayName = 'WhiteboardCanvas';
