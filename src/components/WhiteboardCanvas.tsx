import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { BoardStyle, PenType, Stroke, Point, DrawingTemplate, GuideColor, LessonStep } from '../types/drawing';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { getArabicOrdinal, getStepAudioPrompt } from '../services/sheetService';
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
  FolderOpen
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

  // Reset goal achieved state and step progression when template changes (no auto-speech)
  useEffect(() => {
    hasAchievedGoalRef.current = false;
    setCurrentStepIndex(0);
    setStepAlert(null);
    setEvaluationModal(null);
    setIsLessonStarted(false);
    strokeStartedAtGreenRef.current = false;
    resetStrokeStats();
    drawTemplateGuide();
  }, [template, resetStrokeStats]);

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

        // Extract pixel-level letter body mask for precise coverage and off-path detection
        const cell = 4;
        const gw = Math.ceil(tCanvas.width / cell);
        const gh = Math.ceil(tCanvas.height / cell);
        const grid = new Uint8Array(gw * gh);
        let totalCells = 0;
        const pts: { x: number; y: number }[] = [];

        try {
          const imgData = ctx.getImageData(0, 0, tCanvas.width, tCanvas.height);
          const data = imgData.data;

          for (let y = 0; y < tCanvas.height; y += cell) {
            const gy = Math.floor(y / cell);
            for (let x = 0; x < tCanvas.width; x += cell) {
              const idx = (y * tCanvas.width + x) * 4;
              if (data[idx + 3] > 30) {
                const gx = Math.floor(x / cell);
                grid[gy * gw + gx] = 1;
                totalCells++;
                pts.push({ x, y });
              }
            }
          }
        } catch (err) {
          console.warn('Guide point sampling error (CORS or empty):', err);
        }

        // 100% Reliable Fallback: If canvas was tainted or totalCells is 0, rasterize step corridors
        if (totalCells === 0 && template.steps && template.steps.length > 0) {
          totalCells = rasterizeStepCorridorsIntoGrid(grid, gw, gh, cell, template.steps, drawX, drawY, drawW, drawH, pts);
        }

        guidePointsRef.current = pts;
        letterGridRef.current = { grid, width: gw, height: gh, cell, totalCells };
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

        const cell = 4;
        const gw = Math.ceil(tCanvas.width / cell);
        const gh = Math.ceil(tCanvas.height / cell);
        const grid = new Uint8Array(gw * gh);
        let totalCells = 0;
        const pts: { x: number; y: number }[] = [];

        try {
          const imgData = ctx.getImageData(0, 0, tCanvas.width, tCanvas.height);
          const data = imgData.data;

          for (let y = 0; y < tCanvas.height; y += cell) {
            const gy = Math.floor(y / cell);
            for (let x = 0; x < tCanvas.width; x += cell) {
              const idx = (y * tCanvas.width + x) * 4;
              if (data[idx + 3] > 30) {
                const gx = Math.floor(x / cell);
                grid[gy * gw + gx] = 1;
                totalCells++;
                pts.push({ x, y });
              }
            }
          }
        } catch (err) {
          console.warn('Guide point sampling error:', err);
        }

        if (totalCells === 0 && template.steps && template.steps.length > 0) {
          totalCells = rasterizeStepCorridorsIntoGrid(grid, gw, gh, cell, template.steps, drawX, drawY, drawW, drawH, pts);
        }

        guidePointsRef.current = pts;
        letterGridRef.current = { grid, width: gw, height: gh, cell, totalCells };
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

  // Start exercise with voice unlock and pronunciation
  const handleStartLesson = async () => {
    await audioService.unlockAudio();
    setIsLessonStarted(true);
    setStepAlert(null);
    if (template?.steps && template.steps[currentStepIndex]) {
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

        // Break-away check: If consecutive points in empty space >= 8, mark break away and alert
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
            // Check stroke adherence to letter path!
            const stats = strokeStatsRef.current;
            const total = Math.max(1, stats.total);

            // User Test 2 condition: Did student break away into empty space and arc back?
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
              // Path accuracy score:
              // Core points inside thickness: 100% credit
              // Grazing points: 45% credit
              const pathScore = Math.min(100, Math.max(25, Math.round(((stats.corePoints * 1.0 + stats.grazingPoints * 0.45) / total) * 100)));

              if (pathScore < 45) {
                // Stroke drew mostly outside or off-center
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
                // Reached red dot AND followed path continuously!
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
                  // ALL STEPS COMPLETED! Generate comprehensive evaluation scorecard
                  const startEndScore = 100; // Both start and end points satisfied
                  const coverageScore = calculateCoverageScore();
                  // Combined grade: 20% Start/End + 50% Path Adherence + 30% Width Fill / Coverage
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
                  if (onGoalAchieved) {
                    onGoalAchieved(finalScore);
                  }
                }
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
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs sm:text-sm text-slate-100 whitespace-nowrap">
                  {template.title}
                </span>
                {template.repeatCount && template.repeatCount > 1 ? (
                  <span className="text-[11px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                    <Repeat className="w-3 h-3" />
                    <span>تكرار {currentRepetition || 1} / {template.repeatCount}</span>
                  </span>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
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
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold animate-in fade-in zoom-in-95 duration-150 truncate ${
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
            ) : template?.steps && template.steps.length > 0 ? (
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Desktop Sound Unlock & Lesson Start Button: strictly ( ابدأ ) without icons */}
                {!isLessonStarted && (
                  <button
                    type="button"
                    onClick={handleStartLesson}
                    className="px-3.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                    title="بدء التمرين وسماع التوجيه الصوتي"
                  >
                    ( ابدأ )
                  </button>
                )}

                {/* Step Number Only (مختصر بدون حشو) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold text-xs sm:text-sm whitespace-nowrap">
                    الخطوة {currentStepIndex + 1} من {template.steps.length}
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

                {/* Voice Guidance Button */}
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
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
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
                    setIsLessonStarted(false);
                    strokeStartedAtGreenRef.current = false;
                    resetStrokeStats();
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="إعادة من الخطوة الأولى"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-xs text-amber-300 hidden sm:inline">اختر درساً أولاً ثم انقر ( ابدأ ) لبدء الرسم</span>
            )}
          </div>

          {/* Left: Quick Action Controls (دليل الاستخدام وتكبير الشاشة) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenHelp && (
              <button
                type="button"
                onClick={onOpenHelp}
                title="دليل الاستخدام السريع"
                className="p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-slate-700/60 active:scale-95 transition-all cursor-pointer"
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

      {/* Layer 4: Calligraphy Evaluation Scorecard Modal (بطاقة تقييم رسم الحرف) */}
      {evaluationModal && evaluationModal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm sm:max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-white text-center">
            
            {/* Close button */}
            <button
              onClick={() => {
                setEvaluationModal(null);
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
              بطاقة تقييم كتابة الحرف
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
                  <span className="text-slate-300">نقطتا البداية والنهاية (🟢 → 🔴)</span>
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
                  <span className="text-slate-300">دقة المسار (عدم الخروج عن الحرف)</span>
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
                  <span className="text-slate-300">تغطية سُمك الحرف (ملء عرض الخط)</span>
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

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => {
                  setEvaluationModal(null);
                  setIsLessonStarted(false);
                  setCurrentStepIndex(0);
                  setStepAlert(null);
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
