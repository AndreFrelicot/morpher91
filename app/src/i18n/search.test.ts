import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

describe("localized help search", () => {
  it("matches Latin accents and decomposed accents", () => {
    expect(
      matchesSearch("Déplacer les repères", "REPERES deplacer", "fr"),
    ).toBe(true);
    expect(normalizeSearch("e\u0301", "fr")).toBe("e");
  });

  it("uses Turkish casing before folding Latin diacritics", () => {
    expect(matchesSearch("IŞIK İZLEME", "ışık izleme", "tr")).toBe(true);
    expect(matchesSearch("IŞIK", "isik", "tr")).toBe(false);
    expect(matchesSearch("İZLEME", "izleme", "tr")).toBe(true);
  });

  it.each([
    ["ru", "й", "и"],
    ["ja", "が", "か"],
    ["hi", "क़", "क"],
    ["bn", "ড়", "ড"],
  ])(
    "preserves meaningful combining marks in %s",
    (language, marked, unmarked) => {
      expect(normalizeSearch(marked, language)).not.toBe(
        normalizeSearch(unmarked, language),
      );
      expect(normalizeSearch(marked.normalize("NFD"), language)).toBe(
        normalizeSearch(marked, language),
      );
    },
  );

  it.each([
    ["ja", "キーフレーム", "ｷｰﾌﾚｰﾑ"],
    ["ko", "키프레임", "키프레임"],
    ["zh-Hans", "关键帧", "关键"],
    ["th", "ภาพหลัก", "ภาพ"],
    ["ar", "قناع الطبقة", "الطبقة قناع"],
  ])("searches native text in %s", (language, text, query) => {
    expect(matchesSearch(text, query, language)).toBe(true);
  });
});
