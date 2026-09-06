import { File as NodeFile } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, afterEach } from "vitest";
import { deserializeProject, type VideoAsset } from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { loadLocalVideo } from "@/lib/video/loadVideo";
import { loadDemoPreset } from "./loadDemoAssets";
import { parseDemoManifest } from "./manifest";

vi.mock("@/lib/video/loadVideo", () => ({
  loadLocalVideo: vi.fn(),
  disposeLoadedVideo: vi.fn(),
}));
vi.mock("@/features/editor/projectFile", () => ({
  loadProjectFile: async (file: File) => {
    useProjectStore
      .getState()
      .loadProject(deserializeProject(await file.text()));
  },
}));
const demo = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/demo",
);
const manifest = parseDemoManifest(
  JSON.parse(readFileSync(join(demo, "manifest.json"), "utf8")),
);

afterEach(() => {
  useProjectStore.getState().resetProject();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("bundled video preset loading", () => {
  it.each(manifest.presets.filter((preset) => preset.videos))(
    "$id preserves its authored edit when both media are reconnected",
    async (preset) => {
      const json = readFileSync(join(demo, preset.file), "utf8");
      const authored = deserializeProject(json);
      vi.stubGlobal("File", NodeFile);
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async (url: string) =>
            new Response(url.endsWith(".json") ? json : "video bytes"),
        ),
      );
      for (const slot of ["source", "target"] as const) {
        if (!preset.videos?.[slot]) continue;
        const saved = authored.videos![slot]!;
        const asset: VideoAsset = {
          ...saved,
          id: `new-${slot}`,
          timeline: { startSec: 0, inSec: 0, durationSec: saved.durationSec },
        };
        vi.mocked(loadLocalVideo).mockResolvedValueOnce({
          asset,
          objectUrl: `blob:${slot}`,
          element: {
            pause: vi.fn(),
            removeAttribute: vi.fn(),
            load: vi.fn(),
          } as unknown as HTMLVideoElement,
          poster: {
            asset: authored.images[slot],
            bitmap: { close: vi.fn() } as unknown as ImageBitmap,
          },
        });
      }
      await loadDemoPreset(preset, manifest);
      const loaded = useProjectStore.getState().project!;
      expect(loaded.timeline).toEqual(authored.timeline);
      expect(loaded.layers.map((layer) => layer.clip)).toEqual(
        authored.layers.map((layer) => layer.clip),
      );
      expect(loaded.features.map((feature) => feature.tracks)).toEqual(
        authored.features.map((feature) => feature.tracks),
      );
      for (const slot of ["source", "target"] as const) {
        expect(loaded.videos?.[slot]?.timeline).toEqual(
          authored.videos?.[slot]?.timeline,
        );
        if (preset.videos?.[slot])
          expect(
            useProjectStore.getState()[
              slot === "source" ? "sourceVideo" : "targetVideo"
            ],
          ).not.toBeNull();
      }
      expect(useEditorStore.getState().tauSec).toBe(
        preset.presentation!.timeSec,
      );
    },
  );
});
