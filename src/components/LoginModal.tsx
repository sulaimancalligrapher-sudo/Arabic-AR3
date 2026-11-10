import React, { useState } from 'react';
import { sheetService, RegistrantUser, DEFAULT_SAMPLE_REGISTRANTS } from '../services/sheetService';
import { audioService } from '../services/audioService';
import {
  User,
  Hash,
  LogIn,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: RegistrantUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess
}) => {
  const [participantId, setParticipantId] = useState<string>('');
  const [participantName, setParticipantName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [registrants, setRegistrants] = useState<RegistrantUser[]>(() => sheetService.getCachedRegistrants());

  // Fetch live registrants from the connected Google Sheet
  React.useEffect(() => {
    if (isOpen) {
      sheetService.fetchRegistrants().then((res) => {
        if (res.success && res.registrants && res.registrants.length > 0) {
          setRegistrants(res.registrants);
        }
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedId = participantId.trim();
    const trimmedName = participantName.trim();

    if (!trimmedId) {
      setErrorMessage('يرجى إدخال رقم المشترك (ID)');
      audioService.playErrorSound();
      return;
    }

    if (!trimmedName) {
      setErrorMessage('يرجى إدخال اسم المشترك');
      audioService.playErrorSound();
      return;
    }

    setLoading(true);

    try {
      const res = await sheetService.verifyRegistrant(trimmedId, trimmedName);
      if (res.success && res.user) {
        audioService.playSuccessSound();
        setSuccessMessage(`أهلاً بك يا ${res.user.name}! تم التحقق من رقم المشترك بنجاح 🌟`);
        setTimeout(() => {
          onLoginSuccess(res.user!);
          onClose();
        }, 800);
      } else {
        audioService.playErrorSound();
        setErrorMessage(res.error || 'تعذر التحقق من البيانات. تأكد من إدراج رقم المشترك والاسم في ورقة ID registrants');
      }
    } catch {
      audioService.playErrorSound();
      setErrorMessage('حدث خطأ أثناء الاتصال. يرجى إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = (demo: RegistrantUser) => {
    setParticipantId(demo.id);
    setParticipantName(demo.name);
    setErrorMessage(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
      dir="rtl"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-100 overflow-hidden">
        
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-100 font-ruqaa flex items-center gap-1.5">
                <span>تسجيل دخول المشترك</span>
                <span className="text-xs text-amber-400 font-sans font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                  ID Registrants
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                التحقق المباشر من ورقة المشتركين في Google Sheets
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          
          {/* Field 1: رقم المشترك (ID) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              رقم المشترك (ID):
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <Hash className="w-4 h-4 text-amber-400" />
              </div>
              <input
                type="text"
                value={participantId}
                onChange={(e) => {
                  setParticipantId(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="مثال: 101 أو 2024"
                className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 text-sm placeholder:text-slate-500 transition-all outline-none"
                disabled={loading}
                autoFocus
              />
            </div>
          </div>

          {/* Field 2: اسم المشترك */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              اسم المشترك:
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4 text-amber-400" />
              </div>
              <input
                type="text"
                value={participantName}
                onChange={(e) => {
                  setParticipantName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="مثال: أحمد محمد"
                className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 text-sm placeholder:text-slate-500 transition-all outline-none"
                disabled={loading}
              />
            </div>
          </div>

          {/* Fast Demo Accounts Helper */}
          <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>أرقام المشتركين المسجلين في الشيت للتجربة السريعة:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(registrants.length > 0 ? registrants : DEFAULT_SAMPLE_REGISTRANTS).slice(0, 4).map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  onClick={() => handleFillDemo(demo)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-amber-500/20 text-slate-200 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="font-mono text-amber-400 font-bold">{demo.id}</span>
                  <span>-</span>
                  <span>{demo.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="leading-relaxed font-bold">{successMessage}</div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg hover:shadow-amber-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارِ التحقق من الشيت...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>دخول المنصة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-all cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>

        {/* Note on Google Sheets verification */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-1.5 text-[10px] text-slate-400 justify-center">
          <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
          <span>يتم فحص مطابقة المشترك تلقائياً من ورقة «ID registrants»</span>
        </div>

      </div>
    </div>
  );
};
