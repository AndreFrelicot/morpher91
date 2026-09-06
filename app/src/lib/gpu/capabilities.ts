/**
 * Runtime feature detection (PRD §14.1, §21).
 * WebGPU requires a secure context; WebCodecs gates MP4 export.
 */

export function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function isWebCodecsSupported(): boolean {
  return typeof globalThis !== "undefined" && "VideoEncoder" in globalThis;
}
