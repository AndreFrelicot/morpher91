import { ModalBackdrop } from "@/ui/components/ModalBackdrop";
import { useNumberFormatter } from "@/i18n/formatters";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowLeftRight, Film, Image as ImageIcon, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { Button } from "@/ui/components/ui/button";
import { GLOBAL_LAYER_ID } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import type { ImageSlot } from "@/store/projectStore";
import type { DemoAsset, DemoAssetKind, DemoManifest } from "./manifest";
import { assetLabel, presetName, presetDescription } from "./presetContent";
import {
  fetchDemoManifest,
  loadDemoAssetIntoSlot,
  loadDemoPreset,
} from "./loadDemoAssets";

type KindFilter = "all" | DemoAssetKind;
type DialogTab = "assets" | "presets";

function SlotChip({
  title,
  dotClassName,
  asset,
  language,
  emptyLabel,
}: {
  title: string;
  dotClassName: string;
  asset: DemoAsset | null;
  language: string;
  emptyLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card/50 px-2 py-1.5">
      <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} />
      <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {asset ? (
        <>
          <img
            src={`/demo/${asset.thumb}`}
            alt=""
            draggable={false}
            className="h-7 w-10 shrink-0 rounded border border-border object-cover"
          />
          <span className="truncate text-xs">
            {assetLabel(asset, language)}
          </span>
        </>
      ) : (
        <span className="truncate text-xs text-muted-foreground/60">
          {emptyLabel}
        </span>
      )}
    </div>
  );
}

export function DemoAssetsDialog() {
  const { t, i18n } = useTranslation();
  const formatNumber = useNumberFormatter();
  const open = useEditorStore((s) => s.demoDialogOpen);
  const setOpen = useEditorStore((s) => s.setDemoDialogOpen);
  const setTab = useEditorStore((s) => s.setTab);

  const [manifest, setManifest] = useState<DemoManifest | null>(null);
  const [manifestError, setManifestError] = useState(false);
  const [dialogTab, setDialogTab] = useState<DialogTab>("assets");
  const [filter, setFilter] = useState<KindFilter>("all");
  const [slots, setSlots] = useState<Record<ImageSlot, string | null>>({
    source: null,
    target: null,
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!open || manifest) return;
    fetchDemoManifest()
      .then(setManifest)
      .catch(() => setManifestError(true));
  }, [open, manifest]);

  // Fresh selection whenever the dialog closes — stale slots from a previous
  // visit would silently reuse old picks.
  const resetSelection = () => {
    setSlots({ source: null, target: null });
    setStatus("idle");
  };

  const assets = manifest?.assets ?? [];
  const visible =
    filter === "all" ? assets : assets.filter((a) => a.kind === filter);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const sourceAsset = slots.source ? (byId.get(slots.source) ?? null) : null;
  const targetAsset = slots.target ? (byId.get(slots.target) ?? null) : null;

  const toggleAsset = (id: string) => {
    setSlots((prev) => {
      if (prev.source === id) return { ...prev, source: null };
      if (prev.target === id) return { ...prev, target: null };
      if (!prev.source) return { ...prev, source: id };
      if (!prev.target) return { ...prev, target: id };
      return { ...prev, target: id };
    });
  };

  const load = async () => {
    if (!sourceAsset || !targetAsset) return;
    setStatus("loading");
    try {
      await Promise.all([
        loadDemoAssetIntoSlot(sourceAsset, "source"),
        loadDemoAssetIntoSlot(targetAsset, "target"),
      ]);
      resetSelection();
      // Same fresh-project reset as loadProjectFile: drop the stale active
      // layer and any debug view left on Mask/Layer/Contrib.
      const editor = useEditorStore.getState();
      editor.setActiveLayer(GLOBAL_LAYER_ID);
      editor.setLayerDebugMode("composite");
      setOpen(false);
      setTab("studio");
    } catch {
      setStatus("error");
    }
  };

  const slotBadge = (id: string): "A" | "B" | null =>
    slots.source === id ? "A" : slots.target === id ? "B" : null;

  const presets = manifest?.presets ?? [];

  const openPreset = async (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset || !manifest || status === "loading") return;
    setStatus("loading");
    try {
      await loadDemoPreset(preset, manifest);
      resetSelection();
      setOpen(false);
    } catch {
      setStatus("error");
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetSelection();
      }}
    >
      <Dialog.Portal>
        <ModalBackdrop className="z-[80]" />
        <Dialog.Content
          className={cn(
            dialogStyles.position,
            dialogStyles.surface,
            "z-[81] flex max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden",
          )}
        >
          <div className={dialogStyles.header}>
            <div>
              <Dialog.Title className={dialogStyles.title}>
                {t("demo.title")}
              </Dialog.Title>
              <Dialog.Description className={dialogStyles.description}>
                {t("demo.subtitle")}
                {dialogTab === "presets" && (
                  <span className="mt-2 block text-xs leading-relaxed">
                    {t("demo.presetsNote")}
                  </span>
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("mobile.close")}
                className={cn(dialogStyles.close)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div
            className="flex items-center gap-1 border-b border-border px-5 py-2 sm:px-6"
            role="tablist"
          >
            {(["assets", "presets"] as const).map((tabId) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={dialogTab === tabId}
                onClick={() => setDialogTab(tabId)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  FOCUS_RING,
                  dialogTab === tabId
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tabId === "assets"
                  ? t("demo.tabAssets")
                  : t("demo.tabPresets")}
              </button>
            ))}
          </div>

          {dialogTab === "presets" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {manifestError ? (
                <p className="text-sm text-destructive" role="alert">
                  {t("demo.manifestError")}
                </p>
              ) : presets.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("demo.presetsEmpty")}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {presets.map((preset) => {
                    const isVideo = Boolean(
                      preset.videos?.source ?? preset.videos?.target,
                    );
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={status === "loading"}
                        onClick={() => void openPreset(preset.id)}
                        className={cn(
                          "group relative overflow-hidden rounded-lg border border-border text-start transition-colors hover:border-ring/40 hover:bg-accent/30 disabled:opacity-60",
                          FOCUS_RING,
                        )}
                      >
                        <span
                          dir="ltr"
                          className="grid grid-cols-2 overflow-hidden bg-muted"
                        >
                          {[
                            preset.thumb,
                            preset.targetThumb ?? preset.thumb,
                          ].map((thumb, index) => (
                            <img
                              key={index}
                              src={`/demo/${thumb}`}
                              alt=""
                              draggable={false}
                              className="aspect-square w-full object-contain"
                              loading="lazy"
                            />
                          ))}
                        </span>
                        <span className="absolute end-1.5 top-1.5 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground backdrop-blur">
                          {isVideo ? (
                            <Film className="size-3" />
                          ) : (
                            <ImageIcon className="size-3" />
                          )}
                          {isVideo ? t("demo.kindVideo") : t("demo.kindImage")}
                        </span>
                        <span className="block px-2 pt-2 text-sm font-medium">
                          {presetName(preset, i18n.language)}
                        </span>
                        <span className="block px-2 pb-2 pt-1 text-xs leading-relaxed text-muted-foreground">
                          {presetDescription(preset.id, i18n.language)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {status === "error" && (
                <p className="mt-3 text-xs text-destructive" role="alert">
                  {t("demo.loadError")}
                </p>
              )}
            </div>
          )}

          {dialogTab === "assets" && (
            <>
              <div className="flex items-center gap-2 border-b border-border px-5 py-2 sm:px-6">
                <SlotChip
                  title={t("assets.sourceA")}
                  dotClassName="bg-image-a"
                  asset={sourceAsset}
                  language={i18n.language}
                  emptyLabel={t("demo.slotEmpty")}
                />
                <button
                  type="button"
                  title={t("demo.swap")}
                  aria-label={t("demo.swap")}
                  disabled={!slots.source && !slots.target}
                  onClick={() =>
                    setSlots((prev) => ({
                      source: prev.target,
                      target: prev.source,
                    }))
                  }
                  className={cn(
                    "shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40",
                    FOCUS_RING,
                  )}
                >
                  <ArrowLeftRight className="size-3.5" />
                </button>
                <SlotChip
                  title={t("assets.targetB")}
                  dotClassName="bg-image-b"
                  asset={targetAsset}
                  language={i18n.language}
                  emptyLabel={t("demo.slotEmpty")}
                />
              </div>

              <div className="flex items-center gap-1 border-b border-border px-5 py-2 sm:px-6">
                {(["all", "image", "video"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm transition-colors",
                      FOCUS_RING,
                      filter === f
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f === "all"
                      ? t("demo.filterAll")
                      : f === "image"
                        ? t("demo.filterImages")
                        : t("demo.filterVideos")}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                {manifestError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {t("demo.manifestError")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {visible.map((asset) => {
                      const badge = slotBadge(asset.id);
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => toggleAsset(asset.id)}
                          aria-pressed={badge !== null}
                          className={cn(
                            "group relative flex flex-col overflow-hidden rounded-lg border text-start transition-colors",
                            FOCUS_RING,
                            badge
                              ? "border-ring bg-accent/40"
                              : "border-border hover:border-ring/40 hover:bg-accent/30",
                          )}
                        >
                          {/* Keep thumbnail textures intact when the dialog's theme changes. */}
                          <img
                            src={`/demo/${asset.thumb}`}
                            alt={assetLabel(asset, i18n.language)}
                            draggable={false}
                            className="aspect-[4/3] w-full object-cover"
                            style={{ transform: "translateZ(0)" }}
                            loading="lazy"
                          />
                          {asset.kind === "video" && (
                            <span className="absolute end-1.5 top-1.5 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground backdrop-blur">
                              <Film className="size-3" />
                              {asset.durationSec === null
                                ? null
                                : t("export.secondsValue", {
                                    value: formatNumber(asset.durationSec, 1),
                                  })}
                            </span>
                          )}
                          {badge && (
                            <span
                              className={cn(
                                "absolute start-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-xs font-semibold text-background",
                                badge === "A" ? "bg-image-a" : "bg-image-b",
                              )}
                            >
                              {badge}
                            </span>
                          )}
                          <span className="block break-words px-2 py-1.5 text-sm">
                            {assetLabel(asset, i18n.language)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  dialogStyles.footer,
                  "flex items-center justify-between gap-3",
                )}
              >
                {status === "error" ? (
                  <p className="text-xs text-destructive" role="alert">
                    {t("demo.loadError")}
                  </p>
                ) : (
                  <span />
                )}
                <Button
                  onClick={() => void load()}
                  disabled={
                    !sourceAsset || !targetAsset || status === "loading"
                  }
                >
                  {status === "loading" ? t("assets.loading") : t("demo.load")}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
