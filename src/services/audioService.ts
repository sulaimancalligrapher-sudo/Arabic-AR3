/**
 * Audio Service: Web Speech Synthesis (Arabic) & Web Audio Sound Effects
 */
class AudioService {
  private audioCtx: AudioContext | null = null;
  private arabicVoice: SpeechSynthesisVoice | null = null;
  private isUnlocked: boolean = false;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initVoices();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
      // Auto-unlock audio context on first user interaction anywhere in the window
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
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;

    // Search for best Arabic voice (Saudi, Egyptian, UAE, or general Arabic)
    this.arabicVoice =
      voices.find(v => v.lang.toLowerCase() === 'ar-sa') ||
      voices.find(v => v.lang.toLowerCase() === 'ar-eg') ||
      voices.find(v => v.lang.toLowerCase().startsWith('ar')) ||
      voices.find(v => v.name.toLowerCase().includes('arabic') || v.name.includes('عربي')) ||
      null;
  }

  /**
   * Unlock AudioContext and SpeechSynthesis on Desktop browsers (Chrome/Safari/Edge)
   */
  public async unlockAudio(): Promise<boolean> {
    this.isUnlocked = true;
    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.initVoices();
        window.speechSynthesis.resume();
      }
      return true;
    } catch {
      return false;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
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
   * Pronounce Arabic text clearly using Web Speech API (with Desktop recovery)
   */
  public speakArabic(text: string, rate: number = 0.88): Promise<void> {
    return new Promise((resolve) => {
      if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        this.playChime(520, 0.15);
        resolve();
        return;
      }

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        // Refresh voices if not found initially (Desktop Chrome onvoiceschanged latency)
        if (!this.arabicVoice) {
          this.initVoices();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        if (this.arabicVoice) {
          utterance.voice = this.arabicVoice;
        }
        utterance.rate = rate;
        utterance.pitch = 1.02;
        utterance.volume = 1;

        let finished = false;
        const finish = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };

        utterance.onend = finish;
        utterance.onerror = (e) => {
          console.warn('SpeechSynthesis error or skipped on desktop:', e);
          this.playChime(520, 0.15);
          finish();
        };

        // Safety timeout in case speech engine freezes on desktop
        setTimeout(finish, 4000);

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speak error:', err);
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
