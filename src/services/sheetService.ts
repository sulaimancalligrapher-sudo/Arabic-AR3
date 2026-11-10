import { DrawingTemplate, LessonStep } from '../types/drawing';
import { DRAWING_TEMPLATES } from '../data/drawingTemplates';
import { formatDirectImageUrl } from '../utils/urlHelper';

const SHEET_URL_KEY = 'arabic_ar_sheet_url';
const LOCAL_TEMPLATES_KEY = 'arabic_ar_horizontal_templates_v2';
const LOCAL_STEPS_CACHE_KEY = 'arabic_ar_steps_backup_cache';

// Default built-in Google Apps Script URL so all devices (mobile, tablet, PC) connect automatically
export const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzd9L7BL9tQu-7OkyFX3mNreodryMJO3EGcdcaYP-tnWG9b1reETX7gLEseLSmgsjGOVw/exec';

/**
 * Return authentic Arabic ordinal word for steps
 */
export function getArabicOrdinal(num: number): string {
  const ordinals: Record<number, string> = {
    1: 'الخطوة الأولى',
    2: 'الخطوة الثانية',
    3: 'الخطوة الثالثة',
    4: 'الخطوة الرابعة',
    5: 'الخطوة الخامسة',
    6: 'الخطوة السادسة',
    7: 'الخطوة السابعة',
    8: 'الخطوة الثامنة',
    9: 'الخطوة التاسعة',
    10: 'الخطوة العاشرة',
    11: 'الخطوة الحادية عشرة',
    12: 'الخطوة الثانية عشرة',
    13: 'الخطوة الثالثة عشرة',
    14: 'الخطوة الرابعة عشرة',
    15: 'الخطوة الخامسة عشرة',
  };
  return ordinals[num] || `الخطوة ${num}`;
}

/**
 * Resolves the spoken text for a calligraphy step, ensuring words like 'الخطوة الأولى'
 * instead of bare digits like '1' or 'الخطوة 1'
 */
export function getStepAudioPrompt(step: LessonStep): string {
  if (step.audioHint && step.audioHint.trim()) {
    const hint = step.audioHint.trim();
    // If the hint is solely a number like "1" or "2"
    if (/^\d+$/.test(hint)) {
      return getArabicOrdinal(parseInt(hint, 10));
    }
    // If it contains "الخطوة X" or "خطوة X", replace digit with authentic Arabic ordinal word
    const normalized = hint.replace(/(?:الخطوة|خطوة)\s*(\d+)/g, (_, d) => {
      return getArabicOrdinal(parseInt(d, 10));
    });
    return normalized;
  }
  return getArabicOrdinal(step.stepNumber);
}

/**
 * Parse steps JSON from Sheet column or cache in a completely resilient way
 */
export function parseStepsData(raw: any): LessonStep[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray((raw as any).steps)) return (raw as any).steps;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'سهل' || trimmed === 'متوسط' || trimmed === 'متقدم' || trimmed === 'صعب') {
      return [];
    }
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.steps)) return parsed.steps;
    } catch {
      try {
        const cleaned = trimmed.replace(/'/g, '"');
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  return [];
}

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
const REGISTRANTS_SHEET_NAME = "ID registrants";
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

function getOrCreateRegistrantsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REGISTRANTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRANTS_SHEET_NAME);
    const headers = ["ID", "اسم المشترك"];
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#f8fafc");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    // Seed default sample test registrants
    sheet.appendRow(["101", "أحمد محمد"]);
    sheet.appendRow(["102", "فاطمة علي"]);
    sheet.appendRow(["103", "سارة خالد"]);
    sheet.appendRow(["2024", "عبدالله السعيد"]);
  }
  return sheet;
}

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

// Read all lessons or registrants (GET)
function doGet(e) {
  try {
    const reqAction = (e && e.parameter && e.parameter.action) || "";
    const reqSheet = (e && e.parameter && e.parameter.sheet) || "";

    // 1. Fetch Registrants from 'ID registrants' sheet
    if (reqAction === "get_registrants" || reqSheet === "registrants") {
      const regSheet = getOrCreateRegistrantsSheet();
      const regData = regSheet.getDataRange().getValues();
      const registrants = [];
      for (let i = 1; i < regData.length; i++) {
        const id = String(regData[i][0] || '').trim();
        const name = String(regData[i][1] || '').trim();
        if (id && name) {
          registrants.push({ id: id, name: name });
        }
      }
      return jsonResponse({
        status: "success",
        count: registrants.length,
        registrants: registrants
      });
    }

    // 2. Fetch Lessons from 'ArabicLessons' sheet
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

    // 4. VERIFY REGISTRANT
    if (action === "verify_registrant") {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      const regSheet = getOrCreateRegistrantsSheet();
      const regData = regSheet.getDataRange().getValues();
      let matched = null;
      for (let i = 1; i < regData.length; i++) {
        const rowId = String(regData[i][0] || '').trim();
        const rowName = String(regData[i][1] || '').trim();
        // Match by ID, and if name is provided, verify match
        if (rowId === id) {
          if (!name || rowName.toLowerCase() === name.toLowerCase()) {
            matched = { id: rowId, name: rowName };
            break;
          }
        }
      }
      if (matched) {
        return jsonResponse({ status: "success", verified: true, user: matched });
      } else {
        return jsonResponse({ status: "fail", verified: false, message: "لم يتم العثور على المشترك بالرقم والاسم المدخلين" });
      }
    }

    // 5. ADD REGISTRANT
    if (action === "add_registrant") {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      if (!id || !name) {
        return jsonResponse({ status: "error", message: "رقم المشترك واسمه مطلوبان" });
      }
      const regSheet = getOrCreateRegistrantsSheet();
      regSheet.appendRow([id, name]);
      return jsonResponse({ status: "success", added: true, user: { id: id, name: name } });
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
    // If the browser on this or other devices still has the old 6-column script URL stored,
    // automatically migrate it to the active 7-column URL so steps sync across all devices!
    if (stored && (
      stored.includes('AKfycbwjtf7BiA8k5BEQgw1n0s_VYeBNzTmL-IitZ8m_YKjbnVfd_dZHL4svN08x4jNfw3LNqA') ||
      !stored.trim()
    )) {
      localStorage.setItem(SHEET_URL_KEY, DEFAULT_SHEET_URL);
      return DEFAULT_SHEET_URL;
    }
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
      } else if (item.stepsData) {
        parsedSteps = parseStepsData(item.stepsData);
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

          // Parse steps from stepsData using resilient parser
          const steps: LessonStep[] = parseStepsData(item.stepsData);

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

  // ==========================================
  // Registrants & User Session Management
  // ==========================================

  public getStoredUser(): RegistrantUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const data = localStorage.getItem(LOCAL_USER_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {}
    return null;
  }

  public saveStoredUser(user: RegistrantUser | null): void {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_USER_KEY);
    }
  }

  public getCachedRegistrants(): RegistrantUser[] {
    if (typeof window === 'undefined') return DEFAULT_SAMPLE_REGISTRANTS;
    try {
      const data = localStorage.getItem(LOCAL_REGISTRANTS_CACHE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SAMPLE_REGISTRANTS;
  }

  public saveCachedRegistrants(registrants: RegistrantUser[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_REGISTRANTS_CACHE_KEY, JSON.stringify(registrants));
    } catch {}
  }

  /**
   * Normalize Arabic numerals and characters for reliable comparison
   */
  public normalizeArabicText(str: string): string {
    if (!str) return '';
    return str
      .trim()
      // Convert Arabic-Indic numerals (٠-٩) to ASCII (0-9)
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      // Normalize Arabic characters: Alef with hamza, wasla, madda to bare Alef
      .replace(/[أإآآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase();
  }

  /**
   * Fetch all registrants from the "ID registrants" sheet in Google Sheets
   */
  public async fetchRegistrants(): Promise<{
    success: boolean;
    registrants: RegistrantUser[];
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return {
        success: true,
        registrants: this.getCachedRegistrants()
      };
    }

    try {
      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=get_registrants`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`خطأ في استجابة الخادم: ${response.status}`);
      }

      const json = await response.json();
      if (json.status === 'success' && Array.isArray(json.registrants)) {
        const list: RegistrantUser[] = json.registrants.map((r: any) => ({
          id: String(r.id || '').trim(),
          name: String(r.name || '').trim()
        }));
        if (list.length > 0) {
          this.saveCachedRegistrants(list);
          return { success: true, registrants: list };
        }
      }
      return { success: true, registrants: this.getCachedRegistrants() };
    } catch (err: any) {
      return {
        success: true, // Graceful fallback to cached/sample registrants so student is never blocked
        registrants: this.getCachedRegistrants(),
        error: err.message
      };
    }
  }

  /**
   * Verify an ID and participant name against the "ID registrants" sheet
   */
  public async verifyRegistrant(
    rawId: string,
    rawName: string
  ): Promise<{ success: boolean; user?: RegistrantUser; error?: string }> {
    const cleanId = this.normalizeArabicText(rawId);
    const cleanName = this.normalizeArabicText(rawName);

    if (!cleanId) {
      return { success: false, error: 'يرجى إدخال رقم المشترك (ID)' };
    }
    if (!cleanName) {
      return { success: false, error: 'يرجى إدخال اسم المشترك' };
    }

    // 1. Try live verification via Google Sheets POST if online
    const url = this.getStoredSheetUrl();
    if (url) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'verify_registrant',
            id: rawId.trim(),
            name: rawName.trim()
          })
        });

        if (response.ok) {
          const json = await response.json();
          if (json.status === 'success' && json.verified && json.user) {
            const verifiedUser: RegistrantUser = {
              id: String(json.user.id),
              name: String(json.user.name),
              loginDate: new Date().toISOString()
            };
            this.saveStoredUser(verifiedUser);
            return { success: true, user: verifiedUser };
          }
        }
      } catch {
        // Fallback to local / cached check
      }
    }

    // 2. Local / Cached Verification check
    const registrants = this.getCachedRegistrants();
    const matched = registrants.find(r => {
      const regId = this.normalizeArabicText(r.id);
      const regName = this.normalizeArabicText(r.name);
      return regId === cleanId && (regName.includes(cleanName) || cleanName.includes(regName));
    });

    if (matched) {
      const verifiedUser: RegistrantUser = {
        id: matched.id,
        name: matched.name,
        loginDate: new Date().toISOString()
      };
      this.saveStoredUser(verifiedUser);
      return { success: true, user: verifiedUser };
    }

    return {
      success: false,
      error: 'رقم المشترك أو الاسم غير مسجل في ورقة المشتركين (ID registrants)'
    };
  }

  /**
   * Add a new participant to the "ID registrants" sheet
   */
  public async addRegistrant(
    id: string,
    name: string
  ): Promise<{ success: boolean; user?: RegistrantUser; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'رابط الشيت غير مضبوط' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'add_registrant',
          id: id.trim(),
          name: name.trim()
        })
      });

      const json = await response.json();
      if (json.status === 'success') {
        const newUser: RegistrantUser = { id: id.trim(), name: name.trim() };
        const currentList = this.getCachedRegistrants();
        this.saveCachedRegistrants([newUser, ...currentList.filter(u => u.id !== newUser.id)]);
        return { success: true, user: newUser };
      }
      return { success: false, error: json.message || 'تعذر إضافة المشترك' };
    } catch (err: any) {
      return { success: false, error: err.message || 'خطأ في الاتصال بالخادم' };
    }
  }
}

export interface RegistrantUser {
  id: string;
  name: string;
  loginDate?: string;
}

const LOCAL_USER_KEY = 'arabic_calligraphy_user';
const LOCAL_REGISTRANTS_CACHE_KEY = 'arabic_calligraphy_registrants_cache';

export const DEFAULT_SAMPLE_REGISTRANTS: RegistrantUser[] = [
  { id: '101', name: 'أحمد محمد' },
  { id: '102', name: 'فاطمة علي' },
  { id: '103', name: 'سارة خالد' },
  { id: '2024', name: 'عبدالله السعيد' }
];

export const sheetService = new SheetService();
