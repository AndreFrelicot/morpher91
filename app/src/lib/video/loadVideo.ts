import {
  defaultPlacement,
  type ImageAsset,
  type VideoAsset,
} from "@/morph/model";
import { disposeLoadedImage, type LoadedImage } from "@/lib/image/loadImage";

export type LoadedVideo = {
  asset: VideoAsset;
  element: HTMLVideoElement;
  poster: LoadedImage;
  objectUrl: string;
};

const SEEK_EPSILON_SEC = 1 / 60;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

function waitForMediaEvent(
  video: HTMLVideoElement,
  event: keyof HTMLMediaElementEventMap,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out while reading video "${video.currentSrc}".`));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Could not decode video "${video.currentSrc}".`));
    };
    video.addEventListener(event, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

export async function seekVideoElement(
  video: HTMLVideoElement,
  timeSec: number,
): Promise<void> {
  if (video.readyState < HAVE_METADATA) {
    await waitForMediaEvent(video, "loadedmetadata");
  }
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const target = Math.min(duration, Math.max(0, timeSec));

  if (Math.abs(video.currentTime - target) <= SEEK_EPSILON_SEC) {
    if (video.readyState < HAVE_CURRENT_DATA) {
      await waitForMediaEvent(video, "loadeddata");
    }
    return;
  }

  video.pause();
  const seeked = waitForMediaEvent(video, "seeked");
  video.currentTime = target;
  await seeked;
}

function createCanvas(
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function videoPosterBitmap(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a video poster canvas.");
  ctx.drawImage(video, 0, 0, width, height);
  return createImageBitmap(canvas);
}

export function createVideoElementForUrl(url: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.load();
  return video;
}

function releaseVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

const disposedVideoElements = new WeakSet<HTMLVideoElement>();

export async function loadLocalVideo(file: File): Promise<LoadedVideo> {
  const objectUrl = URL.createObjectURL(file);
  const element = createVideoElementForUrl(objectUrl);

  try {
    await waitForMediaEvent(element, "loadedmetadata");
    await seekVideoElement(element, 0);
    const width = element.videoWidth || 1;
    const height = element.videoHeight || 1;
    const durationSec = Number.isFinite(element.duration)
      ? element.duration
      : 0;
    const posterBitmap = await videoPosterBitmap(element, width, height);
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;

    const videoAsset: VideoAsset = {
      id: crypto.randomUUID(),
      name: file.name,
      width,
      height,
      durationSec,
      fingerprint,
      source: { kind: "object-url", value: objectUrl },
      timeline: {
        startSec: 0,
        inSec: 0,
        durationSec,
      },
    };
    const posterAsset: ImageAsset = {
      id: crypto.randomUUID(),
      name: file.name,
      width,
      height,
      source: { kind: "object-url", value: objectUrl },
      placement: defaultPlacement(),
    };

    return {
      asset: videoAsset,
      element,
      poster: { asset: posterAsset, bitmap: posterBitmap },
      objectUrl,
    };
  } catch (err) {
    releaseVideoElement(element);
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export function disposeLoadedVideo(video: LoadedVideo): void {
  if (disposedVideoElements.has(video.element)) return;
  disposedVideoElements.add(video.element);
  releaseVideoElement(video.element);
  disposeLoadedImage(video.poster);
  URL.revokeObjectURL(video.objectUrl);
}
