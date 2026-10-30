import { DrawingTemplate, LessonStep } from '../types/drawing';
import { DRAWING_TEMPLATES } from '../data/drawingTemplates';
import { formatDirectImageUrl } from '../utils/urlHelper';

const SHEET_URL_KEY = 'arabic_ar_sheet_url';
const LOCAL_TEMPLATES_KEY = 'arabic_ar_horizontal_templates_v2';
const LOCAL_STEPS_CACHE_KEY = 'arabic_ar_steps_backup_cache';

// Default built-in Google Apps Script URL so all devices (mobile, tablet, PC) connect automatically
export const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwjtf7BiA8k5BEQgw1n0s_VYeBNzTmL-IitZ8m_YKjbnVfd_dZHL4svN08x4jNfw3LNqA/exec';

export interface SheetSyncStatus {
  connected: boolean;
  lastSyncTime: Date | null;
  error?: string | null;
}

/**
 * Complete Google Apps Script code configured for 7 columns per lesson horizontally:
 * - Column A: الموضوع (Topic)
 * - 7 Columns per lesson horizontally:
 *   [الفئة, رابط الصورة, عنوان الصورة, نص للقراءة الالية, عدد التكرار, المستوى, خطوات الحرف]
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ========================================================
 * خادم نظام السبورة التفاعلية لتعليم الخط العربي - الهيكل الأفقي (7 أعمدة)
 * Arabic AR Lessons Backend - Horizontal Architecture (7 Cols Per Lesson)
 * ========================================================
 * تعليمات التثبيت:
 * 1. افتح جدول بيانات Google Sheets.
 * 2. من القائمة العلوية: اختر [امتدادات] (Extensions) > [Apps Script].
 * 3. احذف أي كود مكتوب، والصق هذا الكود كاملاً، ثم اضغط حفظ (Ctrl + S).
 * 4. اضغط على زر [نشر] (Deploy) باللون الأزرق بالأعلى > [نشر جديد] (New deployment).
 * 5. اضغط على أيقونة الترس واختر [تطبيق ويب] (Web app).
 * 6. اضبط الإعدادات:
 *    - الوصف: Arabic AR 7-Columns Lessons with Step Maker
 *    - تنفيذ التطبيق كـ (Execute as): أنا (Me)
 *    - من يملك حق الوصول (Who has access): أي شخص (Anyone) <--- مهم جداً!
 * 7. اضغط [نشر] (Deploy) وامنح الأذونات، ثم انسخ رابط تطبيق الويب.
 * 8. الصق الرابط في لوحة الإعدادات بالنظام.
 */

const SHEET_NAME = "ArabicLessons";
const COLS_PER_LESSON = 7;
const SUB_HEADERS = [
  "الفئة",
  "رابط الصورة",
  "عنوان الصورة",
  "نص للقراءة الالية",
  "عدد التكرار",
  "المستوى",
  "خطوات الحرف"
];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ["الموضوع"];
    for (let i = 1; i <= 20; i++) {
      for (let s = 0; s < SUB_HEADERS.length; s++) {
        headers.push("الدرس " + i + " - " + SUB_HEADERS[s]);
      }
    }
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#f8fafc");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
  }
  return sheet;
}

function ensureHeaderLength(sheet, lessonSlotCount) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const neededCols = 1 + (lessonSlotCount * COLS_PER_LESSON);
  if (neededCols > lastCol) {
    const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const newHeaders = [...currentHeaders];
    const currentSlots = Math.floor((lastCol - 1) / COLS_PER_LESSON);
    for (let i = currentSlots + 1; i <= lessonSlotCount; i++) {
      for (let s = 0; s < SUB_HEADERS.length; s++) {
        newHeaders.push("الدرس " + i + " - " + SUB_HEADERS[s]);
      }
    }
    sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    const headerRange = sheet.getRange(1, 1, 1, newHeaders.length);
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#f8fafc");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
  }
}

// Read all lessons from horizontal structure (GET)
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return jsonResponse({ status: "success", count: 0, lessons: [] });
    }

    const lessons = [];

    // Loop through rows starting at row 2 (row 1 is header)
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const topic = String(row[0] || '').trim();
      if (!topic) continue;

      let slotIndex = 1;
      for (let c = 1; c < row.length; c += COLS_PER_LESSON) {
        const category = String(row[c] || '').trim();
        const imageUrl = String(row[c + 1] || '').trim();
        const title = String(row[c + 2] || '').trim();
        const tts = String(row[c + 3] || '').trim();
        const repeatCount = Number(row[c + 4]) || 1;
        const difficulty = String(row[c + 5] || 'سهل').trim();
        const stepsData = String(row[c + 6] || '').trim();

        if (title || imageUrl) {
          lessons.push({
            id: topic + "_" + slotIndex + "_" + (title || ("lesson_" + c)),
            topic: topic,
            category: category || "حروف",
            imageUrl: imageUrl,
            title: title || ("درس " + slotIndex),
            arabicAudioText: tts || title || ("درس " + slotIndex),
            repeatCount: repeatCount,
            difficulty: difficulty || "سهل",
            stepsData: stepsData,
            slotIndex: slotIndex,
            colStart: c + 1
          });
        }
        slotIndex++;
      }
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

// Add, Update, Sync all, or Delete (POST)
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

    // 1. BULK SYNC ALL LESSONS
    if (action === "sync_all" || action === "init") {
      const lessons = body.lessons || [];
      sheet.clearContents();

      const topicsMap = {};
      const topicOrder = [];

      lessons.forEach(l => {
        const top = (l.topic || "خط النسخ").trim();
        if (!topicsMap[top]) {
          topicsMap[top] = [];
          topicOrder.push(top);
        }
        topicsMap[top].push(l);
      });

      let maxLessonsPerTopic = 1;
      topicOrder.forEach(top => {
        if (topicsMap[top].length > maxLessonsPerTopic) {
          maxLessonsPerTopic = topicsMap[top].length;
        }
      });

      // Build Headers
      const headers = ["الموضوع"];
      for (let i = 1; i <= Math.max(maxLessonsPerTopic, 5); i++) {
        for (let s = 0; s < SUB_HEADERS.length; s++) {
          headers.push("الدرس " + i + " - " + SUB_HEADERS[s]);
        }
      }

      sheet.appendRow(headers);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#1e293b");
      headerRange.setFontColor("#f8fafc");
      headerRange.setFontWeight("bold");
      headerRange.setFontSize(10);
      sheet.setFrozenRows(1);
      sheet.setFrozenColumns(1);

      // Build Rows
      const rows = [];
      topicOrder.forEach(top => {
        const list = topicsMap[top];
        const row = [top];
        list.forEach(l => {
          row.push(l.category || "حروف");
          row.push(l.imageUrl || "");
          row.push(l.title || "");
          row.push(l.arabicAudioText || l.title || "");
          row.push(Number(l.repeatCount) || 1);
          row.push(l.difficulty || "سهل");
          row.push(l.stepsData || (l.steps ? JSON.stringify(l.steps) : ""));
        });
        rows.push(row);
      });

      if (rows.length > 0) {
        for (let r = 0; r < rows.length; r++) {
          const rowVals = rows[r];
          sheet.getRange(r + 2, 1, 1, rowVals.length).setValues([rowVals]);
        }
      }

      return jsonResponse({ status: "success", count: lessons.length });
    }

    // 2. UPSERT SINGLE LESSON
    if (action === "upsert" || action === "save") {
      const l = body.lesson;
      if (!l) return jsonResponse({ status: "error", message: "Missing lesson object" });

      const targetTopic = (l.topic || "خط النسخ").trim();
      const data = sheet.getDataRange().getValues();

      let targetRowIndex = -1;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0] || '').trim() === targetTopic) {
          targetRowIndex = r + 1;
          break;
        }
      }

      const lessonValues = [
        l.category || "حروف",
        l.imageUrl || "",
        l.title || "",
        l.arabicAudioText || l.title || "",
        Number(l.repeatCount) || 1,
        l.difficulty || "سهل",
        l.stepsData || (l.steps ? JSON.stringify(l.steps) : "")
      ];

      // If Topic row does NOT exist, create new row
      if (targetRowIndex === -1) {
        targetRowIndex = sheet.getLastRow() + 1;
        ensureHeaderLength(sheet, 1);
        const newRow = [targetTopic, ...lessonValues];
        sheet.getRange(targetRowIndex, 1, 1, newRow.length).setValues([newRow]);
        return jsonResponse({ status: "success", action: "inserted_new_topic", row: targetRowIndex });
      }

      // If Topic row exists: check if updating an existing lesson or appending horizontally
      const rowData = sheet.getRange(targetRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
      let targetColStart = -1;

      const searchTitle = (body.originalTitle || l.title || '').trim();
      for (let c = 1; c < rowData.length; c += COLS_PER_LESSON) {
        const slotTitle = String(rowData[c + 2] || '').trim();
        if (slotTitle && slotTitle === searchTitle) {
          targetColStart = c + 1;
          break;
        }
      }

      if (targetColStart === -1) {
        let firstEmptyCol = 1;
        while (firstEmptyCol < rowData.length) {
          const cat = String(rowData[firstEmptyCol] || '').trim();
          const img = String(rowData[firstEmptyCol + 1] || '').trim();
          const tit = String(rowData[firstEmptyCol + 2] || '').trim();
          if (!cat && !img && !tit) {
            break;
          }
          firstEmptyCol += COLS_PER_LESSON;
        }
        targetColStart = firstEmptyCol + 1;
      }

      const slotNumber = Math.ceil((targetColStart - 1) / COLS_PER_LESSON);
      ensureHeaderLength(sheet, slotNumber);
      sheet.getRange(targetRowIndex, targetColStart, 1, COLS_PER_LESSON).setValues([lessonValues]);

      return jsonResponse({ status: "success", action: "updated", row: targetRowIndex, col: targetColStart });
    }

    // 3. DELETE LESSON
    if (action === "delete") {
      const targetTopic = (body.topic || '').trim();
      const targetTitle = (body.title || '').trim();

      const data = sheet.getDataRange().getValues();
      for (let r = 1; r < data.length; r++) {
        const top = String(data[r][0] || '').trim();
        if (!targetTopic || top === targetTopic) {
          const rowVals = data[r];
          for (let c = 1; c < rowVals.length; c += COLS_PER_LESSON) {
            const tit = String(rowVals[c + 2] || '').trim();
            if (tit === targetTitle || String(rowVals[c + 1] || '').trim() === body.imageUrl) {
              sheet.getRange(r + 1, c + 1, 1, COLS_PER_LESSON).clearContent();
              return jsonResponse({ status: "success", deleted: true, row: r + 1, col: c + 1 });
            }
          }
        }
      }
      return jsonResponse({ status: "success", deleted: false });
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
    if (typeof window !== 'undefined' && !localStorage.getItem(SHEET_URL_KEY)) {
      localStorage.setItem(SHEET_URL_KEY, DEFAULT_SHEET_URL);
    }
  }

  public getStoredSheetUrl(): string {
    if (typeof window === 'undefined') return DEFAULT_SHEET_URL;
    const stored = localStorage.getItem(SHEET_URL_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
    return DEFAULT_SHEET_URL;
  }

  public setStoredSheetUrl(url: string): void {
    const trimmed = url.trim() || DEFAULT_SHEET_URL;
    this.sheetUrl = trimmed;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHEET_URL_KEY, trimmed);
    }
  }

  /**
   * Persistent Fallback Cache for lesson steps to prevent loss
   */
  public getStepsBackupMap(): Record<string, LessonStep[]> {
    if (typeof window === 'undefined') return {};
    try {
      const cached = localStorage.getItem(LOCAL_STEPS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return {};
  }

  public saveStepsToBackup(lessonTitle: string, steps: LessonStep[]): void {
    if (typeof window === 'undefined' || !lessonTitle) return;
    try {
      const map = this.getStepsBackupMap();
      map[lessonTitle.trim()] = steps;
      localStorage.setItem(LOCAL_STEPS_CACHE_KEY, JSON.stringify(map));
    } catch {}
  }

  public getLocalTemplates(): DrawingTemplate[] {
    if (typeof window === 'undefined') return this.normalizeTemplates(DRAWING_TEMPLATES);
    try {
      const cached = localStorage.getItem(LOCAL_TEMPLATES_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.normalizeTemplates(parsed);
        }
      }
    } catch {}
    return this.normalizeTemplates(DRAWING_TEMPLATES);
  }

  public saveLocalTemplates(templates: DrawingTemplate[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates));
      // Also update step backup cache for all lessons with steps
      templates.forEach(t => {
        if (t.steps && t.steps.length > 0) {
          this.saveStepsToBackup(t.title, t.steps);
        }
      });
    }
  }

  /**
   * Ensure every template has topic, category, repeatCount, and valid fields + steps
   */
  public normalizeTemplates(rawList: DrawingTemplate[]): DrawingTemplate[] {
    const backupStepsMap = this.getStepsBackupMap();

    return rawList.map((item, idx) => {
      const topic = (item.topic || 'خط النسخ (الأساسيات)').trim();
      let category = (item.category || 'حروف').trim();
      if (category === 'letters') category = 'حروف';
      if (category === 'words') category = 'كلمات';
      if (category === 'shapes') category = 'رسمة وزخرفة';

      const directImg = formatDirectImageUrl(item.imageUrl);
      const title = (item.title || `درس ${idx + 1}`).trim();

      // Parse steps from steps array, stepsData, or persistent fallback cache
      let parsedSteps: LessonStep[] = [];
      if (Array.isArray(item.steps) && item.steps.length > 0) {
        parsedSteps = item.steps;
      } else if (item.stepsData && item.stepsData.trim()) {
        try {
          const p = JSON.parse(item.stepsData);
          if (Array.isArray(p)) parsedSteps = p;
        } catch {}
      }

      // Check persistent fallback cache if still empty
      if (parsedSteps.length === 0 && backupStepsMap[title]) {
        parsedSteps = backupStepsMap[title];
      }

      return {
        ...item,
        id: item.id || `tpl_${idx}_${Date.now()}`,
        topic: topic,
        category: category,
        imageUrl: directImg || item.imageUrl || '',
        title: title,
        titleEn: item.titleEn || '',
        arabicAudioText: item.arabicAudioText || item.title || '',
        repeatCount: Number(item.repeatCount) || 1,
        difficulty: item.difficulty || 'سهل',
        svgData: item.svgData || '',
        steps: parsedSteps,
        stepsData: item.stepsData || (parsedSteps.length > 0 ? JSON.stringify(parsedSteps) : '')
      };
    });
  }

  /**
   * Fetch all lessons from Google Sheet (GET)
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

        const validTemplates: DrawingTemplate[] = json.lessons.map((item: any) => {
          const topic = (item.topic || 'خط النسخ').trim();
          const category = (item.category || 'حروف').trim();
          const rawImg = String(item.imageUrl || '').trim();
          const directImg = formatDirectImageUrl(rawImg);
          const title = String(item.title || 'درس بدون عنوان').trim();
          const tts = String(item.arabicAudioText || title).trim();

          let steps: LessonStep[] = [];
          if (item.stepsData) {
            try {
              const p = JSON.parse(item.stepsData);
              if (Array.isArray(p)) steps = p;
            } catch {}
          }

          return {
            id: String(item.id || `sheet_${topic}_${title}`),
            topic: topic,
            category: category,
            imageUrl: directImg,
            title: title,
            titleEn: String(item.titleEn || ''),
            arabicAudioText: tts,
            repeatCount: Number(item.repeatCount) || 1,
            difficulty: (item.difficulty as any) || 'سهل',
            description: String(item.description || ''),
            svgData: item.svgData || '',
            tags: [topic, category, item.difficulty || 'سهل'],
            steps: steps,
            stepsData: item.stepsData || (steps.length > 0 ? JSON.stringify(steps) : '')
          };
        });

        const normalized = this.normalizeTemplates(validTemplates);
        this.saveLocalTemplates(normalized);

        return {
          success: true,
          lessons: normalized
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
   * Save or update a single lesson into the horizontal Google Sheet
   */
  public async saveLessonToSheet(
    lesson: DrawingTemplate,
    originalTitle?: string
  ): Promise<{ success: boolean; error?: string }> {
    const url = this.getStoredSheetUrl();

    // Always update local backup cache immediately
    if (lesson.steps && lesson.steps.length > 0) {
      this.saveStepsToBackup(lesson.title, lesson.steps);
    }

    if (!url) {
      return { success: false, error: 'الرابط غير موجود' };
    }

    const stepsSerialized = lesson.stepsData || (lesson.steps && lesson.steps.length > 0 ? JSON.stringify(lesson.steps) : '');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upsert',
          originalTitle: originalTitle || lesson.title,
          lesson: {
            topic: lesson.topic || 'خط النسخ',
            category: lesson.category || 'حروف',
            imageUrl: lesson.imageUrl || '',
            title: lesson.title,
            arabicAudioText: lesson.arabicAudioText || lesson.title,
            repeatCount: Number(lesson.repeatCount) || 1,
            difficulty: lesson.difficulty || 'سهل',
            stepsData: stepsSerialized
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
  public async deleteLessonFromSheet(topic: string, title: string, imageUrl?: string): Promise<{ success: boolean; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) return { success: false, error: 'الرابط غير موجود' };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', topic, title, imageUrl })
      });

      const json = await response.json();
      return { success: json.status === 'success', error: json.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر حذف الدرس من الشيت' };
    }
  }

  /**
   * Bulk sync all current lessons to the horizontal Sheet (7 Columns)
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
          lessons: lessons.map(l => ({
            topic: l.topic || 'خط النسخ',
            category: l.category || 'حروف',
            imageUrl: l.imageUrl || '',
            title: l.title,
            arabicAudioText: l.arabicAudioText || l.title,
            repeatCount: Number(l.repeatCount) || 1,
            difficulty: l.difficulty || 'سهل',
            stepsData: l.stepsData || (l.steps && l.steps.length > 0 ? JSON.stringify(l.steps) : '')
          }))
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
   * Initialize Sheet with standard templates
   */
  public async initializeSheetWithDefaults(): Promise<{ success: boolean; count?: number; error?: string }> {
    return this.syncAllLessonsToSheet(this.getLocalTemplates());
  }
}

export const sheetService = new SheetService();
