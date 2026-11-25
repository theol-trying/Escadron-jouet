import type { PlaneId, PowerUpId } from '../../shared/types';
import { EARSHOT, spatialModel } from './spatialMix';

export interface AudioSettings {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  ambienceVolume: number; // 0..1
  musicVolume: number; // 0..1
  muted: boolean;
}

/** World position (cm) of a sound source: spatialised relative to the camera. */
export interface SoundPos {
  x: number;
  y: number;
  z: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.7,
  sfxVolume: 0.85,
  ambienceVolume: 0.45,
  musicVolume: 0.5,
  muted: false,
};

function loadAudioSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem('ej_audio') || '{}') as Partial<AudioSettings>;
    const vol = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    return {
      masterVolume: vol(raw.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
      sfxVolume: vol(raw.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
      ambienceVolume: vol(raw.ambienceVolume, DEFAULT_AUDIO_SETTINGS.ambienceVolume),
      musicVolume: vol(raw.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
      muted: raw.muted === true,
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

/**
 * Continuous engine sound of the local plane. Each toy has its own voice:
 * - jet: rising whine + airy rush
 * - biplane: buzzy propeller chop + wind-up spring ratchet clicks
 * - glider: mostly wind, a faint hum
 * - bomber: two detuned deep propellers throbbing
 */
interface EngineVoice {
  update(speedRatio: number, boosting: boolean, t: number): void;
  silence(t: number): void;
  stop(): void;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /** Camera position (setListener) and HRTF sounds still playing, for the 3D sound budget */
  private listenerPos = { x: 0, y: 0, z: 0 };
  private hrtfVoices = 0;
  private engineVoice: EngineVoice | null = null;
  private enginePlane: PlaneId | null = null;
  private flightActive = false;
  private ambienceTimer: number | null = null;
  private unlockListeners: Array<() => void> = [];
  private settings: AudioSettings = loadAudioSettings();

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem('ej_audio', JSON.stringify(this.settings));
    } catch {
      // storage unavailable: settings simply won't persist
    }
    this.syncGains();
  }

  /** Audio context and music bus, for the music player (null until the first user gesture). */
  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getMusicBus(): GainNode | null {
    return this.musicGain;
  }

  public getNoiseBuffer(): AudioBuffer | null {
    return this.noiseBuffer;
  }

  /** Runs `cb` once audio is unlocked (immediately if it already is). */
  public onUnlock(cb: () => void): void {
    if (this.ctx) cb();
    else this.unlockListeners.push(cb);
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
    const music = ctx.createGain();

    sfx.connect(master);
    ambience.connect(master);
    music.connect(master);
    master.connect(ctx.destination);

    // 2 s of white noise, shared by wind, whooshes and percussion
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.ambienceGain = ambience;
    this.musicGain = music;
    this.noiseBuffer = noise;
    this.syncGains();

    const listeners = this.unlockListeners;
    this.unlockListeners = [];
    for (const cb of listeners) cb();
  }

  private syncGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.ambienceGain || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(m, t, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.03);
    this.ambienceGain.gain.setTargetAtTime(this.settings.ambienceVolume, t, 0.03);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume, t, 0.03);
  }

  // ── 3D positioning ────────────────────────────────────────────────────────────────────────────

  /** Places the listener at the camera (called every frame by the 3D engine). */
  public setListener(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number
  ): void {
    if (!this.ctx) return;
    this.listenerPos.x = px;
    this.listenerPos.y = py;
    this.listenerPos.z = pz;
    const l = this.ctx.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(px, t);
      l.positionY.setValueAtTime(py, t);
      l.positionZ.setValueAtTime(pz, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(fy, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(ux, t);
      l.upY.setValueAtTime(uy, t);
      l.upZ.setValueAtTime(uz, t);
    } else {
      // Older Safari API
      (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(px, py, pz);
      (l as unknown as {
        setOrientation: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
      }).setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /**
   * Output for a one-shot sound lasting `dur` seconds: straight to the effects bus, or through a 3D
   * panner — HRTF for the few nearest sounds, the cheap equal-power panner otherwise
   * (src/audio/spatialMix.ts). The panner is released once the sound is over.
   */
  private output(pos: SoundPos | undefined, dur: number): AudioNode | null {
    if (!this.ctx || !this.sfxGain) return null;
    if (!pos) return this.sfxGain;
    const lp = this.listenerPos;
    const model = spatialModel(Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z), this.hrtfVoices);
    if (!model) return null;
    const p = this.ctx.createPanner();
    p.panningModel = model;
    p.distanceModel = 'inverse';
    p.refDistance = 40;
    p.maxDistance = EARSHOT;
    p.rolloffFactor = 1.1;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
    }
    p.connect(this.sfxGain);
    if (model === 'HRTF') this.hrtfVoices++;
    globalThis.setTimeout(() => {
      p.disconnect();
      if (model === 'HRTF') this.hrtfVoices = Math.max(0, this.hrtfVoices - 1);
    }, (dur + 0.3) * 1000);
    return p;
  }

  /** Short pitched blip helper: oscillator with an exponential pitch and volume decay. */
  private blip(
    type: OscillatorType,
    f0: number,
    f1: number,
    gain: number,
    dur: number,
    pos?: SoundPos,
    delay = 0
  ): void {
    const out = this.output(pos, delay + dur);
    if (!this.ctx || !out) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.9);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  /** Filtered noise burst helper (whooshes, splashes, rattles). */
  private noiseBurst(
    filterType: BiquadFilterType,
    f0: number,
    f1: number,
    gain: number,
    dur: number,
    pos?: SoundPos,
    q = 1.2
  ): void {
    const out = this.output(pos, dur);
    if (!this.ctx || !out || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  // ── Engine voices ─────────────────────────────────────────────────────────────────────────────

  private buildEngineVoice(planeId: PlaneId): EngineVoice | null {
    const ctx = this.ctx;
    const bus = this.sfxGain;
    if (!ctx || !bus || !this.noiseBuffer) return null;
    const nodes: AudioScheduledSourceNode[] = [];
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);

    const osc = (type: OscillatorType, freq: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.start();
      nodes.push(o);
      return o;
    };
    const noise = () => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      n.loop = true;
      n.start(0, Math.random() * 1.5);
      nodes.push(n);
      return n;
    };
    const filter = (type: BiquadFilterType, freq: number, q = 0.8) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    // Amplitude chop (propeller blades): gain node whose gain is driven by an LFO
    const chopper = (rate: number, depth: number) => {
      const g = ctx.createGain();
      g.gain.value = 1 - depth;
      const lfo = osc('square', rate);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      return { g, lfo };
    };

    const stopAll = () => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          // already stopped
        }
      }
      out.disconnect();
    };
    const silence = (t: number) => out.gain.setTargetAtTime(0, t, 0.06);

    if (planeId === 'plastic_jet') {
      const whine = osc('sawtooth', 180);
      const whineF = filter('lowpass', 900);
      const rush = noise();
      const rushF = filter('bandpass', 1200, 0.7);
      const rushG = ctx.createGain();
      rushG.gain.value = 0.6;
      whine.connect(whineF);
      whineF.connect(out);
      rush.connect(rushF);
      rushF.connect(rushG);
      rushG.connect(out);
      return {
        update: (r, boost, t) => {
          whine.frequency.setTargetAtTime(170 + r * 220 + (boost ? 90 : 0), t, 0.08);
          rushF.frequency.setTargetAtTime(900 + r * 1600 + (boost ? 900 : 0), t, 0.08);
          out.gain.setTargetAtTime(boost ? 0.06 : 0.035, t, 0.08);
        },
        silence,
        stop: stopAll,
      };
    }

    if (planeId === 'windup_biplane') {
      const motor = osc('square', 70);
      const motorF = filter('lowpass', 650);
      const { g: chop, lfo } = chopper(22, 0.7);
      motor.connect(motorF);
      motorF.connect(chop);
      chop.connect(out);
      // Spring ratchet: a pulse train through a narrow bandpass gives dry clicks
      const ratchet = osc('square', 9);
      const clickF = filter('bandpass', 3200, 9);
      const clickG = ctx.createGain();
      clickG.gain.value = 0.35;
      ratchet.connect(clickF);
      clickF.connect(clickG);
      clickG.connect(out);
      return {
        update: (r, boost, t) => {
          motor.frequency.setTargetAtTime(62 + r * 58 + (boost ? 25 : 0), t, 0.08);
          lfo.frequency.setTargetAtTime(18 + r * 18 + (boost ? 8 : 0), t, 0.08);
          ratchet.frequency.setTargetAtTime(6 + r * 9, t, 0.1);
          out.gain.setTargetAtTime(boost ? 0.07 : 0.045, t, 0.08);
        },
        silence,
        stop: stopAll,
      };
    }

    if (planeId === 'foam_glider') {
      const wind = noise();
      const windF = filter('bandpass', 600, 0.6);
      const hum = osc('triangle', 220);
      const humG = ctx.createGain();
      humG.gain.value = 0.18;
      wind.connect(windF);
      windF.connect(out);
      hum.connect(humG);
      humG.connect(out);
      return {
        update: (r, boost, t) => {
          windF.frequency.setTargetAtTime(380 + r * 900 + (boost ? 500 : 0), t, 0.1);
          hum.frequency.setTargetAtTime(200 + r * 90, t, 0.1);
          out.gain.setTargetAtTime(boost ? 0.07 : 0.045, t, 0.1);
        },
        silence,
        stop: stopAll,
      };
    }

    if (planeId === 'toy_helicopter') {
      // Rotor « whup-whup » (low chopped noise) over a small electric motor whine
      const wash = noise();
      const washF = filter('lowpass', 260);
      const { g: chop, lfo } = chopper(11, 0.75);
      const motor = osc('square', 140);
      const motorF = filter('bandpass', 900, 2);
      const motorG = ctx.createGain();
      motorG.gain.value = 0.12;
      wash.connect(washF);
      washF.connect(chop);
      chop.connect(out);
      motor.connect(motorF);
      motorF.connect(motorG);
      motorG.connect(out);
      return {
        update: (r, boost, t) => {
          lfo.frequency.setTargetAtTime(10 + r * 7 + (boost ? 5 : 0), t, 0.1);
          motor.frequency.setTargetAtTime(130 + r * 90 + (boost ? 60 : 0), t, 0.1);
          out.gain.setTargetAtTime(boost ? 0.1 : 0.075, t, 0.1);
        },
        silence,
        stop: stopAll,
      };
    }

    if (planeId === 'paper_plane') {
      // No engine: rustling paper in the wind, brighter with speed
      const air = noise();
      const airF = filter('highpass', 1200, 0.5);
      const flutter = chopper(23, 0.35);
      air.connect(airF);
      airF.connect(flutter.g);
      flutter.g.connect(out);
      return {
        update: (r, boost, t) => {
          airF.frequency.setTargetAtTime(900 + r * 1500 + (boost ? 700 : 0), t, 0.1);
          flutter.lfo.frequency.setTargetAtTime(18 + r * 16, t, 0.1);
          out.gain.setTargetAtTime(boost ? 0.06 : 0.035, t, 0.1);
        },
        silence,
        stop: stopAll,
      };
    }

    // diecast_bomber: twin deep propellers slightly out of tune → slow beating
    const left = osc('sawtooth', 48);
    const right = osc('sawtooth', 50.5);
    const lowF = filter('lowpass', 320);
    const { g: chop, lfo } = chopper(14, 0.55);
    left.connect(lowF);
    right.connect(lowF);
    lowF.connect(chop);
    chop.connect(out);
    return {
      update: (r, boost, t) => {
        left.frequency.setTargetAtTime(46 + r * 26 + (boost ? 12 : 0), t, 0.1);
        right.frequency.setTargetAtTime(48.5 + r * 27 + (boost ? 12 : 0), t, 0.1);
        lfo.frequency.setTargetAtTime(12 + r * 9, t, 0.1);
        out.gain.setTargetAtTime(boost ? 0.09 : 0.065, t, 0.1);
      },
      silence,
      stop: stopAll,
    };
  }

  public startFlightAudio(planeId: PlaneId = 'plastic_jet'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.ambienceGain) return;
    this.flightActive = true;

    if (!this.engineVoice || this.enginePlane !== planeId) {
      this.engineVoice?.stop();
      this.engineVoice = this.buildEngineVoice(planeId);
      this.enginePlane = planeId;
    }

    if (this.ambienceTimer === null) {
      // Gentle toy-room clock tick ambience
      this.ambienceTimer = window.setInterval(() => {
        this.playClockTick();
      }, 1000);
    }
  }

  public stopFlightAudio(): void {
    this.flightActive = false;
    if (this.engineVoice && this.ctx) {
      this.engineVoice.silence(this.ctx.currentTime);
    }
    if (this.ambienceTimer !== null) {
      clearInterval(this.ambienceTimer);
      this.ambienceTimer = null;
    }
  }

  public updateEnginePitch(speedRatio: number, alive: boolean, boosting: boolean): void {
    if (!this.ctx || !this.engineVoice) return;
    const t = this.ctx.currentTime;
    if (!alive || !this.flightActive) {
      this.engineVoice.silence(t);
      return;
    }
    this.engineVoice.update(Math.max(0, Math.min(1, speedRatio)), boosting, t);
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

  // ── One-shot effects (optional `pos` = heard from that point in the room) ────────────────────

  public playUiClick(): void {
    this.unlock();
    this.blip('sine', 660, 940, 0.11, 0.05);
  }

  public playPelletShot(heavy: boolean, pos?: SoundPos): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.blip(heavy ? 'square' : 'triangle', (heavy ? 240 : 480) * jitter, heavy ? 85 : 150, heavy ? 0.16 : 0.11, 0.08, pos);
  }

  public playHit(pos?: SoundPos): void {
    this.blip('sine', 320, 110, 0.18, 0.09, pos);
  }

  public playPopExplosion(pos?: SoundPos): void {
    this.blip('sawtooth', 380, 55, 0.28, 0.26, pos);
    this.noiseBurst('lowpass', 1800, 200, 0.22, 0.35, pos);
  }

  /** Shot bouncing off the golden spawn-protection bubble: bright glassy "plink". */
  public playDeflect(pos?: SoundPos): void {
    this.blip('sine', 2100, 2600, 0.08, 0.12, pos);
    this.blip('triangle', 3150, 3300, 0.05, 0.09, pos, 0.02);
  }

  /** Shot absorbed by the bubble-shield power-up: rubbery "boing". */
  public playShieldBoing(pos?: SoundPos): void {
    this.blip('sine', 180, 420, 0.14, 0.16, pos);
  }

  /** The bubble shield runs out and pops. */
  public playShieldPop(): void {
    this.noiseBurst('highpass', 2400, 900, 0.18, 0.12);
    this.blip('sine', 900, 300, 0.1, 0.1);
  }

  /** Repair tape: quick tape-rip zip. */
  public playRepair(): void {
    this.noiseBurst('bandpass', 1600, 4200, 0.16, 0.22, undefined, 3);
  }

  /**
   * Another plane brushing past: whoosh with a falling pitch (doppler-like), coloured by its
   * engine type so a jet hisses and a propeller plane buzzes.
   */
  public playFlyby(planeId: PlaneId, pos: SoundPos): void {
    const buzzy = planeId === 'windup_biplane' || planeId === 'diecast_bomber' || planeId === 'toy_helicopter';
    this.noiseBurst('bandpass', buzzy ? 900 : 2600, buzzy ? 300 : 700, buzzy ? 0.2 : 0.24, 0.55, pos, 1.6);
    const f0 =
      planeId === 'diecast_bomber'
        ? 120
        : planeId === 'toy_helicopter'
          ? 90
          : planeId === 'windup_biplane'
            ? 180
            : planeId === 'foam_glider' || planeId === 'paper_plane'
              ? 320
              : 520;
    this.blip(buzzy ? 'sawtooth' : 'triangle', f0 * 1.25, f0 * 0.7, 0.07, 0.5, pos);
  }

  public playVictoryFanfare(): void {
    this.unlock();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.blip('triangle', freq, freq, 0.14, 0.28, undefined, i * 0.09);
    });
  }

  public playPickup(): void {
    [587.33, 880].forEach((freq, idx) => {
      this.blip('sine', freq, freq * 1.15, 0.16, 0.11, undefined, idx * 0.055);
    });
  }

  public playPropBreak(pos?: SoundPos): void {
    // Toy plastic/ceramic pop & crunch
    [420, 260, 620].forEach((freq, idx) => {
      this.blip(idx === 2 ? 'sine' : 'square', freq, freq * 0.45, 0.13, 0.09, pos, idx * 0.03);
    });
    this.noiseBurst('bandpass', 2200, 600, 0.12, 0.25, pos, 1.5);
  }

  public playSecondaryUse(powerUpId: PowerUpId, pos?: SoundPos): void {
    if (powerUpId === 'rubber_missile' || powerUpId === 'firecracker') {
      this.blip('sawtooth', powerUpId === 'firecracker' ? 720 : 520, 160, 0.18, 0.24, pos);
    } else if (powerUpId === 'water_bomb' || powerUpId === 'glue_mine') {
      this.blip('sine', 340, 170, 0.19, 0.16, pos);
    } else if (powerUpId === 'bubble_shield') {
      // Bubble inflating
      this.blip('sine', 220, 660, 0.15, 0.3, pos);
    } else if (powerUpId === 'repair_tape') {
      this.playRepair();
    } else {
      this.blip('triangle', 440, 880, 0.16, 0.22, pos);
    }
  }

  public playVacuumAlert(): void {
    [480, 360, 480].forEach((freq, i) => {
      this.blip('sawtooth', freq, freq * 0.72, 0.15, 0.16, undefined, i * 0.18);
    });
  }
}

export const soundEngine = new SoundEngine();
