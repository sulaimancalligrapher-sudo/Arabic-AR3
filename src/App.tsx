import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BoardStyle, PenType, GuideColor, DrawingTemplate, HandTrackingDisplayMode } from './types/drawing';
import { DRAWING_TEMPLATES } from './data/drawingTemplates';
import { WhiteboardCanvas, WhiteboardCanvasRef } from './components/WhiteboardCanvas';
import { ARCameraOverlay } from './components/ARCameraOverlay';
import { WhiteboardToolbar } from './components/WhiteboardToolbar';
import { TemplateLibraryModal } from './components/TemplateLibraryModal';
import { LoginModal } from './components/LoginModal';
import { SettingsView } from './components/SettingsView';
import { sheetService, getArabicOrdinal, getStepAudioPrompt, RegistrantUser } from './services/sheetService';
import { audioService } from './services/audioService';
import {
  ARRewardTier,
  AR_INTRO_ID,
  getStoredARRewards,
  saveStoredARRewards,
  getStoredARIntroReward,
  saveStoredARIntroReward,
  findARRewardForScore,
  decodeARRewardsShareBundle
} from './services/arRewardsService';
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
  const appliedARFromShareUrlRef = useRef(false);

  // Dynamic Routing ('whiteboard' or 'settings')
  const [currentRoute, setCurrentRoute] = useState<'whiteboard' | 'settings'>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (new URLSearchParams(window.location.search).has('ar')) {
          return 'whiteboard';
        }
      } catch {}
      return window.location.hash === '#/settings' || window.location.hash === '#settings'
        ? 'settings'
        : 'whiteboard';
    }
    return 'whiteboard';
  });

  // Templates State (loaded from Google Sheets / LocalStorage / Default templates)
  const [allTemplates, setAllTemplates] = useState<DrawingTemplate[]>(() => sheetService.getLocalTemplates());
  const [selectedTemplate, setSelectedTemplate] = useState<DrawingTemplate | null>(null);

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

  // Background sync on load with default or stored Google Sheet URL + shared ?ar= config
  useEffect(() => {
    let appliedFromUrl = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const arToken = params.get('ar');
      if (arToken) {
        const decoded = decodeARRewardsShareBundle(arToken);
        if (decoded && (decoded.tiers.length > 0 || decoded.intro)) {
          if (decoded.tiers.length > 0) {
            setArRewards(decoded.tiers);
            saveStoredARRewards(decoded.tiers);
          }
          if (decoded.intro) {
            setArIntroReward(decoded.intro);
            saveStoredARIntroReward(decoded.intro);
          }
          appliedFromUrl = true;
          appliedARFromShareUrlRef.current = true;
          setCurrentRoute('whiteboard');
          try {
            window.history.replaceState(null, '', `${window.location.pathname}#/`);
          } catch {}
        }
      }
    } catch {}

    const url = sheetService.getStoredSheetUrl();
    if (url) {
      sheetService.fetchLessonsFromSheet().then((res) => {
        if (res.success && res.lessons.length > 0) {
          setAllTemplates(res.lessons);
        }
      }).catch(() => {});

      if (!appliedFromUrl) {
        sheetService.fetchARRewardsFromSheet().then((res) => {
          if (res.success) {
            if (res.rewards.length > 0) {
              setArRewards(res.rewards);
              saveStoredARRewards(res.rewards);
            }
            if (res.introReward) {
              setArIntroReward(res.introReward);
              saveStoredARIntroReward(res.introReward);
            }
          }
        }).catch(() => {});
      }
    }
  }, []);

  // Core Application States (Default: White Board, Smooth Marker, Royal Blue Ink, Angle 120°)
  const [boardStyle, setBoardStyle] = useState<BoardStyle>('white');
  const [penType, setPenType] = useState<PenType>('marker');
  const [penColor, setPenColor] = useState<string>('#2563eb');
  const [penSize, setPenSize] = useState<number>(18);
  const [calligraphyAngle, setCalligraphyAngle] = useState<number>(120);

  // Template State
  const [customTemplates, setCustomTemplates] = useState<DrawingTemplate[]>([]);
  const [templateOpacity, setTemplateOpacity] = useState<number>(0.35);
  const [guideColor, setGuideColor] = useState<GuideColor>('yellow');
  const [accuracy, setAccuracy] = useState<number>(0);

  // AR & Virtual Cursor States
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [crownCanvas, setCrownCanvas] = useState<HTMLCanvasElement | null>(null);
  const [virtualCursor, setVirtualCursor] = useState<{ x: number; y: number } | null>(null);
  const [isAirDrawing, setIsAirDrawing] = useState<boolean>(false);
  const [isAirPenLocked, setIsAirPenLocked] = useState<boolean>(false);
  const [saveArCameraPhoto, setSaveArCameraPhoto] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('arabic_calligraphy_save_ar_camera_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const handleToggleSaveArCameraPhoto = useCallback((val: boolean) => {
    setSaveArCameraPhoto(val);
    try {
      localStorage.setItem('arabic_calligraphy_save_ar_camera_v1', String(val));
    } catch {}
  }, []);

  // AR Tracking & Camera Options (controlled from outside the whiteboard with the tools)
  const [trackingMode, setTrackingMode] = useState<HandTrackingDisplayMode>('one_hand');
  const [arRewards, setArRewards] = useState<ARRewardTier[]>(() => getStoredARRewards());
  const [arIntroReward, setArIntroReward] = useState<ARRewardTier>(() => getStoredARIntroReward());
  const [showCrown, setShowCrown] = useState<boolean>(false); // Dynamically shows entrance image on AR start, then switches to score reward
  const [lastArScore, setLastArScore] = useState<number | null>(null);
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
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
  });
  const [showToolbarInLandscape, setShowToolbarInLandscape] = useState(false);
  const prevMobileLandscapeRef = useRef(isMobileLandscape);

  useEffect(() => {
    const checkLandscape = () => {
      const landscape = window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
      setIsMobileLandscape(landscape);

      if (landscape && !prevMobileLandscapeRef.current) {
        // Automatically collapse outer toolbar into full edge-to-edge canvas on phone rotation
        setShowToolbarInLandscape(false);
        // Attempt OS browser fullscreen immediately where browser permits, cleanly ignoring gesture restrictions
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        window.scrollTo?.(0, 1);
      } else if (!landscape && prevMobileLandscapeRef.current) {
        setShowToolbarInLandscape(false);
      }
      prevMobileLandscapeRef.current = landscape;
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    window.addEventListener('orientationchange', checkLandscape);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('resize', checkLandscape);
      window.removeEventListener('orientationchange', checkLandscape);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  const [historyCanUndo, setHistoryCanUndo] = useState(false);
  const [historyCanRedo, setHistoryCanRedo] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const [currentRepetition, setCurrentRepetition] = useState<number>(1);

  // User Session State (ID registrants)
  const [currentUser, setCurrentUser] = useState<RegistrantUser | null>(() => sheetService.getStoredUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => !sheetService.getStoredUser());

  const handleLoginSuccess = (user: RegistrantUser) => {
    setCurrentUser(user);
    sheetService.saveStoredUser(user);
    setIsLoginModalOpen(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sheetService.saveStoredUser(null);
    setIsLoginModalOpen(true);
    audioService.playChime(350, 0.1);
  };

  // Synchronize initial pen color when board changes to ensure contrast
  useEffect(() => {
    if (boardStyle === 'dark' || boardStyle === 'green' || boardStyle === 'ar_camera') {
      if (penColor === '#0f172a') {
        setPenColor('#f59e0b'); // Golden calligraphy ink on dark boards
      }
    } else if (boardStyle === 'white' || boardStyle === 'grid') {
      if (penColor === '#f59e0b') {
        setPenColor('#2563eb'); // Royal Blue ink on white/grid boards
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

  const handleToggleAirPenLock = useCallback(() => {
    setIsAirPenLocked(prev => !prev);
  }, []);

  // Handle Undo / Redo / Clear
  const handleUndo = () => {
    canvasRef.current?.undo();
    syncHistoryState();
    setTimeout(syncHistoryState, 0);
  };

  const handleRedo = () => {
    canvasRef.current?.redo();
    syncHistoryState();
    setTimeout(syncHistoryState, 0);
  };

  const handleUpdateARRewards = useCallback((updated: ARRewardTier[]): boolean => {
    appliedARFromShareUrlRef.current = false;
    setArRewards(updated);
    return saveStoredARRewards(updated);
  }, []);

  const handleUpdateARIntroReward = useCallback((updated: ARRewardTier): boolean => {
    appliedARFromShareUrlRef.current = false;
    setArIntroReward(updated);
    return saveStoredARIntroReward(updated);
  }, []);

  // Automatically enable entrance image & refresh Sheet rewards whenever entering AR mode
  useEffect(() => {
    if (boardStyle === 'ar_camera') {
      if (lastArScore === null) {
        setShowCrown(arIntroReward.enabled);
      }
      if (!appliedARFromShareUrlRef.current) {
        sheetService.fetchARRewardsFromSheet().then((res) => {
          if (res.success) {
            if (res.rewards.length > 0) {
              setArRewards(res.rewards);
              saveStoredARRewards(res.rewards);
            }
            if (res.introReward) {
              setArIntroReward(res.introReward);
              saveStoredARIntroReward(res.introReward);
              if (lastArScore === null) {
                setShowCrown(res.introReward.enabled);
              }
            }
          }
        }).catch(() => {});
      }
    }
  }, [boardStyle]);

  const handlePreviewARReward = useCallback((tier: ARRewardTier) => {
    if (tier.id === AR_INTRO_ID) {
      setLastArScore(null);
      setShowCrown(true);
      setBoardStyle('ar_camera');
      window.location.hash = '#/';
      return;
    }
    const low = Math.min(tier.minScore, tier.maxScore);
    const high = Math.max(tier.minScore, tier.maxScore);
    setLastArScore(Math.round((low + high) / 2));
    setShowCrown(true);
    setBoardStyle('ar_camera');
    window.location.hash = '#/';
  }, []);

  const activeReward = showCrown
    ? (lastArScore !== null
        ? findARRewardForScore(lastArScore, arRewards)
        : (arIntroReward.enabled ? arIntroReward : findARRewardForScore(null, arRewards)))
    : null;
  const activeRewardTitle = (activeReward || findARRewardForScore(null, arRewards))?.title;

  const handleClearSideEffects = useCallback(() => {
    setAccuracy(0);
    setCelebrationMessage(null);
    setLastArScore(null);
    setShowCrown(boardStyle === 'ar_camera' && arIntroReward.enabled);
    setCurrentRepetition(1);
    syncHistoryState();
    setTimeout(syncHistoryState, 0);
  }, [syncHistoryState, boardStyle, arIntroReward.enabled]);

  const handleClear = () => {
    canvasRef.current?.clearCanvas();
    handleClearSideEffects();
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
          const text = getStepAudioPrompt(s);
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

  // Head reward toggle handler
  const handleToggleCrown = () => {
    const next = !showCrown;
    if (next) {
      setLastArScore(null);
      const target = arIntroReward.enabled ? arIntroReward : findARRewardForScore(null, arRewards);
      audioService.speakArabic(target ? `تم تفعيل ${target.title}` : 'تم تثبيت صورة الرأس');
    }
    setShowCrown(next);
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

  // Fullscreen toggle (syncs native browser fullscreen cleanly & works in mobile landscape)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen()
          .then(() => setIsFullscreen(true))
          .catch(() => {
            if (isMobileLandscape) {
              setShowToolbarInLandscape(false);
            }
          });
      } else if (isMobileLandscape) {
        setShowToolbarInLandscape(prev => !prev);
      }
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  // Handle final goal achieved (switches off entrance image and shows score-matched AR reward if any)
  const handleGoalAchieved = (acc: number) => {
    if (boardStyle === 'ar_camera') {
      const matched = findARRewardForScore(acc, arRewards);
      setLastArScore(acc);
      if (matched) {
        setShowCrown(true);
        setCelebrationMessage(`${matched.title} — درجة الإتقان ${acc}%!`);
      } else {
        setShowCrown(false);
        setCelebrationMessage(null);
      }
    } else {
      setLastArScore(null);
      setShowCrown(false);
      if (acc >= 85) {
        setCelebrationMessage(`🌟 إبداع رائع! أتقنت كتابة الحرف بدرجة ${acc}%`);
      } else if (acc >= 70) {
        setCelebrationMessage(`👏 أحسنت! أتممت التمرين بنجاح بدرجة ${acc}%`);
      } else {
        setCelebrationMessage(null);
      }
    }
    setTimeout(() => {
      setCelebrationMessage(null);
    }, 7000);
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
        boardStyle={boardStyle}
        onSelectBoardStyle={(style) => setBoardStyle(style)}
        guideColor={guideColor}
        onSelectGuideColor={setGuideColor}
        templateOpacity={templateOpacity}
        onChangeTemplateOpacity={setTemplateOpacity}
        saveArCameraPhoto={saveArCameraPhoto}
        onToggleSaveArCameraPhoto={handleToggleSaveArCameraPhoto}
        arRewards={arRewards}
        onUpdateARRewards={handleUpdateARRewards}
        arIntroReward={arIntroReward}
        onUpdateARIntroReward={handleUpdateARIntroReward}
        onPreviewARReward={handlePreviewARReward}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 font-cairo">
      
      {/* Top Professional Toolbar (auto-hidden on mobile landscape for automatic edge-to-edge fullscreen, toggleable from inside canvas bar) */}
      {(!isMobileLandscape || showToolbarInLandscape) && (
        <WhiteboardToolbar
          boardStyle={boardStyle}
          onSelectBoardStyle={(style) => {
            setBoardStyle(style);
            if (style === 'ar_camera') {
              setLastArScore(null);
              setShowCrown(arIntroReward.enabled);
              audioService.speakArabic('تم تفعيل وضع الواقع المعزز AR');
            } else {
              setShowCrown(false);
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
          currentUser={currentUser}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onLogout={handleLogout}
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
          isAirPenLocked={isAirPenLocked}
          onToggleAirPenLock={handleToggleAirPenLock}
          activeRewardTitle={activeRewardTitle}
          isMobileLandscape={isMobileLandscape}
        />
      )}

      {/* Main Workspace / Stage */}
      <main className={`relative flex-1 min-h-0 w-full overflow-hidden flex flex-col items-center justify-center ${
        isMobileLandscape ? 'p-0' : 'p-1.5 sm:p-3'
      }`}>
        
        {/* Workspace Canvas Container */}
        <div className={`relative w-full h-full min-h-0 overflow-hidden shadow-2xl flex items-center justify-center ${
          isMobileLandscape ? 'max-w-none rounded-none' : 'max-w-6xl rounded-2xl'
        }`}>
          
          {/* Live AR Camera Feed with Full 21-Joint Skeleton & Reward Tracking */}
          <ARCameraOverlay
            isARMode={boardStyle === 'ar_camera'}
            trackingMode={trackingMode}
            showCrown={showCrown}
            activeReward={activeReward}
            facingMode={facingMode}
            isMirrored={isMirrored}
            onCursorUpdate={handleCursorUpdate}
            onVideoElementReady={setVideoElement}
            onCrownCanvasReady={setCrownCanvas}
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
            crownCanvas={crownCanvas}
            isMirrored={isMirrored}
            saveArCameraPhoto={saveArCameraPhoto}
            virtualCursor={virtualCursor}
            isAirDrawing={isAirDrawing}
            isAirPenLocked={isAirPenLocked}
            onToggleAirPenLock={handleToggleAirPenLock}
            currentRepetition={currentRepetition}
            isFullscreen={isFullscreen}
            isMobileLandscape={isMobileLandscape}
            isLandscapeToolbarOpen={showToolbarInLandscape}
            onToggleLandscapeToolbar={() => setShowToolbarInLandscape(prev => !prev)}
            onToggleFullscreen={toggleFullscreen}
            onOpenHelp={() => setIsHelpOpen(true)}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onClearSideEffects={handleClearSideEffects}
            onNextRepetition={() => {
              const totalReps = Number(selectedTemplate?.repeatCount) || 1;
              if (currentRepetition < totalReps) {
                setCurrentRepetition(prev => prev + 1);
              }
            }}
            onResetRepetition={() => setCurrentRepetition(1)}
            onAccuracyUpdate={(acc) => {
              setAccuracy(acc);
              syncHistoryState();
            }}
            onGoalAchieved={handleGoalAchieved}
            currentUser={currentUser}
            totalLessonsInTopic={allTemplates.filter(t => (t.topic || 'خط النسخ').trim() === (selectedTemplate?.topic || 'خط النسخ').trim()).length}
          />

          {/* Celebration Achievement Banner */}
          {celebrationMessage && (
            <div className="absolute top-16 inset-x-4 max-w-md mx-auto z-40 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-bold p-3 sm:p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-bounce">
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
          setLastArScore(null);
          setShowCrown(boardStyle === 'ar_camera' && arIntroReward.enabled);
          canvasRef.current?.clearCanvas();
          syncHistoryState();
        }}
        onAddCustomTemplate={(customTpl) => {
          setCustomTemplates(prev => [customTpl, ...prev]);
          setAllTemplates(prev => [customTpl, ...prev]);
          sheetService.saveLocalTemplates([customTpl, ...allTemplates]);
        }}
      />

      {/* Participant Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          if (currentUser) {
            setIsLoginModalOpen(false);
          }
        }}
        onLoginSuccess={handleLoginSuccess}
        canDismiss={!!currentUser}
      />

    </div>
  );
}
