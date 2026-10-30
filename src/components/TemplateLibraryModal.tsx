import React, { useState, useEffect } from 'react';
import { DrawingTemplate } from '../types/drawing';
import { DRAWING_TEMPLATES } from '../data/drawingTemplates';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl } from '../utils/urlHelper';
import {
  X,
  Search,
  BookOpen,
  Volume2,
  LayoutList,
  LayoutGrid,
  Repeat,
  Image as ImageIcon
} from 'lucide-react';

interface TemplateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplate: DrawingTemplate | null;
  onSelectTemplate: (template: DrawingTemplate) => void;
  onAddCustomTemplate?: (template: DrawingTemplate) => void;
  templates?: DrawingTemplate[];
}

export const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({
  isOpen,
  onClose,
  selectedTemplate,
  onSelectTemplate,
  templates = DRAWING_TEMPLATES,
}) => {
  const allTemplates = templates && templates.length > 0 ? templates : DRAWING_TEMPLATES;

  // View mode: 'list' (default as requested) or 'grid' (cards)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract unique topics
  const topics = Array.from(
    new Set(allTemplates.map(t => (t.topic || 'خط النسخ (الأساسيات)').trim()))
  ).filter(Boolean);

  const [selectedTopic, setSelectedTopic] = useState<string>(() => {
    return topics.length > 0 ? topics[0] : 'خط النسخ (الأساسيات)';
  });

  // Keep selectedTopic valid
  useEffect(() => {
    if (topics.length > 0 && (!selectedTopic || !topics.includes(selectedTopic))) {
      setSelectedTopic(topics[0]);
    }
  }, [topics, selectedTopic]);

  // Lessons under the selected topic
  const lessonsInTopic = allTemplates.filter(
    t => (t.topic || 'خط النسخ (الأساسيات)').trim() === selectedTopic
  );

  // Extract unique categories within this topic (NO "الكل" tab as requested)
  const categoriesInTopic = Array.from(
    new Set(lessonsInTopic.map(t => (t.category || 'حروف').trim()))
  ).filter(Boolean);

  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // When selected topic changes, set selectedCategory to the first available category
  useEffect(() => {
    if (categoriesInTopic.length > 0) {
      if (!selectedCategory || !categoriesInTopic.includes(selectedCategory)) {
        setSelectedCategory(categoriesInTopic[0]);
      }
    } else {
      setSelectedCategory('حروف');
    }
  }, [selectedTopic, categoriesInTopic, selectedCategory]);

  if (!isOpen) return null;

  // Filter lessons in selected topic and category
  const filteredLessons = lessonsInTopic
    .filter(tpl => (tpl.category || 'حروف').trim() === selectedCategory)
    .filter(tpl => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        tpl.title.toLowerCase().includes(q) ||
        (tpl.titleEn && tpl.titleEn.toLowerCase().includes(q)) ||
        (tpl.description && tpl.description.toLowerCase().includes(q)) ||
        (tpl.arabicAudioText && tpl.arabicAudioText.toLowerCase().includes(q))
      );
    });

  const handleChooseLesson = (item: DrawingTemplate) => {
    onSelectTemplate(item);
    onClose();
    if (item.arabicAudioText || item.title) {
      audioService.speakArabic(item.arabicAudioText || item.title);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header - Renamed to "الدروس" */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-ruqaa text-amber-400 flex items-center gap-2">
                <span>الدروس</span>
              </h2>
              <p className="text-xs text-slate-400">
                اختر درساً للشف والتمرن على السبورة التفاعلية أو بكاميرا الواقع المعزز AR
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle Button: List vs Cards (Grid) */}
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              title={viewMode === 'list' ? 'تحويل إلى بطاقات' : 'تحويل إلى قائمة'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
            >
              {viewMode === 'list' ? (
                <>
                  <LayoutGrid className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">عرض البطاقات</span>
                </>
              ) : (
                <>
                  <LayoutList className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">عرض القائمة</span>
                </>
              )}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 1. Topics Dropdown & Search Bar */}
        <div className="p-4 sm:px-6 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Topics Dropdown */}
          <div className="flex items-center gap-2.5 flex-1">
            <span className="text-xs font-bold text-amber-400 shrink-0">موضوع الدرس:</span>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full max-w-xs px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-slate-100 font-bold focus:outline-hidden focus:border-amber-500 cursor-pointer"
            >
              {topics.map(top => (
                <option key={top} value={top}>{top}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن درس أو حرف..."
              className="w-full pl-3 pr-8 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500"
            />
          </div>
        </div>

        {/* 2. Category Tabs (Filtered by selected topic - NO 'الكل' tab) */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-xs text-slate-400 font-semibold ml-1 shrink-0">الفئات:</span>
          {categoriesInTopic.map(cat => {
            const count = lessonsInTopic.filter(l => (l.category || 'حروف').trim() === cat).length;
            const isCatActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isCatActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <span>{cat}</span>
                <span className="mr-1.5 text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* 3. Lessons View (List by default, or Grid/Cards) */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {viewMode === 'list' ? (
            /* =================== LIST VIEW (DEFAULT) =================== */
            <div className="flex flex-col gap-2.5">
              {filteredLessons.map(item => {
                const isSelected = selectedTemplate?.id === item.id;
                const directUrl = formatDirectImageUrl(item.imageUrl);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleChooseLesson(item)}
                    className={`group p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                        : 'bg-slate-900/70 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Right side: Thumbnail + Title & Info (RTL) */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Thumbnail */}
                      <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center p-1.5 shrink-0 overflow-hidden text-amber-400 group-hover:scale-105 transition-transform">
                        {directUrl ? (
                          <img
                            src={directUrl}
                            alt={item.title}
                            className="max-h-full max-w-full object-contain filter drop-shadow"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : item.svgData ? (
                          <div
                            className="w-full h-full flex items-center justify-center [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{ __html: item.svgData }}
                          />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-slate-500" />
                        )}
                      </div>

                      {/* Title & Description */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-400 transition-colors truncate">
                            {item.title}
                          </h3>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                              محدد حالياً
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.arabicAudioText || item.description || 'تمرين شف وكتابة على السبورة'}
                        </p>
                      </div>
                    </div>

                    {/* Left side: Badges & Audio Pronounce */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Repeat Count */}
                      <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 text-[11px] font-bold">
                        <Repeat className="w-3 h-3" />
                        <span>التكرار: {item.repeatCount || 1}</span>
                      </div>

                      {/* Difficulty */}
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700">
                        {item.difficulty || 'سهل'}
                      </span>

                      {/* Listen button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          audioService.speakArabic(item.arabicAudioText || item.title);
                        }}
                        title="استمع للنطق"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition-all cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* =================== CARDS / GRID VIEW =================== */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {filteredLessons.map(item => {
                const isSelected = selectedTemplate?.id === item.id;
                const directUrl = formatDirectImageUrl(item.imageUrl);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleChooseLesson(item)}
                    className={`group relative p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-between text-center ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                        : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600'
                    }`}
                  >
                    {/* Thumbnail Preview */}
                    <div className="relative w-full aspect-square rounded-xl bg-slate-950/60 flex items-center justify-center p-3 mb-2.5 overflow-hidden group-hover:scale-105 transition-transform duration-200">
                      {directUrl ? (
                        <img
                          src={directUrl}
                          alt={item.title}
                          className="max-h-full max-w-full object-contain filter drop-shadow"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : item.svgData ? (
                        <div
                          className="w-full h-full flex items-center justify-center text-amber-400 [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-full"
                          dangerouslySetInnerHTML={{ __html: item.svgData }}
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-500" />
                      )}

                      {/* Repeat count badge */}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-900/90 text-amber-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1">
                        <Repeat className="w-2.5 h-2.5" />
                        <span>{item.repeatCount || 1}</span>
                      </div>

                      {/* Audio Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          audioService.speakArabic(item.arabicAudioText || item.title);
                        }}
                        title="استمع للنطق العربي"
                        className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Title */}
                    <div className="w-full">
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-1">
                        {item.title}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        {item.arabicAudioText || item.title}
                      </p>
                    </div>

                    {/* Difficulty Badge */}
                    <span className="mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-amber-400 border border-slate-700">
                      {item.difficulty || 'سهل'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {filteredLessons.length === 0 && (
            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-500" />
              <p className="text-sm font-bold text-slate-300">
                لا توجد دروس في الفئة &quot;{selectedCategory}&quot;
              </p>
              <p className="text-xs text-slate-500">
                يمكنك التبديل إلى فئة أخرى أو اختيار موضوع مختلف من القائمة بالأعلى.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
