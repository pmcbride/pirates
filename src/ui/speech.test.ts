/**
 * @vitest-environment jsdom
 *
 * Gating contract for the Web Speech wrapper:
 *   - speaks at the kid-friendly 0.9 rate,
 *   - cancels in-flight speech before each new utterance,
 *   - is a strict no-op when muted or when the API is missing,
 *   - never throws when the engine misbehaves.
 *
 * jsdom has no speechSynthesis, so a mock is installed per test — which is
 * also exactly the "unsupported" path when it's absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSpeechForTests,
  isSpeechSupported,
  setSpeechMuted,
  speak,
} from "./speech";

class FakeUtterance {
  text: string;
  rate = 1;
  volume = 1;
  constructor(text = "") {
    this.text = text;
  }
}

interface SynthMock {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

const installSynthMock = (): SynthMock => {
  const mock: SynthMock = { speak: vi.fn(), cancel: vi.fn() };
  Object.defineProperty(window, "speechSynthesis", {
    value: mock,
    configurable: true,
    writable: true,
  });
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    FakeUtterance;
  return mock;
};

const removeSynthMock = (): void => {
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  delete (globalThis as { SpeechSynthesisUtterance?: unknown })
    .SpeechSynthesisUtterance;
};

describe("speech — speak()", () => {
  let synth: SynthMock;

  beforeEach(() => {
    __resetSpeechForTests();
    synth = installSynthMock();
  });

  afterEach(() => {
    removeSynthMock();
  });

  it("speaks the text at rate 0.9", () => {
    speak("Collect the chest!");
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe("Collect the chest!");
    expect(utterance.rate).toBeCloseTo(0.9);
  });

  it("cancels in-flight speech before every new utterance", () => {
    speak("First line");
    speak("Second line");
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(synth.speak).toHaveBeenCalledTimes(2);
    const last = synth.speak.mock.calls[1][0] as FakeUtterance;
    expect(last.text).toBe("Second line");
  });

  it("ignores empty and whitespace-only text", () => {
    speak("");
    speak("   ");
    expect(synth.speak).not.toHaveBeenCalled();
    expect(synth.cancel).not.toHaveBeenCalled();
  });

  it("never throws when the engine throws", () => {
    synth.speak.mockImplementation(() => {
      throw new Error("engine exploded");
    });
    expect(() => speak("Boom")).not.toThrow();
  });
});

describe("speech — mute gating", () => {
  let synth: SynthMock;

  beforeEach(() => {
    __resetSpeechForTests();
    synth = installSynthMock();
  });

  afterEach(() => {
    removeSynthMock();
  });

  it("is a no-op while muted", () => {
    setSpeechMuted(true);
    speak("Should stay silent");
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("cancels in-flight speech the moment mute flips on", () => {
    speak("Long sentence underway");
    synth.cancel.mockClear();
    setSpeechMuted(true);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it("speaks again after unmuting", () => {
    setSpeechMuted(true);
    speak("Silent");
    setSpeechMuted(false);
    speak("Audible again");
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe("Audible again");
  });
});

describe("speech — unsupported platform", () => {
  beforeEach(() => {
    __resetSpeechForTests();
    removeSynthMock();
  });

  it("reports unsupported and no-ops without throwing", () => {
    expect(isSpeechSupported()).toBe(false);
    expect(() => speak("Nobody is listening")).not.toThrow();
    expect(() => setSpeechMuted(true)).not.toThrow();
    expect(() => setSpeechMuted(false)).not.toThrow();
  });
});
