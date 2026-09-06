import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { deserializeProject, serializeProject } from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { parseDemoManifest } from "./manifest";
import { localizePresetProject } from "./presetContent";

const demoDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/demo",
);
const manifest = parseDemoManifest(
  JSON.parse(readFileSync(join(demoDir, "manifest.json"), "utf8")),
);
const resources = import.meta.glob<Record<string, unknown>>(
  "../../i18n/locales/*.json",
  { eager: true, import: "default" },
);
const originalProjectState = useProjectStore.getState();
const originalHistoryState = useHistoryStore.getState();

afterEach(async () => {
  useProjectStore.setState(originalProjectState, true);
  useHistoryStore.setState(originalHistoryState, true);
  await i18n.changeLanguage("en");
});

describe("preset localization boundaries", () => {
  it("only localizes teaching names when creating a preset, without mutating its geometry", () => {
    const preset = manifest.presets.find(
      (preset) => preset.id === "painted-mask",
    )!;
    const original = deserializeProject(
      readFileSync(join(demoDir, preset.file), "utf8"),
    );
    const before = JSON.stringify(serializeProject(original));
    const localized = localizePresetProject(original, preset, "fr");
    expect(JSON.stringify(serializeProject(original))).toBe(before);
    expect(localized.features).toEqual(original.features);
    expect(localized.images).toEqual(original.images);
    expect(localized.timeline).toEqual(original.timeline);
    expect(localized.layers.map((layer) => ({ ...layer, name: "" }))).toEqual(
      original.layers.map((layer) => ({ ...layer, name: "" })),
    );
  });

  it("changing the UI language preserves user names, serialized data, dirty state and undo history", async () => {
    const preset = manifest.presets[0];
    const project = deserializeProject(
      readFileSync(join(demoDir, preset.file), "utf8"),
    );
    project.name = "My project — مشروعي 日本語";
    project.layers[0].name = "My layer — calque personnel";
    project.features[0].label = "Custom landmark — 目";
    useProjectStore.setState({ project });
    useHistoryStore.setState({
      past: [structuredClone(project.features)],
      future: [],
      pending: null,
    });
    const beforeProject = useProjectStore.getState();
    const beforeHistory = useHistoryStore.getState();
    const serialized = JSON.stringify(serializeProject(project));
    for (const [path, resource] of Object.entries(resources)) {
      const language = path.split("/").at(-1)!.replace(".json", "");
      i18n.addResourceBundle(language, "translation", resource, true, true);
      await i18n.changeLanguage(language);
      expect(useProjectStore.getState(), language).toBe(beforeProject);
      expect(useHistoryStore.getState(), language).toBe(beforeHistory);
      expect(
        JSON.stringify(serializeProject(useProjectStore.getState().project!)),
        language,
      ).toBe(serialized);
    }
  });
});
