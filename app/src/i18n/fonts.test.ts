import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchFont = vi.fn();
const cache = { match: vi.fn(), put: vi.fn(), delete: vi.fn() };
const add = vi.fn();
const load = vi.fn();
const fontSetLoad = vi.fn();
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  cache.match.mockResolvedValue(undefined);
  cache.put.mockResolvedValue(undefined);
  cache.delete.mockResolvedValue(true);
  load.mockResolvedValue(undefined);
  fontSetLoad.mockResolvedValue([]);
  fetchFont.mockImplementation(
    async () => new Response(new Uint8Array([1, 2, 3])),
  );
  vi.stubGlobal("fetch", fetchFont);
  vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
  vi.stubGlobal(
    "FontFace",
    class {
      family: string;
      constructor(family: string) {
        this.family = family;
      }
      load() {
        return load();
      }
    },
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { add, load: fontSetLoad },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

describe("language font preparation", () => {
  it("shares a pending font request and waits for decoded glyphs before registering", async () => {
    let finish!: () => void;
    load.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { prepareLanguageFonts } = await import("./fonts");
    const first = prepareLanguageFonts("ar");
    const second = prepareLanguageFonts("ar");
    expect(second).toBe(first);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(add).not.toHaveBeenCalled();
    finish();
    await first;
    expect(add).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
    await prepareLanguageFonts("ar");
    expect(fetchFont).toHaveBeenCalledOnce();
  });

  it("restores a previously cached font without a network connection", async () => {
    cache.match.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    fetchFont.mockRejectedValue(new TypeError("offline"));
    const { prepareLanguageFonts } = await import("./fonts");
    await prepareLanguageFonts("ja");
    expect(fetchFont).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ family: "Noto Sans JP" }),
    );
  });

  it("rejects an unavailable font and allows an explicit later retry", async () => {
    fetchFont.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const { prepareLanguageFonts } = await import("./fonts");
    await expect(prepareLanguageFonts("bn")).rejects.toThrow("404");
    expect(add).not.toHaveBeenCalled();
    await prepareLanguageFonts("bn");
    expect(fetchFont).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledOnce();
  });

  it("removes a damaged cached font so retry can fetch a valid copy", async () => {
    cache.match.mockResolvedValueOnce(new Response(new Uint8Array([0])));
    load.mockRejectedValueOnce(new Error("invalid font"));
    const { prepareLanguageFonts, fontForLanguage } = await import("./fonts");
    await expect(prepareLanguageFonts("hi")).rejects.toThrow("invalid font");
    expect(cache.delete).toHaveBeenCalledWith(fontForLanguage("hi")!.full.url);
    await prepareLanguageFonts("hi");
    expect(fetchFont).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });

  it("keeps online loading usable when cache storage is unavailable", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockRejectedValue(new Error("denied")),
    });
    const { prepareLanguageFonts } = await import("./fonts");
    await prepareLanguageFonts("th");
    expect(add).toHaveBeenCalledOnce();
  });

  it("prepares Latin extended glyphs without requesting full Noto fonts", async () => {
    const { prepareLanguageFonts } = await import("./fonts");
    await prepareLanguageFonts("tr");
    expect(fetchFont).not.toHaveBeenCalled();
    expect(fontSetLoad).toHaveBeenCalledWith(
      expect.stringContaining("Instrument Sans"),
      expect.stringContaining("İı"),
    );
  });
});
