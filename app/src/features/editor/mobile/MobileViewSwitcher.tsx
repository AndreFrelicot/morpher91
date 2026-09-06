import { useMemo, useState, type ReactNode } from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MorphCanvas } from "@/features/editor/MorphCanvas";
import { FeaturePane } from "@/features/editor/FeaturePane";
import { useProjectStore } from "@/store/projectStore";
import type { ImageAsset } from "@/morph/model";

/**
 * Mobile view switcher (PRD M12 lot 3). Only one viewport stack is mounted at a
 * time, so inactive views own no GPU surfaces. Inactive source/target cards reuse
 * their serializable image source when one is available; GPU output is never read
 * back synchronously for thumbnails.
 */
// Labels are functions so they re-resolve through i18next on language change
// (the component re-renders via useTranslation).
type ViewDef = { id: string; label: () => string; render: () => ReactNode };

const STUDIO_VIEWS: ViewDef[] = [
  {
    id: "source",
    label: () => i18next.t("assets.sourceA"),
    render: () => (
      <FeaturePane
        slot="source"
        label={i18next.t("assets.sourceA")}
        dotClassName="bg-image-a"
      />
    ),
  },
  {
    id: "target",
    label: () => i18next.t("assets.targetB"),
    render: () => (
      <FeaturePane
        slot="target"
        label={i18next.t("assets.targetB")}
        dotClassName="bg-image-b"
      />
    ),
  },
  {
    id: "morph",
    label: () => i18next.t("studio.preview"),
    render: () => <MorphCanvas />,
  },
];

const COMPARE_VIEWS: ViewDef[] = [
  {
    id: "crossfade",
    label: () => i18next.t("algorithmShortNames.crossfade"),
    render: () => <MorphCanvas algorithm="crossfade" showOverlays={false} />,
  },
  {
    id: "mesh",
    label: () => i18next.t("algorithmShortNames.mesh"),
    render: () => <MorphCanvas algorithm="mesh" showOverlays={false} />,
  },
  {
    id: "tps",
    label: () => i18next.t("algorithmShortNames.thin-plate-spline"),
    render: () => (
      <MorphCanvas algorithm="thin-plate-spline" showOverlays={false} />
    ),
  },
  {
    id: "beier",
    label: () => i18next.t("algorithmShortNames.beier-neely"),
    render: () => <MorphCanvas algorithm="beier-neely" showOverlays={false} />,
  },
];

export function MobileViewSwitcher({ tab }: { tab: "studio" | "compare" }) {
  const { t } = useTranslation();
  const views = tab === "studio" ? STUDIO_VIEWS : COMPARE_VIEWS;
  const [activeId, setActiveId] = useState(views[0].id);
  const project = useProjectStore((state) => state.project);

  // The parent keys this component by `tab`, so switching tabs remounts it and
  // resets activeId without a synchronization effect.
  const active = useMemo(
    () => views.find((v) => v.id === activeId) ?? views[0],
    [views, activeId],
  );

  const switchTo = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        {/* Keyed so switching views remounts the surface (one live canvas). */}
        <div key={active.id} className="absolute inset-0">
          {active.render()}
        </div>
      </div>
      <div
        role="tablist"
        aria-label={t("mobile.views")}
        className="flex shrink-0 gap-2 overflow-x-auto border-t border-border bg-background/60 px-2 py-2"
      >
        {views.map((v) => (
          <Thumb
            key={v.id}
            label={v.label()}
            active={v.id === activeId}
            thumbnail={
              tab === "studio"
                ? assetThumbnail(
                    v.id === "source"
                      ? project?.images.source
                      : v.id === "target"
                        ? project?.images.target
                        : undefined,
                  )
                : undefined
            }
            onSelect={() => switchTo(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Thumb({
  label,
  active,
  thumbnail,
  onSelect,
}: {
  label: string;
  active: boolean;
  thumbnail?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-background/80 outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-accent" : "border-border",
      )}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="h-full w-full object-cover opacity-90"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
          {label}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-background/70 px-1 text-center text-[9px] font-medium text-foreground">
        {label}
      </span>
    </button>
  );
}

function assetThumbnail(asset: ImageAsset | undefined): string | undefined {
  if (!asset || asset.source.kind === "object-url") return undefined;
  return asset.source.value;
}
