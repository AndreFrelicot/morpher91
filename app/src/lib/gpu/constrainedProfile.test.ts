import { describe, expect, it } from "vitest";
import { isConstrainedGpuProfile } from "./constrainedProfile";

describe("isConstrainedGpuProfile", () => {
  it("keeps a wide mouse-only desktop on the standard profile", () => {
    expect(
      isConstrainedGpuProfile({
        mobileLayout: false,
        coarsePointer: false,
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it("constrains a narrow desktop using the mobile shell", () => {
    expect(
      isConstrainedGpuProfile({
        mobileLayout: true,
        coarsePointer: false,
        maxTouchPoints: 0,
      }),
    ).toBe(true);
  });

  it("constrains a wide iPad even when it keeps the desktop shell", () => {
    expect(
      isConstrainedGpuProfile({
        mobileLayout: false,
        coarsePointer: true,
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("constrains touch hardware when pointer media queries are incomplete", () => {
    expect(
      isConstrainedGpuProfile({
        mobileLayout: false,
        coarsePointer: false,
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });
});
