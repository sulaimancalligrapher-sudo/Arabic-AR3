import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BoardStyle, PenType, GuideColor, DrawingTemplate, HandTrackingDisplayMode } from './types/drawing';
import { DRAWING_TEMPLATES } from './data/drawingTemplates';
import { WhiteboardCanvas, WhiteboardCanvasRef } from './components/WhiteboardCanvas';
import { ARCameraOverlay } from './components/ARCameraOverlay';
import { WhiteboardToolbar } from './components/WhiteboardToolbar';
import { TemplateLibraryModal } from './components/TemplateLibraryModal';
import { SettingsView } from './components/SettingsView';
import { sheetService, getArabicOrdinal } from './services/sheetService';
import { audioService } from './services/audioService';
import {
  Camera,
  Award,
  HelpCircle,
  X,
  Maximize2,
  Minimize2,
  Lightbulb,
  Repeat
} from 'lucide-react';

export default function App() {
  const canvasRef = useRef<WhiteboardCanvasRef>(null);

  // Dynamic Routing ('whiteboard' or 'settings')
  const [currentRoute, setCurrentRoute] = useState<'whiteboard' | 'settings'>(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash === '#/settings' || window.location.hash === '#settings'
        ? 'settings'
        : 'whiteboard';
    }
    return 'whiteboard';
  });

  // Templates State (loaded from Google Sheets / LocalStorage / Default templates)
  const [allTemplates, setAllTemplates] = useState<DrawingTemplate[]>(() => sheetService.getLocalTemplates());
  const [selectedTemplate, setSelectedTemplate] = useState<DrawingTemplate | null>(() => {
    const initialList = sheetService.getLocalTemplates();
    return initialList.length > 0 ? initialList[0] : DRAWING_TEMPLATES[0];
  });

  // Listen to hash changes (e.g. #/settings or browser back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#/settings' || hash === '#settings') {
        setCurrentRoute('settings');
      } else {
        setCurrentRoute('whiteboard');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Background sync on load with default or stored Google Sheet URL
  useEffect(() => {
    const url = sheetService.getStoredSheetUrl();
    if (url) {
      sheetService.fetchLessonsFromSheet().then((res) => {
        if (res.success && res.lessons.length > 0) {
          setAllTemplates(res.lessons);
          setSelectedTemplate(prev => {
            if (!prev || prev.id.startsWith('letter_alif')) {
              return res.lessons[0];
            }
            const found = res.lessons.find(l => l.id === prev.id);
            return found || res.lessons[0];
          });
        }
      }).catch(() => {});
    }
  }, []);

  // Core Application States
  const [boardStyle, setBoardStyle] = useState<BoardStyle>('grid');
  const [penType, setPenType] = useState<PenType>('calligraphy');
  const [penColor, setPenColor] = useState<string>('#0f172a');
  const [penSize, setPenSize] = useState<number>(18);
  const [calligraphyAngle, setCalligraphyAngle] = useState<number>(45);

  // Template State
  const [customTemplates, setCustomTemplates] = useState<DrawingTemplate[]>([]);
  const [templateOpacity, setTemplateOpacity] = useState<number>(0.35);
  const [guideColor, setGuideColor] = useState<GuideColor>('yellow');
  const [accuracy, setAccuracy] = useState<number>(0);

  // AR & Virtual Cursor States
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [virtualCursor, setVirtualCursor] = useState<{ x: number; y: number } | null>(null);
  const [isAirDrawing, setIsAirDrawing] = useState<boolean>(false);

  // AR Tracking & Camera Options (controlled from outside the whiteboard with the tools)
  const [trackingMode, setTrackingMode] = useState<HandTrackingDisplayMode>('one_hand');
  const [showCrown, setShowCrown] = useState<boolean>(false); // Crown appears as reward upon mastery!
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [arDetectionStatus, setArDetectionStatus] = useState<{
    handsCount: number;
    isPinching: boolean;
    faceDetected: boolean;
    fps: number;
  }>({ handsCount: 0, isPinching: false, faceDetected: false, fps: 0 });

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [historyCanUndo, setHistoryCanUndo] = useState(false);
  const [historyCanRedo, setHistoryCanRedo] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const [currentRepetition, setCurrentRepetition] = useState<number>(1);

  // Synchronize initial pen color when board changes to ensure contrast
  useEffect(() => {
    if (boardStyle === 'dark' || boardStyle === 'green' || boardStyle === 'ar_camera') {
      if (penColor === '#0f172a') {
        setPenColor('#f59e0b'); // Golden calligraphy ink on dark boards
      }
    } else if (boardStyle === 'white' || boardStyle === 'grid') {
      if (penColor === '#f59e0b') {
        setPenColor('#0f172a'); // Black ink on white/grid boards
      }
    }
  }, [boardStyle]);

  // Update undo/redo availability from canvas ref
  const syncHistoryState = useCallback(() => {
    if (canvasRef.current) {
      setHistoryCanUndo(canvasRef.current.canUndo);
      setHistoryCanRedo(canvasRef.current.canRedo);
    }
  }, []);

  // Keyboard Shortcuts Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if focus is on an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          canvasRef.current?.redo();
        } else {
          canvasRef.current?.undo();
        }
        syncHistoryState();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        canvasRef.current?.redo();
        syncHistoryState();
      } else if (e.key.toLowerCase() === 'b') {
        setPenType('calligraphy');
      } else if (e.key.toLowerCase() === 'e') {
        setPenType('eraser');
      } else if (e.key.toLowerCase() === 'c') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [syncHistoryState]);

  // Handle AR Cursor from Camera Overlay
  const handleCursorUpdate = useCallback((cursor: { x: number; y: number } | null, isPinching: boolean) => {
    setVirtualCursor(cursor);
    setIsAirDrawing(isPinching);
  }, []);

  // Handle Undo / Redo / Clear
  const handleUndo = () => {
    canvasRef.current?.undo();
    syncHistoryState();
  };

  const handleRedo = () => {
    canvasRef.current?.redo();
    syncHistoryState();
  };

  const handleClear = () => {
    canvasRef.current?.clearCanvas();
    setAccuracy(0);
    setCelebrationMessage(null);
    setShowCrown(false);
    syncHistoryState();
  };

  // Export drawing as PNG image
  const handleExport = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.exportImage(true);
    const link = document.createElement('a');
    link.download = `لوحة_خط_عربي_${selectedTemplate?.title || 'رسمة'}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    audioService.speakArabic('تم حفظ لوحتك بنجاح!');
  };

  // Pronounce template name and sequential steps instructions
  const handlePronounce = () => {
    if (!selectedTemplate) return;
    const mainTitle = selectedTemplate.arabicAudioText || selectedTemplate.title;
    audioService.speakArabic(mainTitle);

    if (selectedTemplate.steps && selectedTemplate.steps.length > 0) {
      const stepsList = selectedTemplate.steps;
      let idx = 0;
      const playNextStep = () => {
        if (idx < stepsList.length) {
          const s = stepsList[idx];
          const text = (s.audioHint && s.audioHint.trim()) ? s.audioHint.trim() : getArabicOrdinal(s.stepNumber);
          audioService.speakArabic(text);
          idx++;
          setTimeout(playNextStep, 2400);
        }
      };
      setTimeout(playNextStep, 1600);
    }
  };

  // Tracking Mode selection handler with spoken confirmation
  const handleSelectTrackingMode = (mode: HandTrackingDisplayMode) => {
    setTrackingMode(mode);
    if (mode === 'finger_only') {
      audioService.speakArabic('تتبع إصبع السبابة');
    } else if (mode === 'one_hand') {
      audioService.speakArabic('تتبع هيكل اليد');
    } else if (mode === 'two_hands') {
      audioService.speakArabic('تتبع هيكل اليدين معاً');
    }
  };

  // Crown toggle handler
  const handleToggleCrown = () => {
    const next = !showCrown;
    setShowCrown(next);
    if (next) {
      audioService.speakArabic('تم تثبيت التاج الملكي');
    }
  };

  // Camera facing mode toggle (user front / environment rear)
  const handleToggleFacingMode = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    const nextMirrored = next === 'user';
    setIsMirrored(nextMirrored);
  };

  // Mirror toggle handler
  const handleToggleMirror = () => {
    setIsMirrored(prev => !prev);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Handle goal achieved (accuracy goal passed)
  const handleGoalAchieved = (acc: number) => {
    const totalReps = Number(selectedTemplate?.repeatCount) || 1;
    if (currentRepetition < totalReps) {
      setCelebrationMessage(`أحسنت! أنهيت التكرار ${currentRepetition} من ${totalReps} 🌟 تابع للتكرار التالي!`);
      audioService.speakArabic(`رائع! أنهيت التكرار ${currentRepetition}، واصل للمرة التالية`);
      setTimeout(() => {
        setCurrentRepetition(prev => prev + 1);
        canvasRef.current?.clearCanvas();
        setCelebrationMessage(null);
      }, 3000);
    } else {
      setShowCrown(true); // 👑 Crown reward granted upon mastery!
      setCelebrationMessage(`👑 ما شاء الله! حققت إتقان ${acc}% وتوجت بتاج الخطاط الملكي! 🌟`);
      audioService.playSuccessFanfare();
      audioService.speakArabic('مبارك عليك! أتقنت رسم الحرف وتُوجت بجائزة التاج الملكي!');
      setTimeout(() => {
        setCelebrationMessage(null);
      }, 8000);
    }
  };

  // If in Settings route, display Settings Studio View completely isolated from the whiteboard
  if (currentRoute === 'settings') {
    return (
      <SettingsView
        onBackToWhiteboard={() => {
          window.location.hash = '#/';
        }}
        templates={allTemplates}
        onUpdateTemplates={(updated) => {
          setAllTemplates(updated);
          sheetService.saveLocalTemplates(updated);
          if (selectedTemplate && !updated.find(t => t.id === selectedTemplate.id)) {
            setSelectedTemplate(updated[0] || null);
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-cairo">
      
      {/* Top Professional Toolbar (Includes the 4 Tracking Options outside the whiteboard) */}
      <WhiteboardToolbar
        boardStyle={boardStyle}
        onSelectBoardStyle={(style) => {
          setBoardStyle(style);
          if (style === 'ar_camera') {
            audioService.speakArabic('تم تفعيل وضع الواقع المعزز AR');
          }
        }}
        penType={penType}
        onSelectPenType={setPenType}
        penColor={penColor}
        onSelectPenColor={setPenColor}
        penSize={penSize}
        onChangePenSize={setPenSize}
        calligraphyAngle={calligraphyAngle}
        onChangeCalligraphyAngle={setCalligraphyAngle}
        template={selectedTemplate}
        templateOpacity={templateOpacity}
        onChangeTemplateOpacity={setTemplateOpacity}
        guideColor={guideColor}
        onSelectGuideColor={setGuideColor}
        canUndo={historyCanUndo}
        canRedo={historyCanRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onExport={handleExport}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenSettings={() => {
          window.location.hash = '#/settings';
        }}
        onPronounce={handlePronounce}
        accuracy={accuracy}
        trackingMode={trackingMode}
        onSelectTrackingMode={handleSelectTrackingMode}
        showCrown={showCrown}
        onToggleCrown={handleToggleCrown}
        facingMode={facingMode}
        onToggleFacingMode={handleToggleFacingMode}
        isMirrored={isMirrored}
        onToggleMirror={handleToggleMirror}
        arDetectionStatus={arDetectionStatus}
      />

      {/* Main Workspace / Stage */}
      <main className="relative flex-1 w-full h-full p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center">
        
        {/* Workspace Canvas Container */}
        <div className="relative w-full h-full max-w-6xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
          
          {/* Live AR Camera Feed with Full 21-Joint Skeleton & Crown Tracking */}
          <ARCameraOverlay
            isARMode={boardStyle === 'ar_camera'}
            trackingMode={trackingMode}
            showCrown={showCrown}
            facingMode={facingMode}
            isMirrored={isMirrored}
            onCursorUpdate={handleCursorUpdate}
            onVideoElementReady={setVideoElement}
            onDetectionUpdate={setArDetectionStatus}
          />

          {/* Interactive Whiteboard Canvas */}
          <WhiteboardCanvas
            ref={canvasRef}
            boardStyle={boardStyle}
            penType={penType}
            penColor={penColor}
            penSize={penSize}
            calligraphyAngle={calligraphyAngle}
            template={selectedTemplate}
            templateOpacity={templateOpacity}
            guideColor={guideColor}
            isARMode={boardStyle === 'ar_camera'}
            videoElement={videoElement}
            virtualCursor={virtualCursor}
            isAirDrawing={isAirDrawing}
            onAccuracyUpdate={(acc) => {
              setAccuracy(acc);
              syncHistoryState();
            }}
            onGoalAchieved={handleGoalAchieved}
          />

          {/* Celebration Achievement Banner */}
          {celebrationMessage && (
            <div className="absolute top-4 inset-x-4 max-w-md mx-auto z-40 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-bold p-3 sm:p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-bounce">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-950 text-amber-400 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <span className="text-sm font-ruqaa text-base">{celebrationMessage}</span>
              </div>
              <button
                onClick={() => setCelebrationMessage(null)}
                className="p-1 rounded-lg hover:bg-slate-950/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick Floating Screen Action Buttons (Fullscreen, Help) */}
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
            <button
              onClick={() => setIsHelpOpen(!isHelpOpen)}
              title="دليل الاستخدام السريع"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/70 backdrop-blur-md shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'تصغير الشاشة' : 'تكبير الشاشة ملء العرض'}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/70 backdrop-blur-md shadow-md active:scale-95 transition-all cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Active Lesson Topic & Repetition Badge */}
          {selectedTemplate && (
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
              {boardStyle === 'ar_camera' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-lg animate-pulse">
                  <Camera className="w-3.5 h-3.5" />
                  <span>AR</span>
                </div>
              )}
              <div className="px-3 py-1 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/80 shadow-md flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-100">{selectedTemplate.title}</span>
                <span className="h-3 w-px bg-slate-700" />
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <Repeat className="w-3 h-3" />
                  <span>{currentRepetition} / {selectedTemplate.repeatCount || 1}</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-bold border border-slate-700">
                  {selectedTemplate.difficulty || 'سهل'}
                </span>
              </div>
            </div>
          )}

          {/* Calligraphy Nib Preview (Bottom Right of Canvas) */}
          {penType === 'calligraphy' && (
            <div className="hidden sm:flex absolute bottom-3 right-3 z-20 items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/80 backdrop-blur-md text-[11px] text-slate-300 pointer-events-none">
              <span>شطفة قلم القصبة:</span>
              <div
                className="w-4 h-1.5 rounded-[1px] shadow-sm transition-transform"
                style={{ backgroundColor: penColor, transform: `rotate(-${calligraphyAngle}deg)` }}
              />
              <span className="font-mono text-amber-400">{calligraphyAngle}°</span>
            </div>
          )}

        </div>

        {/* Quick Instructions & Help Modal */}
        {isHelpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Lightbulb className="w-5 h-5" />
                  <span className="text-base font-ruqaa">دليل السبورة والواقع المعزز AR</span>
                </div>
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ١
                  </span>
                  <div>
                    <strong className="text-white">السبورة التفاعلية:</strong> استخدم إصبعك أو قلم الشاشة أو الماوس للرسم. يمكنك التحكم بزاوية وسُمك القلم والألوان من زر أدوات الرسم.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ٢
                  </span>
                  <div>
                    <strong className="text-white">خيارات التتبع المجمعة:</strong> عند تشغيل الواقع المعزز AR، اضغط زر خيارات التتبع للتبديل بين تتبع السبابة ☝️، أو هيكل يد واحدة 🖐️، أو هيكل يدين 🖐️🖐️، وتفعيل التاج الملكي 👑.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ٣
                  </span>
                  <div>
                    <strong className="text-white">الرسم الدقيق في الهواء:</strong> تطابق نقطة الرسم طرف إصبع السبابة تماماً. عند تقريب الإبهام والسبابة (Pinch) يبدأ القلم بالرسم من طرف إصبعك مباشرة.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ٤
                  </span>
                  <div>
                    <strong className="text-white">رفع نماذج مخصصة:</strong> من خلال أيقونة النماذج، يمكنك اختيار أي حرف عربي أو رفع أي صورة من جهازك لتحويلها لنموذج شفاف قابل للشف والتلوين.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsHelpOpen(false)}
                className="mt-6 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                فهمت، لنبدأ الرسم!
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Template Library Modal */}
      <TemplateLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        selectedTemplate={selectedTemplate}
        templates={allTemplates}
        onSelectTemplate={(tpl) => {
          setSelectedTemplate(tpl);
          setCurrentRepetition(1);
          setCelebrationMessage(null);
          setShowCrown(false);
          canvasRef.current?.clearCanvas();
          syncHistoryState();
        }}
        onAddCustomTemplate={(customTpl) => {
          setCustomTemplates(prev => [customTpl, ...prev]);
          setAllTemplates(prev => [customTpl, ...prev]);
          sheetService.saveLocalTemplates([customTpl, ...allTemplates]);
        }}
      />

    </div>
  );
}
