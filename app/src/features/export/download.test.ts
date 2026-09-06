import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBlobDownload } from "./download";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startBlobDownload", () => {
  it("clicks an attached anchor and revokes the URL later", () => {
    const click = vi.mocked(HTMLAnchorElement.prototype.click);
    click.mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe("demo.zip");
    });

    startBlobDownload(new Blob(["zip"]), "demo.zip", 100);

    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("keeps the URL alive when early cleanup is repeated", () => {
    const active = startBlobDownload(new Blob(["zip"]), "demo.zip", 100);
    active.dispose();
    active.dispose();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    active.dispose();
    vi.advanceTimersByTime(100);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
