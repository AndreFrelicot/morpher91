import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { changeAppLanguage, prepareLanguage } from "./index";
import de from "./locales/de.json";

vi.mock("./fonts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fonts")>()),
  prepareLanguageFonts: () => Promise.resolve(),
}));

beforeEach(async () => {
  i18n.removeResourceBundle("de", "translation");
  await i18n.changeLanguage("en");
  localStorage.clear();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});

describe("catalogue loading over HTTP", () => {
  it("reissues a failed request on retry without changing the current language", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(de));
    vi.stubGlobal("fetch", fetcher);

    await expect(changeAppLanguage("de")).rejects.toThrow("503");
    expect(i18n.language).toBe("en");
    expect(localStorage.getItem("bwm.lang")).toBeNull();
    expect(i18n.hasResourceBundle("de", "translation")).toBe(false);

    expect(await changeAppLanguage("de")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[0][0]);
    expect(i18n.language).toBe("de");
    expect(i18n.t("topbar.new")).toBe(de.topbar.new);
    expect(localStorage.getItem("bwm.lang")).toBe("de");
  });

  it("retries a network rejection or invalid JSON without registering it", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("<html>temporary error</html>"))
      .mockResolvedValueOnce(Response.json(de));
    vi.stubGlobal("fetch", fetcher);

    await expect(prepareLanguage("de")).rejects.toThrow("offline");
    await expect(prepareLanguage("de")).rejects.toThrow();
    expect(i18n.hasResourceBundle("de", "translation")).toBe(false);
    await prepareLanguage("de");
    expect(i18n.hasResourceBundle("de", "translation")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("shares an in-flight fetch and reuses a successfully registered catalogue", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const first = prepareLanguage("de");
    const second = prepareLanguage("de");
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish(Response.json(de));
    await Promise.all([first, second]);
    await prepareLanguage("de");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
