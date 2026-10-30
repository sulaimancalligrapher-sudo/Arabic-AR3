export type DrawingCategory = 'letters' | 'words' | 'shapes' | 'custom' | 'freehand' | string;

export type BoardStyle = 'white' | 'dark' | 'green' | 'grid' | 'ar_camera';

export type HandTrackingDisplayMode = 'finger_only' | 'one_hand' | 'two_hands' | 'off';

export type PenType = 'calligraphy' | 'marker' | 'brush' | 'eraser';

export type GuideColor = 'yellow' | 'green' | 'white' | 'cyan' | 'black';

export type LessonDifficulty = 'سهل' | 'متوسط' | 'متقدم' | 'صعب' | 'easy' | 'normal' | 'advanced';

export interface LessonStep {
  id: string;
  stepNumber: number;
  title: string;
  startX: number; // Normalized [0, 1]
  startY: number; // Normalized [0, 1]
  endX: number;   // Normalized [0, 1]
  endY: number;   // Normalized [0, 1]
  audioHint?: string;
}

export interface DrawingTemplate {
  id: string;
  topic?: string;            // العامود A: الموضوع (مثل: خط النسخ، خط الرقعة، رسم وزخرفة)
  category: string;          // العامود B: الفئة (مثل: حروف، كلمات، رسمة)
  imageUrl?: string;         // العامود C: رابط الصورة (من قوقل درايف أو رابط مباشر)
  title: string;             // العامود D: عنوان الصورة / اسم الدرس
  titleEn?: string;
  arabicAudioText?: string;  // العامود E: نص للقراءة الآلية (إذا فارغ يُقرأ العنوان)
  repeatCount?: number;      // العامود F: عدد التكرار (الافتراضي 1)
  difficulty?: LessonDifficulty; // العامود G: المستوى (سهل / متوسط / متقدم / صعب)
  description?: string;
  svgData?: string;
  guideColor?: GuideColor;
  targetAccuracy?: number;
  tags?: string[];
  isCustom?: boolean;
  steps?: LessonStep[];       // خطوات كتابة الحرف المرقمة
  stepsData?: string;        // بيانات الخطوات كـ JSON للحفظ
}

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  penType: PenType;
  color: string;
  size: number;
  opacity: number;
  nibAngle?: number; // In degrees, typically 45° for Arabic calligraphy
}

export interface HandCursor {
  x: number;
  y: number;
  isPinching: boolean;
  handDetected: boolean;
  pinchDistance: number;
  gesture: 'pointing' | 'pinch' | 'open' | 'none';
}
