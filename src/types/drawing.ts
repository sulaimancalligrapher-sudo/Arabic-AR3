export type DrawingCategory = 'letters' | 'words' | 'shapes' | 'custom' | 'freehand';

export type BoardStyle = 'white' | 'dark' | 'green' | 'grid' | 'ar_camera';

export type HandTrackingDisplayMode = 'finger_only' | 'one_hand' | 'two_hands' | 'off';

export type PenType = 'calligraphy' | 'marker' | 'brush' | 'eraser';

export type GuideColor = 'yellow' | 'green' | 'white' | 'cyan' | 'black';

export interface DrawingTemplate {
  id: string;
  title: string;
  titleEn: string;
  category: DrawingCategory;
  description: string;
  svgData: string;
  arabicAudioText?: string;
  difficulty?: 'easy' | 'normal' | 'advanced';
  guideColor?: GuideColor;
  targetAccuracy?: number;
  tags?: string[];
  isCustom?: boolean;
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
