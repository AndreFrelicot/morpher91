import { describe, expect, it } from "vitest";
import { formatNumber } from "./formatters";
import { SUPPORTED_LANGUAGES } from "./languages";

describe("localized readouts", () => {
  it.each(SUPPORTED_LANGUAGES)("uses %s number conventions", (language) => {
    expect(formatNumber(1234.5, language)).toBe(
      new Intl.NumberFormat(language).format(1234.5),
    );
    expect(formatNumber(0.125, language, 2)).toBe(
      new Intl.NumberFormat(language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(0.125),
    );
  });

  it("does not carry one language's cached formatter into the next", () => {
    expect(formatNumber(1.5, "en", 2)).toBe("1.50");
    expect(formatNumber(1.5, "fr", 2)).toBe("1,50");
    expect(formatNumber(1.5, "en", 2)).toBe("1.50");
  });
});
