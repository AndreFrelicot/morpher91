/** Shared timeline geometry and timecode helpers (dock + playback ruler). */

export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export function pct(sec: number, durationSec: number): string {
  return `${(sec / Math.max(0.001, durationSec)) * 100}%`;
}

export function formatTimecode(sec: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(sec * safeFps));
  const wholeSeconds = Math.floor(totalFrames / safeFps);
  const frames = totalFrames % safeFps;
  return `${wholeSeconds.toString().padStart(2, "0")}:${frames
    .toString()
    .padStart(2, "0")}`;
}

function rulerMajorStep(durationSec: number): number {
  if (durationSec <= 8) return 1;
  if (durationSec <= 20) return 2;
  if (durationSec <= 60) return 5;
  if (durationSec <= 180) return 10;
  return 30;
}

export function buildRulerTicks(durationSec: number) {
  const majorStep = rulerMajorStep(durationSec);
  const minorStep = majorStep / 4;
  const ticks: { sec: number; major: boolean }[] = [];
  const tickCount = Math.ceil(durationSec / minorStep);
  for (let i = 0; i <= tickCount; i += 1) {
    const sec = Math.min(durationSec, i * minorStep);
    const major =
      Math.abs(sec / majorStep - Math.round(sec / majorStep)) < 0.01;
    ticks.push({ sec, major });
  }
  if (ticks[ticks.length - 1]?.sec !== durationSec) {
    ticks.push({ sec: durationSec, major: true });
  }
  return ticks;
}
