import type { Rgba } from "@/morph/overlay/scene";

/**
 * Resolved colours the GPU overlay needs, mirroring the classes/hex the old SVG
 * overlays used (PRD M11 parity). Pane accents + foreground come from theme
 * tokens (`text-image-a/-b`, `text-foreground`) so they track the theme; the
 * morph-preview palette is the fixed per-kind hex from the old PreviewMorphOverlay.
 * Colours are stored at full alpha; builders apply per-use opacity.
 */
export type OverlayPalette = {
  accentA: Rgba;
  accentB: Rgba;
  foreground: Rgba;
  /** Pane Beier influence grid (was `text-orange-300/55`). */
  beierGrid: Rgba;
  /** Halo drawn under every warp grid line so meshes read on any background. */
  gridOutline: Rgba;
  /** Pane selected/hovered dot ring + beacons (theme `--selection` yellow). */
  selectedStroke: Rgba;
  /** Pane unselected dot ring (was rgba(0,0,0,0.6)). */
  unselectedStroke: Rgba;
  preview: {
    point: Rgba;
    segment: Rgba;
    polyline: Rgba;
    region: Rgba;
    mesh: Rgba;
    tpsGrid: Rgba;
    beierField: Rgba;
    /** Dot halo (was rgba(0,0,0,0.72)). */
    halo: Rgba;
  };
};

/** Parses any CSS colour string to straight RGBA 0..1 via a 1×1 canvas readback. */
function makeColorReader(): (css: string) => Rgba {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return (css: string): Rgba => {
    if (!ctx) return [0, 0, 0, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = css; // unknown strings leave the previous (black) value
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255, a / 255];
  };
}

/** Reads a theme token by Tailwind class, resolved against the live theme. */
function readClassColor(
  read: (css: string) => Rgba,
  host: HTMLElement,
  className: string,
): Rgba {
  const probe = document.createElement("span");
  probe.className = className;
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  host.appendChild(probe);
  const color = getComputedStyle(probe).color;
  host.removeChild(probe);
  return read(color || "#000000");
}

/**
 * Resolves the overlay palette against the current theme. DOM-only (uses
 * getComputedStyle + canvas), called once when an {@link OverlayCanvas} mounts.
 */
export function resolveOverlayColors(
  host: HTMLElement = document.body,
): OverlayPalette {
  const read = makeColorReader();
  const cls = (name: string) => readClassColor(read, host, name);
  return {
    accentA: cls("text-image-a"),
    accentB: cls("text-image-b"),
    foreground: cls("text-foreground"),
    beierGrid: cls("text-orange-300"),
    gridOutline: read("#ef4444"),
    selectedStroke: cls("text-selection"),
    unselectedStroke: [0, 0, 0, 0.6],
    preview: {
      point: read("#facc15"),
      segment: read("#fb7185"),
      polyline: read("#22d3ee"),
      region: read("#a78bfa"),
      mesh: read("#38bdf8"),
      tpsGrid: read("#c084fc"),
      beierField: read("#fb923c"),
      halo: [0, 0, 0, 0.72],
    },
  };
}
