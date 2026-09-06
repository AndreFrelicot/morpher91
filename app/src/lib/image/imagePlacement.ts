/**
 * Maps a canvas UV (0..1) to an image UV (0..1) so the image is fit into the
 * canvas without distortion (PRD §7.3, ImagePlacement contain/cover).
 *
 *   imageUv = canvasUv * (scaleX, scaleY) + (offsetX, offsetY)
 *
 * For "contain" the image is letterboxed (UVs outside [0,1] = background).
 * For "cover" the image fills the canvas and overflow is cropped.
 */
export type UvTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export function computeUvTransform(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  mode: "contain" | "cover",
): UvTransform {
  const canvasAspect = canvasWidth / canvasHeight;
  const imageAspect = imageWidth / imageHeight;
  const imageIsWider = imageAspect > canvasAspect;

  // Fraction of the canvas covered by the image, per axis.
  let rectW: number;
  let rectH: number;
  if (mode === "contain") {
    if (imageIsWider) {
      rectW = 1;
      rectH = canvasAspect / imageAspect;
    } else {
      rectH = 1;
      rectW = imageAspect / canvasAspect;
    }
  } else {
    if (imageIsWider) {
      rectH = 1;
      rectW = imageAspect / canvasAspect;
    } else {
      rectW = 1;
      rectH = canvasAspect / imageAspect;
    }
  }

  const originX = (1 - rectW) / 2;
  const originY = (1 - rectH) / 2;

  // Normalize -0 to 0 for clean, predictable output.
  const nz = (n: number) => (n === 0 ? 0 : n);

  return {
    scaleX: nz(1 / rectW),
    scaleY: nz(1 / rectH),
    offsetX: nz(-originX / rectW),
    offsetY: nz(-originY / rectH),
  };
}
