import React, { useState, useEffect } from 'react';
import { DrawingTemplate, LessonDifficulty, LessonStep } from '../types/drawing';
import { sheetService, GOOGLE_APPS_SCRIPT_CODE } from '../services/sheetService';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl, extractDriveFileId } from '../utils/urlHelper';
import { StepMakerModal } from './StepMakerModal';
import {
  ArrowRight,
  Database,
  RefreshCw,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit3,
  FileSpreadsheet,
  Volume2,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Search,
  Sparkles,
  Save,
  Info,
  FolderOpen,
  Image as ImageIcon,
  Table,
  Repeat,
  Compass,
  Footprints
} from 'lucide-react';

interface SettingsViewProps {
  onBackToWhiteboard: () => void;
  templates: DrawingTemplate[];
  onUpdateTemplates: (newTemplates: DrawingTemplate[]) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBackToWhiteboard,
  templates,
  onUpdateTemplates,
}) => {
  // Tabs: 'lessons' (إدارة وتعديل), 'table' (ورقة الدروس), 'sheet' (ربط الشيت)
  const [activeTab, setActiveTab] = useState<'lessons' | 'table' | 'sheet'>('lessons');

  // Sheet connection states
  const [sheetUrl, setSheetUrl] = useState<string>(() => sheetService.getStoredSheetUrl());
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>(
    sheetService.getStoredSheetUrl() ? 'idle' : 'error'
  );
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Lesson Management: Topic & Category states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Add / Edit Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DrawingTemplate | null>(null);
  const [originalTitle, setOriginalTitle] = useState<string>('');

  // Step Maker Modal state
  const [stepMakerLesson, setStepMakerLesson] = useState<DrawingTemplate | null>(null);

  // Form Fields
  const [formTopic, setFormTopic] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formAudioText, setFormAudioText] = useState('');
  const [formRepeatCount, setFormRepeatCount] = useState<number>(1);
  const [formDifficulty, setFormDifficulty] = useState<LessonDifficulty>('سهل');
  const [formSteps, setFormSteps] = useState<LessonStep[]>([]);
  const [formStepsData, setFormStepsData] = useState<string>('');

  // Extract unique topics from templates
  const topics = Array.from(
    new Set(templates.map(t => (t.topic || 'خط النسخ (الأساسيات)').trim()))
  ).filter(Boolean);

  // Default selectedTopic to first available topic
  useEffect(() => {
    if (topics.length > 0 && (!selectedTopic || !topics.includes(selectedTopic))) {
      setSelectedTopic(topics[0]);
    }
  }, [topics, selectedTopic]);

  // Lessons belonging to the selected topic
  const currentTopicLessons = templates.filter(
    t => (t.topic || 'خط النسخ (الأساسيات)').trim() === selectedTopic
  );

  // Extract unique categories within the selected topic
  const categoriesInTopic = Array.from(
    new Set(currentTopicLessons.map(t => (t.category || 'حروف').trim()))
  ).filter(Boolean);

  // Default selectedCategory to first available category in topic
  useEffect(() => {
    if (categoriesInTopic.length > 0) {
      if (!selectedCategory || !categoriesInTopic.includes(selectedCategory)) {
        setSelectedCategory(categoriesInTopic[0]);
      }
    } else {
      setSelectedCategory('حروف');
    }
  }, [selectedTopic, categoriesInTopic, selectedCategory]);

  // All registered categories across the whole system
  const allKnownCategories = Array.from(
    new Set([
      'حروف',
      'كلمات',
      'رسمة',
      'أشكال وزخرفة',
      ...templates.map(t => (t.category || '').trim())
    ])
  ).filter(Boolean);

  // Initial connection test
  useEffect(() => {
    if (sheetUrl) {
      handleTestConnection();
    }
  }, []);

  // Copy Apps Script code
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setIsCopied(true);
      audioService.speakArabic('تم نسخ كود الهيكل الأفقي بنجاح');
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      alert('يرجى تحديد النص ونسخه يدوياً');
    }
  };

  // Test connection and sync from sheet
  const handleTestConnection = async () => {
    if (!sheetUrl.trim()) {
      setConnectionStatus('error');
      setStatusMessage('يرجى إدخال رابط تطبيق ويب Google Apps Script');
      return;
    }

    setIsConnecting(true);
    setStatusMessage('جاري الاتصال بـ Google Sheets...');
    sheetService.setStoredSheetUrl(sheetUrl);

    const result = await sheetService.fetchLessonsFromSheet();
    setIsConnecting(false);

    if (result.success) {
      setConnectionStatus('success');
      if (result.lessons.length > 0) {
        onUpdateTemplates(result.lessons);
        setStatusMessage(`تم الاتصال بنجاح! تم جلب ومزامنة ${result.lessons.length} درساً عبر الهيكل الأفقي.`);
        audioService.speakArabic('تمت مزامنة الدروس من جدول البيانات بنجاح');
      } else {
        setStatusMessage('تم الاتصال بنجاح! جدول البيانات متصل ولكنه فارغ حالياً.');
      }
    } else {
      setConnectionStatus('error');
      setStatusMessage(result.error || 'فشل الاتصال بالشيت.');
    }
  };

  // Bulk sync current in-memory lessons to sheet
  const handleSyncAllToSheet = async () => {
    if (!sheetUrl.trim()) {
      alert('يرجى إدخال رابط تطبيق الويب أولاً');
      return;
    }

    setIsConnecting(true);
    setStatusMessage('جاري رفع ومزامنة كافة الدروس إلى ورقة ArabicLessons...');

    const res = await sheetService.syncAllLessonsToSheet(templates);
    setIsConnecting(false);

    if (res.success) {
      setConnectionStatus('success');
      setStatusMessage(`تم حفظ وتحديث ${templates.length} درساً في الشيت أفقياً بنجاح!`);
      audioService.speakArabic('تم حفظ الدروس في جدول البيانات بنجاح');
    } else {
      setConnectionStatus('error');
      setStatusMessage(res.error || 'فشلت المزامنة');
    }
  };

  // Delete a lesson
  const handleDeleteLesson = async (lesson: DrawingTemplate) => {
    const confirm = window.confirm(`هل أنت متأكد من حذف الدرس "${lesson.title}"؟`);
    if (!confirm) return;

    const newTemplates = templates.filter(t => t.id !== lesson.id);
    onUpdateTemplates(newTemplates);
    sheetService.saveLocalTemplates(newTemplates);

    if (sheetUrl.trim()) {
      await sheetService.deleteLessonFromSheet(
        lesson.topic || 'خط النسخ',
        lesson.title,
        lesson.imageUrl
      );
    }
    audioService.speakArabic('تم حذف الدرس');
  };

  // Open modal for editing
  const handleOpenEdit = (tpl: DrawingTemplate) => {
    setEditingTemplate(tpl);
    setOriginalTitle(tpl.title);
    setFormTopic(tpl.topic || 'خط النسخ');
    setFormCategory(tpl.category || 'حروف');
    setFormImageUrl(tpl.imageUrl || '');
    setFormTitle(tpl.title);
    setFormAudioText(tpl.arabicAudioText || tpl.title);
    setFormRepeatCount(Number(tpl.repeatCount) || 1);
    setFormDifficulty(tpl.difficulty || 'سهل');
    setFormSteps(tpl.steps || []);
    setFormStepsData(tpl.stepsData || (tpl.steps ? JSON.stringify(tpl.steps) : ''));
    setIsAddModalOpen(true);
  };

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setOriginalTitle('');
    setFormTopic(selectedTopic || 'خط النسخ');
    setFormCategory(selectedCategory || 'حروف');
    setFormImageUrl('');
    setFormTitle('');
    setFormAudioText('');
    setFormRepeatCount(1);
    setFormDifficulty('سهل');
    setFormSteps([]);
    setFormStepsData('');
    setIsAddModalOpen(true);
  };

  // Save lesson (Add or Edit)
  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTopic.trim()) {
      alert('يرجى تحديد أو إدخال الموضوع');
      return;
    }
    if (!formCategory.trim()) {
      alert('يرجى تحديد أو إدخال الفئة');
      return;
    }
    if (!formTitle.trim()) {
      alert('يرجى إدخال عنوان الصورة / اسم الدرس');
      return;
    }

    const directImg = formatDirectImageUrl(formImageUrl.trim());

    const lessonData: DrawingTemplate = {
      id: editingTemplate ? editingTemplate.id : `lesson_${Date.now()}`,
      topic: formTopic.trim(),
      category: formCategory.trim(),
      imageUrl: directImg || formImageUrl.trim(),
      title: formTitle.trim(),
      arabicAudioText: formAudioText.trim() || formTitle.trim(),
      repeatCount: Number(formRepeatCount) || 1,
      difficulty: formDifficulty,
      svgData: editingTemplate?.svgData || '',
      steps: formSteps,
      stepsData: formStepsData || (formSteps.length > 0 ? JSON.stringify(formSteps) : '')
    };

    let updatedList: DrawingTemplate[];
    if (editingTemplate) {
      updatedList = templates.map(t => t.id === editingTemplate.id ? lessonData : t);
    } else {
      updatedList = [lessonData, ...templates];
    }

    onUpdateTemplates(updatedList);
    sheetService.saveLocalTemplates(updatedList);

    setSelectedTopic(lessonData.topic || formTopic.trim());
    setSelectedCategory(lessonData.category || formCategory.trim());

    setIsAddModalOpen(false);

    if (sheetUrl.trim()) {
      setIsConnecting(true);
      await sheetService.saveLessonToSheet(lessonData, originalTitle);
      setIsConnecting(false);
    }

    audioService.speakArabic('تم حفظ الدرس بنجاح');
  };

  // Save updated steps from StepMakerModal
  const handleSaveStepsFromModal = async (updatedLesson: DrawingTemplate) => {
    // If the Add/Edit form is currently open, sync steps directly to form state
    if (isAddModalOpen) {
      setFormSteps(updatedLesson.steps || []);
      setFormStepsData(updatedLesson.stepsData || (updatedLesson.steps ? JSON.stringify(updatedLesson.steps) : ''));
    }

    const updatedList = templates.map(t => t.id === updatedLesson.id ? updatedLesson : t);
    onUpdateTemplates(updatedList);
    sheetService.saveLocalTemplates(updatedList);

    if (sheetUrl.trim()) {
      setIsConnecting(true);
      await sheetService.saveLessonToSheet(updatedLesson, updatedLesson.title);
      setIsConnecting(false);
    }
  };

  // Filter lessons for current topic and category
  const displayedLessons = currentTopicLessons
    .filter(t => (t.category || 'حروف').trim() === selectedCategory)
    .filter(t => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.arabicAudioText && t.arabicAudioText.toLowerCase().includes(q))
      );
    });

  const previewDirectUrl = formatDirectImageUrl(formImageUrl);
  const detectedDriveId = extractDriveFileId(formImageUrl);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-cairo flex flex-col">
      {/* Top Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-bold text-xl shadow-lg shadow-amber-500/20">
            ض
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>لوحة إعدادات الدروس وقاعدة البيانات</span>
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                لوحة المعلم
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              إدارة دروس الخط العربي، صانع خطوات الحرف، واستعراض ورقة الدروس السحابية
            </p>
          </div>
        </div>

        {/* Back to Whiteboard */}
        <button
          onClick={onBackToWhiteboard}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <span>العودة إلى السبورة</span>
          <ArrowRight className="w-4 h-4 rotate-180" />
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">

        {/* 3 Tabs Bar: 1. إدارة وتعديل / 2. ورقة الدروس / 3. ربط الشيت */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setActiveTab('lessons')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'lessons'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>إدارة وتعديل الدروس ({templates.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'table'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>ورقة الدروس (جدول الشيت)</span>
            </button>

            <button
              onClick={() => setActiveTab('sheet')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'sheet'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ربط Google Sheets</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">
              الرابط السريع: <code className="text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">#/settings</code>
            </span>
          </div>
        </div>

        {/* ======================= TAB 1: LESSONS MANAGEMENT (LIST VIEW) ======================= */}
        {activeTab === 'lessons' && (
          <div className="space-y-6">

            {/* TOPIC SELECTOR & TOOLBAR */}
            <div className="p-4 sm:p-5 bg-slate-900 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Topic Dropdown */}
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs sm:text-sm shrink-0">
                    <FolderOpen className="w-4 h-4" />
                    <span>الموضوع:</span>
                  </div>
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full max-w-xs px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-bold text-xs sm:text-sm focus:outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    {topics.map(top => (
                      <option key={top} value={top}>{top}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={isConnecting || !sheetUrl.trim()}
                    title="مزامنة من الشيت"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">مزامنة من الشيت</span>
                  </button>

                  <button
                    onClick={handleOpenAdd}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة درس جديد</span>
                  </button>
                </div>
              </div>

              {/* Category Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <span className="text-xs text-slate-400 shrink-0 font-medium ml-1">الفئات:</span>
                  {categoriesInTopic.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className="mr-1.5 text-[10px] opacity-75">
                        ({currentTopicLessons.filter(l => (l.category || 'حروف').trim() === cat).length})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="بحث في دروس هذه الفئة..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* LESSONS LIST VIEW (With Crisp White Thumbnail Background for Black Calligraphy) */}
            <div className="flex flex-col gap-3">
              {displayedLessons.map((tpl) => {
                const directUrl = formatDirectImageUrl(tpl.imageUrl);
                const stepsCount = tpl.steps?.length || 0;

                return (
                  <div
                    key={tpl.id}
                    className="group p-3 sm:p-4 bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
                  >
                    {/* Right side: Thumbnail on CRISP WHITE BACKGROUND + Info (RTL) */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* White Background Thumbnail Box for Black Calligraphy Artwork */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl border border-slate-300 shadow-inner flex items-center justify-center p-2 shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
                        {directUrl ? (
                          <img
                            src={directUrl}
                            alt={tpl.title}
                            className="max-h-full max-w-full object-contain filter drop-shadow"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : tpl.svgData ? (
                          <div
                            className="w-full h-full flex items-center justify-center text-slate-950 [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{ __html: tpl.svgData }}
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        )}
                      </div>

                      {/* Title & Badges */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm sm:text-base text-slate-100 group-hover:text-amber-400 transition-colors">
                            {tpl.title}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 font-bold border border-slate-700">
                            {tpl.difficulty || 'سهل'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700 flex items-center gap-1">
                            <Repeat className="w-2.5 h-2.5" />
                            <span>تكرار: {tpl.repeatCount || 1}</span>
                          </span>
                          {/* Steps badge */}
                          {stepsCount > 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1">
                              <Footprints className="w-2.5 h-2.5" />
                              <span>{stepsCount} خطوات مرقمة</span>
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60">
                              بدون خطوات محددة
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 mt-1 truncate">
                          {tpl.arabicAudioText || 'النطق مطابق للعنوان'}
                        </p>
                      </div>
                    </div>

                    {/* Left side: Step Maker Button + Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* 1. Step Maker Studio Button (صانع خطوات الحرف) */}
                      <button
                        onClick={() => setStepMakerLesson(tpl)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer active:scale-95"
                        title="تحديد خطوات كتابة الحرف ونقاط الانطلاق وسهام الاتجاه"
                      >
                        <Footprints className="w-3.5 h-3.5" />
                        <span>صانع الخطوات ({stepsCount})</span>
                      </button>

                      {/* 2. Audio Speak */}
                      <button
                        onClick={() => audioService.speakArabic(tpl.arabicAudioText || tpl.title)}
                        title="سماع النطق الصوتي"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 cursor-pointer transition-colors"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>

                      {/* 3. Edit */}
                      <button
                        onClick={() => handleOpenEdit(tpl)}
                        title="تعديل بيانات الدرس"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {/* 4. Delete */}
                      <button
                        onClick={() => handleDeleteLesson(tpl)}
                        title="حذف الدرس"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 hover:text-white text-rose-400 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {displayedLessons.length === 0 && (
              <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800 space-y-3">
                <BookOpen className="w-8 h-8 mx-auto text-slate-500" />
                <p className="text-sm font-bold text-slate-300">
                  لا توجد دروس مسجلة في الفئة &quot;{selectedCategory}&quot; ضمن موضوع &quot;{selectedTopic}&quot;
                </p>
                <p className="text-xs text-slate-500">
                  اضغط على زر &quot;إضافة درس جديد&quot; بالأعلى لبدء تسجيل أول درس.
                </p>
              </div>
            )}

          </div>
        )}

        {/* ======================= TAB 2: SHEET LESSONS TABLE VIEW (ورقة الدروس) ======================= */}
        {activeTab === 'table' && (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-amber-400 flex items-center gap-2">
                  <Table className="w-5 h-5" />
                  <span>جدول ورقة الدروس المسجلة في Google Sheets</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  عرض شامل لكافة الدروس عبر ورقة ArabicLessons الأفقية ({templates.length} درس مسجل)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isConnecting || !sheetUrl.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                  <span>تحديث الجدول</span>
                </button>

                <button
                  onClick={handleSyncAllToSheet}
                  disabled={isConnecting || !sheetUrl.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ ومزامنة الشيت</span>
                </button>
              </div>
            </div>

            {/* Responsive Table */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-300 font-bold">
                    <tr>
                      <th className="p-3.5">#</th>
                      <th className="p-3.5">الموضوع (A)</th>
                      <th className="p-3.5">الفئة (B)</th>
                      <th className="p-3.5">الصورة (C)</th>
                      <th className="p-3.5">عنوان الدرس (D)</th>
                      <th className="p-3.5">نص القراءة الآلية (E)</th>
                      <th className="p-3.5">التكرار (F)</th>
                      <th className="p-3.5">المستوى (G)</th>
                      <th className="p-3.5">خطوات الحرف</th>
                      <th className="p-3.5 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {templates.map((l, idx) => {
                      const directUrl = formatDirectImageUrl(l.imageUrl);
                      const stepsCount = l.steps?.length || 0;
                      return (
                        <tr key={l.id || idx} className="hover:bg-slate-850/60 transition-colors">
                          <td className="p-3.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3.5 font-bold text-amber-400">{l.topic || 'خط النسخ'}</td>
                          <td className="p-3.5 text-slate-200">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px]">
                              {l.category || 'حروف'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {/* Crisp White Thumbnail in Table */}
                            <div className="w-12 h-12 bg-white rounded-xl border border-slate-300 shadow-inner flex items-center justify-center p-1 overflow-hidden">
                              {directUrl ? (
                                <img
                                  src={directUrl}
                                  alt={l.title}
                                  className="max-h-full max-w-full object-contain filter drop-shadow"
                                  crossOrigin="anonymous"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 font-bold text-slate-100">{l.title}</td>
                          <td className="p-3.5 text-slate-400 max-w-[180px] truncate">
                            {l.arabicAudioText || l.title}
                          </td>
                          <td className="p-3.5 font-mono text-amber-400">{l.repeatCount || 1}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-[10px]">
                              {l.difficulty || 'سهل'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <button
                              onClick={() => setStepMakerLesson(l)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[11px] font-bold cursor-pointer"
                            >
                              <Footprints className="w-3 h-3" />
                              <span>{stepsCount > 0 ? `${stepsCount} خطوات` : 'إضافة خطوات'}</span>
                            </button>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(l)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 cursor-pointer"
                                title="تعديل"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLesson(l)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500 hover:text-white text-rose-400 cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB 3: GOOGLE SHEETS SETUP ======================= */}
        {activeTab === 'sheet' && (
          <div className="space-y-6">

            {/* Connection Card */}
            <div className="p-5 sm:p-6 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5 text-amber-400 font-bold">
                  <Database className="w-5 h-5" />
                  <span className="text-base font-ruqaa">ربط ورقة ArabicLessons الأفقية</span>
                </div>

                <div className="flex items-center gap-2">
                  {connectionStatus === 'success' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      متصل بالشيت
                    </span>
                  )}
                  {connectionStatus === 'error' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <AlertCircle className="w-3.5 h-3.5" />
                      غير متصل
                    </span>
                  )}
                  {connectionStatus === 'idle' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                      جاهز للاختبار
                    </span>
                  )}
                </div>
              </div>

              {/* URL Input Form */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  رابط تطبيق الويب المباشر (Google Apps Script Web App URL):
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-hidden focus:border-amber-500 transition-colors"
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={isConnecting}
                    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
                    <span>{isConnecting ? 'جاري الفحص...' : 'فحص ومزامنة'}</span>
                  </button>
                </div>
                {statusMessage && (
                  <p className={`text-xs mt-1.5 ${connectionStatus === 'success' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {statusMessage}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={handleSyncAllToSheet}
                  disabled={isConnecting || !sheetUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  <span>رفع وتحديث كافة الدروس الحالية ({templates.length}) في الشيت أفقياً</span>
                </button>
              </div>
            </div>

            {/* Apps Script Guide */}
            <div className="p-5 sm:p-6 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-sm sm:text-base">
                  <Info className="w-4 h-4 text-amber-400" />
                  <span>كود ورقة ArabicLessons الأفقية (Google Apps Script)</span>
                </div>

                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'تم النسخ!' : 'نسخ الكود الخلفي'}</span>
                </button>
              </div>

              {/* Steps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">١. العامود A: الموضوع:</strong>
                  كل صف في الورقة يمثل موضوعاً رئيسياً (مثل: خط النسخ، خط الرقعة).
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">٢. ٧ أعمدة لكل درس أفقياً:</strong>
                  الدرس 1 (B:H)، الدرس 2 (I:O)، الدرس 3 (P:V)... (الفئة، رابط الصورة، عنوان الدرس، نص القراءة، التكرار، المستوى، خطوات الحرف).
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">٣. لصق الكود وحفظه:</strong>
                  في Apps Script، امسح الكود القديم والصق هذا الكود المحدث بالكامل واحفظه (Ctrl + S).
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">٤. النشر كتطبيق ويب (Web app):</strong>
                  نشر جديد &gt; تطبيق ويب &gt; التنفيذ كـ: أنا (Me) &gt; الصلاحية: أي شخص (Anyone) &gt; ثم انسخ الرابط.
                </div>
              </div>

              {/* Code Box */}
              <div className="mt-4">
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 scrollbar-thin">
                  <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
                </pre>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ======================= ADD / EDIT MODAL ======================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
            <h2 className="text-base sm:text-lg font-bold text-amber-400 pb-3 border-b border-slate-800 flex items-center gap-2">
              <Edit3 className="w-5 h-5" />
              <span>{editingTemplate ? 'تعديل بيانات الدرس' : 'إضافة درس خط عربي جديد'}</span>
            </h2>

            <form onSubmit={handleSaveLesson} className="space-y-4 mt-4 text-xs sm:text-sm">
              
              {/* 1. Topic input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ١. الموضوع (العامود A) *:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                    placeholder="مثال: خط النسخ، خط الرقعة، أساسيات الخط"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                  />
                  {topics.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) setFormTopic(e.target.value);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs cursor-pointer shrink-0"
                    >
                      <option value="">اختيار مسجل...</option>
                      {topics.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* 2. Category input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ٢. الفئة (العامود B) *:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="مثال: حروف، كلمات، رسمة، أشكال"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setFormCategory(e.target.value);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs cursor-pointer shrink-0"
                  >
                    <option value="">اختيار مسجل...</option>
                    {allKnownCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Image URL */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ٣. رابط الصورة (من Google Drive أو رابط مباشر) (العامود C):
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-hidden focus:border-amber-500"
                />

                {/* Live Preview with Crisp White Background */}
                {formImageUrl.trim() && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-4">
                    <div className="w-20 h-20 bg-white rounded-xl border border-slate-300 shadow-inner flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                      {previewDirectUrl ? (
                        <img
                          src={previewDirectUrl}
                          alt="معاينة"
                          crossOrigin="anonymous"
                          className="max-h-full max-w-full object-contain filter drop-shadow"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="text-amber-400 font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>معاينة الصورة المباشرة</span>
                      </div>
                      {detectedDriveId && (
                        <p className="text-[10px] text-slate-400 font-mono">
                          معرف درايف: {detectedDriveId}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-300">
                        تظهر الصورة بخلفية بيضاء نقية لرؤية الخطوط السوداء بوضوح تام.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Lesson Title */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ٤. عنوان الصورة / اسم الدرس (العامود D) *:
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="مثال: حرف الألف، كلمة السلام، رسمة نخلة"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                />
              </div>

              {/* 5. TTS Text */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ٥. نص للقراءة الآلية (العامود E):
                </label>
                <input
                  type="text"
                  value={formAudioText}
                  onChange={(e) => setFormAudioText(e.target.value)}
                  placeholder="اتركه فارغاً ليقوم النظام بنطق عنوان الصورة تلقائياً"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                />
              </div>

              {/* 6 & 7: Repeat Count & Difficulty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    ٦. عدد التكرار (العامود F) *:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formRepeatCount}
                    onChange={(e) => setFormRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">الافتراضي: 1 تكرار</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    ٧. مستوى الدرس (العامود G) *:
                  </label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    <option value="سهل">سهل</option>
                    <option value="متوسط">متوسط</option>
                    <option value="متقدم">متقدم</option>
                    <option value="صعب">صعب</option>
                  </select>
                </div>
              </div>

              {/* 8. Dedicated Step Maker Section inside Add/Edit Modal */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                      <Footprints className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-200">
                        ٨. خطوات رسم الحرف (Step Maker) (العامود H):
                      </label>
                      <p className="text-[10px] text-slate-400">
                        تحديد نقطة الانطلاق (🟢) والانتهاء (🔴) ورقم الخطوة لكل جزء في الحرف.
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      formSteps.length > 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {formSteps.length > 0 ? `${formSteps.length} خطوة مسجلة` : 'بدون خطوات'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!formImageUrl.trim() && !editingTemplate?.svgData) {
                        alert('يرجى إدخال رابط الصورة أولاً لتتمكن من وضع خطوات الرسم عليها');
                        return;
                      }
                      const draftLesson: DrawingTemplate = {
                        id: editingTemplate ? editingTemplate.id : `draft_${Date.now()}`,
                        title: formTitle.trim() || 'معاينة الدرس',
                        imageUrl: previewDirectUrl || formImageUrl.trim(),
                        topic: formTopic.trim() || 'خط النسخ',
                        category: formCategory.trim() || 'حروف',
                        repeatCount: formRepeatCount,
                        difficulty: formDifficulty,
                        svgData: editingTemplate?.svgData || '',
                        steps: formSteps,
                        stepsData: formStepsData || (formSteps.length > 0 ? JSON.stringify(formSteps) : '')
                      };
                      setStepMakerLesson(draftLesson);
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{formSteps.length > 0 ? 'تعديل خطوات رسم الحرف' : 'فتح صانع الخطوات على الصورة'}</span>
                  </button>

                  {formSteps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('هل تريد مسح جميع الخطوات المحددة لهذا الدرس؟')) {
                          setFormSteps([]);
                          setFormStepsData('');
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                    >
                      مسح الخطوات
                    </button>
                  )}
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md cursor-pointer transition-all active:scale-95"
                >
                  حفظ في النظام والشيت
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ======================= STEP MAKER STUDIO MODAL ======================= */}
      {stepMakerLesson && (
        <StepMakerModal
          isOpen={Boolean(stepMakerLesson)}
          onClose={() => setStepMakerLesson(null)}
          lesson={stepMakerLesson}
          onSaveSteps={handleSaveStepsFromModal}
        />
      )}

    </div>
  );
};
