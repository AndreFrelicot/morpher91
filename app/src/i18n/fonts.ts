import fonts from "./fonts.json";
import { LANGUAGE_METADATA, type Language } from "./languages";
import { fontCache } from "@/pwa/cachePolicy.json";

export const FONT_METADATA = fonts;
export type FontScript = keyof typeof fonts;

export function fontForLanguage(language: Language) {
  const script = LANGUAGE_METADATA[language].script;
  return Object.hasOwn(fonts, script) ? fonts[script as FontScript] : null;
}

export function nativeFontFamily(language: Language): string | undefined {
  const font = fontForLanguage(language);
  return font ? `"${font.native.family}", sans-serif` : undefined;
}

const prepared = new Map<string, Promise<void>>();

async function openFontCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(fontCache);
  } catch {
    // Storage can be disabled while the current online session remains usable.
    return null;
  }
}

async function loadScriptFont(
  font: NonNullable<ReturnType<typeof fontForLanguage>>,
) {
  if (typeof FontFace === "undefined" || !document.fonts)
    throw new Error("Font loading is unavailable");
  const cache = await openFontCache();
  const cached = await cache?.match(font.full.url).catch(() => undefined);
  const response = cached ?? (await fetch(font.full.url));
  if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
  const copy = response.clone();
  try {
    const face = new FontFace(font.family, await response.arrayBuffer(), {
      style: "normal",
      weight: "400 700",
      unicodeRange: font.full.unicodeRange,
    });
    await face.load();
    // Also persist a font fetched before a first service worker takes control.
    if (!cached) await cache?.put(font.full.url, copy).catch(() => undefined);
    document.fonts.add(face);
  } catch (error) {
    // A damaged cached response must not prevent a later online retry.
    await cache?.delete(font.full.url).catch(() => undefined);
    throw error;
  }
}

/** A language is applied only after its full, self-hosted script font is usable. */
export function prepareLanguageFonts(language: Language): Promise<void> {
  const font = fontForLanguage(language);
  const key = font?.full.url ?? "latin";
  const existing = prepared.get(key);
  if (existing) return existing;
  const loading = font
    ? loadScriptFont(font)
    : document.fonts
      ? Promise.all([
          document.fonts.load('400 14px "Instrument Sans Variable"', "AaéİıȘ"),
          document.fonts.load('600 14px "Instrument Sans Variable"', "AaéİıȘ"),
        ]).then(() => undefined)
      : Promise.resolve(); // Non-rendering test environments have no FontFaceSet.
  const promise = loading.catch((error: unknown) => {
    prepared.delete(key);
    throw error;
  });
  prepared.set(key, promise);
  return promise;
}
