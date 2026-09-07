import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
  type VideoSample,
} from "mediabunny";

/**
 * Sequential frame cursor (M23): frames requested in non-decreasing time
 * order come from ONE decoder stream — each packet decoded once, ~1 ms per
 * frame — instead of a keyframe rollback per request. A request going back
 * in time restarts the stream from there (one rollback). Requests are
 * serialized; the caller owns and must `close()` every returned frame.
 */
export type SequentialFrameCursor = {
  /** The frame presented at `timeSec` (last frame at or before it; past the
   * end ⇒ the final frame); null when nothing could be decoded. */
  next(
    timeSec: number,
    shouldContinue?: () => boolean,
  ): Promise<VideoFrame | null>;
  /** Releases the decoder stream. */
  close(): Promise<void>;
};

/** Tolerance when matching a requested time against sample timestamps. */
const SAMPLE_TIME_EPSILON = 1e-6;

/**
 * Frame-exact WebCodecs decoding for one video (M22). Wraps a Mediabunny
 * `Input` + `VideoSampleSink`: keyframe-aware seeks and decoding through
 * `VideoDecoder` — no `<video>` element, no browser-controlled seek. `open`
 * resolves to null when WebCodecs or the codec is unavailable, so callers keep
 * the existing `<video>` path as fallback. Callers own every returned
 * `VideoFrame` and must `close()` it as soon as it is consumed.
 */

/** Clamps a requested time into the track's addressable range: sampling below
 * the first timestamp would return no frame, so it maps to the first frame. */
export function mapTimeToTrack(
  timeSec: number,
  firstTimestampSec: number,
): number {
  if (!Number.isFinite(timeSec)) return firstTimestampSec;
  return Math.max(firstTimestampSec, timeSec);
}

export class WebCodecsVideoReader {
  private disposed = false;
  private tail: Promise<unknown> = Promise.resolve();
  private scrubCursor: SequentialFrameCursor | null = null;
  private readonly input: Input;
  private readonly sink: VideoSampleSink;
  /** Presentation time of the track's first frame. */
  readonly firstTimestampSec: number;
  /** The track's own frame rate (M23 cache keys); null when unknown. */
  readonly nativeFps: number | null;

  private constructor(
    input: Input,
    sink: VideoSampleSink,
    firstTimestampSec: number,
    nativeFps: number | null,
  ) {
    this.input = input;
    this.sink = sink;
    this.firstTimestampSec = firstTimestampSec;
    this.nativeFps = nativeFps;
  }

  /** Opens `url` (object URL or asset URL) for decoding; null ⇒ unsupported. */
  static async open(url: string): Promise<WebCodecsVideoReader | null> {
    if (typeof VideoDecoder === "undefined") return null;
    let input: Input | null = null;
    try {
      const blob = await fetch(url).then((response) => response.blob());
      input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) {
        input.dispose();
        return null;
      }
      const firstTimestampSec = await track.getFirstTimestamp();
      let nativeFps: number | null = null;
      try {
        const { averagePacketRate } = await track.computePacketStats(200);
        nativeFps = averagePacketRate > 0 ? averagePacketRate : null;
      } catch {
        nativeFps = null; // callers fall back to the timeline frame rate
      }
      return new WebCodecsVideoReader(
        input,
        new VideoSampleSink(track),
        firstTimestampSec,
        nativeFps,
      );
    } catch {
      input?.dispose();
      return null;
    }
  }

  /**
   * The frame presented at `timeSec` — the last frame starting at or before
   * it, clamped into the track range (so past-the-end times return the final
   * frame). Calls are serialized so concurrent seeks never race the decoder.
   * The caller must `close()` the returned frame. Null when disposed or when
   * nothing could be decoded.
   */
  frameAt(
    timeSec: number,
    shouldContinue: () => boolean = () => true,
  ): Promise<VideoFrame | null> {
    return this.enqueueFrame(async () => {
      await this.releaseScrubCursor();
      if (!shouldContinue()) return null;
      return this.readFrame(timeSec);
    }, shouldContinue);
  }

  /** Interactive seeks reuse a short forward run; large/backward jumps restart
   * at their destination instead of decoding everything between the two times. */
  scrubFrameAt(
    timeSec: number,
    shouldContinue: () => boolean,
  ): Promise<VideoFrame | null> {
    return this.enqueueFrame(async () => {
      this.scrubCursor ??= this.openSequence(0.25);
      return this.scrubCursor.next(timeSec, shouldContinue);
    }, shouldContinue);
  }

  private enqueueFrame(
    read: () => Promise<VideoFrame | null>,
    shouldContinue: () => boolean,
  ): Promise<VideoFrame | null> {
    const run = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (this.disposed || !shouldContinue()) return null;
        const frame = await read();
        if (this.disposed || !shouldContinue()) {
          frame?.close();
          return null;
        }
        return frame;
      });
    this.tail = run;
    return run;
  }

  private async releaseScrubCursor(): Promise<void> {
    const cursor = this.scrubCursor;
    this.scrubCursor = null;
    await cursor?.close();
  }

  /** Playback no longer needs an idle preview decoder. */
  closeScrubCursor(): void {
    void this.releaseScrubCursor();
  }

  /**
   * Sequential decode of the frames presented in `[startSec, endSec)` (M23):
   * one decoder and one keyframe rollback for the whole range, then roughly a
   * millisecond per frame — versus a full rollback per {@link frameAt}. The
   * first frame emitted is the one presented at `startSec`. `onFrame` owns
   * each frame and must `close()` it; `shouldContinue` is checked before each
   * frame and, when false, the sweep stops and releases the decoder.
   * Serialized with `frameAt`, so a sweep never races a seek.
   */
  framesInRange(
    startSec: number,
    endSec: number,
    onFrame: (frame: VideoFrame, timestampSec: number) => void,
    shouldContinue: () => boolean,
  ): Promise<void> {
    const run = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (this.disposed || !shouldContinue()) return;
        await this.releaseScrubCursor();
        await this.readRange(startSec, endSec, onFrame, shouldContinue);
      });
    this.tail = run;
    return run;
  }

  /**
   * Opens a {@link SequentialFrameCursor} over this track (export path). The
   * cursor keeps its own decoder stream: it holds the current sample plus one
   * look-ahead sample, and repeated requests for the same frame hand out new
   * `VideoFrame` clones of the same decoded image. Do not interleave with
   * {@link frameAt}/{@link framesInRange} on the same reader.
   */
  openSequence(
    maxForwardSec = Number.POSITIVE_INFINITY,
  ): SequentialFrameCursor {
    let iterator: AsyncIterator<VideoSample> | null = null;
    let current: VideoSample | null = null;
    let peek: VideoSample | null | undefined;
    let lastTimeSec = Number.NEGATIVE_INFINITY;
    let chain: Promise<unknown> = Promise.resolve();
    let closed = false;

    const reset = async () => {
      current?.close();
      current = null;
      peek?.close();
      peek = undefined;
      const previous = iterator;
      iterator = null;
      await previous?.return?.().catch(() => undefined);
    };

    const advance = async (
      timeSec: number,
      shouldContinue: () => boolean,
    ): Promise<VideoFrame | null> => {
      const active = () => !closed && !this.disposed && shouldContinue();
      if (!active()) return null;
      const time = mapTimeToTrack(timeSec, this.firstTimestampSec);
      if (
        !iterator ||
        time < lastTimeSec ||
        time - lastTimeSec > maxForwardSec
      ) {
        await reset();
        if (!active()) return null;
        iterator = this.sink.samples(time)[Symbol.asyncIterator]();
      }
      lastTimeSec = time;
      if (!current) {
        const first = await iterator.next();
        if (first.done) return null;
        current = first.value;
      }
      for (;;) {
        if (!active()) {
          // Keep decoded samples for a newer forward seek; obsolete output is
          // discarded without throwing away the useful decoder position.
          if (closed || this.disposed) await reset();
          return null;
        }
        if (peek === undefined) {
          const result = await iterator.next();
          peek = result.done ? null : result.value;
        }
        if (!active()) {
          // Keep decoded samples for a newer forward seek; obsolete output is
          // discarded without throwing away the useful decoder position.
          if (closed || this.disposed) await reset();
          return null;
        }
        if (peek && peek.timestamp <= time + SAMPLE_TIME_EPSILON) {
          current.close();
          current = peek;
          peek = undefined;
          continue;
        }
        return current.toVideoFrame();
      }
    };

    return {
      next: (timeSec, shouldContinue = () => true) => {
        const run = chain
          .catch(() => undefined)
          .then(async () => {
            try {
              return await advance(timeSec, shouldContinue);
            } catch {
              await reset();
              return null;
            }
          });
        chain = run;
        return run;
      },
      close: () => {
        closed = true;
        const run = chain.catch(() => undefined).then(reset);
        chain = run;
        return run;
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.releaseScrubCursor();
    this.input.dispose();
  }

  private async readRange(
    startSec: number,
    endSec: number,
    onFrame: (frame: VideoFrame, timestampSec: number) => void,
    shouldContinue: () => boolean,
  ): Promise<void> {
    if (this.disposed || !shouldContinue()) return;
    const start = mapTimeToTrack(startSec, this.firstTimestampSec);
    if (!(endSec > start)) return;
    try {
      // Returning early out of for-await calls `return()` on the iterator,
      // which is how Mediabunny closes its decoder and pending samples.
      for await (const sample of this.sink.samples(start, endSec)) {
        if (!shouldContinue() || this.disposed) {
          sample.close();
          return;
        }
        const { timestamp } = sample;
        let frame: VideoFrame;
        try {
          frame = sample.toVideoFrame();
        } finally {
          sample.close();
        }
        onFrame(frame, timestamp);
      }
    } catch {
      // Best-effort background decode; callers treat a short sweep as misses.
    }
  }

  private async readFrame(timeSec: number): Promise<VideoFrame | null> {
    if (this.disposed) return null;
    try {
      const sample = await this.sink.getSample(
        mapTimeToTrack(timeSec, this.firstTimestampSec),
      );
      if (!sample) return null;
      try {
        return sample.toVideoFrame();
      } finally {
        sample.close();
      }
    } catch {
      return null;
    }
  }
}
