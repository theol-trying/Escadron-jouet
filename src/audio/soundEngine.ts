export interface AudioSettings {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  ambienceVolume: number; // 0..1
  muted: boolean;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private ambienceTimer: number | null = null;
  private settings: AudioSettings = {
    masterVolume: 0.7,
    sfxVolume: 0.85,
    ambienceVolume: 0.45,
    muted: false,
  };

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.syncGains();
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const ambience = ctx.createGain();

    sfx.connect(master);
    ambience.connect(master);
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.ambienceGain = ambience;
    this.syncGains();
  }

  private syncGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.ambienceGain) return;
    const t = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(m, t, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.03);
    this.ambienceGain.gain.setTargetAtTime(this.settings.ambienceVolume, t, 0.03);
  }

  public startFlightAudio(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.ambienceGain) return;

    if (!this.engineOsc) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 95;
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      gain.gain.value = 0.035;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      this.engineOsc = osc;
      this.engineGain = gain;
    }

    if (this.ambienceTimer === null) {
      // Gentle toy-room clock tick ambience
      this.ambienceTimer = window.setInterval(() => {
        this.playClockTick();
      }, 1000);
    }
  }

  public stopFlightAudio(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    }
    if (this.ambienceTimer !== null) {
      clearInterval(this.ambienceTimer);
      this.ambienceTimer = null;
    }
  }

  public updateEnginePitch(speedRatio: number, alive: boolean, boosting: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    if (!alive) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const targetFreq = 75 + speedRatio * 95 + (boosting ? 38 : 0);
    const targetGain = boosting ? 0.055 : 0.032;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.06);
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.06);
  }

  private playClockTick(): void {
    if (!this.ctx || !this.ambienceGain || this.settings.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.025);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g);
    g.connect(this.ambienceGain);
    osc.start(t);
    osc.stop(t + 0.035);
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(940, t + 0.04);
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  public playPelletShot(heavy: boolean): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = heavy ? 'square' : 'triangle';
    osc.frequency.setValueAtTime((heavy ? 240 : 480) * jitter, t);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 85 : 150, t + 0.07);
    g.gain.setValueAtTime(heavy ? 0.16 : 0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.085);
  }

  public playHit(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.095);
  }

  public playPopExplosion(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.24);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.27);
  }

  public playVictoryFanfare(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const start = now + i * 0.09;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.14, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}

export const soundEngine = new SoundEngine();
