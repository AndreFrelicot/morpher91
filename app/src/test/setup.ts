import "@testing-library/jest-dom/vitest";

Object.defineProperty(globalThis, "GPUTextureUsage", {
  configurable: true,
  writable: true,
  value: {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  },
});
// jsdom has no ResizeObserver; panes and overlays observe their own size.
if (typeof globalThis.ResizeObserver === "undefined") {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}
// Initialize i18next so code calling i18next.t() resolves real (English) strings.
import "@/i18n";
