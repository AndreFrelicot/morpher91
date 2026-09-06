import type { MorphAlgorithmId } from "@/morph/model";

/**
 * Hand-drawn 24×24 stroke icons, one per morphing algorithm:
 * crossfade = two dissolving circles, mesh = triangulated quad,
 * TPS = smoothly warped grid, Beier–Neely = paired directed field lines.
 */
const ICON_PATHS: Record<MorphAlgorithmId, React.ReactNode> = {
  crossfade: (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" opacity="0.45" />
    </>
  ),
  mesh: (
    <>
      <path d="M4 6 20 4 18 20 6 18Z" />
      <path d="M4 6l14 14M20 4 6 18" opacity="0.55" />
    </>
  ),
  "thin-plate-spline": (
    <>
      <path d="M8 3c-1.5 6 3 12 1 18M16 3c1.5 6-3 12-1 18" />
      <path d="M3 8c6-1.5 12 3 18 1M3 16c6 1.5 12-3 18-1" opacity="0.55" />
    </>
  ),
  "beier-neely": (
    <>
      <path d="M8 20V5M4.5 8.5 8 5l3.5 3.5" />
      <path d="M16 20V5m-3.5 3.5L16 5l3.5 3.5" opacity="0.45" />
    </>
  ),
};

export function AlgorithmIcon({
  id,
  className,
}: {
  id: MorphAlgorithmId;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[id]}
    </svg>
  );
}
