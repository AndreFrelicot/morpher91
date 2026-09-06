import {
  defaultPlacement,
  type ImageAsset,
  type MorphProject,
} from "@/morph/model";

export type LoadedImage = { asset: ImageAsset; bitmap: ImageBitmap };
export type HydratedProjectImages = {
  project: MorphProject;
  source: LoadedImage | null;
  target: LoadedImage | null;
};

const disposedBitmaps = new WeakSet<ImageBitmap>();

/** Releases an owned preview bitmap exactly once, even through aliased wrappers. */
export function disposeLoadedImage(image: LoadedImage | null): void {
  if (!image || disposedBitmaps.has(image.bitmap)) return;
  disposedBitmaps.add(image.bitmap);
  image.bitmap.close();
}

/** Cap the longest preview edge (PRD §17.2). Export can re-decode at full size. */
const MAX_PREVIEW_EDGE = 1536;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read image data."));
    reader.readAsDataURL(blob);
  });
}

async function createPreviewBitmap(
  blob: Blob,
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const probe = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const width = probe.width;
  const height = probe.height;

  const maxDim = Math.max(probe.width, probe.height);
  if (maxDim <= MAX_PREVIEW_EDGE) return { bitmap: probe, width, height };

  const scale = MAX_PREVIEW_EDGE / maxDim;
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
    resizeWidth: Math.round(probe.width * scale),
    resizeHeight: Math.round(probe.height * scale),
    resizeQuality: "high",
  });
  probe.close();
  return { bitmap, width, height };
}

/**
 * Loads a local image file into a GPU-friendly ImageBitmap + serializable asset.
 * EXIF orientation is applied; oversized images are downscaled for preview.
 */
export async function loadLocalImage(file: File): Promise<LoadedImage> {
  // Read first so a FileReader failure cannot orphan an already-decoded bitmap.
  const dataUrl = await blobToDataUrl(file);
  const preview = await createPreviewBitmap(file);

  const asset: ImageAsset = {
    id: crypto.randomUUID(),
    name: file.name,
    width: preview.width,
    height: preview.height,
    source: { kind: "data-url", value: dataUrl },
    placement: defaultPlacement(),
  };

  return { asset, bitmap: preview.bitmap };
}

export async function loadImageAsset(
  asset: ImageAsset,
): Promise<LoadedImage | null> {
  if (asset.source.kind !== "data-url" && asset.source.kind !== "object-url") {
    return null;
  }

  const response = await fetch(asset.source.value);
  if (!response.ok) {
    throw new Error(`Could not load embedded image "${asset.name}".`);
  }

  const preview = await createPreviewBitmap(await response.blob());
  return {
    asset: { ...asset, width: preview.width, height: preview.height },
    bitmap: preview.bitmap,
  };
}

export async function hydrateProjectImages(
  project: MorphProject,
): Promise<HydratedProjectImages> {
  const results = await Promise.allSettled([
    loadImageAsset(project.images.source),
    loadImageAsset(project.images.target),
  ]);
  const sourceResult = results[0];
  const targetResult = results[1];
  const releaseFulfilled = () => {
    for (const result of results) {
      if (result.status === "fulfilled") disposeLoadedImage(result.value);
    }
  };
  if (sourceResult.status === "rejected") {
    releaseFulfilled();
    throw sourceResult.reason;
  }
  if (targetResult.status === "rejected") {
    releaseFulfilled();
    throw targetResult.reason;
  }
  const source = sourceResult.value;
  const target = targetResult.value;

  return {
    project: {
      ...project,
      images: {
        source: source?.asset ?? project.images.source,
        target: target?.asset ?? project.images.target,
      },
    },
    source,
    target,
  };
}
