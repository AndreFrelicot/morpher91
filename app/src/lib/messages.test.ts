import { describe, expect, it } from "vitest";
import {
  TOO_MANY_FEATURES_THRESHOLD,
  shouldWarnFeatureCount,
} from "./messages";

describe("messages", () => {
  it("warns only above the too-many-features threshold", () => {
    expect(shouldWarnFeatureCount(TOO_MANY_FEATURES_THRESHOLD)).toBe(false);
    expect(shouldWarnFeatureCount(TOO_MANY_FEATURES_THRESHOLD + 1)).toBe(true);
  });
});
