import { describe, expect, it } from "vitest";
import {
  decodeMaskBytes,
  encodeMaskBytes,
  maskBytesAreEmpty,
  MAX_PAINTED_MASK_EDGE,
  paintedMaskSize,
} from "./paintedMask";

describe("painted mask codec", () => {
  it("round-trips typical mask data (flat runs + gradients)", () => {
    const bytes = new Uint8Array(1024);
    bytes.fill(255, 100, 500);
    for (let i = 500; i < 600; i++) bytes[i] = 600 - i; // gradient band
    const decoded = decodeMaskBytes(encodeMaskBytes(bytes), bytes.length);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips empty and full masks", () => {
    const empty = new Uint8Array(300);
    const full = new Uint8Array(300).fill(255);
    expect(decodeMaskBytes(encodeMaskBytes(empty), 300)).toEqual(empty);
    expect(decodeMaskBytes(encodeMaskBytes(full), 300)).toEqual(full);
  });

  it("round-trips runs longer than one RLE chunk (255)", () => {
    const bytes = new Uint8Array(1000).fill(7);
    expect(decodeMaskBytes(encodeMaskBytes(bytes), 1000)).toEqual(bytes);
  });

  it("rejects corrupt data (wrong length)", () => {
    const encoded = encodeMaskBytes(new Uint8Array(100).fill(1));
    expect(() => decodeMaskBytes(encoded, 50)).toThrow();
    expect(() => decodeMaskBytes(encoded, 200)).toThrow();
  });

  it("detects all-zero masks", () => {
    expect(maskBytesAreEmpty(new Uint8Array(10))).toBe(true);
    const touched = new Uint8Array(10);
    touched[7] = 1;
    expect(maskBytesAreEmpty(touched)).toBe(false);
  });

  it("caps the authoring size while keeping the canvas aspect", () => {
    expect(paintedMaskSize({ width: 1024, height: 1024 })).toEqual({
      width: 1024,
      height: 1024,
    });
    const capped = paintedMaskSize({ width: 4096, height: 2048 });
    expect(capped.width).toBe(MAX_PAINTED_MASK_EDGE);
    expect(capped.height).toBe(MAX_PAINTED_MASK_EDGE / 2);
  });
});
