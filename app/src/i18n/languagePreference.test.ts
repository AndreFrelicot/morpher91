import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readLanguagePreference,
  saveLanguagePreference,
} from "./languagePreference";
import { detectLanguage } from "./languages";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("language preference storage", () => {
  it("restores the existing storage key and canonicalizes supported preferences", () => {
    saveLanguagePreference("pt-BR");
    expect(localStorage.getItem("bwm.lang")).toBe("pt-BR");
    expect(detectLanguage(readLanguagePreference(), ["en"])).toBe("pt-BR");
    localStorage.setItem("bwm.lang", "fr-CA");
    expect(detectLanguage(readLanguagePreference(), ["en"])).toBe("fr");
  });

  it("continues to browser preferences when reading storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readLanguagePreference()).toBeNull();
    expect(detectLanguage(readLanguagePreference(), ["ja-JP"])).toBe("ja");
  });

  it("does not let a failed write block the current session", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveLanguagePreference("ar")).not.toThrow();
  });
});
