import { useEffect, useId, useRef, useState } from "react";
import { Film, ImagePlus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { loadLocalImage } from "@/lib/image/loadImage";
import {
  disposeLoadedVideo,
  loadLocalVideo,
  type LoadedVideo,
} from "@/lib/video/loadVideo";
import { VideoRelinkError, type VideoRelinkErrorCode } from "@/morph/model";
import { assist } from "@/assist/anchors";
import { useProjectStore, type ImageSlot } from "@/store/projectStore";
import { FOCUS_WITHIN_RING } from "@/ui/focusRing";

const SLOT_LABEL_KEY = {
  source: "assets.sourceA",
  target: "assets.targetB",
} as const satisfies Record<ImageSlot, string>;

type AssetErrorKey =
  | "assets.relinkVideoOnly"
  | "assets.relinkMismatch"
  | "assets.relinkNoSavedVideo"
  | "assets.relinkAlreadyLinked"
  | "assets.loadError";

const VIDEO_RELINK_ERROR_KEYS = {
  "no-saved-video": "assets.relinkNoSavedVideo",
  "already-linked": "assets.relinkAlreadyLinked",
  mismatch: "assets.relinkMismatch",
} as const satisfies Record<VideoRelinkErrorCode, AssetErrorKey>;

/** Cover-fit preview of the already-decoded ImageBitmap (video poster included). */
function AssetThumb({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = Math.max(
      canvas.width / bitmap.width,
      canvas.height / bitmap.height,
    );
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      bitmap,
      (canvas.width - w) / 2,
      (canvas.height - h) / 2,
      w,
      h,
    );
  }, [bitmap]);

  return (
    <canvas
      ref={ref}
      width={112}
      height={80}
      className="h-10 w-14 shrink-0 rounded-md border border-border bg-black/20"
    />
  );
}

export function AssetUploader({
  slot,
  dotClassName,
}: {
  slot: ImageSlot;
  dotClassName: string;
}) {
  const { t } = useTranslation();
  const image = useProjectStore((s) => s[slot]);
  const video = useProjectStore((s) =>
    slot === "source" ? s.sourceVideo : s.targetVideo,
  );
  const savedVideo = useProjectStore((s) => s.project?.videos?.[slot]);
  const setImage = useProjectStore((s) => s.setImage);
  const setVideo = useProjectStore((s) => s.setVideo);
  const relinkVideo = useProjectStore((s) => s.relinkVideo);
  const inputId = useId();
  const replacementInputId = useId();
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<AssetErrorKey | null>(null);
  const missingVideo = savedVideo !== undefined && video === null;

  const onFile = async (file: File | undefined, mode: "normal" | "relink") => {
    if (!file) return;
    setLoading(true);
    setErrorKey(null);
    let unownedVideo: LoadedVideo | null = null;
    try {
      if (mode === "relink" && !file.type.startsWith("video/")) {
        setErrorKey("assets.relinkVideoOnly");
        return;
      }
      if (file.type.startsWith("video/")) {
        const loaded = await loadLocalVideo(file);
        if (mode === "relink") {
          unownedVideo = loaded;
          relinkVideo(slot, loaded);
          unownedVideo = null;
        } else {
          setVideo(slot, loaded);
        }
      } else {
        setImage(slot, await loadLocalImage(file));
      }
    } catch (error) {
      if (unownedVideo) disposeLoadedVideo(unownedVideo);
      setErrorKey(
        error instanceof VideoRelinkError
          ? VIDEO_RELINK_ERROR_KEYS[error.code]
          : "assets.loadError",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        {...assist(slot === "source" ? "assets.source" : "assets.target")}
        title={
          missingVideo
            ? t("assets.relink")
            : image
              ? t("assets.replace")
              : t("assets.choose")
        }
        className={cn(
          "group flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card/50 p-1.5 transition-colors hover:border-ring/40 hover:bg-accent/40",
          FOCUS_WITHIN_RING,
        )}
      >
        {image && !loading ? (
          <AssetThumb bitmap={image.bitmap} />
        ) : (
          <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-background/40">
            <ImagePlus className="size-4 text-muted-foreground/60" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span
              className={cn("size-1.5 shrink-0 rounded-full", dotClassName)}
            />
            {t(SLOT_LABEL_KEY[slot])}
            {(video || missingVideo) && <Film className="size-3" />}
          </span>
          <span
            className={cn(
              "block text-xs",
              !loading && (missingVideo || image) ? "truncate" : "break-words",
            )}
          >
            {loading
              ? t("assets.loading")
              : missingVideo
                ? savedVideo.name
                : image
                  ? image.asset.name
                  : t("assets.choose")}
          </span>
          {missingVideo && !loading && (
            <span className="block text-[10px] text-amber-300">
              {t("assets.videoMissing")}
            </span>
          )}
          {image && !loading && !missingVideo && (
            <span className="block font-mono text-[10px] text-muted-foreground">
              <bdi dir="ltr">
                {image.asset.width}×{image.asset.height}
              </bdi>
              {video && ` · ${t("assets.video")}`}
            </span>
          )}
        </span>
        {missingVideo ? (
          <span className="mr-1 shrink-0 rounded border border-amber-400/40 px-1.5 py-0.5 text-[10px] text-amber-300">
            {t("assets.relink")}
          </span>
        ) : (
          <Upload className="mr-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
        )}
      </label>
      <input
        id={inputId}
        type="file"
        hidden
        accept={missingVideo ? "video/*" : "image/*,video/*"}
        onChange={(e) => {
          void onFile(e.target.files?.[0], missingVideo ? "relink" : "normal");
          e.target.value = "";
        }}
      />
      {missingVideo && (
        <>
          <label
            htmlFor={replacementInputId}
            className="mt-1 block cursor-pointer text-end text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("assets.replaceInstead")}
          </label>
          <input
            id={replacementInputId}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0], "normal");
              e.target.value = "";
            }}
          />
        </>
      )}
      {errorKey && (
        <p className="mt-1 text-[10px] text-destructive" role="alert">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
