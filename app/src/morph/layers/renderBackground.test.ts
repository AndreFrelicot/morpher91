import { describe, expect, it } from "vitest";
import {
  backgroundClearColor,
  backgroundForOutput,
  backgroundUniform,
  canvasAlphaMode,
} from "./renderBackground";

describe("render background contract", () => {
  it("maps transparent, black and white to explicit clear colors", () => {
    expect(backgroundClearColor("transparent")).toEqual([0, 0, 0, 0]);
    expect(backgroundClearColor("black")).toEqual([0, 0, 0, 1]);
    expect(backgroundClearColor("white")).toEqual([1, 1, 1, 1]);
  });

  it("preserves alpha only for a transparent presentation", () => {
    expect(backgroundUniform("transparent")[3]).toBe(0);
    expect(backgroundUniform("black")[3]).toBe(1);
    expect(canvasAlphaMode("transparent")).toBe("premultiplied");
    expect(canvasAlphaMode("white")).toBe("opaque");
  });

  it("normalizes unsupported transparent video output to black", () => {
    expect(backgroundForOutput("video", "transparent")).toBe("black");
    expect(backgroundForOutput("frames", "transparent")).toBe("transparent");
    expect(backgroundForOutput("video", "white")).toBe("white");
  });
});
