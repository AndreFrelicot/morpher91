import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import fr from "@/i18n/locales/fr.json";
import { createLayer, defaultGlobalLayer } from "@/morph/model";
import { layerName } from "./layerName";

afterEach(async () => {
  i18n.addResource("fr", "translation", "layers.baseName", fr.layers.baseName);
  await i18n.changeLanguage("en");
});

describe("layer display names", () => {
  it("resolves the built-in base name without mutating it", async () => {
    const layer = defaultGlobalLayer();
    i18n.addResource("fr", "translation", "layers.baseName", "Base de test");
    await i18n.changeLanguage("fr");
    expect(layerName(layer)).toBe("Base de test");
    expect(layer.name).toBe("Global");
  });

  it("preserves a user layer called Global and customized base names", async () => {
    await i18n.changeLanguage("fr");
    i18n.addResource("fr", "translation", "layers.baseName", "Base de test");
    expect(layerName(createLayer("Global"))).toBe("Global");
    expect(layerName({ ...defaultGlobalLayer(), name: "My base — 基础" })).toBe(
      "My base — 基础",
    );
  });
});
