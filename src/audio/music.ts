import { MUSIC_TRACKS, type MusicMoment, type MusicTrack } from './musicTracks';
import { soundEngine } from './soundEngine';

/** A playing track: can fade out and stop. */
interface PlayingTrack {
  stop(fadeSeconds: number): void;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ── Built-in pieces (eighth-note grids, 4 bars looping) ─────────────────────────────────────────

interface Piece {
  bpm: number;
  melody: Array<number | null>; // 32 eighth notes (MIDI), null = rest
  bass: Array<number | null>; // 32 eighth notes
  drums: boolean;
  bell: boolean; // music-box bell timbre (else bright square lead)
}

const PIECES: Record<NonNullable<MusicTrack['procedural']>, Piece> = {
  // Gentle music-box lullaby: C – Am – F – G
  music_box: {
    bpm: 84,
    melody: [
      76, null, 72, 74, 76, null, 79, null,
      72, null, 69, 72, 76, null, 74, null,
      72, null, 69, 65, 69, 72, 77, null,
      74, null, 71, 67, 71, 74, 79, 77,
    ],
    bass: [
      48, null, null, null, 55, null, null, null,
      45, null, null, null, 52, null, null, null,
      41, null, null, null, 48, null, null, null,
      43, null, null, null, 50, null, null, null,
    ],
    drums: false,
    bell: true,
  },
  // Toy soldier march: C – F – G – C
  toy_march: {
    bpm: 126,
    melody: [
      72, 72, 76, 79, 76, 72, 74, 76,
      77, 77, 81, 77, 76, 74, 72, 74,
      74, 71, 74, 79, 77, 74, 71, 74,
      76, 79, 76, 72, 72, null, 67, null,
    ],
    bass: [
      48, null, 55, null, 48, null, 55, null,
      41, null, 48, null, 41, null, 48, null,
      43, null, 50, null, 43, null, 50, null,
      48, null, 55, null, 48, null, 43, null,
    ],
    drums: true,
    bell: false,
  },
};

/** Live sequencer for a built-in piece (Web Audio scheduling with a short look-ahead). */
function startProcedural(kind: NonNullable<MusicTrack['procedural']>, getTempoScale: () => number): PlayingTrack | null {
  const ctx = soundEngine.getContext();
  const bus = soundEngine.getMusicBus();
  const noiseBuf = soundEngine.getNoiseBuffer();
  if (!ctx || !bus) return null;
  const piece = PIECES[kind];

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.2);
  out.connect(bus);

  const note = (freq: number, t: number, dur: number, type: OscillatorType, vol: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const noiseHit = (t: number, freq: number, type: BiquadFilterType, dur: number, vol: number) => {
    if (!noiseBuf) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  };

  let step = 0;
  let nextTime = ctx.currentTime + 0.1;
  const schedule = (i: number, t: number) => {
    const m = piece.melody[i % 32];
    const b = piece.bass[i % 32];
    const eighth = 60 / (piece.bpm * getTempoScale()) / 2;
    if (m !== null) {
      if (piece.bell) {
        // Music-box tine: pure tone + faint octave, long ring
        note(midi(m), t, 1.4, 'sine', 0.12);
        note(midi(m) * 2.01, t, 0.6, 'sine', 0.03);
      } else {
        note(midi(m), t, eighth * 0.9, 'square', 0.045);
      }
    }
    if (b !== null) note(midi(b), t, piece.bell ? 1.2 : eighth * 1.8, 'triangle', piece.bell ? 0.1 : 0.14);
    if (piece.drums) {
      const beatInBar = i % 8;
      if (beatInBar === 0 || beatInBar === 4) {
        // Kick: quick sine drop
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 0.15);
      }
      if (beatInBar === 2 || beatInBar === 6) noiseHit(t, 1800, 'bandpass', 0.13, 0.12);
      noiseHit(t, 7000, 'highpass', 0.03, beatInBar % 2 === 0 ? 0.05 : 0.03);
    }
  };

  const timer = window.setInterval(() => {
    while (nextTime < ctx.currentTime + 0.15) {
      schedule(step, nextTime);
      nextTime += 60 / (piece.bpm * getTempoScale()) / 2;
      step++;
    }
  }, 25);

  return {
    stop(fade: number) {
      window.clearInterval(timer);
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
      window.setTimeout(() => out.disconnect(), (fade + 1.6) * 1000);
    },
  };
}

/** External music file through the music bus (so the music volume setting applies). */
function startFile(track: MusicTrack, loop: boolean, onEnded: () => void, onError: () => void): PlayingTrack | null {
  const ctx = soundEngine.getContext();
  const bus = soundEngine.getMusicBus();
  if (!ctx || !bus || !track.sources?.length) return null;
  const probe = document.createElement('audio');
  const src = track.sources.find((s) => {
    const ext = s.split('.').pop()?.toLowerCase() ?? '';
    const mime =
      ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' || ext === 'aac' ? 'audio/mp4' : ext === 'opus' ? 'audio/ogg; codecs=opus' : `audio/${ext}`;
    return probe.canPlayType(mime) !== '';
  });
  if (!src) return null;

  const el = new Audio(src);
  el.loop = loop;
  el.preload = 'auto';
  const node = ctx.createMediaElementSource(el);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 1.5);
  node.connect(out);
  out.connect(bus);
  let stopped = false;
  el.addEventListener('ended', () => {
    if (!stopped) onEnded();
  });
  el.addEventListener('error', () => {
    if (!stopped) onError();
  });
  void el.play().catch(() => {
    if (!stopped) onError();
  });

  return {
    stop(fade: number) {
      stopped = true;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
      window.setTimeout(() => {
        el.pause();
        out.disconnect();
      }, (fade + 0.2) * 1000);
    },
  };
}

class MusicPlayer {
  private moment: MusicMoment | 'off' = 'off';
  private playing: PlayingTrack | null = null;
  private nextIndex: Record<MusicMoment, number> = { menu: 0, match: 0 };
  private tempoScale = 1;

  /** Chooses what plays: title/lobby music, in-flight music, or silence. */
  public setMoment(moment: MusicMoment | 'off'): void {
    if (moment === this.moment) return;
    this.moment = moment;
    soundEngine.onUnlock(() => this.startCurrent());
  }

  /** Sudden death: the march speeds up. */
  public setIntensity(urgent: boolean): void {
    this.tempoScale = urgent ? 1.15 : 1;
  }

  private startCurrent(failedFile = false): void {
    this.playing?.stop(1.0);
    this.playing = null;
    const moment = this.moment;
    if (moment === 'off') return;

    const tracks = MUSIC_TRACKS.filter((t) => t.moment === moment);
    const files = tracks.filter((t) => t.sources?.length);
    const builtIn = tracks.find((t) => t.procedural);

    if (files.length > 0 && !failedFile) {
      const track = files[this.nextIndex[moment] % files.length];
      this.nextIndex[moment]++;
      this.playing = startFile(
        track,
        files.length === 1,
        () => this.moment === moment && this.startCurrent(),
        () => this.moment === moment && this.startCurrent(true)
      );
      if (this.playing) return;
    }
    if (builtIn?.procedural) {
      this.playing = startProcedural(builtIn.procedural, () => this.tempoScale);
    }
  }
}

export const music = new MusicPlayer();
