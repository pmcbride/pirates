import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAudioForTests,
  isMuted,
  playSfx,
  setMuted,
  type SfxName,
} from "./audio";

// --- Web Audio mock ------------------------------------------------------

interface MockOscillator {
  type: OscillatorType;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> };
  detune: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockGain {
  gain: {
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

const oscillators: MockOscillator[] = [];
const gains: MockGain[] = [];

const createOscillator = (): MockOscillator => {
  const osc: MockOscillator = {
    type: "sine",
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    detune: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  oscillators.push(osc);
  return osc;
};

const createGain = (): MockGain => {
  const gain: MockGain = {
    gain: {
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  gains.push(gain);
  return gain;
};

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  state: AudioContextState = "running";
  resume = vi.fn(async () => undefined);
  createOscillator = createOscillator;
  createGain = createGain;
  createBuffer = (channels: number, frames: number, sampleRate: number) => {
    const data = new Float32Array(frames);
    return {
      sampleRate,
      length: frames,
      numberOfChannels: channels,
      getChannelData: () => data,
    };
  };
  createBufferSource = () => ({
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  createBiquadFilter = () => ({
    type: "highpass" as BiquadFilterType,
    frequency: { value: 0 },
    connect: vi.fn(),
  });
}

const globalAny = globalThis as unknown as { AudioContext?: unknown; localStorage?: Storage };

const installMockStorage = (): void => {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  globalAny.localStorage = storage;
};

const removeMockStorage = (): void => {
  if ("window" in globalThis) {
    delete (globalThis as { window?: unknown }).window;
  }
  delete globalAny.localStorage;
};

beforeEach(() => {
  oscillators.length = 0;
  gains.length = 0;
  globalAny.AudioContext = MockAudioContext;
  installMockStorage();
  __resetAudioForTests();
});

afterEach(() => {
  delete globalAny.AudioContext;
  removeMockStorage();
  __resetAudioForTests();
});

describe("audio.playSfx", () => {
  it("creates at least one oscillator when unmuted", () => {
    playSfx("stamp-drop");
    expect(oscillators.length).toBeGreaterThan(0);
    expect(gains.length).toBeGreaterThan(0);
    expect(oscillators[0].start).toHaveBeenCalled();
  });

  it("emits the rising arpeggio for `success` (4 tones)", () => {
    playSfx("success");
    // success = 4-note triangle arpeggio
    expect(oscillators.length).toBeGreaterThanOrEqual(4);
    expect(oscillators[0].type).toBe("triangle");
  });

  it("no-ops when muted", () => {
    setMuted(true);
    playSfx("collect");
    expect(oscillators.length).toBe(0);
    expect(gains.length).toBe(0);
  });

  it("isMuted reflects setMuted", () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it("persists muted state across resets", () => {
    setMuted(true);
    __resetAudioForTests();
    // localStorage flag survives the in-memory reset
    expect(isMuted()).toBe(true);
  });

  it("no-ops when AudioContext is unavailable", () => {
    delete globalAny.AudioContext;
    __resetAudioForTests();
    expect(() => playSfx("sail")).not.toThrow();
    expect(oscillators.length).toBe(0);
  });

  it("handles every sfx name without throwing", () => {
    const names: SfxName[] = [
      "sail",
      "turn",
      "fire",
      "dodge",
      "collect",
      "talk",
      "fail",
      "success",
      "stamp-drop",
      "reward-claim",
    ];
    for (const name of names) {
      expect(() => playSfx(name)).not.toThrow();
    }
  });
});
