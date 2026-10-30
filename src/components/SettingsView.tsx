import React, { useState, useEffect } from 'react';
import { DrawingTemplate, DrawingCategory } from '../types/drawing';
import { sheetService, GOOGLE_APPS_SCRIPT_CODE } from '../services/sheetService';
import { audioService } from '../services/audioService';
import {
  ArrowRight,
  Database,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
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
  Upload,
  Info
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
  // Tabs
  const [activeTab, setActiveTab] = useState<'sheet' | 'lessons'>('sheet');

  // Sheet connection states
  const [sheetUrl, setSheetUrl] = useState<string>(() => sheetService.getStoredSheetUrl());
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>(
    sheetService.getStoredSheetUrl() ? 'idle' : 'error'
  );
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Lessons management states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DrawingCategory | 'all'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DrawingTemplate | null>(null);

  // Form states for adding / editing
  const [formTitle, setFormTitle] = useState('');
  const [formTitleEn, setFormTitleEn] = useState('');
  const [formCategory, setFormCategory] = useState<DrawingCategory>('letters');
  const [formDescription, setFormDescription] = useState('');
  const [formAudioText, setFormAudioText] = useState('');
  const [formDifficulty, setFormDifficulty] = useState<'easy' | 'normal' | 'advanced'>('easy');
  const [formTargetAccuracy, setFormTargetAccuracy] = useState<number>(75);
  const [formSvgData, setFormSvgData] = useState('');

  // Initial connection check if URL is present
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
      audioService.speakArabic('تم نسخ الكود بنجاح');
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
        setStatusMessage(`تم الاتصال بنجاح! تم جلب ومزامنة ${result.lessons.length} درساً من ورقة الشيت.`);
        audioService.speakArabic('تم الاتصال بجدول البيانات بنجاح ومزامنة الدروس');
      } else {
        setStatusMessage('تم الاتصال بنجاح! جدول البيانات متصل ولكنه فارغ حالياً. يمكنك تهيئته بالضغط على زر "تهيئة الحروف التلقائية".');
      }
    } else {
      setConnectionStatus('error');
      setStatusMessage(result.error || 'فشل الاتصال بالشيت. يرجى التأكد من نشر تطبيق الويب واختيار حق الوصول: أي شخص (Anyone)');
    }
  };

  // Initialize Sheet with default 28 letters
  const handleSeedDefaultsToSheet = async () => {
    if (!sheetUrl.trim()) {
      alert('يرجى إدخال رابط تطبيق الويب أولاً');
      return;
    }
    const confirm = window.confirm('هل تريد رفع وتهيئة الحروف العربية الـ 28 التلقائية في جدول بيانات Google Sheets؟');
    if (!confirm) return;

    setIsConnecting(true);
    setStatusMessage('جاري تهيئة وحفظ الحروف العربية في جدول الشيت...');

    const res = await sheetService.initializeSheetWithDefaults();
    setIsConnecting(false);

    if (res.success) {
      setConnectionStatus('success');
      setStatusMessage(`تمت تهيئة الشيت وحفظ ${res.count || templates.length} درساً بنجاح!`);
      audioService.speakArabic('تم حفظ وتهيئة الحروف في جدول البيانات');
      // Refresh
      const refresh = await sheetService.fetchLessonsFromSheet();
      if (refresh.success && refresh.lessons.length > 0) {
        onUpdateTemplates(refresh.lessons);
      }
    } else {
      setConnectionStatus('error');
      setStatusMessage(res.error || 'حدث خطأ أثناء التهيئة');
    }
  };

  // Bulk sync current in-memory lessons to sheet
  const handleSyncAllToSheet = async () => {
    if (!sheetUrl.trim()) {
      alert('يرجى ضبط رابط الشيت أولاً');
      return;
    }

    setIsConnecting(true);
    setStatusMessage('جاري رفع ومزامنة كل الدروس إلى الشيت...');

    const res = await sheetService.syncAllLessonsToSheet(templates);
    setIsConnecting(false);

    if (res.success) {
      setConnectionStatus('success');
      setStatusMessage(`تم حفظ وتحديث ${templates.length} درساً في الشيت بنجاح!`);
      audioService.speakArabic('تم حفظ التعديلات في جدول البيانات بنجاح');
    } else {
      setConnectionStatus('error');
      setStatusMessage(res.error || 'فشلت المزامنة');
    }
  };

  // Delete a lesson
  const handleDeleteLesson = async (id: string, title: string) => {
    const confirm = window.confirm(`هل أنت متأكد من حذف الدرس "${title}"؟`);
    if (!confirm) return;

    const newTemplates = templates.filter(t => t.id !== id);
    onUpdateTemplates(newTemplates);
    sheetService.saveLocalTemplates(newTemplates);

    if (sheetUrl.trim()) {
      await sheetService.deleteLessonFromSheet(id);
    }
    audioService.speakArabic('تم حذف الدرس');
  };

  // Open modal for editing
  const handleOpenEdit = (tpl: DrawingTemplate) => {
    setEditingTemplate(tpl);
    setFormTitle(tpl.title);
    setFormTitleEn(tpl.titleEn || '');
    setFormCategory(tpl.category);
    setFormDescription(tpl.description || '');
    setFormAudioText(tpl.arabicAudioText || tpl.title);
    setFormDifficulty(tpl.difficulty || 'easy');
    setFormTargetAccuracy(tpl.targetAccuracy || 75);
    setFormSvgData(tpl.svgData || '');
    setIsAddModalOpen(true);
  };

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setFormTitle('');
    setFormTitleEn('');
    setFormCategory('letters');
    setFormDescription('');
    setFormAudioText('');
    setFormDifficulty('easy');
    setFormTargetAccuracy(75);
    setFormSvgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <path d="M 150 250 L 350 250" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
</svg>`);
    setIsAddModalOpen(true);
  };

  // Save lesson (Add or Edit)
  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('يرجى إدخال عنوان الدرس');
      return;
    }

    const lessonData: DrawingTemplate = {
      id: editingTemplate ? editingTemplate.id : `lesson_${Date.now()}`,
      title: formTitle.trim(),
      titleEn: formTitleEn.trim(),
      category: formCategory,
      description: formDescription.trim(),
      arabicAudioText: formAudioText.trim() || formTitle.trim(),
      difficulty: formDifficulty,
      targetAccuracy: formTargetAccuracy,
      svgData: formSvgData.trim(),
      isCustom: formCategory === 'custom',
      tags: [formCategory, formDifficulty]
    };

    let updatedList: DrawingTemplate[];
    if (editingTemplate) {
      updatedList = templates.map(t => t.id === editingTemplate.id ? lessonData : t);
    } else {
      updatedList = [lessonData, ...templates];
    }

    onUpdateTemplates(updatedList);
    sheetService.saveLocalTemplates(updatedList);
    setIsAddModalOpen(false);

    // Sync with Sheet if connected
    if (sheetUrl.trim()) {
      setIsConnecting(true);
      await sheetService.saveLessonToSheet(lessonData);
      setIsConnecting(false);
    }

    audioService.speakArabic('تم حفظ الدرس بنجاح');
  };

  // Filter templates for management view
  const filteredTemplates = templates.filter(tpl => {
    const matchCategory = categoryFilter === 'all' || tpl.category === categoryFilter;
    const matchSearch =
      tpl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tpl.description && tpl.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-cairo flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-bold text-xl shadow-lg shadow-amber-500/20">
            ض
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>استوديو الإعدادات والربط السحابي</span>
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                لوحة المعلم والخطاط
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              إدارة دروس الخط العربي والربط المباشر مع جداول بيانات Google Sheets
            </p>
          </div>
        </div>

        {/* Action: Return to Whiteboard */}
        <button
          onClick={onBackToWhiteboard}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <span>العودة إلى السبورة التفاعلية</span>
          <ArrowRight className="w-4 h-4 rotate-180" />
        </button>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">

        {/* Tabs Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('sheet')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'sheet'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ربط Google Sheets وتطبيق الويب</span>
            </button>

            <button
              onClick={() => setActiveTab('lessons')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'lessons'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>إدارة وتعديل الدروس والرسومات ({templates.length})</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">
              رابط القسم: <code className="text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">#/settings</code>
            </span>
          </div>
        </div>

        {/* ======================= TAB 1: GOOGLE SHEETS SETUP ======================= */}
        {activeTab === 'sheet' && (
          <div className="space-y-6">

            {/* Connection Card */}
            <div className="p-5 sm:p-6 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5 text-amber-400 font-bold">
                  <Database className="w-5 h-5" />
                  <span className="text-base font-ruqaa">ربط جدول البيانات عبر Google Apps Script</span>
                </div>

                {/* Status Indicator */}
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

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={handleSeedDefaultsToSheet}
                  disabled={isConnecting || !sheetUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/20 font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تهيئة وحفظ الحروف الـ 28 التلقائية في الشيت</span>
                </button>

                <button
                  onClick={handleSyncAllToSheet}
                  disabled={isConnecting || !sheetUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  <span>رفع وتحديث كافة الدروس الحالية ({templates.length}) في الشيت</span>
                </button>
              </div>
            </div>

            {/* Step-by-Step Instructions & Backend Code Box */}
            <div className="p-5 sm:p-6 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-sm sm:text-base">
                  <Info className="w-4 h-4 text-amber-400" />
                  <span>خطوات إعداد الكود الخلفي في Google Sheets (في دقيقة واحدة)</span>
                </div>

                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'تم النسخ!' : 'نسخ الكود الخلفي'}</span>
                </button>
              </div>

              {/* Instructions Steps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">١. افتح جدول Google Sheets:</strong>
                  أنشئ جدول بيانات جديد على Google Drive بأي اسم (مثل: "قاعدة دروس الخط العربي").
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">٢. الدخول لمحرر Apps Script:</strong>
                  من القائمة العلوية للجدول، اختر <strong>امتدادات (Extensions)</strong> ثم <strong>Apps Script</strong>.
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">٣. لصق الكود وحفظه:</strong>
                  امسح أي كود موجود في المحرر، واضغط زر <strong>"نسخ الكود الخلفي"</strong> بالأعلى ثم الصقه واضغط حفظ (Ctrl + S).
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">٤. النشر كتطبيق ويب (Web App):</strong>
                  اضغط الزر الأزرق <strong>نشر (Deploy)</strong> &gt; <strong>نشر جديد (New deployment)</strong> &gt; اختر <strong>تطبيق ويب (Web app)</strong>.
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 md:col-span-2">
                  <strong className="text-amber-400 block mb-1">٥. ضبط صلاحية الوصول (مهم جداً):</strong>
                  اجعل <strong>تنفيذ التطبيق كـ: أنا (Me)</strong>، واجعل <strong>من يملك حق الوصول: أي شخص (Anyone)</strong>. ثم اضغط <strong>نشر</strong>، وانسخ رابط تطبيق الويب والصقه في خانة الرابط أعلاه!
                </div>
              </div>

              {/* Code Preview Box */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1.5 px-1">
                  <span>كود Google Apps Script (جاهز للنسخ المباشر):</span>
                  <span>Google Apps Script (.gs)</span>
                </div>
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 scrollbar-thin">
                    <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
                  </pre>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ======================= TAB 2: LESSONS & TEMPLATES MANAGEMENT ======================= */}
        {activeTab === 'lessons' && (
          <div className="space-y-6">

            {/* Top Toolbar: Search, Category Filter, and Add Lesson */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-slate-900 rounded-2xl border border-slate-800">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ابحث عن درس أو حرف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pr-9 pl-4 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                >
                  <option value="all">جميع الأقسام</option>
                  <option value="letters">الحروف العربية</option>
                  <option value="words">الكلمات والعبارات</option>
                  <option value="shapes">الأشكال والزخارف</option>
                  <option value="custom">النماذج المخصصة</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isConnecting || !sheetUrl.trim()}
                  title="مزامنة وجلب من الشيت"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">مزامنة من الشيت</span>
                </button>

                <button
                  onClick={handleSyncAllToSheet}
                  disabled={isConnecting || !sheetUrl.trim()}
                  title="حفظ الكل في الشيت"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">حفظ في الشيت</span>
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

            {/* Lessons Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="group relative p-4 bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    {/* SVG Thumbnail Preview */}
                    <div className="w-full h-32 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center p-2 mb-3 overflow-hidden text-amber-400">
                      {tpl.svgData ? (
                        <div
                          className="w-full h-full flex items-center justify-center [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto"
                          dangerouslySetInnerHTML={{ __html: tpl.svgData }}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">بدون رسمة</span>
                      )}
                    </div>

                    {/* Lesson Title & Category */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-400 transition-colors">
                        {tpl.title}
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 shrink-0">
                        {tpl.category === 'letters' ? 'حرف' : tpl.category === 'words' ? 'كلمة' : 'شكل'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-3">
                      {tpl.description || 'لا يوجد وصف مضاف'}
                    </p>
                  </div>

                  {/* Actions & Pronounce */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                    <button
                      onClick={() => audioService.speakArabic(tpl.arabicAudioText || tpl.title)}
                      title="سماع النطق الصوتي"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 cursor-pointer transition-colors"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(tpl)}
                        title="تعديل الدرس"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteLesson(tpl.id, tpl.title)}
                        title="حذف الدرس"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500 hover:text-white text-rose-400 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                <p className="text-sm">لم يتم العثور على دروس مطابقة لبحثك</p>
              </div>
            )}

          </div>
        )}

      </div>

      {/* ======================= ADD / EDIT LESSON MODAL ======================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base sm:text-lg font-bold text-amber-400 pb-3 border-b border-slate-800 flex items-center gap-2">
              <Edit3 className="w-5 h-5" />
              <span>{editingTemplate ? 'تعديل بيانات الدرس' : 'إضافة درس خط عربي جديد'}</span>
            </h2>

            <form onSubmit={handleSaveLesson} className="space-y-4 mt-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اسم الدرس / الحرف بالعربية *:</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="مثال: حرف الجيم (ج)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الاسم بالإنجليزية (اختياري):</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formTitleEn}
                    onChange={(e) => setFormTitleEn(e.target.value)}
                    placeholder="e.g. Letter Jeem"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">القسم / التصنيف:</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="letters">حروف الخط العربي</option>
                    <option value="words">كلمات وعبارات</option>
                    <option value="shapes">أشكال وزخارف</option>
                    <option value="custom">مخصص</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">مستوى الصعوبة:</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="easy">مبتدئ (سهل)</option>
                    <option value="normal">متوسط</option>
                    <option value="advanced">متقدم (محترف)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نسبة الإتقان المطلوبة:</label>
                  <input
                    type="number"
                    min="50"
                    max="95"
                    value={formTargetAccuracy}
                    onChange={(e) => setFormTargetAccuracy(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">النطق الصوتي التوجيهي (تشجيع الطالب):</label>
                <input
                  type="text"
                  value={formAudioText}
                  onChange={(e) => setFormAudioText(e.target.value)}
                  placeholder="مثال: جِيمْ، حَرْفُ الجِيم، رَائِعْ!"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">وصف وتوجيه كتابة الحرف:</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="مثال: ابدأ برسم رأس الجيم الموجي، ثم انزل بقوس نصف دائري كبير للبطن مع نقطة في المنتصف"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">كود رسمة الحرف (SVG Vector Code):</label>
                <textarea
                  rows={4}
                  dir="ltr"
                  value={formSvgData}
                  onChange={(e) => setFormSvgData(e.target.value)}
                  placeholder="<svg viewBox='0 0 500 500'>...</svg>"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-[11px] focus:outline-hidden focus:border-amber-500"
                />
              </div>

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
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md cursor-pointer"
                >
                  حفظ في النظام والشيت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
