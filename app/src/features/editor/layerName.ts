import i18next from "i18next";
import { GLOBAL_LAYER_ID, type MorphLayer } from "@/morph/model";

/** Translate only the built-in base name at display time; never edit project data. */
export function layerName(layer: MorphLayer): string {
  return layer.id === GLOBAL_LAYER_ID && layer.name === "Global"
    ? i18next.t("layers.baseName")
    : layer.name;
}
