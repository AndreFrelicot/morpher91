import {
  featureHandles,
  type FeaturePair,
  type FeatureSide,
} from "@/morph/model";
import type { ProjectSpaceTransform } from "@/lib/viewport/projectSpace";
import { cn } from "@/lib/utils";
import type { ToolHud } from "./tools/hud";

/**
 * Screen-space HTML labels for feature handles + contextual tool HUD (PRD M11):
 * crisp, accessible, i18n-friendly text on top of the GPU overlay, positioned
 * with the same projectSpace transform. Replaces the `<text>` nodes of the old
 * SVG FeatureOverlay. Pointer-transparent — the pane owns interaction.
 */
export function HudLayer({
  side,
  features,
  transform,
  selection,
  hoveredId,
  toolHud,
}: {
  side: FeatureSide;
  features: FeaturePair[];
  transform: ProjectSpaceTransform;
  selection: string[];
  hoveredId: string | null;
  toolHud: ToolHud[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {toolHud.map((hud, i) => {
        const at = transform.toScreen(hud.at);
        return (
          <span
            key={`hud-${i}`}
            className={cn(
              "absolute whitespace-nowrap rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums backdrop-blur",
              hud.tone === "muted"
                ? "text-muted-foreground"
                : "text-foreground",
            )}
            style={{ left: at.x + (hud.dx ?? 0), top: at.y + (hud.dy ?? 0) }}
          >
            {hud.text}
          </span>
        );
      })}
      {features.map((f) => {
        if (!f.enabled || !f.label) return null;
        const handles = featureHandles(f, side);
        if (handles.length === 0) return null;
        const anchor = transform.toScreen(handles[0].pos);
        const active = selection.includes(f.id) || hoveredId === f.id;
        return (
          <span
            key={f.id}
            className={cn(
              "absolute -translate-y-full whitespace-nowrap text-[10px] font-medium text-foreground",
              !active && "opacity-70",
            )}
            style={{ left: anchor.x + 9, top: anchor.y - 8 }}
          >
            {f.label}
          </span>
        );
      })}
    </div>
  );
}
