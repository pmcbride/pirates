/**
 * Voice narration for Sea of Codes via the Web Speech API.
 *
 * The target player is a 5-year-old PRE-READER: every on-screen sentence
 * (mission objective, hint reason + fix, reward line) is invisible to them
 * unless it is spoken aloud. This module wraps `window.speechSynthesis`
 * with the same defensive posture as `./audio.ts`:
 *
 *   - No-op when the API is unsupported (old WebViews, jsdom).
 *   - Gated off by the profile's mute switch (one switch silences both
 *     sfx and speech — see the HUD store subscription).
 *   - New speech cancels any in-flight utterance — the latest state is the
 *     only one worth hearing; queueing would lag the screen badly.
 *   - Primed on the first user gesture: iOS/Safari only let utterances
 *     start inside a gesture, so a one-time pointerdown listener speaks a
 *     silent utterance to unlock the engine (mirrors the lazy
 *     AudioContext-resume pattern in `./audio.ts`).
 *
 * Speech must never break gameplay — every API touch is try/caught.
 */

const SPEECH_RATE = 0.9;

type UtteranceCtor = new (text?: string) => SpeechSynthesisUtterance;

let muted = false;
let primed = false;
let unlockInstalled = false;
let failureWarned = false;

/**
 * Warn the first time narration breaks, then go quiet. Speech is the only
 * information channel a pre-reader has — when it dies on a device, that has
 * to be diagnosable (BootScene sets the same precedent for painted art), but
 * a broken engine erroring on every line must not spam the console.
 */
const warnOnce = (context: string, detail?: unknown): void => {
  if (failureWarned) {
    return;
  }
  failureWarned = true;
  console.warn(`[speech] narration unavailable (${context})`, detail ?? "");
};

/** Resolve the synth lazily — never cached, so tests can swap the global. */
const getSynth = (): SpeechSynthesis | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const synth = (window as Window & { speechSynthesis?: SpeechSynthesis })
    .speechSynthesis;
  return synth ?? null;
};

const getUtteranceCtor = (): UtteranceCtor | null => {
  const ctor = (globalThis as { SpeechSynthesisUtterance?: UtteranceCtor })
    .SpeechSynthesisUtterance;
  return ctor ?? null;
};

/**
 * Speak a silent utterance inside the current (gesture) call stack so the
 * engine accepts later non-gesture speech (hint banners fire from playback
 * timers, not taps). Harmless on platforms that don't need priming.
 */
const primeOnGesture = (): void => {
  if (primed) {
    return;
  }
  const synth = getSynth();
  const Ctor = getUtteranceCtor();
  if (!synth || !Ctor) {
    return;
  }
  try {
    const utterance = new Ctor("");
    utterance.volume = 0;
    synth.speak(utterance);
    // Mark primed only after the engine accepted the utterance — a throw
    // leaves the flag unset so a later explicit gesture could retry.
    primed = true;
  } catch (err) {
    warnOnce("gesture priming failed", err);
  }
};

const installUnlockListener = (): void => {
  if (unlockInstalled || typeof window === "undefined") {
    return;
  }
  unlockInstalled = true;
  window.addEventListener("pointerdown", primeOnGesture, {
    once: true,
    capture: true,
  });
};

// Arm the unlock as soon as the module loads in a browser — the very first
// tap anywhere (Set Sail, captain pick) primes the engine.
installUnlockListener();

/** Gate speech on the profile mute switch. Cancels in-flight speech when muting. */
export const setSpeechMuted = (value: boolean): void => {
  muted = value;
  if (muted) {
    try {
      getSynth()?.cancel();
    } catch {
      // ignore — engine may already be torn down
    }
  }
};

export const isSpeechMuted = (): boolean => muted;

/** True when the platform can speak at all. */
export const isSpeechSupported = (): boolean =>
  getSynth() !== null && getUtteranceCtor() !== null;

/**
 * Speak `text` aloud at a kid-friendly rate. Cancels whatever was already
 * being spoken — callers fire on state *changes*, so the newest line wins.
 * Empty / whitespace-only text is a no-op.
 */
export const speak = (text: string): void => {
  const trimmed = text.trim();
  if (trimmed.length === 0 || muted) {
    return;
  }
  const synth = getSynth();
  const Ctor = getUtteranceCtor();
  if (!synth || !Ctor) {
    return;
  }
  try {
    synth.cancel();
    const utterance = new Ctor(trimmed);
    utterance.rate = SPEECH_RATE;
    // speak() itself rarely throws — real failures (not-allowed, audio-busy,
    // synthesis-failed) arrive async on the utterance's error event.
    utterance.onerror = (event) => {
      const error = (event as SpeechSynthesisErrorEvent).error;
      // "interrupted"/"canceled" are the expected result of our own
      // cancel-prior-on-new-speak policy, not failures.
      if (error !== "interrupted" && error !== "canceled") {
        warnOnce(`utterance error: ${error}`);
      }
    };
    synth.speak(utterance);
  } catch (err) {
    warnOnce("speak threw", err);
  }
};

/** Reset module state — test-only helper (mirrors `__resetAudioForTests`). */
export const __resetSpeechForTests = (): void => {
  muted = false;
  primed = false;
  failureWarned = false;
  // Leave `unlockInstalled` alone — the once-listener already consumed
  // itself or is still armed; re-installing per test would stack handlers.
};
