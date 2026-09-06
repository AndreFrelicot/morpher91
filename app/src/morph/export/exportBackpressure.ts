import { ExportError, throwIfExportAborted } from "./exportValidation";

export const MAX_EXPORT_QUEUE_SIZE = 4;

type EncoderQueue = EventTarget & { readonly encodeQueueSize: number };

function waitForEventOrAbort(
  target: EventTarget,
  event: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfExportAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      signal?.removeEventListener("abort", onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new ExportError("cancelled"));
    };
    target.addEventListener(event, onEvent, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForEncoderCapacity(
  encoder: EncoderQueue,
  signal?: AbortSignal,
  maximum = MAX_EXPORT_QUEUE_SIZE,
): Promise<void> {
  while (encoder.encodeQueueSize >= maximum) {
    await waitForEventOrAbort(encoder, "dequeue", signal);
    throwIfExportAborted(signal);
  }
}

export async function waitForPendingWorkCapacity(
  pending: ReadonlySet<Promise<void>>,
  signal?: AbortSignal,
  maximum = MAX_EXPORT_QUEUE_SIZE,
): Promise<void> {
  while (pending.size >= maximum) {
    throwIfExportAborted(signal);
    const next = Promise.race(pending);
    if (!signal) {
      await next;
    } else {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        const onAbort = () => {
          cleanup();
          reject(new ExportError("cancelled"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        void next.then(
          () => {
            cleanup();
            resolve();
          },
          (error) => {
            cleanup();
            reject(error);
          },
        );
      });
    }
    throwIfExportAborted(signal);
  }
}

export async function drainPendingWork(
  pending: ReadonlySet<Promise<void>>,
  signal?: AbortSignal,
): Promise<void> {
  await waitForPendingWorkCapacity(pending, signal, 1);
}
