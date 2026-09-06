import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { GUIDES } from "./guides";
import { matchesSearch } from "@/i18n/search";

const resources = import.meta.glob<Record<string, unknown>>(
  "../i18n/locales/*.json",
  {
    eager: true,
    import: "default",
  },
);

// Queries written as user requests, independent of the catalogue's key order.
// Add contextual queries here when a new catalogue is activated.
const practicalQueries: Record<string, readonly [string, string][]> = {
  en: [
    ["mask", "mask-region"],
    ["keyframes", "videos"],
  ],
  fr: [
    ["masque", "mask-region"],
    ["images clés", "videos"],
  ],
  de: [
    ["Maske", "mask-region"],
    ["Keyframes", "videos"],
  ],
  it: [
    ["sfumatura", "mask-region"],
    ["fotogrammi chiave", "videos"],
  ],
  "pt-BR": [
    ["difusão", "mask-region"],
    ["quadros-chave", "videos"],
  ],
  tr: [
    ["İŞARET", "place-points"],
    ["ANAHTAR KARE", "videos"],
    ["IŞIK", "layer-look"],
    ["kenar yumuşatma", "mask-region"],
  ],
  id: [
    ["penanda", "place-points"],
    ["bingkai kunci", "videos"],
    ["pelembutan tepi", "mask-region"],
    ["urungkan", "push-points"],
    ["garis bersambung", "draw-polyline"],
  ],
  ru: [
    ["ориентир", "place-points"],
    ["КЛЮЧЕВЫЕ КАДРЫ", "videos"],
    ["растушёвка", "mask-region"],
    ["растушевка", "mask-region"],
    ["отменить", "push-points"],
  ],
  ja: [
    ["対応点", "place-points"],
    ["キーフレーム", "videos"],
    ["ぼかし", "mask-region"],
    ["元に戻す", "push-points"],
    ["ﾎﾟﾘﾗｲﾝ", "draw-polyline"],
  ],
  ko: [
    ["대응점", "place-points"],
    ["키프레임", "videos"],
    ["페더", "mask-region"],
    ["실행 취소", "push-points"],
    ["꺾은선", "draw-polyline"],
  ],
  "zh-Hans": [
    ["对应点", "place-points"],
    ["关键帧", "videos"],
    ["羽化", "mask-region"],
    ["撤销", "push-points"],
    ["折线", "draw-polyline"],
  ],
  th: [
    ["จุด", "place-points"],
    ["คีย์เฟรม", "videos"],
    ["ขอบนุ่ม", "mask-region"],
    ["เลิกทำ", "push-points"],
    ["เส้นต่อเนื่อง", "draw-polyline"],
  ],
  hi: [
    ["बिंदु", "place-points"],
    ["कीफ़्रेम", "videos"],
    ["किनारे नरमी", "mask-region"],
    ["पूर्ववत", "push-points"],
    ["पॉलीलाइन", "draw-polyline"],
  ],
  bn: [
    ["বিন্দু", "place-points"],
    ["কিফ্রেম", "videos"],
    ["প্রান্ত কোমলতা", "mask-region"],
    ["আগের অবস্থায়", "push-points"],
    ["পলিলাইন", "draw-polyline"],
  ],
  ar: [
    ["نقاط", "place-points"],
    ["إطارات أساسية", "videos"],
    ["تنعيم الحواف", "mask-region"],
    ["تراجع", "push-points"],
    ["خط متعدد المقاطع", "draw-polyline"],
  ],
  es: [
    ["calado", "mask-region"],
    ["fotogramas clave", "videos"],
  ],
};

for (const [path, resource] of Object.entries(resources)) {
  const language = path.split("/").at(-1)!.replace(".json", "");
  describe(`${language} guide resources`, () => {
    it("finds the intended guide for practical native-language queries", () => {
      i18n.addResourceBundle(language, "translation", resource, true, true);
      expect(practicalQueries[language], language).toBeDefined();
      for (const [query, expectedId] of practicalQueries[language]) {
        const matches = GUIDES.filter((guide) =>
          matchesSearch(
            [guide.title, guide.description, guide.keywords]
              .map((key) => i18n.getResource(language, "translation", key))
              .join(" "),
            query,
            language,
          ),
        );
        expect(
          matches.map((guide) => guide.id),
          query,
        ).toContain(expectedId);
      }
    });

    it("resolves every guide/step reference in that locale without fallback", () => {
      i18n.addResourceBundle(language, "translation", resource, true, true);
      for (const guide of GUIDES) {
        const references = [
          guide.title,
          guide.description,
          guide.keywords,
          guide.preconditionHint,
        ];
        for (const step of guide.steps) {
          references.push(step.title, step.missingHint);
          if (typeof step.body === "string") references.push(step.body);
          else {
            const body = step.body(language);
            expect(
              body.trim().length,
              `${guide.id}/${step.id}`,
            ).toBeGreaterThan(0);
            expect(body).not.toMatch(
              /guideText\.|assist\.shortcuts\.|tools\.|\{\{/,
            );
          }
        }
        for (const reference of references.filter((key) => key !== undefined)) {
          const actual = i18n.getResource(language, "translation", reference);
          expect(
            typeof actual === "string" && actual.trim().length > 0,
            reference,
          ).toBe(true);
        }
      }
    });

    it("finds each guide by its own translated title and keywords", () => {
      i18n.addResourceBundle(language, "translation", resource, true, true);
      for (const guide of GUIDES) {
        const title = i18n.getResource(
          language,
          "translation",
          guide.title,
        ) as string;
        const keywords = i18n.getResource(
          language,
          "translation",
          guide.keywords,
        ) as string;
        expect(
          matchesSearch(`${title} ${keywords}`, title, language),
          guide.id,
        ).toBe(true);
        expect(
          matchesSearch(
            `${title} ${keywords}`,
            keywords.split(/\s+/u)[0],
            language,
          ),
          guide.id,
        ).toBe(true);
      }
    });
  });
}
