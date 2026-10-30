import { DrawingTemplate } from '../types/drawing';
import { DRAWING_TEMPLATES } from '../data/drawingTemplates';

const SHEET_URL_KEY = 'arabic_ar_sheet_url';
const LOCAL_TEMPLATES_KEY = 'arabic_ar_local_templates';

export interface SheetSyncStatus {
  connected: boolean;
  lastSyncTime: Date | null;
  error?: string | null;
}

// Complete Google Apps Script code to copy & paste into Google Sheets
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ========================================================
 * خادم نظام السبورة التفاعلية لتعليم الخط العربي والواقع المعزز
 * Arabic AR Whiteboard - Google Sheets Database Backend
 * ========================================================
 * طريقة التثبيت في دقيقة واحدة:
 * 1. افتح جدول بيانات Google Sheets جديد.
 * 2. من القائمة العلوية: اختر [امتدادات] (Extensions) > [Apps Script].
 * 3. احذف أي كود مكتوب، والصق هذا الكود كاملاً، ثم اضغط حفظ (Ctrl + S).
 * 4. اضغط على زر [نشر] (Deploy) باللون الأزرق بالأعلى > [نشر جديد] (New deployment).
 * 5. اضغط على أيقونة الترس بجانب "اختر النوع" واختر [تطبيق ويب] (Web app).
 * 6. اضبط الإعدادات كالتالي:
 *    - الوصف: Arabic AR Lessons Backend
 *    - تنفيذ التطبيق كـ (Execute as): أنا (Me)
 *    - من يملك حق الوصول (Who has access): أي شخص (Anyone)  <--- مهم جداً!
 * 7. اضغط [نشر] (Deploy)، ثم امنح الأذونات، وانسخ [رابط تطبيق الويب] (Web app URL).
 * 8. الصق الرابط في صفحة إعدادات النظام واضغط "اختبار الاتصال والمزامنة".
 */

const SHEET_NAME = "ArabicLessons";
const HEADERS = [
  "id",
  "title",
  "titleEn",
  "category",
  "description",
  "arabicAudioText",
  "difficulty",
  "targetAccuracy",
  "tags",
  "svgData",
  "stepsData",
  "updatedAt"
];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Setup Headers with nice Arabic styling
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#f8fafc");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

// Read all lessons (GET request)
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return jsonResponse({ status: "success", count: 0, lessons: [] });
    }

    const headers = data[0];
    const lessons = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue; // Skip empty rows

      const lesson = {
        id: String(row[0] || ''),
        title: String(row[1] || ''),
        titleEn: String(row[2] || ''),
        category: String(row[3] || 'letters'),
        description: String(row[4] || ''),
        arabicAudioText: String(row[5] || ''),
        difficulty: String(row[6] || 'easy'),
        targetAccuracy: Number(row[7] || 75),
        tags: row[8] ? String(row[8]).split(',').map(s => s.trim()) : [],
        svgData: String(row[9] || ''),
        stepsData: String(row[10] || ''),
        updatedAt: String(row[11] || '')
      };
      lessons.push(lesson);
    }

    return jsonResponse({
      status: "success",
      count: lessons.length,
      lessons: lessons
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// Save, Update, or Delete lessons (POST request)
function doPost(e) {
  try {
    const sheet = getOrCreateSheet();
    let body;
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse({ status: "error", message: "No post data received" });
    }

    const action = body.action || "upsert";

    // 1. Bulk sync or initialize all lessons
    if (action === "sync_all" || action === "init") {
      const lessons = body.lessons || [];
      sheet.clearContents();
      sheet.appendRow(HEADERS);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setBackground("#1e293b");
      headerRange.setFontColor("#f8fafc");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);

      const rows = lessons.map(l => [
        l.id || '',
        l.title || '',
        l.titleEn || '',
        l.category || 'letters',
        l.description || '',
        l.arabicAudioText || '',
        l.difficulty || 'easy',
        l.targetAccuracy || 75,
        Array.isArray(l.tags) ? l.tags.join(', ') : (l.tags || ''),
        l.svgData || '',
        l.stepsData || '',
        new Date().toISOString()
      ]);

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
      }
      return jsonResponse({ status: "success", action: action, count: rows.length });
    }

    // 2. Delete a single lesson by ID
    if (action === "delete") {
      const id = String(body.id || '');
      if (!id) return jsonResponse({ status: "error", message: "Missing id for delete" });

      const data = sheet.getDataRange().getValues();
      let deleted = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === id) {
          sheet.deleteRow(i + 1);
          deleted = true;
          break;
        }
      }
      return jsonResponse({ status: "success", deleted: deleted });
    }

    // 3. Upsert a single lesson (add or update)
    if (action === "upsert" || action === "save") {
      const l = body.lesson;
      if (!l || !l.id) {
        return jsonResponse({ status: "error", message: "Missing lesson object or id" });
      }

      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(l.id)) {
          rowIndex = i + 1;
          break;
        }
      }

      const rowValues = [
        l.id,
        l.title || '',
        l.titleEn || '',
        l.category || 'letters',
        l.description || '',
        l.arabicAudioText || '',
        l.difficulty || 'easy',
        l.targetAccuracy || 75,
        Array.isArray(l.tags) ? l.tags.join(', ') : (l.tags || ''),
        l.svgData || '',
        l.stepsData || '',
        new Date().toISOString()
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }

      return jsonResponse({ status: "success", id: l.id, updated: rowIndex > 0 });
    }

    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

class SheetService {
  private sheetUrl: string = '';

  constructor() {
    this.sheetUrl = this.getStoredSheetUrl();
  }

  public getStoredSheetUrl(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(SHEET_URL_KEY) || '';
  }

  public setStoredSheetUrl(url: string): void {
    const trimmed = url.trim();
    this.sheetUrl = trimmed;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHEET_URL_KEY, trimmed);
    }
  }

  public getLocalTemplates(): DrawingTemplate[] {
    if (typeof window === 'undefined') return DRAWING_TEMPLATES;
    try {
      const cached = localStorage.getItem(LOCAL_TEMPLATES_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors, fallback to default
    }
    return DRAWING_TEMPLATES;
  }

  public saveLocalTemplates(templates: DrawingTemplate[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates));
    }
  }

  /**
   * Fetch all lessons from Google Sheet
   */
  public async fetchLessonsFromSheet(): Promise<{
    success: boolean;
    lessons: DrawingTemplate[];
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return {
        success: false,
        lessons: this.getLocalTemplates(),
        error: 'لم يتم إدخال رابط تطبيق ويب Google Apps Script بعد'
      };
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`خطأ في استجابة الخادم: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      if (json.status === 'success' && Array.isArray(json.lessons)) {
        if (json.lessons.length === 0) {
          return { success: true, lessons: [] };
        }

        const validTemplates: DrawingTemplate[] = json.lessons.map((item: any) => ({
          id: String(item.id || `tpl_${Date.now()}`),
          title: String(item.title || 'درس بدون عنوان'),
          titleEn: String(item.titleEn || ''),
          category: item.category || 'letters',
          description: String(item.description || ''),
          arabicAudioText: String(item.arabicAudioText || item.title || ''),
          difficulty: item.difficulty || 'easy',
          targetAccuracy: Number(item.targetAccuracy || 75),
          tags: Array.isArray(item.tags) ? item.tags : (item.tags ? String(item.tags).split(',') : []),
          svgData: String(item.svgData || ''),
          isCustom: item.category === 'custom',
        }));

        // Cache locally for offline capability
        this.saveLocalTemplates(validTemplates);

        return {
          success: true,
          lessons: validTemplates
        };
      } else {
        throw new Error(json.message || 'استجابة غير صالحة من Google Sheets');
      }
    } catch (err: any) {
      return {
        success: false,
        lessons: this.getLocalTemplates(),
        error: err.message || 'فشل الاتصال بجدول البيانات'
      };
    }
  }

  /**
   * Save or update a single lesson into the Sheet
   */
  public async saveLessonToSheet(lesson: DrawingTemplate): Promise<{ success: boolean; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'الرابط غير موجود' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upsert',
          lesson: {
            id: lesson.id,
            title: lesson.title,
            titleEn: lesson.titleEn,
            category: lesson.category,
            description: lesson.description,
            arabicAudioText: lesson.arabicAudioText,
            difficulty: lesson.difficulty,
            targetAccuracy: lesson.targetAccuracy,
            tags: lesson.tags,
            svgData: lesson.svgData,
            stepsData: ''
          }
        })
      });

      const json = await response.json();
      if (json.status === 'success') {
        return { success: true };
      } else {
        throw new Error(json.message || 'خطأ في حفظ الدرس في الشيت');
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر الاتصال بـ Google Sheets' };
    }
  }

  /**
   * Delete a lesson from the Sheet
   */
  public async deleteLessonFromSheet(id: string): Promise<{ success: boolean; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) return { success: false, error: 'الرابط غير موجود' };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', id })
      });

      const json = await response.json();
      return { success: json.status === 'success', error: json.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر حذف السطر' };
    }
  }

  /**
   * Initialize or sync all current lessons to the Sheet
   */
  public async syncAllLessonsToSheet(lessons: DrawingTemplate[]): Promise<{ success: boolean; count?: number; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'لم يتم ضبط رابط Google Apps Script بعد' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync_all',
          lessons: lessons
        })
      });

      const json = await response.json();
      if (json.status === 'success') {
        return { success: true, count: json.count };
      } else {
        throw new Error(json.message || 'فشل مزامنة الدروس مع الشيت');
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر إرسال البيانات إلى Google Sheets' };
    }
  }

  /**
   * Initialize Sheet with standard 28 Arabic letters
   */
  public async initializeSheetWithDefaults(): Promise<{ success: boolean; count?: number; error?: string }> {
    return this.syncAllLessonsToSheet(DRAWING_TEMPLATES);
  }
}

export const sheetService = new SheetService();
