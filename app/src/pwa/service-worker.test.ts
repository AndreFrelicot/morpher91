import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import policy from "./cachePolicy.json";

const current = "morpher91-0.1.5";
const fullFont = "/fonts/arabic-full-contenthash.woff2";
const shell = [
  "/",
  "/index.html",
  "/assets/ar-hash.json",
  "/fonts/arabic-native-hash.woff2",
];
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "service-worker.js"),
  "utf8",
)
  .replace('"__MORPHER_CACHE__"', JSON.stringify(current))
  .replace('"__MORPHER_SHELL__"', JSON.stringify(shell))
  .replace('"__MORPHER_FONT_CACHE__"', JSON.stringify(policy.fontCache))
  .replace('"__MORPHER_FONTS__"', JSON.stringify([fullFont]));
const shellCache = { addAll: vi.fn(), match: vi.fn() };
const fontCache = { match: vi.fn(), put: vi.fn() };
const cachesMock = { open: vi.fn(), keys: vi.fn(), delete: vi.fn() };
const fetchMock = vi.fn();
const claim = vi.fn();
const skipWaiting = vi.fn();
const handlers = new Map<string, (event: unknown) => void>();

beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
  shellCache.addAll.mockResolvedValue(undefined);
  shellCache.match.mockResolvedValue(undefined);
  fontCache.match.mockResolvedValue(undefined);
  fontCache.put.mockResolvedValue(undefined);
  cachesMock.open.mockImplementation(async (key: string) =>
    key === policy.fontCache ? fontCache : shellCache,
  );
  cachesMock.keys.mockResolvedValue([
    "morpher91-0.1.4",
    current,
    policy.fontCache,
    "unrelated-app",
  ]);
  cachesMock.delete.mockResolvedValue(true);
  fetchMock.mockImplementation(async () => new Response("font"));
  claim.mockResolvedValue(undefined);
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, handler: (e: unknown) => void) =>
        handlers.set(name, handler),
      location: { origin: "https://morpher.test" },
      clients: { claim },
      skipWaiting,
    },
    caches: cachesMock,
    fetch: fetchMock,
    URL,
  });
});

function dispatchFetch(path: string, mode = "cors") {
  let response: Promise<Response> | undefined;
  handlers.get("fetch")!({
    request: {
      method: "GET",
      url: `https://morpher.test${path}`,
      mode,
      redirect: mode === "navigate" ? "manual" : "follow",
    },
    respondWith: (promise: Promise<Response>) => {
      response = promise;
    },
  });
  return response;
}

describe("font and shell cache policy", () => {
  it("installs the shell without downloading full script fonts or forcing an update", async () => {
    let work: Promise<unknown> | undefined;
    handlers.get("install")!({
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
    expect(shellCache.addAll).toHaveBeenCalledWith(shell);
    expect(shellCache.addAll.mock.calls[0][0]).not.toContain(fullFont);
    expect(skipWaiting).not.toHaveBeenCalled();
  });

  it("keeps reusable font data and foreign caches during activation", async () => {
    let work: Promise<unknown> | undefined;
    handlers.get("activate")!({
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
    expect(cachesMock.delete.mock.calls).toEqual([["morpher91-0.1.4"]]);
    expect(claim).toHaveBeenCalledOnce();
  });

  it("serves a previously used full font when the network is offline", async () => {
    fontCache.match.mockResolvedValue(new Response("cached font"));
    fetchMock.mockRejectedValue(new Error("offline"));
    const response = await dispatchFetch(fullFont);
    expect(await response!.text()).toBe("cached font");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches a successful on-demand font and avoids caching HTTP errors", async () => {
    expect((await dispatchFetch(fullFont))!.ok).toBe(true);
    expect(fontCache.put).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    expect((await dispatchFetch(fullFont))!.status).toBe(404);
    expect(fontCache.put).toHaveBeenCalledOnce();
  });

  it("returns a fetched font even if persistence fails, while leaving demo media alone", async () => {
    fontCache.put.mockRejectedValue(new Error("quota"));
    expect(await (await dispatchFetch(fullFont))!.text()).toBe("font");
    expect(dispatchFetch("/demo/anna.webp")).toBeUndefined();
  });

  it.each(["/", "/?lang=fr", "/index.html"])(
    "serves non-redirected installed HTML for offline navigation to %s",
    async (path) => {
      const html = new Response("installed HTML");
      // Cloudflare redirects /index.html to /. Cache.addAll follows that
      // redirect, but navigation cannot consume the resulting response.
      const redirectedHtml = new Response("redirected HTML");
      Object.defineProperty(redirectedHtml, "redirected", { value: true });
      shellCache.match.mockImplementation(async (key: string) =>
        key === "/" ? html : redirectedHtml,
      );
      fetchMock.mockRejectedValue(new TypeError("offline"));

      const response = await dispatchFetch(path, "navigate");
      expect(response!.redirected).toBe(false);
      expect(await response!.text()).toBe("installed HTML");
      expect(shellCache.match).toHaveBeenCalledWith("/");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("serves an unused JSON catalogue from the installed shell while offline", async () => {
    shellCache.match.mockResolvedValue(Response.json({ language: "ar" }));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const response = await dispatchFetch("/assets/ar-hash.json");
    expect(await response!.json()).toEqual({ language: "ar" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
