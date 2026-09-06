import { describe, expect, it } from "vitest";
import {
  drainPendingWork,
  MAX_EXPORT_QUEUE_SIZE,
  waitForEncoderCapacity,
  waitForPendingWorkCapacity,
} from "./exportBackpressure";

class FakeEncoderQueue extends EventTarget {
  encodeQueueSize = MAX_EXPORT_QUEUE_SIZE;

  dequeue(size: number) {
    this.encodeQueueSize = size;
    this.dispatchEvent(new Event("dequeue"));
  }
}

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("export backpressure", () => {
  it("waits while the WebCodecs queue is saturated", async () => {
    const encoder = new FakeEncoderQueue();
    let released = false;
    const waiting = waitForEncoderCapacity(encoder).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    encoder.dequeue(MAX_EXPORT_QUEUE_SIZE - 1);
    await waiting;
    expect(released).toBe(true);
  });

  it("cancels while waiting for a dequeue event", async () => {
    const encoder = new FakeEncoderQueue();
    const controller = new AbortController();
    const waiting = waitForEncoderCapacity(encoder, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: "cancelled" });
  });

  it("bounds and drains asynchronous packet writes", async () => {
    const jobs = Array.from({ length: MAX_EXPORT_QUEUE_SIZE }, deferred);
    const pending = new Set(jobs.map((job) => job.promise));
    for (const promise of pending) {
      void promise.finally(() => pending.delete(promise));
    }

    let capacity = false;
    const waiting = waitForPendingWorkCapacity(pending).then(() => {
      capacity = true;
    });
    await Promise.resolve();
    expect(capacity).toBe(false);
    jobs[0].resolve();
    await waiting;
    expect(pending.size).toBe(MAX_EXPORT_QUEUE_SIZE - 1);

    const draining = drainPendingWork(pending);
    for (const job of jobs.slice(1)) job.resolve();
    await draining;
    expect(pending.size).toBe(0);
  });

  it("cancels while waiting for a pending packet write", async () => {
    const job = deferred();
    const controller = new AbortController();
    const waiting = waitForPendingWorkCapacity(
      new Set([job.promise]),
      controller.signal,
      1,
    );
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: "cancelled" });
    job.resolve();
  });
});
