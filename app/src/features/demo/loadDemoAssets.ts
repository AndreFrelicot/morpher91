import { loadLocalImage } from "@/lib/image/loadImage";
import { loadLocalVideo } from "@/lib/video/loadVideo";
import { loadProjectFile } from "@/features/editor/projectFile";
import i18n from "@/i18n";
import { deserializeProject } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { localizePresetProject } from "./presetContent";
import { useProjectStore, type ImageSlot } from "@/store/projectStore";
import type { DemoAsset, DemoManifest, DemoPreset } from "./manifest";
import { parseDemoManifest } from "./manifest";

const DEMO_BASE = "/demo/";

export async function fetchDemoManifest(): Promise<DemoManifest> {
  const res = await fetch(`${DEMO_BASE}manifest.json`);
  if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
  return parseDemoManifest(await res.json());
}

async function fetchAsFile(asset: DemoAsset): Promise<File> {
  const res = await fetch(DEMO_BASE + asset.file);
  if (!res.ok) throw new Error(`${asset.file}: HTTP ${res.status}`);
  const blob = await res.blob();
  const name = asset.file.split("/").pop() ?? asset.id;
  const fallbackType = asset.kind === "video" ? "video/mp4" : "image/png";
  return new File([blob], name, { type: blob.type || fallbackType });
}

/**
 * Loads one demo asset into a project slot through the exact same pipeline as
 * a local file pick (loadLocalImage / loadLocalVideo → projectStore).
 *
 * Mixing an image with a video (either direction) is supported: the model is
 * per-slot by construction (independent setImage/setVideo, per-slot clip
 * status and render fallbacks), verified at runtime in M15 — so the dialog
 * deliberately allows heterogeneous A/B pairs.
 */
export async function loadDemoAssetIntoSlot(
  asset: DemoAsset,
  slot: ImageSlot,
): Promise<void> {
  const file = await fetchAsFile(asset);
  const store = useProjectStore.getState();
  if (asset.kind === "video") {
    store.setVideo(slot, await loadLocalVideo(file));
  } else {
    store.setImage(slot, await loadLocalImage(file));
  }
}

/** Reconnect bundled media without re-placing clips or changing the authored timeline. */
async function attachPresetVideo(
  asset: DemoAsset,
  slot: ImageSlot,
): Promise<void> {
  const file = await fetchAsFile(asset);
  const video = await loadLocalVideo(file);
  useProjectStore.getState().relinkVideo(slot, video);
}

/**
 * Opens a bundled example project through the exact same pipeline as the
 * TopBar Load button (self-contained .morph.json with embedded images).
 * Presets that declare `videos` then re-attach the bundled demo videos.
 */
export async function loadDemoPreset(
  preset: DemoPreset,
  manifest: DemoManifest,
): Promise<void> {
  const res = await fetch(DEMO_BASE + preset.file);
  if (!res.ok) throw new Error(`${preset.file}: HTTP ${res.status}`);
  const project = localizePresetProject(
    deserializeProject(await res.text()),
    preset,
    i18n.language,
  );
  const name = preset.file.split("/").pop() ?? `${preset.id}.morph.json`;
  await loadProjectFile(
    new File([JSON.stringify(project)], name, { type: "application/json" }),
  );
  const byId = new Map(manifest.assets.map((a) => [a.id, a]));
  for (const slot of ["source", "target"] as const) {
    const id = preset.videos?.[slot];
    const asset = id ? byId.get(id) : undefined;
    if (asset?.kind === "video") await attachPresetVideo(asset, slot);
  }
  const start = preset.presentation;
  if (start) {
    const editor = useEditorStore.getState();
    editor.setTab(start.view === "compare" ? "compare" : "studio");
    if (start.view !== "compare") editor.setStudioView(start.view);
    editor.setTimelineTime(
      Math.min(start.timeSec, project.timeline.durationSec),
      project.timeline.durationSec,
    );
    if (
      start.layerId &&
      project.layers.some((layer) => layer.id === start.layerId)
    )
      editor.setActiveLayer(start.layerId);
    if (
      start.featureId &&
      project.features.some((feature) => feature.id === start.featureId)
    )
      editor.selectFeature(start.featureId, "replace");
  }
}
