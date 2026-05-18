const MUTE_KEY = "foodoro-kitchen-mute";

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === "closed") {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      _ctx = new Ctor();
    }
    return _ctx;
  } catch {
    return null;
  }
}

export async function unlockAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    /* ignore */
  }
}

function playTone(
  frequency: number,
  duration: number,
  volume = 0.25,
  delayFromNow = 0,
): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== "running") return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delayFromNow);

  gainNode.gain.setValueAtTime(0.001, ctx.currentTime + delayFromNow);
  gainNode.gain.linearRampToValueAtTime(
    volume,
    ctx.currentTime + delayFromNow + 0.02,
  );
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + delayFromNow + duration,
  );

  oscillator.start(ctx.currentTime + delayFromNow);
  oscillator.stop(ctx.currentTime + delayFromNow + duration + 0.05);
}

export function playNewOrderAlert(): void {
  try {
    playTone(880, 0.13, 0.28, 0);
    playTone(1100, 0.16, 0.28, 0.17);
  } catch {
    /* ignore */
  }
}
