import React, { useState } from 'react';
import { BoardStyle, PenType, HandTrackingDisplayMode } from '../types/drawing';
import { CALLIGRAPHY_COLORS } from '../data/drawingTemplates';
import {
  PenTool,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Camera,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Hand,
  Crown
} from 'lucide-react';

interface MobileQuickBarProps {
  boardStyle: BoardStyle;
  onToggleAR: () => void;
  penType: PenType;
  onSelectPenType: (type: PenType) => void;
  penColor: string;
  onSelectPenColor: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onOpenLibrary: () => void;

  // AR quick toggles
  trackingMode?: HandTrackingDisplayMode;
  onSelectTrackingMode?: (mode: HandTrackingDisplayMode) => void;
  showCrown?: boolean;
  onToggleCrown?: () => void;
}

export const MobileQuickBar: React.FC<MobileQuickBarProps> = ({
  boardStyle,
  onToggleAR,
  penType,
  onSelectPenType,
  penColor,
  onSelectPenColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onOpenLibrary,
  trackingMode = 'one_hand',
  onSelectTrackingMode,
  showCrown = true,
  onToggleCrown,
}) => {
  const [isColorDrawerOpen, setIsColorDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Cycle tracking modes: finger_only -> one_hand -> two_hands -> finger_only
  const cycleTrackingMode = () => {
    if (!onSelectTrackingMode) return;
    if (trackingMode === 'finger_only') onSelectTrackingMode('one_hand');
    else if (trackingMode === 'one_hand') onSelectTrackingMode('two_hands');
    else onSelectTrackingMode('finger_only');
  };

  return (
    <div className="md:hidden fixed bottom-3 left-3 right-3 z-40 flex flex-col items-center pointer-events-none transition-all">
      
      {/* Expand/Collapse Handle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="pointer-events-auto mb-1.5 px-3 py-0.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 text-[10px] flex items-center gap-1 shadow-lg cursor-pointer"
      >
        <span>{isCollapsed ? 'إظهار الأدوات' : 'إخفاء شريط الأدوات'}</span>
        {isCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {!isCollapsed && (
        <div className="w-full flex flex-col gap-2 pointer-events-auto">
          
          {/* Color palette popup */}
          {isColorDrawerOpen && (
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 p-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-1.5 overflow-x-auto animate-in slide-in-from-bottom-2 duration-150">
              {CALLIGRAPHY_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => {
                    onSelectPenColor(c.hex);
                    setIsColorDrawerOpen(false);
                  }}
                  className={`w-7 h-7 rounded-full shrink-0 transition-transform cursor-pointer ${
                    penColor === c.hex ? 'ring-2 ring-amber-400 scale-110' : 'opacity-85'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}

          {/* Main Quick Action Bar */}
          <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-2 rounded-2xl shadow-2xl flex items-center justify-between gap-1">
            
            {/* Library */}
            <button
              onClick={onOpenLibrary}
              title="مكتبة النماذج"
              className="p-2 rounded-xl bg-slate-800 text-amber-400 active:scale-95 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
            </button>

            {/* AR Toggle */}
            <button
              onClick={onToggleAR}
              title="كاميرا الواقع المعزز AR"
              className={`p-2 rounded-xl active:scale-95 transition-all cursor-pointer ${
                boardStyle === 'ar_camera'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'bg-slate-800 text-amber-400'
              }`}
            >
              <Camera className="w-4 h-4" />
            </button>

            {/* AR-specific Quick Toggles (Finger/Hand/TwoHands & Crown) */}
            {boardStyle === 'ar_camera' && (
              <>
                <button
                  onClick={cycleTrackingMode}
                  title="تبديل وضع التتبع: إصبع / يد / يدين"
                  className={`p-1.5 px-2 rounded-xl active:scale-95 transition-all text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                    trackingMode === 'finger_only'
                      ? 'bg-emerald-600 text-white'
                      : trackingMode === 'one_hand'
                      ? 'bg-blue-600 text-white'
                      : 'bg-purple-600 text-white'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>
                    {trackingMode === 'finger_only' ? 'إصبع' : trackingMode === 'one_hand' ? 'يد' : 'يدين'}
                  </span>
                </button>

                <button
                  onClick={onToggleCrown}
                  title="تشغيل / إيقاف التاج الملكي"
                  className={`p-2 rounded-xl active:scale-95 transition-all cursor-pointer ${
                    showCrown ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Crown className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Pen Tool Toggle */}
            <button
              onClick={() => onSelectPenType('calligraphy')}
              className={`p-2 rounded-xl active:scale-95 transition-all cursor-pointer ${
                penType === 'calligraphy' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'
              }`}
            >
              <PenTool className="w-4 h-4" />
            </button>

            {/* Eraser */}
            <button
              onClick={() => onSelectPenType('eraser')}
              className={`p-2 rounded-xl active:scale-95 transition-all cursor-pointer ${
                penType === 'eraser' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'
              }`}
            >
              <Eraser className="w-4 h-4" />
            </button>

            {/* Color Palette Picker Button */}
            <button
              onClick={() => setIsColorDrawerOpen(!isColorDrawerOpen)}
              className="p-2 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center relative active:scale-95 cursor-pointer"
            >
              <div
                className="w-4 h-4 rounded-full border border-white/50"
                style={{ backgroundColor: penColor }}
              />
            </button>

            {/* Undo */}
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-2 rounded-xl bg-slate-800 text-slate-200 disabled:opacity-30 active:scale-95 cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            {/* Clear */}
            <button
              onClick={onClear}
              className="p-2 rounded-xl bg-slate-800 text-red-400 active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>

          </div>
        </div>
      )}
    </div>
  );
};
