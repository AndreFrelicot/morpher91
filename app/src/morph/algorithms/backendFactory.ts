import type { MorphAlgorithmId } from "@/morph/model";
import type { MorphBackend } from "./MorphBackend";
import { CrossfadeBackend } from "./crossfade/CrossfadeBackend";
import { MeshBackend } from "./mesh/MeshBackend";
import { TpsBackend } from "./tps/TpsBackend";
import { BeierBackend } from "./beier/BeierBackend";

/**
 * Builds the rendering backend for an algorithm. Unknown ids fall back to
 * crossfade (the UI only offers the wired algorithms — see RightInspector).
 */
export function createBackend(
  id: MorphAlgorithmId,
  device: GPUDevice,
  format: GPUTextureFormat,
): MorphBackend {
  switch (id) {
    case "mesh":
      return new MeshBackend(device, format);
    case "thin-plate-spline":
      return new TpsBackend(device, format);
    case "beier-neely":
      return new BeierBackend(device, format);
    default:
      return new CrossfadeBackend(device, format);
  }
}
