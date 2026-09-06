import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { onSharedDeviceLost } from "@/morph/gpu/sharedDevice";

let lost = false;
const subscribers = new Set<() => void>();

// Bridge the imperative device-loss event into React. Registered once at module
// load so a loss is caught even before the banner mounts.
onSharedDeviceLost(() => {
  lost = true;
  subscribers.forEach((cb) => cb());
});

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * Full-width prompt shown when the shared WebGPU device is lost (M12 lot 4).
 * The singleton can't be swapped under live canvases, so recovery is a reload.
 */
export function DeviceLostBanner() {
  const { t } = useTranslation();
  const isLost = useSyncExternalStore(
    subscribe,
    () => lost,
    () => false,
  );
  if (!isLost) return null;

  return (
    <div
      role="alert"
      className="absolute inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 border-b border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-100 backdrop-blur"
    >
      <span>{t("notices.deviceLost")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded border border-red-300/50 px-2 py-0.5 font-medium text-red-50 hover:bg-red-500/30"
      >
        {t("notices.reload")}
      </button>
    </div>
  );
}
