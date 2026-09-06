import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useProjectStore } from "@/store/projectStore";
import { MorphCanvas } from "@/features/editor/MorphCanvas";
import { isWebGPUSupported } from "@/lib/gpu/capabilities";
import { WebGPUNotice } from "@/ui/components/WebGPUNotice";

/**
 * Compare view (PRD §4.2): the four algorithms side by side in a 2×2 grid,
 * sharing the same images, features and t. Crossfade ghosts where features are
 * misaligned; mesh/TPS/Beier warp to the intermediate shape and stay sharp.
 * Each cell owns its WebGPU canvas (fixed `algorithm` prop) and redraws from the
 * shared stores.
 */
export function ComparePage() {
  const { t } = useTranslation();
  const ready = useProjectStore((s) => s.source !== null && s.target !== null);
  const [webgpu] = useState(isWebGPUSupported);

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          <Trans
            i18nKey="compare.importPrompt"
            components={{
              a: <span className="text-image-a" />,
              b: <span className="text-image-b" />,
            }}
          />
        </p>
      </div>
    );
  }

  if (!webgpu) return <WebGPUNotice />;

  return (
    <div
      dir="ltr"
      data-technical-surface="compare"
      className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-border"
    >
      <Cell label={t("algorithmNames.crossfade")}>
        <MorphCanvas algorithm="crossfade" showOverlays={false} />
      </Cell>
      <Cell label={t("algorithmNames.mesh")}>
        <MorphCanvas algorithm="mesh" showOverlays={false} />
      </Cell>
      <Cell label={t("algorithmNames.thin-plate-spline")}>
        <MorphCanvas algorithm="thin-plate-spline" showOverlays={false} />
      </Cell>
      <Cell label={t("algorithmNames.beier-neely")}>
        <MorphCanvas algorithm="beier-neely" showOverlays={false} />
      </Cell>
    </div>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {children}
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
        {label}
      </div>
    </div>
  );
}
