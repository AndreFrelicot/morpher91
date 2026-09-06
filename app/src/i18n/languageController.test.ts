import { describe, expect, it, vi } from "vitest";
import { createLanguageController } from "./languageController";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("language loading transactions", () => {
  it("keeps the current language until the third locale is fully ready", async () => {
    const load = deferred();
    const apply = vi.fn();
    const change = createLanguageController(() => load.promise, apply);
    const pending = change("de");
    expect(apply).not.toHaveBeenCalled();
    load.resolve();
    expect(await pending).toBe(true);
    expect(apply).toHaveBeenCalledExactlyOnceWith("de");
  });

  it("only applies the latest choice when requests resolve out of order", async () => {
    const first = deferred();
    const last = deferred();
    const apply = vi.fn();
    const change = createLanguageController(
      (language) => (language === "de" ? first.promise : last.promise),
      apply,
    );
    const a = change("de");
    const b = change("ja");
    last.resolve();
    expect(await b).toBe(true);
    first.resolve();
    expect(await a).toBe(false);
    expect(apply).toHaveBeenCalledExactlyOnceWith("ja");
  });

  it("discards a stale failure without undoing the newest selection", async () => {
    const stale = deferred();
    const apply = vi.fn();
    const change = createLanguageController(
      (language) => (language === "de" ? stale.promise : Promise.resolve()),
      apply,
    );
    const a = change("de");
    await change("fr");
    stale.reject(new Error("offline"));
    expect(await a).toBe(false);
    expect(apply).toHaveBeenCalledExactlyOnceWith("fr");
  });

  it("retains the old language on failure and permits a real retry", async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const apply = vi.fn();
    const change = createLanguageController(prepare, apply);
    await expect(change("ar")).rejects.toThrow("offline");
    expect(apply).not.toHaveBeenCalled();
    expect(await change("ar")).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledExactlyOnceWith("ar");
  });
});
