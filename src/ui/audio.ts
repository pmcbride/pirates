/**
 * Tiny Web Audio synthesizer for Sea of Codes.
 *
 * All sfx are synthesized inline via OscillatorNode + GainNode (+ a noise
 * burst for `fire`) so we keep bundle size flat — no audio assets shipped.
 *
 * Browsers require a user gesture before an AudioContext can produce sound,
 * so the context is created lazily inside playSfx(). On first call we also
 * try to resume() in case the context starts suspended.
 */

export type SfxName =
  | "sail"
  | "turn"
  | "fire"
  | "dodge"
  | "collect"
  | "talk"
  | "fail"
  | "success"
  | "stamp-drop"
  | "reward-claim";

type AudioContextCtor = new (contextOptions?: AudioContextOptions) => AudioContext;

const MUTE_STORAGE_KEY = "sea-of-codes/audio/muted";

let muted = false;
let mutedHydrated = false;
let context: AudioContext | null = null;

const hydrateMute = (): void => {
  if (mutedHydrated || typeof window === "undefined") {
    return;
  }
  mutedHydrated = true;
  try {
    muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    muted = false;
  }
};

const persistMute = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // ignore quota / privacy mode failures
  }
};

const getContext = (): AudioContext | null => {
  if (context) {
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    return context;
  }
  const globalAny = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = globalAny.AudioContext ?? globalAny.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  try {
    context = new Ctor();
  } catch {
    context = null;
    return null;
  }
  if (context && context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
  return context;
};

export const isMuted = (): boolean => {
  hydrateMute();
  return muted;
};

export const setMuted = (value: boolean): void => {
  hydrateMute();
  muted = value;
  persistMute();
};

/** Reset state — test-only helper. */
export const __resetAudioForTests = (): void => {
  context = null;
  muted = false;
  mutedHydrated = false;
};

const envelope = (
  ctx: AudioContext,
  gainNode: GainNode,
  peak: number,
  attack: number,
  release: number,
  startTime: number,
): number => {
  const start = Math.max(startTime, ctx.currentTime);
  gainNode.gain.cancelScheduledValues(start);
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), start + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  return start + attack + release;
};

const tone = (
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  options: {
    type?: OscillatorType;
    peak?: number;
    attack?: number;
    release?: number;
    sweepTo?: number;
    detune?: number;
  } = {},
): number => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(freq, Math.max(startTime, ctx.currentTime));
  if (options.detune) {
    osc.detune.setValueAtTime(options.detune, Math.max(startTime, ctx.currentTime));
  }
  if (options.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(options.sweepTo, 1),
      Math.max(startTime, ctx.currentTime) + duration,
    );
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  const end = envelope(
    ctx,
    gain,
    options.peak ?? 0.18,
    options.attack ?? 0.01,
    options.release ?? duration,
    startTime,
  );
  osc.start(Math.max(startTime, ctx.currentTime));
  osc.stop(end + 0.02);
  return end;
};

const noiseBurst = (
  ctx: AudioContext,
  startTime: number,
  duration: number,
  peak = 0.22,
): number => {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // shape: bright at the start, fade to nothing
    const env = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 800;
  const gain = ctx.createGain();
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  const start = Math.max(startTime, ctx.currentTime);
  envelope(ctx, gain, peak, 0.005, duration, start);
  source.start(start);
  source.stop(start + duration + 0.02);
  return start + duration;
};

const renderSfx = (ctx: AudioContext, name: SfxName): void => {
  const now = ctx.currentTime;
  switch (name) {
    case "sail": {
      // breathy whoosh: short low sine sweeping up
      tone(ctx, 220, now, 0.22, {
        type: "sine",
        peak: 0.12,
        sweepTo: 360,
        release: 0.22,
      });
      noiseBurst(ctx, now, 0.18, 0.06);
      return;
    }
    case "turn": {
      tone(ctx, 180, now, 0.12, { type: "triangle", peak: 0.16, release: 0.12 });
      return;
    }
    case "fire": {
      // bright pop: noise burst + a quick square chirp
      noiseBurst(ctx, now, 0.12, 0.28);
      tone(ctx, 540, now, 0.1, {
        type: "square",
        peak: 0.16,
        sweepTo: 220,
        release: 0.1,
      });
      return;
    }
    case "dodge": {
      tone(ctx, 520, now, 0.18, {
        type: "sine",
        peak: 0.14,
        sweepTo: 880,
        release: 0.18,
      });
      return;
    }
    case "collect": {
      // sparkle chord: three rising fifths
      const notes = [523.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        tone(ctx, freq, now + i * 0.06, 0.22, {
          type: "sine",
          peak: 0.13,
          release: 0.22,
        });
      });
      return;
    }
    case "talk": {
      tone(ctx, 440, now, 0.12, { type: "triangle", peak: 0.14, release: 0.12 });
      tone(ctx, 660, now + 0.08, 0.12, { type: "triangle", peak: 0.12, release: 0.12 });
      return;
    }
    case "fail": {
      // gentle descending minor third
      tone(ctx, 392, now, 0.22, { type: "sine", peak: 0.16, release: 0.22 });
      tone(ctx, 311.13, now + 0.18, 0.32, {
        type: "sine",
        peak: 0.16,
        release: 0.32,
      });
      return;
    }
    case "success": {
      // rising arpeggio C-E-G-C
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        tone(ctx, freq, now + i * 0.09, 0.2, {
          type: "triangle",
          peak: 0.15,
          release: 0.22,
        });
      });
      return;
    }
    case "stamp-drop": {
      tone(ctx, 320, now, 0.08, { type: "square", peak: 0.12, release: 0.08 });
      return;
    }
    case "reward-claim": {
      // victory horn — three sustained notes
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        tone(ctx, freq, now + i * 0.12, 0.3, {
          type: "triangle",
          peak: 0.18,
          release: 0.32,
        });
      });
      return;
    }
  }
};

export const playSfx = (name: SfxName): void => {
  hydrateMute();
  if (muted) {
    return;
  }
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  try {
    renderSfx(ctx, name);
  } catch {
    // never let an audio glitch break gameplay
  }
};
