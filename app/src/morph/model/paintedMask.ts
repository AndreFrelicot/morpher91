/**
 * Painted layer mask (PRD M11 lot 3): an R8 alpha bitmap in project space
 * (0..1 over the canvas), authored with the GPU brush over the un-warped
 * source. The bitmap itself is static, but at composite time it is ADVECTED
 * through the layer's A-side warp map (M17), so the paint follows the layer's
 * content as it morphs. It coexists with the vector region mask — the
 * compositor combines them with `max` — and rides on the layer document, so
 * save/load and the offline export renderer read it from the model. Bytes are
 * RLE-compressed then base64'd: masks are mostly flat runs, and the codec
 * stays synchronous (no canvas/PNG decode on the render path).
 */
export type PaintedMask = {
  width: number;
  height: number;
  /** R8 rows (width × height bytes), RLE + base64. See {@link encodeMaskBytes}. */
  data: string;
};

/** Painting resolution cap — the mask is soft, it upscales fine at export. */
export const MAX_PAINTED_MASK_EDGE = 2048;

/** Authoring size of a painted mask: the project canvas, capped. */
export function paintedMaskSize(canvas: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const scale = Math.min(
    1,
    MAX_PAINTED_MASK_EDGE / Math.max(canvas.width, canvas.height, 1),
  );
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

/** Byte-level RLE: (runLength 1..255, value) pairs. */
function rleEncode(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const value = bytes[i];
    let run = 1;
    while (run < 255 && i + run < bytes.length && bytes[i + run] === value) {
      run++;
    }
    out.push(run, value);
    i += run;
  }
  return new Uint8Array(out);
}

function rleDecode(packed: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < packed.length; i += 2) {
    const run = packed[i];
    const value = packed[i + 1];
    if (o + run > length) {
      throw new Error("Invalid painted mask: run overflows the bitmap.");
    }
    out.fill(value, o, o + run);
    o += run;
  }
  if (o !== length) {
    throw new Error("Invalid painted mask: decoded size mismatch.");
  }
  return out;
}

const B64_CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
  }
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Packs raw R8 mask bytes into the serializable `data` string. */
export function encodeMaskBytes(bytes: Uint8Array): string {
  return toBase64(rleEncode(bytes));
}

/** Unpacks `data` back to `length` raw R8 bytes. Throws on corrupt input. */
export function decodeMaskBytes(data: string, length: number): Uint8Array {
  return rleDecode(fromBase64(data), length);
}

/** True when the whole bitmap is zero (an all-erased mask should be dropped). */
export function maskBytesAreEmpty(bytes: Uint8Array): boolean {
  return bytes.every((b) => b === 0);
}
