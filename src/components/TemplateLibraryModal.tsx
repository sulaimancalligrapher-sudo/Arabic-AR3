import React, { useState } from 'react';
import { DrawingTemplate, DrawingCategory } from '../types/drawing';
import { DRAWING_TEMPLATES } from '../data/drawingTemplates';
import { audioService } from '../services/audioService';
import { X, Search, Sparkles, Upload, Palette, BookOpen, Star, Volume2 } from 'lucide-react';

interface TemplateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplate: DrawingTemplate | null;
  onSelectTemplate: (template: DrawingTemplate) => void;
  onAddCustomTemplate: (template: DrawingTemplate) => void;
}

export const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({
  isOpen,
  onClose,
  selectedTemplate,
  onSelectTemplate,
  onAddCustomTemplate,
}) => {
  const [activeCategory, setActiveCategory] = useState<DrawingCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customImageError, setCustomImageError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter templates
  const filtered = DRAWING_TEMPLATES.filter(tpl => {
    const matchCategory = activeCategory === 'all' || tpl.category === activeCategory;
    const matchSearch =
      tpl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tpl.tags && tpl.tags.some(t => t.includes(searchQuery)));
    return matchCategory && matchSearch;
  });

  // Handle custom image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCustomImageError('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        // Create custom template
        const customTemplate: DrawingTemplate = {
          id: `custom_${Date.now()}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          titleEn: 'Custom Image Tracing',
          category: 'custom',
          description: 'نموذج مخصص مرفوع من جهازك للشف والتلوين على السبورة والواقع المعزز',
          arabicAudioText: 'نَمُوذَجُكَ المُرَفَّعْ، مَرْحَبَاً بِكَ فِي الرَّسْم',
          difficulty: 'normal',
          targetAccuracy: 65,
          isCustom: true,
          svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
            <image href="${result}" width="500" height="500" preserveAspectRatio="xMidYMid meet"/>
          </svg>`
        };

        onAddCustomTemplate(customTemplate);
        onSelectTemplate(customTemplate);
        onClose();
        audioService.speakArabic('تم تحميل الصورة بنجاح!');
      }
    };
    reader.readAsDataURL(file);
  };

  const categories = [
    { id: 'all', label: 'الكل' },
    { id: 'letters', label: 'حروف الخط العربي (٢٨ حرف)' },
    { id: 'words', label: 'كلمات وعبارات أصيلة' },
    { id: 'shapes', label: 'أشكال ورسومات وتلوين' },
    { id: 'freehand', label: 'سبورة حرة خالية' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-ruqaa text-amber-400">
                مكتبة نماذج الخط العربي والرسومات
              </h2>
              <p className="text-xs text-slate-400">
                اختر الحرف أو الرسمة للشف والتمرن على السبورة التفاعلية أو بالواقع المعزز AR
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 sm:px-6 bg-slate-950/40 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Categories Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as any)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن حرف أو رسمة..."
              className="w-full pl-3 pr-9 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Upload Custom Image Action */}
        <div className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-amber-950/20 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>هل تود شف صورة أو لوحة خاصة من جهازك؟</span>
          </div>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span>رفع صورة للشف</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {customImageError && (
          <div className="px-6 py-2 bg-red-950/50 text-red-300 text-xs border-b border-red-800/50">
            {customImageError}
          </div>
        )}

        {/* Templates Grid List */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map(item => {
            const isSelected = selectedTemplate?.id === item.id;
            return (
              <div
                key={item.id}
                onClick={() => {
                  onSelectTemplate(item);
                  onClose();
                  if (item.arabicAudioText) {
                    audioService.speakArabic(item.arabicAudioText);
                  }
                }}
                className={`group relative p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-between text-center ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                    : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600'
                }`}
              >
                {/* SVG Silhouette Preview */}
                <div className="relative w-full aspect-square rounded-xl bg-slate-950/60 flex items-center justify-center p-3 mb-2.5 overflow-hidden group-hover:scale-105 transition-transform duration-200">
                  {item.svgData ? (
                    <div
                      className="w-full h-full flex items-center justify-center text-amber-400 [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-full"
                      dangerouslySetInnerHTML={{ __html: item.svgData }}
                    />
                  ) : (
                    <div className="text-3xl text-slate-500 flex flex-col items-center">
                      <Palette className="w-8 h-8 text-amber-400 mb-1" />
                      <span className="text-xs">لوحة خالية</span>
                    </div>
                  )}

                  {/* Audio Listen Button */}
                  {item.arabicAudioText && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        audioService.speakArabic(item.arabicAudioText!);
                      }}
                      title="استمع للنطق العربي"
                      className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Title & Info */}
                <div className="w-full">
                  <h3 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                    {item.titleEn}
                  </p>
                </div>

                {/* Difficulty Badge */}
                {item.difficulty && (
                  <span className={`mt-2 px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                    item.difficulty === 'easy'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : item.difficulty === 'normal'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  }`}>
                    {item.difficulty === 'easy' ? 'مبتدئ' : item.difficulty === 'normal' ? 'متوسط' : 'متقدم'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
