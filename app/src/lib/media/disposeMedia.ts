import { disposeLoadedImage, type LoadedImage } from "@/lib/image/loadImage";
import { disposeLoadedVideo, type LoadedVideo } from "@/lib/video/loadVideo";

/**
 * Releases one project slot. A video owns its element, object URL and poster;
 * the separately exposed image may alias that poster and is therefore skipped.
 * The lower-level helpers are idempotent as a second line of defence.
 */
export function disposeSlotMedia(
  image: LoadedImage | null,
  video: LoadedVideo | null,
): void {
  if (video) disposeLoadedVideo(video);
  if (!video || image?.bitmap !== video.poster.bitmap) {
    disposeLoadedImage(image);
  }
}
