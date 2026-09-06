import i18n from "@/i18n";
import { resolveLanguage } from "@/i18n/languages";
import type { MorphProject } from "@/morph/model";
import type { DemoAsset, DemoPreset } from "./manifest";
import landmarks from "./presetLandmarks.json";

function localizedText(key: string, language: string): string | undefined {
  const locale = resolveLanguage(language) ?? "en";
  const value: unknown =
    i18n.getResource(locale, "translation", key) ??
    i18n.getResource("en", "translation", key);
  return typeof value === "string" ? value : undefined;
}

export function assetLabel(asset: DemoAsset, language: string): string {
  return localizedText(`demo.assets.${asset.id}`, language) ?? asset.label.en;
}

export function presetName(preset: DemoPreset, language: string): string {
  return (
    localizedText(`demo.presetContent.${preset.id}.name`, language) ??
    preset.label.en
  );
}

export function presetDescription(id: string, language: string): string {
  return localizedText(`demo.presetContent.${id}.description`, language) ?? "";
}

/** Called only when creating a bundled example, never on a language change. */
export function localizePresetProject(
  project: MorphProject,
  preset: DemoPreset,
  language: string,
): MorphProject {
  const labels = (landmarks as Record<string, Record<string, string>>)[
    preset.id
  ];
  return {
    ...project,
    name: presetName(preset, language),
    features: project.features.map((feature) => ({
      ...feature,
      // Authored English landmarks are deliberately independent of UI language.
      label: labels?.[feature.id] ?? feature.label,
    })),
    layers: project.layers.map((layer) => ({
      ...layer,
      name:
        localizedText(
          `demo.presetContent.${preset.id}.labels.${layer.id}`,
          language,
        ) ?? layer.name,
    })),
  };
}
