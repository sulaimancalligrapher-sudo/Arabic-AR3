import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { BoardStyle, PenType, Stroke, Point, DrawingTemplate, GuideColor, LessonStep } from '../types/drawing';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { getArabicOrdinal, getStepAudioPrompt, RegistrantUser, sheetService } from '../services/sheetService';
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
  ExternalLink,
  Loader2,
  Eye,
  EyeOff,
  Sparkles
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
  virtualCursor: { x: number; y: number } | null;
  isAirDrawing: boolean;
  calligraphyAngle?: number;
  currentRepetition?: number;
  isFullscreen?: boolean;
  currentUser?: RegistrantUser | null;
  totalLessonsInTopic?: number;
  onToggleFullscreen?: () => void;
  onOpenHelp?: () => void;
  onOpenLibrary?: () => void;
  onNextRepetition?: () => void;
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
  calligraphyAngle = 120,
  currentRepetition = 1,
  isFullscreen = false,
  currentUser,
  totalLessonsInTopic,
  onToggleFullscreen,
  onOpenHelp,
  onOpenLibrary,
  onNextRepetition,
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
  const [evaluationModal, setEvaluationModal] = useState<{
    isOpen: boolean;
    totalScore: number;
    startEndScore: number;
    pathScore: number;
    coverageScore: number;
    feedback: string;
  } | null>(null);

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
  }, [dimensions, template, guideColor, templateOpacity, currentStepIndex, showGhostOverlay]);

  // Reset goal achieved state and step progression when template or repetition changes (requires ( ابدأ ) for every lesson)
  useEffect(() => {
    hasAchievedGoalRef.current = false;
    setCurrentStepIndex(0);
    setStepAlert(null);
    setEvaluationModal(null);
    setSubmitAnswerResult(null);
    setShowGhostOverlay(false);
    setIsLessonStarted(false);
    strokeStartedAtGreenRef.current = false;
    stepScoresRef.current = [];
    resetStrokeStats();
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

  // Extract pixel-level letter grid using a dedicated sampling canvas (works even when hideImage is true!)
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

        for (let y = 0; y < tHeight; y += cell) {
          const gy = Math.floor(y / cell);
          for (let x = 0; x < tWidth; x += cell) {
            const idx = (y * tWidth + x) * 4;
            if (data[idx + 3] > 30) {
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

    // 1. Direct Image URL (Google Drive transparent PNG or web URL)
    if (template.imageUrl && template.imageUrl.trim()) {
      const directUrl = formatDirectImageUrl(template.imageUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = directUrl;

      img.onload = () => {
        const padding = Math.min(tCanvas.width, tCanvas.height) * 0.08;
        const availW = tCanvas.width - padding * 2;
        const availH = tCanvas.height - padding * 2;
        const scale = Math.min(availW / (img.width || 500), availH / (img.height || 500));
        const drawW = (img.width || 500) * scale;
        const drawH = (img.height || 500) * scale;
        const drawX = (tCanvas.width - drawW) / 2;
        const drawY = (tCanvas.height - drawH) / 2;
        drawBoundsRef.current = { drawX, drawY, drawW, drawH };

        if (shouldRenderImage) {
          ctx.save();
          ctx.globalAlpha = effectiveOpacity;

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
        }

        // Render ONLY the active step marker (No arrows, green start dot & red end dot) if enabled
        if (template.steps && template.steps.length > 0) {
          drawActiveStepMarker(ctx, template.steps, currentStepIndex, drawX, drawY, drawW, drawH, shouldRenderDots);
        }

        // Extract pixel-level letter body mask in memory (even when hideImage is active)
        extractLetterGridFromImage(img, tCanvas.width, tCanvas.height, drawX, drawY, drawW, drawH, template.steps);
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
        const padding = Math.min(tCanvas.width, tCanvas.height) * 0.08;
        const availW = tCanvas.width - padding * 2;
        const availH = tCanvas.height - padding * 2;
        const scale = Math.min(availW / (img.width || 500), availH / (img.height || 500));
        const drawW = (img.width || 500) * scale;
        const drawH = (img.height || 500) * scale;
        const drawX = (tCanvas.width - drawW) / 2;
        const drawY = (tCanvas.height - drawH) / 2;
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
  const calculateCoverageScore = useCallback((): number => {
    const lg = letterGridRef.current;
    if (!lg || lg.totalCells === 0 || !template || template.category === 'freehand') return 0;

    // Must allocate matching the entire spatial grid dimensions (width * height)
    // so indexing cy * width + cx never exceeds array bounds
    const covered = new Uint8Array(lg.grid.length);
    let coveredCount = 0;

    strokes.forEach(stroke => {
      if (stroke.penType !== 'eraser') {
        const strokePenRadius = Math.max(3, (stroke.size || penSize) * 0.6);
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
  }, [strokes, template, penSize, onAccuracyUpdate]);

  // Recalculate whenever strokes change
  useEffect(() => {
    calculateCoverageScore();
  }, [strokes, calculateCoverageScore]);

  // Capture composite board image safely as Base64 PNG with an optional bottom stamp bar (student info + scores)
  const captureBoardBase64 = useCallback((stampInfo?: {
    studentName: string;
    studentId: string;
    lessonTitle: string;
    totalScore: number;
    startEndScore: number;
    pathScore: number;
    coverageScore: number;
    isBlindMode?: boolean;
  }): string => {
    const exportWidth = Math.max(780, Math.min(1200, dimensions.width || 800));
    const scale = exportWidth / Math.max(1, dimensions.width || 800);
    const boardHeight = Math.max(1, Math.round((dimensions.height || 500) * scale));
    const footerHeight = stampInfo ? 78 : 0;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportWidth;
    exportCanvas.height = boardHeight + footerHeight;
    const ctx = exportCanvas.getContext('2d')!;

    if (boardStyle === 'dark') {
      ctx.fillStyle = '#0f172a';
    } else if (boardStyle === 'green') {
      ctx.fillStyle = '#064e3b';
    } else if (boardStyle === 'grid') {
      ctx.fillStyle = '#fdfbf7';
    } else {
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillRect(0, 0, exportWidth, boardHeight);

    // Check if templateCanvasRef is origin-clean BEFORE drawing it onto exportCanvas
    if (templateCanvasRef.current && !template?.hideImage) {
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

    // Stamp student info, score badge, and breakdown on a crisp bottom band
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
      const row1Y = yTop + 23;
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
      ctx.fillRect(padX, yTop + 40, exportWidth - padX * 2, 1);

      // Row 2: Final Score Badge (right) | Detailed Breakdown (left)
      const row2Y = yTop + 58;
      const scoreVal = Math.round(stampInfo.totalScore);
      const badgeColor = scoreVal >= 75 ? '#10b981' : scoreVal >= 50 ? '#f59e0b' : '#f43f5e';
      const badgeBg = scoreVal >= 75 ? 'rgba(16, 185, 129, 0.16)' : scoreVal >= 50 ? 'rgba(245, 158, 11, 0.16)' : 'rgba(244, 63, 94, 0.18)';

      const scoreLabel = `الدرجة النهائية: ${scoreVal}%`;
      ctx.font = 'bold 14px Cairo, Tahoma, sans-serif';
      const pillWidth = Math.ceil(ctx.measureText(scoreLabel).width) + 24;
      const pillHeight = 26;
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
      const breakdownText = stampInfo.isBlindMode
        ? `الاتزان: ${stampInfo.startEndScore}%  •  التشابه: ${stampInfo.pathScore}%  •  المعالم: ${stampInfo.coverageScore}%`
        : `البداية/النهاية: ${stampInfo.startEndScore}%  •  المسار: ${stampInfo.pathScore}%  •  السُمك: ${stampInfo.coverageScore}%`;
      ctx.fillText(breakdownText, padX, row2Y + 1);
    }

    return exportCanvas.toDataURL('image/png');
  }, [dimensions, boardStyle, template]);

  // Open Evaluation Modal with scores, confetti & voice
  const openEvaluationResults = useCallback((
    startEndScore: number,
    pathScore: number,
    coverageScore: number,
    customFeedback?: string
  ) => {
    const finalScore = Math.min(
      100,
      Math.max(20, Math.round(startEndScore * 0.20 + pathScore * 0.50 + coverageScore * 0.30))
    );

    let feedback = customFeedback || '';
    if (!feedback) {
      if (finalScore >= 88) feedback = 'ما شاء الله! جريان قلم متقن ومسار متميز 🌟';
      else if (finalScore >= 72) feedback = 'جيد جداً! رسم دقيق مع استقرار في القلم 👍';
      else if (finalScore >= 50) feedback = 'محاولة طيبة! واصل التدريب لملء عرض الحرف والالتزام بالمسار ✍️';
      else feedback = 'بداية تحتاج إلى تركيز أكثر على شكل الحرف ومساره ✍️';
    }

    setEvaluationModal({
      isOpen: true,
      totalScore: finalScore,
      startEndScore,
      pathScore,
      coverageScore,
      feedback
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

    if (isLessonStarted && !template?.hideDots && !template?.hideImage) {
      audioService.speakArabic(`حققت درجة ${finalScore} في المئة. ${feedback}`);
    }
    setStepAlert({
      type: 'success',
      message: `تم التقييم: الدرجة النهائية ${finalScore}% 🎉`,
      timestamp: Date.now()
    });
    if (onGoalAchieved) {
      onGoalAchieved(finalScore);
    }
  }, [isLessonStarted, template, onGoalAchieved]);

  // Evaluate Blind Memory Test (hideImage) or No-Dots Mode (hideDots)
  const handleFinishChallengeEvaluation = useCallback(() => {
    const userStrokes = strokes.filter(s => s.penType !== 'eraser' && s.points.length > 0);
    if (userStrokes.length === 0) {
      audioService.playErrorSound();
      setStepAlert({
        type: 'error',
        message: '⚠️ ارسم الحرف أولاً ثم اضغط للتقييم ✍️',
        timestamp: Date.now()
      });
      return;
    }

    // Collect all user drawn points
    const drawnPts: Point[] = [];
    userStrokes.forEach(s => s.points.forEach(p => drawnPts.push(p)));

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

      // Check step directional alignment in normalized bounding box if steps exist
      if (template.steps && template.steps.length > 0 && drawBoundsRef.current) {
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
        startEndScore = shapeScore;
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
          : 'أحسنت المحاولة! راجع الظل الذهبي للحرف وأعد التجربة 💪'
      );
      return;
    }

    // 2. NO-DOTS MODE (hideDots = true) or NO-STEPS TEMPLATE: Evaluate against visible guide
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

    let startEndScore = pathScore;
    if (template?.steps && template.steps.length > 0 && drawBoundsRef.current) {
      const { drawX, drawY, drawW, drawH } = drawBoundsRef.current;
      const firstStep = template.steps[0];
      const lastStep = template.steps[template.steps.length - 1];
      const sx = drawX + firstStep.startX * drawW;
      const sy = drawY + firstStep.startY * drawH;
      const ex = drawX + lastStep.endX * drawW;
      const ey = drawY + lastStep.endY * drawH;

      const uStart = userStrokes[0].points[0];
      const lastStroke = userStrokes[userStrokes.length - 1];
      const uEnd = lastStroke.points[lastStroke.points.length - 1];

      const threshold = Math.max(45, penSize * 2.5);
      const startDist = Math.hypot(uStart.x - sx, uStart.y - sy);
      const endDist = Math.hypot(uEnd.x - ex, uEnd.y - ey);
      const sPct = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, startDist - threshold * 0.5) * 0.8)));
      const ePct = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, endDist - threshold * 0.5) * 0.8)));
      startEndScore = Math.round((sPct + ePct) / 2);
    }

    openEvaluationResults(startEndScore, pathScore, coverageScore);
  }, [strokes, template, penSize, classifyPoint, calculateCoverageScore, openEvaluationResults]);

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
      const imageBase64 = captureBoardBase64({
        studentName: currentUser.name,
        studentId: currentUser.id,
        lessonTitle: template.title,
        totalScore: evaluationModal.totalScore,
        startEndScore: evaluationModal.startEndScore,
        pathScore: evaluationModal.pathScore,
        coverageScore: evaluationModal.coverageScore,
        isBlindMode: Boolean(template.hideImage)
      });
      const details = `البداية/النهاية: ${evaluationModal.startEndScore}% | المسار: ${evaluationModal.pathScore}% | السُمك: ${evaluationModal.coverageScore}%`;
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
            message: `تم تسجيل الإجابة ورفع الصورة بنجاح! (${res.completionStatus || 'محفوظ'})`,
            imageUrl: res.imageUrl,
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
    await audioService.unlockAudio();
    setIsLessonStarted(true);
    setStepAlert(null);
    stepScoresRef.current = [];
    if (template?.steps && template.steps[currentStepIndex] && !template.hideDots && !template.hideImage) {
      const prompt = getStepAudioPrompt(template.steps[currentStepIndex]);
      audioService.speakArabic(prompt);
    }
  };

  // Handle pointer down (Mouse, Finger Touch, Apple Pencil Stylus)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
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

    // 2. Guard: Check if student has clicked ( ابدأ )
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
      setStrokes(prev => [...prev, finishedStroke]);
      setRedoStack([]); // Clear redo history on new stroke
      activePointerStrokeRef.current = null;
      redrawCanvas();

      const isChallengeMode = !!(template?.hideDots || template?.hideImage);

      // Step constraint check in standard step-by-step mode
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

            // Level 2 (متوسط) & Level 3 (متقدم): Strictly block if pencil left the path or broke away
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
              // Calculate adjusted step path score (in 'سهل', penalize off-path strokes cleanly instead of blocking)
              const effectivePathScore = (difficulty === 'سهل' && (brokeAway || offCenter))
                ? Math.min(rawPathScore, 55)
                : rawPathScore;

              const nextIdx = currentStepIndex + 1;
              const coverageScore = calculateCoverageScore();

              // Level 3 (متقدم): On final step, enforce stroke thickness coverage >= 75%
              if (difficulty === 'متقدم' && nextIdx >= template.steps.length && coverageScore < 75) {
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

              // Record step result
              stepScoresRef.current[currentStepIndex] = {
                startEnd: 100,
                path: effectivePathScore,
                brokenAway: brokeAway
              };

              audioService.playStepSuccessSound();

              if (nextIdx < template.steps.length) {
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
                // ALL STEPS COMPLETED! Average path scores across recorded steps
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
            // Stroke did not reach red dot
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

      if (!isLessonStarted) {
        if (!activeAirStrokeRef.current) {
          audioService.playErrorSound();
          setStepAlert({
            type: 'error',
            message: '⚠️ انقر على زر ( ابدأ ) في الشريط لبدء التمرين وسماع التوجيه 🎧',
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

          // Track path adherence
          if (penType !== 'eraser' && template?.steps && template.steps.length > 0) {
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
                setStepAlert({
                  type: 'error',
                  message: '⚠️ تنبيه: خرج القلم عن مسار الحرف! التزم بالحبر',
                  timestamp: Date.now()
                });
                audioService.playErrorSound();
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
              const stats = strokeStatsRef.current;
              const total = Math.max(1, stats.total);

              if (stats.hasBrokenAway || stats.maxConsecutiveOffPath >= 8) {
                audioService.playErrorSound();
                setStepAlert({
                  type: 'error',
                  message: 'تنبيه: خرج القلم عن مسار الحرف! يجب الاستمرار على مسار الخط دون انقطاع ✍️',
                  timestamp: Date.now()
                });
                if (isLessonStarted) {
                  audioService.speakArabic('خرج القلم عن مسار الحرف! التزم بالخط دون انقطاع');
                }
              } else {
                const pathScore = Math.min(100, Math.max(25, Math.round(((stats.corePoints * 1.0 + stats.grazingPoints * 0.45) / total) * 100)));

                if (pathScore < 45) {
                  audioService.playErrorSound();
                  setStepAlert({
                    type: 'error',
                    message: 'تنبيه: يجب الرسم فوق مسار خط الحرف بدقة ✍️',
                    timestamp: Date.now()
                  });
                  if (isLessonStarted) {
                    audioService.speakArabic('ارسم فوق مسار الحرف بدقة');
                  }
                } else {
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
                    if (isLessonStarted) {
                      const nextPrompt = getStepAudioPrompt(nextStep);
                      setTimeout(() => {
                        audioService.speakArabic(nextPrompt);
                      }, 400);
                    }
                  } else {
                    const startEndScore = 100;
                    const coverageScore = calculateCoverageScore();
                    const finalScore = Math.min(100, Math.max(30, Math.round(startEndScore * 0.20 + pathScore * 0.50 + coverageScore * 0.30)));

                    let feedback = '';
                    if (finalScore >= 88) feedback = 'ما شاء الله! جريان قلم متقن ومسار متميز 🌟';
                    else if (finalScore >= 72) feedback = 'جيد جداً! رسم دقيق مع استقرار في القلم 👍';
                    else feedback = 'محاولة طيبة! حاول ملء عرض الحرف والالتزام بالمسار أكثر ✍️';

                    setEvaluationModal({
                      isOpen: true,
                      totalScore: finalScore,
                      startEndScore,
                      pathScore,
                      coverageScore,
                      feedback
                    });

                    confetti({
                      particleCount: 90,
                      spread: 75,
                      origin: { y: 0.6 }
                    });
                    audioService.playSuccessFanfare();
                    if (isLessonStarted) {
                      audioService.speakArabic(`ممتاز جداً! حققت درجة ${finalScore} في المئة. ${feedback}`);
                    }
                    setStepAlert({
                      type: 'success',
                      message: `مبارك! أتممت كتابة الحرف بدرجة ${finalScore}% بنجاح 🎉`,
                      timestamp: Date.now()
                    });
                    if (onGoalAchieved) onGoalAchieved(finalScore);
                  }
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
      }
    }
  }, [virtualCursor, isAirDrawing, isARMode, dimensions, penType, penColor, penSize, calligraphyAngle, redrawCanvas, currentStepIndex, template, onGoalAchieved, checkPointOnPath, classifyPoint, calculateCoverageScore, isLessonStarted]);

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
      setEvaluationModal(null);
      setIsLessonStarted(false);
      strokeStartedAtGreenRef.current = false;
      resetStrokeStats();
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (onAccuracyUpdate) onAccuracyUpdate(0);
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
    recalculateAccuracy: () => calculateCoverageScore()
  }), [strokes, redoStack, dimensions, boardStyle, calculateCoverageScore, onAccuracyUpdate, template]);

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

      {/* Layer 3: Unified Single-Row Top Bar (الشريط الموحد المدمج على صف واحد) */}
      <div className="absolute top-2 sm:top-3 inset-x-2 sm:inset-x-4 z-30 pointer-events-none flex justify-center">
        <div className="pointer-events-auto flex items-center justify-between w-full max-w-5xl px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl text-white gap-2">
          
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

          {/* Center: In-Bar Smart Alert OR Step Guidance (رسائل الأخطاء الذكية أو رقم الخطوة والصوت) */}
          <div className="flex items-center justify-center flex-1 mx-1 sm:mx-2 overflow-hidden">
            {stepAlert ? (
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
                {/* Lesson Start Button: strictly ( ابدأ ) */}
                {!isLessonStarted && (
                  <button
                    type="button"
                    onClick={handleStartLesson}
                    className="px-2.5 sm:px-3.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-pulse"
                    title="بدء التمرين"
                  >
                    ( ابدأ )
                  </button>
                )}

                {/* Challenge Modes (hideImage or hideDots) or No-Steps Templates */}
                {(template.hideImage || template.hideDots || !template.steps || template.steps.length === 0) ? (
                  <>
                    {isLessonStarted ? (
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
                    ) : (
                      <span className="hidden sm:inline text-xs font-semibold text-amber-300/90 whitespace-nowrap">
                        {template.hideImage
                          ? '🧠 تحدي الذاكرة (سبورة بيضاء)'
                          : template.hideDots
                          ? '🎯 تحدي بدون مؤشرات'
                          : '✍️ انقر ( ابدأ ) للرسم'}
                      </span>
                    )}

                    {/* Reset Challenge Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentStepIndex(0);
                        setStepAlert(null);
                        setEvaluationModal(null);
                        setSubmitAnswerResult(null);
                        setShowGhostOverlay(false);
                        setIsLessonStarted(false);
                        strokeStartedAtGreenRef.current = false;
                        stepScoresRef.current = [];
                        resetStrokeStats();
                      }}
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
                        setIsLessonStarted(true);
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
                      onClick={() => {
                        setCurrentStepIndex(0);
                        setStepAlert(null);
                        setEvaluationModal(null);
                        setSubmitAnswerResult(null);
                        setShowGhostOverlay(false);
                        setIsLessonStarted(false);
                        strokeStartedAtGreenRef.current = false;
                        stepScoresRef.current = [];
                        resetStrokeStats();
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                      title="إعادة من الخطوة الأولى"
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

          {/* Left: Quick Action Controls (دليل الاستخدام وتكبير الشاشة) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Help Guide Button: hidden on mobile per user request */}
            {onOpenHelp && (
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
                className="p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 active:scale-95 transition-all cursor-pointer"
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

      {/* Layer 4: Calligraphy Evaluation Scorecard Modal (بطاقة تقييم رسم الحرف) */}
      {evaluationModal && evaluationModal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm sm:max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-white text-center max-h-[92vh] overflow-y-auto">
            
            {/* Close button */}
            <button
              onClick={() => {
                setEvaluationModal(prev => prev ? { ...prev, isOpen: false } : null);
                setIsLessonStarted(false);
              }}
              className="absolute top-4 left-4 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Badge Icon */}
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-lg">
              <Award className="w-8 h-8" />
            </div>

            <h3 className="text-lg sm:text-xl font-bold font-ruqaa text-amber-300 mb-1">
              {template?.hideImage ? 'بطاقة تقييم اختبار الذاكرة 🧠' : 'بطاقة تقييم كتابة الحرف'}
            </h3>
            
            {/* Final Big Score */}
            <div className="my-3">
              <span className="text-4xl sm:text-5xl font-extrabold font-mono text-white tracking-tight">
                {evaluationModal.totalScore}%
              </span>
              <p className="text-sm font-semibold text-amber-400 mt-1">
                {evaluationModal.feedback}
              </p>
            </div>

            {/* Criteria Progress Bars */}
            <div className="space-y-3 my-4 text-xs text-right bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/60">
              {/* Criterion 1 */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">
                    {template?.hideImage ? 'اتجاه البداية والنهاية المرسوم' : 'نقطتا البداية والنهاية (🟢 → 🔴)'}
                  </span>
                  <span className="font-bold text-emerald-400">{evaluationModal.startEndScore}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${evaluationModal.startEndScore}%` }}
                  />
                </div>
              </div>

              {/* Criterion 2 */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">
                    {template?.hideImage ? 'تطابق الشكل والنسب من الذاكرة' : 'دقة المسار (عدم الخروج عن الحرف)'}
                  </span>
                  <span className="font-bold text-amber-400">{evaluationModal.pathScore}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-400 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${evaluationModal.pathScore}%` }}
                  />
                </div>
              </div>

              {/* Criterion 3 */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">
                    {template?.hideImage ? 'تغطية معالم الحرف الأصلي' : 'تغطية سُمك الحرف (ملء عرض الخط)'}
                  </span>
                  <span className="font-bold text-sky-400">{evaluationModal.coverageScore}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-sky-400 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${evaluationModal.coverageScore}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Blind Memory Mode: Compare Ghost Overlay Toggle */}
            {template?.hideImage && (
              <button
                type="button"
                onClick={() => {
                  setShowGhostOverlay(true);
                  setEvaluationModal(prev => prev ? { ...prev, isOpen: false } : null);
                }}
                className="w-full mb-3 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>معاينة الظل الذهبي للحرف الأصلي على السبورة للمقارنة 👻</span>
              </button>
            )}

            {/* Save & Upload Answer to Google Drive & Sheet 'answers 1' */}
            <div className="mb-3">
              <button
                type="button"
                onClick={handleSubmitAnswer}
                disabled={isSubmittingAnswer || submitAnswerResult?.success}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                  submitAnswerResult?.success
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white active:scale-95 disabled:opacity-60'
                }`}
              >
                {isSubmittingAnswer ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارِ رفع الصورة وتسجيل الإجابة...</span>
                  </>
                ) : submitAnswerResult?.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>تم تسجيل الإجابة وحفظ الصورة بنجاح ✓</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>تسجيل الإجابة 💾</span>
                  </>
                )}
              </button>

              {submitAnswerResult && (
                <div
                  className={`mt-2 p-2.5 rounded-xl text-[11px] font-semibold flex flex-col gap-1 text-right ${
                    submitAnswerResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div>{submitAnswerResult.message}</div>
                  {submitAnswerResult.imageUrl && submitAnswerResult.imageUrl.startsWith('http') && (
                    <a
                      href={submitAnswerResult.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 underline w-fit"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>عرض صورة التمرين المحفوظة في Google Drive</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  setEvaluationModal(null);
                  setSubmitAnswerResult(null);
                  setShowGhostOverlay(false);
                  setIsLessonStarted(false);
                  setCurrentStepIndex(0);
                  setStepAlert(null);
                  stepScoresRef.current = [];
                  resetStrokeStats();
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx?.clearRect(0, 0, canvas.width, canvas.height);
                  }
                  setStrokes([]);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة التمرين</span>
              </button>

              {onNextRepetition && currentRepetition && template?.repeatCount && currentRepetition < template.repeatCount ? (
                <button
                  onClick={() => {
                    setEvaluationModal(null);
                    setSubmitAnswerResult(null);
                    setShowGhostOverlay(false);
                    setIsLessonStarted(false);
                    onNextRepetition();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg hover:brightness-110 transition-all cursor-pointer"
                >
                  <span>التكرار التالي ({currentRepetition + 1})</span>
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setEvaluationModal(null);
                    setSubmitAnswerResult(null);
                    setIsLessonStarted(false);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg hover:brightness-110 transition-all cursor-pointer"
                >
                  <span>متابعة</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
