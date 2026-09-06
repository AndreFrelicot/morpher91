import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebCodecsVideoReader, mapTimeToTrack } from "./WebCodecsVideoReader";

const mocks = vi.hoisted(() => ({
  inputDispose: vi.fn(),
  getPrimaryVideoTrack: vi.fn(),
  canDecode: vi.fn(),
  getFirstTimestamp: vi.fn(),
  computePacketStats: vi.fn(),
  getSample: vi.fn(),
  samples: vi.fn(),
}));

vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: class {
    readonly blob: unknown;
    constructor(blob: unknown) {
      this.blob = blob;
    }
  },
  Input: class {
    dispose = mocks.inputDispose;
    getPrimaryVideoTrack = mocks.getPrimaryVideoTrack;
  },
  VideoSampleSink: class {
    getSample = mocks.getSample;
    samples = mocks.samples;
  },
}));

const track = {
  canDecode: mocks.canDecode,
  getFirstTimestamp: mocks.getFirstTimestamp,
  computePacketStats: mocks.computePacketStats,
};

function makeSample(frame: unknown, timestamp = 0, duration = 0) {
  return {
    timestamp,
    duration,
    toVideoFrame: vi.fn(() => frame),
    close: vi.fn(),
  };
}

/** Async iterator over `samples` that records whether `return()` was called. */
function sampleStream(samples: unknown[]) {
  let index = 0;
  const stream = {
    returned: false,
    [Symbol.asyncIterator]() {
      return stream;
    },
    async next() {
      return index < samples.length
        ? { value: samples[index++], done: false as const }
        : { value: undefined, done: true as const };
    },
    async return() {
      stream.returned = true;
      return { value: undefined, done: true as const };
    },
  };
  return stream;
}

beforeEach(() => {
  vi.stubGlobal("VideoDecoder", class {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ blob: async () => new Blob() })),
  );
  mocks.inputDispose.mockReset();
  mocks.getPrimaryVideoTrack.mockReset().mockResolvedValue(track);
  mocks.canDecode.mockReset().mockResolvedValue(true);
  mocks.getFirstTimestamp.mockReset().mockResolvedValue(0);
  mocks.computePacketStats
    .mockReset()
    .mockResolvedValue({ averagePacketRate: 24 });
  mocks.getSample.mockReset().mockResolvedValue(null);
  mocks.samples.mockReset().mockImplementation(() => sampleStream([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapTimeToTrack", () => {
  it("clamps times before the first timestamp up to the first frame", () => {
    expect(mapTimeToTrack(0, 0.5)).toBe(0.5);
    expect(mapTimeToTrack(-3, 0.5)).toBe(0.5);
  });

  it("passes through times inside the track range", () => {
    expect(mapTimeToTrack(2.25, 0.5)).toBe(2.25);
  });

  it("maps non-finite times to the first frame", () => {
    expect(mapTimeToTrack(Number.NaN, 0.5)).toBe(0.5);
    expect(mapTimeToTrack(Number.POSITIVE_INFINITY, 0.5)).toBe(0.5);
  });
});

describe("WebCodecsVideoReader.open", () => {
  it("returns null without VideoDecoder support (fallback to <video>)", async () => {
    vi.stubGlobal("VideoDecoder", undefined);
    expect(await WebCodecsVideoReader.open("blob:x")).toBeNull();
  });

  it("returns null and disposes the input when there is no video track", async () => {
    mocks.getPrimaryVideoTrack.mockResolvedValue(null);
    expect(await WebCodecsVideoReader.open("blob:x")).toBeNull();
    expect(mocks.inputDispose).toHaveBeenCalled();
  });

  it("returns null and disposes the input when the codec cannot decode", async () => {
    mocks.canDecode.mockResolvedValue(false);
    expect(await WebCodecsVideoReader.open("blob:x")).toBeNull();
    expect(mocks.inputDispose).toHaveBeenCalled();
  });

  it("returns null when the source cannot be fetched or parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("nope");
      }),
    );
    expect(await WebCodecsVideoReader.open("blob:x")).toBeNull();
  });

  it("opens a reader when a decodable video track exists", async () => {
    expect(await WebCodecsVideoReader.open("blob:x")).not.toBeNull();
  });

  it("exposes the track's first timestamp and native frame rate", async () => {
    mocks.getFirstTimestamp.mockResolvedValue(0.25);
    const reader = await WebCodecsVideoReader.open("blob:x");
    expect(reader?.firstTimestampSec).toBe(0.25);
    expect(reader?.nativeFps).toBe(24);
  });

  it("leaves the native frame rate unknown when packet stats are unavailable", async () => {
    mocks.computePacketStats.mockRejectedValue(new Error("no stats"));
    const reader = await WebCodecsVideoReader.open("blob:x");
    expect(reader).not.toBeNull();
    expect(reader?.nativeFps).toBeNull();
  });
});

describe("WebCodecsVideoReader.frameAt", () => {
  it("requests the sample at the clamped time and closes it after conversion", async () => {
    mocks.getFirstTimestamp.mockResolvedValue(0.5);
    const frame = { kind: "video-frame" };
    const sample = makeSample(frame);
    mocks.getSample.mockResolvedValue(sample);
    const reader = await WebCodecsVideoReader.open("blob:x");

    // Before the first timestamp → clamped to the first frame.
    await expect(reader?.frameAt(0)).resolves.toBe(frame);
    expect(mocks.getSample).toHaveBeenLastCalledWith(0.5);
    // Inside the range → exact time.
    await expect(reader?.frameAt(2.25)).resolves.toBe(frame);
    expect(mocks.getSample).toHaveBeenLastCalledWith(2.25);
    // The Mediabunny sample is closed; only the VideoFrame stays open.
    expect(sample.close).toHaveBeenCalledTimes(2);
  });

  it("returns null when no sample is available", async () => {
    const reader = await WebCodecsVideoReader.open("blob:x");
    await expect(reader?.frameAt(1)).resolves.toBeNull();
  });

  it("returns null after dispose and releases the input", async () => {
    const reader = await WebCodecsVideoReader.open("blob:x");
    reader?.dispose();
    expect(mocks.inputDispose).toHaveBeenCalled();
    await expect(reader?.frameAt(1)).resolves.toBeNull();
    expect(mocks.getSample).not.toHaveBeenCalled();
  });

  it("serializes concurrent seeks (later request resolves after earlier)", async () => {
    mocks.getFirstTimestamp.mockResolvedValue(0);
    const order: number[] = [];
    mocks.getSample.mockImplementation(async (timeSec: number) => {
      order.push(timeSec);
      return makeSample({ at: timeSec });
    });
    const reader = await WebCodecsVideoReader.open("blob:x");
    const [first, second] = await Promise.all([
      reader!.frameAt(1),
      reader!.frameAt(2),
    ]);
    expect(order).toEqual([1, 2]);
    expect(first).toEqual({ at: 1 });
    expect(second).toEqual({ at: 2 });
  });
});

describe("WebCodecsVideoReader.openSequence", () => {
  const clip = () =>
    [0, 1, 2, 3].map((i) => makeSample({ at: i / 24 }, i / 24));

  it("serves monotonic requests from one stream, decoding each frame once", async () => {
    const samples = clip();
    const stream = sampleStream(samples);
    mocks.samples.mockImplementation(() => stream);
    const reader = await WebCodecsVideoReader.open("blob:x");
    const cursor = reader!.openSequence();

    // 30 fps timeline over a 24 fps clip: 0, 1/30, 2/30, 3/30 → frames 0, 0, 1, 2.
    const got = [];
    for (const k of [0, 1, 2, 3]) got.push(await cursor.next(k / 30));
    expect(got).toEqual([{ at: 0 }, { at: 0 }, { at: 1 / 24 }, { at: 2 / 24 }]);
    expect(mocks.samples).toHaveBeenCalledTimes(1);
    expect(mocks.samples).toHaveBeenCalledWith(0);
    // Superseded samples are closed; the current one and its look-ahead stay open.
    expect(samples[0].close).toHaveBeenCalled();
    expect(samples[1].close).toHaveBeenCalled();
    expect(samples[2].close).not.toHaveBeenCalled();
    expect(samples[3].close).not.toHaveBeenCalled();

    cursor.close();
    await cursor.next(0); // resolves null after close
    expect(stream.returned).toBe(true);
    expect(samples[2].close).toHaveBeenCalled();
    expect(samples[3].close).toHaveBeenCalled();
  });

  it("restarts the stream from the requested time when going backwards", async () => {
    const streams: ReturnType<typeof sampleStream>[] = [];
    mocks.samples.mockImplementation((start: number) => {
      const stream = sampleStream(
        clip().filter((sample) => sample.timestamp >= start - 1e-9),
      );
      streams.push(stream);
      return stream;
    });
    const reader = await WebCodecsVideoReader.open("blob:x");
    const cursor = reader!.openSequence();

    await expect(cursor.next(3 / 24)).resolves.toEqual({ at: 3 / 24 });
    await expect(cursor.next(1 / 24)).resolves.toEqual({ at: 1 / 24 });
    expect(mocks.samples).toHaveBeenCalledTimes(2);
    expect(mocks.samples).toHaveBeenLastCalledWith(1 / 24);
    expect(streams[0].returned).toBe(true);
  });

  it("keeps handing out the final frame past the end of the stream", async () => {
    mocks.samples.mockImplementation(() => sampleStream(clip()));
    const reader = await WebCodecsVideoReader.open("blob:x");
    const cursor = reader!.openSequence();

    await expect(cursor.next(10)).resolves.toEqual({ at: 3 / 24 });
    await expect(cursor.next(11)).resolves.toEqual({ at: 3 / 24 });
    expect(mocks.samples).toHaveBeenCalledTimes(1);
  });

  it("resolves null when the stream yields nothing or the reader is disposed", async () => {
    const reader = await WebCodecsVideoReader.open("blob:x");
    const cursor = reader!.openSequence();
    await expect(cursor.next(0)).resolves.toBeNull();
    reader!.dispose();
    await expect(cursor.next(1)).resolves.toBeNull();
  });
});

describe("WebCodecsVideoReader.framesInRange", () => {
  it("sweeps the range sequentially, handing over frames and closing samples", async () => {
    mocks.getFirstTimestamp.mockResolvedValue(0.5);
    const samples = [
      makeSample({ at: 0.5 }, 0.5, 0.25),
      makeSample({ at: 0.75 }, 0.75, 0.25),
    ];
    mocks.samples.mockImplementation(() => sampleStream(samples));
    const reader = await WebCodecsVideoReader.open("blob:x");
    const seen: unknown[] = [];

    await reader?.framesInRange(
      0, // before the first timestamp → clamped
      1,
      (frame, timestampSec) => seen.push([frame, timestampSec]),
      () => true,
    );

    expect(mocks.samples).toHaveBeenCalledTimes(1);
    expect(mocks.samples).toHaveBeenCalledWith(0.5, 1);
    expect(seen).toEqual([
      [{ at: 0.5 }, 0.5],
      [{ at: 0.75 }, 0.75],
    ]);
    for (const sample of samples) expect(sample.close).toHaveBeenCalledTimes(1);
  });

  it("stops within one frame and releases the iterator when told to stop", async () => {
    const samples = [
      makeSample({ at: 0 }, 0, 0.1),
      makeSample({ at: 0.1 }, 0.1, 0.1),
      makeSample({ at: 0.2 }, 0.2, 0.1),
    ];
    const stream = sampleStream(samples);
    mocks.samples.mockImplementation(() => stream);
    const reader = await WebCodecsVideoReader.open("blob:x");
    let delivered = 0;

    await reader?.framesInRange(
      0,
      1,
      () => {
        delivered++;
      },
      () => delivered < 1,
    );

    expect(delivered).toBe(1);
    expect(stream.returned).toBe(true);
    // The undelivered sample is closed too; nothing leaks past the stop.
    expect(samples[1].close).toHaveBeenCalledTimes(1);
    expect(samples[2].toVideoFrame).not.toHaveBeenCalled();
  });

  it("does nothing for an empty range or after dispose", async () => {
    const reader = await WebCodecsVideoReader.open("blob:x");
    await reader?.framesInRange(2, 1, vi.fn(), () => true);
    expect(mocks.samples).not.toHaveBeenCalled();
    reader?.dispose();
    await reader?.framesInRange(0, 1, vi.fn(), () => true);
    expect(mocks.samples).not.toHaveBeenCalled();
  });

  it("serializes a sweep with seeks (a seek queued during the sweep runs after it)", async () => {
    const order: string[] = [];
    mocks.samples.mockImplementation(() => {
      order.push("sweep");
      return sampleStream([makeSample({ at: 0 }, 0, 0.1)]);
    });
    mocks.getSample.mockImplementation(async (timeSec: number) => {
      order.push(`seek ${timeSec}`);
      return makeSample({ at: timeSec });
    });
    const reader = await WebCodecsVideoReader.open("blob:x");

    await Promise.all([
      reader!.framesInRange(
        0,
        1,
        (frame) => void frame,
        () => true,
      ),
      reader!.frameAt(2),
    ]);

    expect(order).toEqual(["sweep", "seek 2"]);
  });
});
