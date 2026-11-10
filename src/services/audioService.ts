/**
 * Audio Service: Web Speech Synthesis (Arabic) & Web Audio Sound Effects
 */
class AudioService {
  private audioCtx: AudioContext | null = null;
  private arabicVoice: SpeechSynthesisVoice | null = null;
  private isUnlocked: boolean = false;
  private isMuted: boolean = false;

  private ttsAudio: HTMLAudioElement | null = null;
  private currentAudioAbort: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.ttsAudio = new Audio();
      } catch {
        // Fallback for environments where Audio constructor is restricted
      }
      this.initVoices();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
      // Auto-unlock audio context and media player on first user interaction anywhere
      const handleFirstInteraction = () => {
        this.unlockAudio();
        window.removeEventListener('pointerdown', handleFirstInteraction);
        window.removeEventListener('keydown', handleFirstInteraction);
      };
      window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
      window.addEventListener('keydown', handleFirstInteraction, { once: true });
    }
  }

  public initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Search for best Arabic voice (Saudi, Egyptian, UAE, or general Arabic)
      this.arabicVoice =
        voices.find(v => v.lang.toLowerCase() === 'ar-sa') ||
        voices.find(v => v.lang.toLowerCase() === 'ar-eg') ||
        voices.find(v => v.lang.toLowerCase() === 'ar-ae') ||
        voices.find(v => v.lang.toLowerCase().startsWith('ar')) ||
        voices.find(v => v.name.toLowerCase().includes('arabic') || v.name.includes('عربي') || v.name.includes('Salma') || v.name.includes('Maged')) ||
        null;
    } catch {
      // Ignore voice reading error
    }
  }

  /**
   * Unlock AudioContext and HTML5 Audio on Desktop & Mobile/Tablet browsers (Chrome/Safari/Edge/Firefox)
   */
  public async unlockAudio(): Promise<boolean> {
    this.isUnlocked = true;
    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Initialize HTML5 Audio element under user gesture
      if (typeof window !== 'undefined') {
        if (!this.ttsAudio) {
          this.ttsAudio = new Audio();
        }
        // Play silent blank buffer to satisfy browser autoplay security on mobile/tablets
        this.ttsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        this.ttsAudio.volume = 1;
        this.ttsAudio.play().catch(() => {});
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.initVoices();
        try {
          window.speechSynthesis.resume();
        } catch {}
      }
      return true;
    } catch {
      return false;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.ttsAudio) {
      try {
        this.ttsAudio.pause();
      } catch {}
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Universal Arabic Pronunciation:
   * 1. Uses universal HTML5 Audio with high-clarity Arabic TTS stream (works in 100% of browsers & devices without OS language packs).
   * 2. Falls back seamlessly to Web Speech API or synthesized chime if offline.
   */
  public speakArabic(text: string, rate: number = 0.9): Promise<void> {
    return new Promise((resolve) => {
      if (this.isMuted || !text || !text.trim() || typeof window === 'undefined') {
        resolve();
        return;
      }

      // Abort any previous pending audio playback
      if (this.currentAudioAbort) {
        this.currentAudioAbort();
        this.currentAudioAbort = null;
      }

      let isResolved = false;
      const safeResolve = () => {
        if (!isResolved) {
          isResolved = true;
          this.currentAudioAbort = null;
          resolve();
        }
      };

      // 1. Try High-Compatibility HTML5 Audio TTS (Works in Chrome, Firefox, Safari, Edge, Mobile, Tablet)
      try {
        if (!this.ttsAudio) {
          this.ttsAudio = new Audio();
        }

        const audio = this.ttsAudio;
        audio.pause();
        audio.currentTime = 0;

        const cleanText = text.replace(/[\n\r\t]+/g, ' ').trim();
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
        audio.src = ttsUrl;
        audio.playbackRate = rate;

        const onEnded = () => {
          cleanup();
          safeResolve();
        };

        const onError = () => {
          cleanup();
          // Fall back to Web Speech API or chime
          this.speakViaWebSpeech(cleanText, rate).then(safeResolve);
        };

        const cleanup = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
        };

        audio.addEventListener('ended', onEnded, { once: true });
        audio.addEventListener('error', onError, { once: true });

        // Safety timeout in case audio stalls
        const timeout = setTimeout(() => {
          cleanup();
          safeResolve();
        }, 5000);

        this.currentAudioAbort = () => {
          clearTimeout(timeout);
          cleanup();
          try {
            audio.pause();
          } catch {}
          safeResolve();
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('HTML5 Audio play prevented or offline, switching to WebSpeech fallback:', err);
            cleanup();
            clearTimeout(timeout);
            this.speakViaWebSpeech(cleanText, rate).then(safeResolve);
          });
        }
      } catch (err) {
        console.warn('HTML5 Audio initialization failed, fallback to WebSpeech:', err);
        this.speakViaWebSpeech(text, rate).then(safeResolve);
      }
    });
  }

  /**
   * Secondary fallback using browser's built-in Web Speech API
   */
  private speakViaWebSpeech(text: string, rate: number = 0.9): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        this.playChime(520, 0.15);
        resolve();
        return;
      }

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        if (!this.arabicVoice) {
          this.initVoices();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        if (this.arabicVoice) {
          utterance.voice = this.arabicVoice;
        }
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1;

        let finished = false;
        const finish = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };

        utterance.onend = finish;
        utterance.onerror = () => {
          this.playChime(520, 0.15);
          finish();
        };

        setTimeout(finish, 3500);
        window.speechSynthesis.speak(utterance);
      } catch {
        this.playChime(520, 0.15);
        resolve();
      }
    });
  }

  /**
   * Play clean synthesized chime sound
   */
  public playChime(freq: number = 587.33, duration: number = 0.2) {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio autoplay restriction fallback
    }
  }

  /**
   * Sound effect for pen stroke start
   */
  public playStrokeStart() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {}
  }

  /**
   * Eraser sound effect
   */
  public playEraserSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }

  /**
   * Triumphant fanfare upon completing template with high accuracy
   */
  public playSuccessFanfare() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        } catch {}
      }, idx * 110);
    });
  }

  /**
   * Sound effect for student drawing error (off start point or missed end point)
   */
  public playErrorSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  }

  /**
   * Sound effect for completing an individual calligraphy step
   */
  public playStepSuccessSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const notes = [587.33, 880]; // D5, A5
      notes.forEach((freq, i) => {
        setTimeout(() => {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.22);
          } catch {}
        }, i * 90);
      });
    } catch {}
  }
}

export const audioService = new AudioService();
