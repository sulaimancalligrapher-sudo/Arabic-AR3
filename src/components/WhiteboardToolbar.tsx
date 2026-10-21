import React from 'react';
import { BoardStyle, PenType, GuideColor, DrawingTemplate, HandTrackingDisplayMode } from '../types/drawing';
import { CALLIGRAPHY_COLORS, GUIDE_COLORS } from '../data/drawingTemplates';
import {
  PenTool,
  Paintbrush,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Camera,
  Grid,
  Square,
  Sparkles,
  Volume2,
  FolderOpen,
  Hand,
  Crown,
  FlipHorizontal,
  RefreshCw,
  Video
} from 'lucide-react';

interface WhiteboardToolbarProps {
  boardStyle: BoardStyle;
  onSelectBoardStyle: (style: BoardStyle) => void;
  penType: PenType;
  onSelectPenType: (type: PenType) => void;
  penColor: string;
  onSelectPenColor: (color: string) => void;
  penSize: number;
  onChangePenSize: (size: number) => void;
  template: DrawingTemplate | null;
  templateOpacity: number;
  onChangeTemplateOpacity: (val: number) => void;
  guideColor: GuideColor;
  onSelectGuideColor: (color: GuideColor) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
  onOpenLibrary: () => void;
  onPronounce: () => void;
  accuracy: number;

  // AR Tracking & Camera Controls (Placed outside the whiteboard with the tools)
  trackingMode: HandTrackingDisplayMode;
  onSelectTrackingMode: (mode: HandTrackingDisplayMode) => void;
  showCrown: boolean;
  onToggleCrown: () => void;
  facingMode: 'user' | 'environment';
  onToggleFacingMode: () => void;
  isMirrored: boolean;
  onToggleMirror: () => void;
  arDetectionStatus?: {
    handsCount: number;
    isPinching: boolean;
    faceDetected: boolean;
    fps: number;
  };
}

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  boardStyle,
  onSelectBoardStyle,
  penType,
  onSelectPenType,
  penColor,
  onSelectPenColor,
  penSize,
  onChangePenSize,
  template,
  templateOpacity,
  onChangeTemplateOpacity,
  guideColor,
  onSelectGuideColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onExport,
  onOpenLibrary,
  onPronounce,
  accuracy,
  trackingMode,
  onSelectTrackingMode,
  showCrown,
  onToggleCrown,
  facingMode,
  onToggleFacingMode,
  isMirrored,
  onToggleMirror,
  arDetectionStatus,
}) => {
  return (
    <header className="w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 px-3 sm:px-6 py-2.5 z-40 transition-all select-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Right Section (Brand & Active Template) */}
        <div className="w-full md:w-auto flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
              <span className="font-ruqaa text-xl font-black">ض</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-ruqaa font-black text-sm sm:text-base text-amber-400">
                  السبورة التفاعلية والواقع المعزز
                </h1>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  AR 2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                رسم وخط عربي تفاعلي • جوال • تابلت • كمبيوتر
              </p>
            </div>
          </div>

          {/* Active Template pill & Library trigger */}
          <button
            onClick={onOpenLibrary}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-amber-300 font-semibold transition-all active:scale-95 shadow-sm"
          >
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <span className="max-w-[120px] sm:max-w-[180px] truncate">
              {template ? template.title : 'اختر نموذجاً للشف'}
            </span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
              تغيير
            </span>
          </button>
        </div>

        {/* Center Section: Board Styles & Pen Tools */}
        <div className="w-full md:w-auto flex flex-wrap items-center justify-center gap-2">
          
          {/* Board Background Selector */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => onSelectBoardStyle('white')}
              title="سبورة بيضاء نظيفة"
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                boardStyle === 'white' ? 'bg-slate-200 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">بيضاء</span>
            </button>
            <button
              onClick={() => onSelectBoardStyle('dark')}
              title="سبورة داكنة كلاسيكية"
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                boardStyle === 'dark' ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">داكنة</span>
            </button>
            <button
              onClick={() => onSelectBoardStyle('green')}
              title="سبورة خضراء مدرسية"
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                boardStyle === 'green' ? 'bg-emerald-800 text-emerald-200 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-emerald-500" />
              <span className="hidden sm:inline">خضراء</span>
            </button>
            <button
              onClick={() => onSelectBoardStyle('grid')}
              title="شبكة وميزان الخط العربي"
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                boardStyle === 'grid' ? 'bg-amber-100 text-amber-950 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ميزان الخط</span>
            </button>
            {/* AR Camera Mode */}
            <button
              onClick={() => onSelectBoardStyle(boardStyle === 'ar_camera' ? 'white' : 'ar_camera')}
              title="واقع معزز AR (كاميرا مع شفافية وتتبع اليد)"
              className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                boardStyle === 'ar_camera'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                  : 'text-amber-400 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>واقع معزز AR</span>
            </button>
          </div>

          {/* Pen Tool Selector */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => onSelectPenType('calligraphy')}
              title="قلم الخط العربي (مشطوف بزاوية 45°)"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                penType === 'calligraphy'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>قلم الخط</span>
            </button>
            <button
              onClick={() => onSelectPenType('marker')}
              title="قلم حبر مستدير ناعم"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                penType === 'marker'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>حبر ناعم</span>
            </button>
            <button
              onClick={() => onSelectPenType('brush')}
              title="فرشاة تلوين هوائية"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                penType === 'brush'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Paintbrush className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">فرشاة</span>
            </button>
            <button
              onClick={() => onSelectPenType('eraser')}
              title="ممحاة لتعديل الخطوط"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                penType === 'eraser'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ممحاة</span>
            </button>
          </div>

        </div>

        {/* Left Section: Action Buttons & Accuracy Score */}
        <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-2">
          {/* Real-time Accuracy Percentage */}
          {template && template.category !== 'freehand' && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-950/80 border border-slate-800 rounded-xl text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">التطابق:</span>
              <span className={`font-bold font-mono ${accuracy >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {accuracy}%
              </span>
            </div>
          )}

          {/* Voice Speaker */}
          {template?.arabicAudioText && (
            <button
              onClick={onPronounce}
              title="استمع لنطق الحرف أو الشكل"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-all active:scale-95 shadow-sm"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}

          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="تراجع (Ctrl+Z)"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="إعادة (Ctrl+Y)"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Clear Canvas */}
          <button
            onClick={onClear}
            title="مسح السبورة بالكامل"
            className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/50 hover:text-red-400 text-slate-400 border border-slate-700/60 transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Export / Download Image */}
          <button
            onClick={onExport}
            title="تنزيل اللوحة كصورة عالية الدقة PNG"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-400 text-slate-200 border border-slate-700 text-xs font-semibold transition-all active:scale-95 shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">حفظ</span>
          </button>
        </div>

      </div>

      {/* AR Tracking Controls Bar (Placed OUTSIDE the whiteboard with the tools) */}
      {boardStyle === 'ar_camera' && (
        <div className="max-w-7xl mx-auto mt-2.5 pt-2.5 border-t border-amber-500/30 flex flex-wrap items-center justify-between gap-2.5 text-xs bg-slate-950/60 px-3 py-2 rounded-2xl border">
          
          {/* Tracking Options: Finger / One Hand / Two Hands / Crown */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-amber-400 text-xs font-bold flex items-center gap-1.5 ml-1">
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>خيارات التتبع:</span>
            </span>

            {/* Mode 1: Finger Only */}
            <button
              onClick={() => onSelectTrackingMode('finger_only')}
              title="تتبع إصبع واحد (السبابة) للرسم الدقيق بالهواء"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                trackingMode === 'finger_only'
                  ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.5)] border border-emerald-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <span>☝️</span>
              <span>تتبع السبابة</span>
            </button>

            {/* Mode 2: One Hand Skeleton */}
            <button
              onClick={() => onSelectTrackingMode('one_hand')}
              title="هيكل يد واحدة كامل بـ 21 مفصل مع مؤشر التقاط ورسم"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                trackingMode === 'one_hand'
                  ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)] border border-blue-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>هيكل يد واحدة</span>
            </button>

            {/* Mode 3: Two Hands Skeleton */}
            <button
              onClick={() => onSelectTrackingMode('two_hands')}
              title="هيكل يدين معاً (اليمنى واليسرى) للألعاب والتفاعل الحركي"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                trackingMode === 'two_hands'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)] border border-purple-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <span>🖐️🖐️</span>
              <span>هيكل يدين اثنتين</span>
            </button>

            {/* Mode 4: Royal Crown Toggle */}
            <button
              onClick={onToggleCrown}
              title={showCrown ? 'إلغاء تاج الرأس الملكي' : 'تفعيل وضع التاج الملكي فوق رأس الطالب'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                showCrown
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.6)] border border-yellow-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-current" />
              <span>{showCrown ? 'التاج الملكي: مفعّل 👑' : 'التاج: معطّل'}</span>
            </button>
          </div>

          {/* Camera Controls & Status Badge */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Mirror Toggle */}
            <button
              onClick={onToggleMirror}
              title={isMirrored ? 'المرآة مفعلة (يمينك يمين) - اضغط للإلغاء' : 'المرآة معطلة - اضغط لتفعيل المرآة'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                isMirrored
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span>{isMirrored ? 'المرآة: مفعّلة' : 'المرآة: معطّلة'}</span>
            </button>

            {/* Facing Mode Toggle (Front / Back) */}
            <button
              onClick={onToggleFacingMode}
              title={facingMode === 'user' ? 'التبديل للكاميرا الخلفية (لتصوير الكراسة)' : 'التبديل لكاميرا السيلفي'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>{facingMode === 'user' ? 'الأمامية (سيلفي)' : 'الخلفية (كراسة)'}</span>
            </button>

            {/* Real-time Status Indicator Badge */}
            {arDetectionStatus && (
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-700 rounded-xl text-[11px] font-medium text-slate-200 shadow-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  arDetectionStatus.handsCount > 0
                    ? arDetectionStatus.isPinching
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                }`} />
                <span>
                  {arDetectionStatus.handsCount > 0
                    ? arDetectionStatus.isPinching
                      ? '✍️ يرسم الآن في الهواء'
                      : trackingMode === 'finger_only'
                      ? '☝️ السبابة جاهزة • قرّب الإبهام للرسم'
                      : trackingMode === 'two_hands' && arDetectionStatus.handsCount >= 2
                      ? '🖐️🖐️ تم اكتشاف اليدين معاً'
                      : '🖐️ هيكل اليد متصل ومطابق'
                    : 'ضع يدك أمام الكاميرا للبدء'}
                  {arDetectionStatus.faceDetected && showCrown && ' • 👑 التاج مثبت'}
                </span>
              </div>
            )}

          </div>

        </div>
      )}

      {/* Secondary Bar: Colors & Stroke Width Slider */}
      <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Calligraphy Ink Colors */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">ألوان الحبر:</span>
          {CALLIGRAPHY_COLORS.map(c => (
            <button
              key={c.hex}
              onClick={() => onSelectPenColor(c.hex)}
              title={c.name}
              className={`w-6 h-6 rounded-full transition-all shrink-0 cursor-pointer ${
                penColor === c.hex
                  ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 scale-110'
                  : 'hover:scale-105 opacity-85'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}

          {/* Custom color picker */}
          <label className="relative cursor-pointer p-0.5 rounded-full hover:scale-105 transition-transform shrink-0" title="اختيار لون مخصص">
            <input
              type="color"
              value={penColor}
              onChange={(e) => onSelectPenColor(e.target.value)}
              className="w-6 h-6 rounded-full overflow-hidden opacity-0 absolute inset-0 cursor-pointer"
            />
            <div
              className="w-6 h-6 rounded-full border border-slate-600 flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: penColor }}
            >
              +
            </div>
          </label>
        </div>

        {/* Controls: Pen Size Slider & Template Opacity */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Pen Size Slider */}
          <div className="flex items-center gap-2 bg-slate-950/50 px-3 py-1 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 text-[11px]">سُمك القلم:</span>
            <input
              type="range"
              min="4"
              max="48"
              value={penSize}
              onChange={(e) => onChangePenSize(Number(e.target.value))}
              className="w-20 sm:w-28 accent-amber-500 cursor-pointer"
            />
            <span className="w-5 text-center font-mono font-bold text-amber-400">
              {penSize}
            </span>
          </div>

          {/* Template Opacity Slider (When template is selected) */}
          {template && template.category !== 'freehand' && (
            <div className="flex items-center gap-2 bg-slate-950/50 px-3 py-1 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 text-[11px]">شفافية النموذج:</span>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={templateOpacity}
                onChange={(e) => onChangeTemplateOpacity(Number(e.target.value))}
                className="w-16 sm:w-24 accent-amber-500 cursor-pointer"
              />
              <span className="w-8 text-center font-mono font-bold text-amber-400">
                {Math.round(templateOpacity * 100)}%
              </span>
            </div>
          )}

          {/* Guide Line Color (When template is selected) */}
          {template && template.category !== 'freehand' && (
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-950/50 px-3 py-1 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 text-[11px]">لون الخط الدليلي:</span>
              {GUIDE_COLORS.map(g => (
                <button
                  key={g.id}
                  onClick={() => onSelectGuideColor(g.id)}
                  title={g.name}
                  className={`w-4 h-4 rounded-full transition-all cursor-pointer ${
                    guideColor === g.id
                      ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900 scale-125'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: g.hex }}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
