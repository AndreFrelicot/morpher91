export type PremultipliedRgba = readonly [number, number, number, number];
export type AlphaBlendMode = "normal" | "multiply" | "screen" | "lighter";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function color(
  premultiplied: PremultipliedRgba,
): readonly [number, number, number] {
  const alpha = premultiplied[3];
  return alpha <= 1e-6
    ? [0, 0, 0]
    : [
        premultiplied[0] / alpha,
        premultiplied[1] / alpha,
        premultiplied[2] / alpha,
      ];
}

function blendChannel(dst: number, src: number, mode: AlphaBlendMode): number {
  switch (mode) {
    case "multiply":
      return dst * src;
    case "screen":
      return 1 - (1 - dst) * (1 - src);
    default:
      return src;
  }
}

/** CPU mirror of composite.wgsl, used to lock the premultiplied-alpha contract. */
export function compositePremultiplied(
  dst: PremultipliedRgba,
  src: PremultipliedRgba,
  layerAmount: number,
  mode: AlphaBlendMode,
): PremultipliedRgba {
  const amount = clamp01(layerAmount);
  const srcAlpha = src[3] * amount;
  const srcPremul = [
    src[0] * amount,
    src[1] * amount,
    src[2] * amount,
  ] as const;

  if (mode === "lighter") {
    return [
      clamp01(dst[0] + srcPremul[0]),
      clamp01(dst[1] + srcPremul[1]),
      clamp01(dst[2] + srcPremul[2]),
      clamp01(dst[3] + srcAlpha),
    ];
  }

  const dstColor = color(dst);
  const srcColor = color(src);
  const rgb = [0, 1, 2].map((index) => {
    const blended = blendChannel(dstColor[index], srcColor[index], mode);
    return (
      (1 - srcAlpha) * dst[index] +
      (1 - dst[3]) * srcPremul[index] +
      srcAlpha * dst[3] * blended
    );
  });
  return [rgb[0], rgb[1], rgb[2], srcAlpha + dst[3] * (1 - srcAlpha)];
}
