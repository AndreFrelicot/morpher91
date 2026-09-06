import { ModalBackdrop } from "@/ui/components/ModalBackdrop";
import { useNumberFormatter } from "@/i18n/formatters";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Download, Share2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import {
  isWebCodecsSupported,
  isWebGPUSupported,
} from "@/lib/gpu/capabilities";
import { useEditorStore } from "@/store/editorStore";
import { hasMissingProjectVideos, useProjectStore } from "@/store/projectStore";
import { useExportStore } from "@/store/exportStore";
import {
  exportMorphToFrameZip,
  exportMorphToVideo,
  type ExportProgress,
} from "@/morph/export/exportMorph";
import { resolveExportDimensions } from "@/morph/export/exportDimensions";
import {
  effectiveExportDuration,
  ExportError,
  type ExportErrorCode,
  validateExportJob,
} from "@/morph/export/exportValidation";
import type { ExportSettings } from "@/morph/model";
import { normalizeBackgroundForOutput } from "@/morph/model";
import { startBlobDownload, type ActiveDownload } from "./download";

type RunStatus = "idle" | "running" | "done" | "cancelled" | "error";

const EXPORT_ERROR_KEYS = {
  "unsupported-webgpu": "export.errors.unsupportedWebgpu",
  "unsupported-webcodecs": "export.errors.unsupportedWebcodecs",
  "unsupported-codec": "export.errors.unsupportedCodec",
  "invalid-dimensions": "export.errors.invalidDimensions",
  "device-dimension-limit": "export.errors.deviceDimensionLimit",
  "invalid-fps": "export.errors.invalidFps",
  "invalid-duration": "export.errors.invalidDuration",
  "too-many-frames": "export.errors.tooManyFrames",
  "invalid-bitrate": "export.errors.invalidBitrate",
  "sequence-too-large": "export.errors.sequenceTooLarge",
  "media-missing": "export.errors.mediaMissing",
  cancelled: "export.errors.cancelled",
  "gpu-failure": "export.errors.gpuFailure",
} as const satisfies Record<ExportErrorCode, string>;

const FORMATS: {
  label: string;
  codec: ExportSettings["codec"];
  container: ExportSettings["container"];
}[] = [
  { label: "H.264 · MP4", codec: "avc1.42E01E", container: "mp4" },
  { label: "VP9 · WebM", codec: "vp09.00.10.08", container: "webm" },
  { label: "AV1 · MP4", codec: "av01.0.05M.08", container: "mp4" },
];

const RESOLUTIONS: { label: string; width: number; height: number }[] = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1:1", width: 1024, height: 1024 },
];

const RESOLUTION_PRESETS: ExportSettings["resolutionPreset"][] = [
  "project",
  "source",
  "target",
  "custom",
];

type ExportResult = { blob: Blob; filename: string };

function resultAsFile(result: ExportResult): File {
  return new File([result.blob], result.filename, { type: result.blob.type });
}

/** Web Share with files is iOS Safari's native "save to Photos/Files" path. */
function canShareResult(result: ExportResult | null): boolean {
  if (!result || typeof navigator === "undefined" || !navigator.canShare) {
    return false;
  }
  try {
    return navigator.canShare({ files: [resultAsFile(result)] });
  } catch {
    return false;
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <h3 className={cn(dialogStyles.sectionTitle, "mb-3")}>{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/**
 * Modal export dialog: the settings scroll inside the body while the header
 * and the run/progress footer stay visible whatever the viewport height.
 */
export function ExportDialog() {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const open = useEditorStore((s) => s.exportDialogOpen);
  const setOpen = useEditorStore((s) => s.setExportDialogOpen);
  const [webgpu] = useState(isWebGPUSupported);
  const [webcodecs] = useState(isWebCodecsSupported);
  const settings = useExportStore((s) => s.settings);
  const setSettings = useExportStore((s) => s.setSettings);
  const project = useProjectStore((s) => s.project);
  const hasProject = project !== null;
  const hasImages = useProjectStore(
    (s) => s.source !== null && s.target !== null,
  );
  const hasVideos = Boolean(project?.videos?.source || project?.videos?.target);
  const mediaMissing = useProjectStore(hasMissingProjectVideos);

  const [status, setStatus] = useState<RunStatus>("idle");
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const downloadRef = useRef<ActiveDownload | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      downloadRef.current?.dispose();
    },
    [],
  );

  const patch = (p: Partial<ExportSettings>) => setSettings(p);
  const setOutputKind = (outputKind: ExportSettings["outputKind"]) => {
    patch({
      outputKind,
      background: normalizeBackgroundForOutput(outputKind, settings.background),
    });
  };

  const setResolutionPreset = (
    resolutionPreset: ExportSettings["resolutionPreset"],
  ) => {
    if (!project) {
      patch({ resolutionPreset });
      return;
    }
    const dimensions = resolveExportDimensions(project, {
      ...settings,
      resolutionPreset,
    });
    patch({ resolutionPreset, ...dimensions });
  };

  const run = async () => {
    const ps = useProjectStore.getState();
    if (!ps.project || !ps.source || !ps.target) return;
    setStatus("running");
    setError(null);
    setProgress(null);
    setResult(null);
    downloadRef.current?.dispose();
    downloadRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const exporter =
        settings.outputKind === "frames"
          ? exportMorphToFrameZip
          : exportMorphToVideo;
      const { blob, filename } = await exporter({
        project: ps.project,
        settings,
        source: ps.source.bitmap,
        target: ps.target.bitmap,
        sourceVideo: ps.sourceVideo,
        targetVideo: ps.targetVideo,
        onProgress: setProgress,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new ExportError("cancelled");
      downloadRef.current = startBlobDownload(blob, filename);
      setResult({ blob, filename });
      setStatus("done");
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof ExportError && err.code === "cancelled")
      ) {
        setStatus("cancelled");
        return;
      }
      setError(
        t(
          err instanceof ExportError
            ? EXPORT_ERROR_KEYS[err.code]
            : "export.errors.gpuFailure",
        ),
      );
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const handleShare = async () => {
    if (!result) return;
    try {
      await navigator.share({
        files: [resultAsFile(result)],
        title: result.filename,
      });
    } catch {
      // User dismissed the share sheet, or sharing is unavailable — no-op.
    }
  };

  const running = status === "running";
  const isFrames = settings.outputKind === "frames";
  const shareable = canShareResult(result);
  const effectiveDimensions = project
    ? resolveExportDimensions(project, settings)
    : { width: settings.width, height: settings.height };
  let validationError: ExportError | null = webgpu
    ? null
    : new ExportError("unsupported-webgpu");
  if (project && !validationError) {
    try {
      validateExportJob(project, settings, { dimensions: effectiveDimensions });
    } catch (caught) {
      validationError =
        caught instanceof ExportError
          ? caught
          : new ExportError("gpu-failure", { cause: caught });
    }
  }
  const canExport =
    hasProject &&
    hasImages &&
    !mediaMissing &&
    !validationError &&
    (isFrames || webcodecs);
  const pct =
    progress && progress.frameCount > 0
      ? Math.round((progress.frameIndex / progress.frameCount) * 100)
      : 0;

  const activeFormat = FORMATS.find(
    (f) => f.codec === settings.codec && f.container === settings.container,
  );
  const effectiveDurationSec = project
    ? effectiveExportDuration(project, settings)
    : settings.durationSec;

  return (
    <Dialog.Root
      open={open}
      // Unmounting aborts a running export: stay open until it finishes or
      // the user cancels it explicitly.
      onOpenChange={(next) => {
        if (next || !running) setOpen(next);
      }}
    >
      <Dialog.Portal>
        <ModalBackdrop className="z-[80]" />
        <Dialog.Content
          {...assist("export.panel")}
          onInteractOutside={(event) => {
            // The guided assistant's popover floats above the dialog; using
            // its buttons must not dismiss the export.
            if (
              event.target instanceof Element &&
              event.target.closest("[data-assist-popover]")
            ) {
              event.preventDefault();
            }
          }}
          className={cn(
            dialogStyles.position,
            dialogStyles.surface,
            "z-[81] flex max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden",
          )}
        >
          <div className={dialogStyles.header}>
            <div>
              <Dialog.Title className={dialogStyles.title}>
                {t("export.title")}
              </Dialog.Title>
              <Dialog.Description className={dialogStyles.description}>
                {t("export.subtitle")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("mobile.close")}
                disabled={running}
                className={cn(dialogStyles.close)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {!webcodecs && !isFrames && (
              <div className="bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                {t("notices.noWebcodecs")}
              </div>
            )}

            {mediaMissing && (
              <div
                className="bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
                role="alert"
              >
                {t("export.videoMissing")}
              </div>
            )}

            <Section title={t("export.output")}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOutputKind("video")}
                  aria-pressed={settings.outputKind === "video"}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1 text-sm transition-colors",
                    FOCUS_RING,
                    settings.outputKind === "video"
                      ? "border-ring bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("export.video")}
                </button>
                <button
                  type="button"
                  onClick={() => setOutputKind("frames")}
                  aria-pressed={settings.outputKind === "frames"}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1 text-sm transition-colors",
                    FOCUS_RING,
                    settings.outputKind === "frames"
                      ? "border-ring bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("export.imageSequence")}
                </button>
              </div>
            </Section>

            <Section title={t("export.resolution")}>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
                {RESOLUTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setResolutionPreset(preset)}
                    aria-pressed={settings.resolutionPreset === preset}
                    disabled={!project && preset !== "custom"}
                    className={cn(
                      "min-w-0 break-words rounded-md border px-2 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      FOCUS_RING,
                      settings.resolutionPreset === preset
                        ? "border-ring bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`export.presets.${preset}`)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() =>
                      patch({
                        resolutionPreset: "custom",
                        width: r.width,
                        height: r.height,
                      })
                    }
                    aria-pressed={
                      settings.resolutionPreset === "custom" &&
                      settings.width === r.width &&
                      settings.height === r.height
                    }
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1 text-sm transition-colors",
                      FOCUS_RING,
                      settings.resolutionPreset === "custom" &&
                        settings.width === r.width &&
                        settings.height === r.height
                        ? "border-ring bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="min-w-0 space-y-1">
                  <span className="block text-muted-foreground">
                    {t("export.width")}
                  </span>
                  <input
                    type="number"
                    min={16}
                    max={3840}
                    value={settings.width}
                    onChange={(e) =>
                      patch({
                        resolutionPreset: "custom",
                        width: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-card px-2 py-1 tabular-nums"
                  />
                </label>
                <label className="min-w-0 space-y-1">
                  <span className="block text-muted-foreground">
                    {t("export.height")}
                  </span>
                  <input
                    type="number"
                    min={16}
                    max={2160}
                    value={settings.height}
                    onChange={(e) =>
                      patch({
                        resolutionPreset: "custom",
                        height: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-card px-2 py-1 tabular-nums"
                  />
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("export.effective")}{" "}
                <bdi dir="ltr" className="tabular-nums">
                  {effectiveDimensions.width}×{effectiveDimensions.height}
                </bdi>
              </div>
            </Section>

            <Section title={t("export.timing")}>
              <label className="block text-sm">
                <div className="mb-1 flex items-center justify-between text-muted-foreground">
                  <span>{t("export.duration")}</span>
                  <span className="tabular-nums">
                    {t("export.secondsValue", {
                      value: formatNumber(
                        hasVideos ? effectiveDurationSec : settings.durationSec,
                      ),
                    })}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={
                    hasVideos ? effectiveDurationSec : settings.durationSec
                  }
                  disabled={hasVideos}
                  onChange={(e) =>
                    patch({ durationSec: Number(e.target.value) })
                  }
                  className="w-full disabled:opacity-50"
                />
              </label>
              {hasVideos && (
                <p className="text-xs text-muted-foreground">
                  {t("export.videoDurationNote")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("export.limits")}
              </p>

              <label className="block text-sm">
                <div className="mb-1 flex items-center justify-between text-muted-foreground">
                  <span>{t("export.frameRate")}</span>
                  <span className="tabular-nums">
                    {t("export.frameRateValue", {
                      value: formatNumber(settings.fps),
                    })}
                  </span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={60}
                  step={1}
                  value={settings.fps}
                  onChange={(e) => patch({ fps: Number(e.target.value) })}
                  className="w-full"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("export.pingPong")}
                </span>
                <input
                  type="checkbox"
                  checked={settings.includePingPong}
                  onChange={() =>
                    patch({ includePingPong: !settings.includePingPong })
                  }
                />
              </label>
            </Section>

            <Section
              title={
                isFrames ? t("export.imageSequence") : t("export.encoding")
              }
            >
              {isFrames ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">
                      {t("export.format")}
                    </span>
                    <select
                      value={settings.frameFormat}
                      onChange={(e) =>
                        patch({
                          frameFormat: e.target
                            .value as ExportSettings["frameFormat"],
                        })
                      }
                      className="w-full rounded-md border border-border bg-card px-2 py-1"
                    >
                      <option value="png">PNG</option>
                    </select>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">manifest.json</span>
                    <input
                      type="checkbox"
                      checked={settings.includeManifest}
                      onChange={() =>
                        patch({ includeManifest: !settings.includeManifest })
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">
                      {t("export.format")}
                    </span>
                    <select
                      value={activeFormat?.label ?? FORMATS[0].label}
                      onChange={(e) => {
                        const f = FORMATS.find(
                          (x) => x.label === e.target.value,
                        );
                        if (f)
                          patch({ codec: f.codec, container: f.container });
                      }}
                      className="w-full rounded-md border border-border bg-card px-2 py-1"
                    >
                      {FORMATS.map((f) => (
                        <option key={f.label} value={f.label}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    <div className="mb-1 flex items-center justify-between text-muted-foreground">
                      <span>{t("export.bitrate")}</span>
                      <span className="tabular-nums">
                        {t("export.bitrateValue", {
                          value: formatNumber(settings.bitrate / 1_000_000, 1),
                        })}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1_000_000}
                      max={20_000_000}
                      step={500_000}
                      value={settings.bitrate}
                      onChange={(e) =>
                        patch({ bitrate: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </label>
                </>
              )}

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  {t("export.background")}
                </span>
                <select
                  value={settings.background}
                  onChange={(e) =>
                    patch({
                      background: e.target
                        .value as ExportSettings["background"],
                    })
                  }
                  className="w-full rounded-md border border-border bg-card px-2 py-1"
                >
                  <option value="black">{t("export.backgrounds.black")}</option>
                  <option value="white">{t("export.backgrounds.white")}</option>
                  {isFrames && (
                    <option value="transparent">
                      {t("export.backgrounds.transparent")}
                    </option>
                  )}
                </select>
              </label>
            </Section>
          </div>

          <div className={dialogStyles.footer}>
            {!hasImages && (
              <p className="mb-3 text-sm text-muted-foreground">
                {t("export.importPrompt")}
              </p>
            )}

            {validationError && (
              <p
                className="mb-3 text-sm text-amber-800 dark:text-amber-300"
                role="alert"
              >
                {t(EXPORT_ERROR_KEYS[validationError.code])}
              </p>
            )}

            <Button
              {...assist("export.button")}
              onClick={running ? cancel : () => void run()}
              disabled={!running && !canExport}
              className="w-full"
            >
              {running ? (
                <>
                  <X />
                  {t("export.cancel")}
                </>
              ) : (
                <>
                  <Download />
                  {t("export.exportButton", {
                    format: isFrames ? "ZIP" : settings.container.toUpperCase(),
                  })}
                </>
              )}
            </Button>

            {running && progress && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t(`export.phases.${progress.phase}`)}</span>
                  <span className="tabular-nums">
                    {t("export.frameProgress", {
                      index: progress.frameIndex,
                      count: progress.frameCount,
                    })}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/40">
                  <div
                    className="h-full bg-foreground transition-[width] motion-reduce:transition-none"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {status === "done" && (
              <p className="mt-3 text-sm text-primary">{t("export.done")}</p>
            )}

            {status === "cancelled" && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("export.errors.cancelled")}
              </p>
            )}

            {status === "done" && shareable && (
              <Button
                variant="ghost"
                onClick={() => void handleShare()}
                className="mt-3 w-full"
              >
                <Share2 />
                {t("export.share")}
              </Button>
            )}

            {status === "error" && error && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
