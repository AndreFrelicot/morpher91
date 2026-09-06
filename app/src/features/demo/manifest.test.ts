import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./presetLandmarks.json";
import { deserializeProject } from "@/morph/model";
import i18n from "@/i18n";
import { parseDemoManifest } from "./manifest";
import { localizePresetProject } from "./presetContent";

const locales = import.meta.glob<{
  demo: {
    assets: Record<string, string>;
    presetContent: Record<
      string,
      { name: string; description: string; labels?: Record<string, string> }
    >;
  };
}>("../../i18n/locales/*.json", { eager: true, import: "default" });
const available = Object.entries(locales).map(([path, locale]) => ({
  language: path.split("/").at(-1)!.replace(".json", ""),
  locale,
}));

const DEMO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/demo",
);

describe("demo manifest", () => {
  const raw: unknown = JSON.parse(
    readFileSync(join(DEMO_DIR, "manifest.json"), "utf8"),
  );

  it("matches the schema", () => {
    expect(() => parseDemoManifest(raw)).not.toThrow();
  });

  it("every referenced file exists in public/demo", () => {
    const manifest = parseDemoManifest(raw);
    const missing: string[] = [];
    for (const asset of manifest.assets) {
      for (const rel of [asset.file, asset.thumb]) {
        if (!existsSync(join(DEMO_DIR, rel))) missing.push(rel);
      }
    }
    for (const preset of manifest.presets) {
      for (const rel of [preset.file, preset.thumb, preset.targetThumb]) {
        if (rel && !existsSync(join(DEMO_DIR, rel))) missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every example has a usable entry point, translated copy and complete media timing", () => {
    for (const preset of parseDemoManifest(raw).presets) {
      const project = deserializeProject(
        readFileSync(join(DEMO_DIR, preset.file), "utf8"),
      );
      expect(preset.presentation, preset.id).toBeDefined();
      expect(preset.presentation!.timeSec, preset.id).toBeLessThanOrEqual(
        project.timeline.durationSec,
      );
      if (preset.presentation!.layerId)
        expect(project.layers.map((l) => l.id)).toContain(
          preset.presentation!.layerId,
        );
      if (preset.presentation!.featureId)
        expect(project.features.map((f) => f.id)).toContain(
          preset.presentation!.featureId,
        );
      for (const { locale } of available) {
        const copy = (
          locale.demo.presetContent as Record<
            string,
            {
              name: string;
              description: string;
              labels?: Record<string, string>;
            }
          >
        )[preset.id];
        expect(copy?.description, preset.id).toBeTruthy();
        expect(copy?.name, preset.id).toBeTruthy();
        for (const layer of project.layers.filter(
          (layer) => layer.id !== "global",
        ))
          expect(
            copy.labels?.[layer.id],
            `${preset.id}/${layer.id}`,
          ).toBeTruthy();
      }
      const englishLabels = (
        landmarks as Record<string, Record<string, string>>
      )[preset.id];
      for (const feature of project.features) {
        expect(feature.label, `${preset.id}/${feature.id}`).toBe(
          englishLabels[feature.id],
        );
      }
      for (const { language, locale } of available) {
        i18n.addResourceBundle(language, "translation", locale, true, true);
        const localized = localizePresetProject(project, preset, language);
        expect(localized.features.map((feature) => feature.label)).toEqual(
          project.features.map((feature) => feature.label),
        );
      }
      const clips = Object.values(project.videos ?? {}).filter(
        (v) => v !== undefined,
      );
      if (clips.length) {
        expect(
          Math.max(
            ...clips.map((v) => v.timeline.startSec + v.timeline.durationSec),
          ),
          preset.id,
        ).toBeCloseTo(project.timeline.durationSec);
        for (const video of clips)
          expect(
            video.timeline.inSec + video.timeline.durationSec,
            preset.id,
          ).toBeLessThanOrEqual(video.durationSec);
      }
    }
  });

  it("translates every demo media name in every delivered locale", () => {
    for (const { language, locale } of available) {
      for (const asset of parseDemoManifest(raw).assets) {
        expect(
          locale.demo.assets[asset.id]?.trim(),
          `${language}/${asset.id}`,
        ).toBeTruthy();
      }
    }
  });

  it("rejects a preset video slot pointing at a non-video asset", () => {
    expect(() =>
      parseDemoManifest({
        version: 1,
        assets: [
          {
            id: "still",
            kind: "image",
            file: "images/still.png",
            thumb: "thumbs/still.webp",
            width: 10,
            height: 10,
            durationSec: null,
            label: { en: "Still", fr: "Still" },
            group: "faces",
          },
        ],
        presets: [
          {
            id: "p",
            label: { en: "P", fr: "P" },
            thumb: "",
            file: "presets/p.morph.json",
            videos: { source: "still" },
          },
        ],
      }),
    ).toThrow(/not a video asset/);
  });

  it("rejects a video without duration", () => {
    expect(() =>
      parseDemoManifest({
        version: 1,
        assets: [
          {
            id: "x",
            kind: "video",
            file: "videos/x.mp4",
            thumb: "thumbs/x.webp",
            width: 10,
            height: 10,
            durationSec: null,
            label: { en: "X", fr: "X" },
            group: "singing",
          },
        ],
        presets: [],
      }),
    ).toThrow(/durationSec/);
  });
});
