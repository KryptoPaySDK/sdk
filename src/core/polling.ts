import type { ResolvedPaymentIntent } from "./types";
import { resolveIntent, type HttpClientOptions } from "./http";

/**
 * Poll options.
 * timeout behavior is designed for your UX requirement:
 * - if pending_confirmations takes long, we can show "awaiting confirmation"
 * - and allow the user to close and later check dashboard
 */
export type WaitForFinalStatusOptions = HttpClientOptions & {
  intervalMs?: number; // default 2500
  timeoutMs?: number; // default 10 minutes
  onUpdate?: (intent: ResolvedPaymentIntent) => void;
  shouldStop?: () => boolean;
};

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((r) => setTimeout(r, ms));
    return;
  }

  if (signal.aborted) {
    throw createAbortError();
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort);
  });
}

export async function waitForFinalStatus(
  clientSecret: string,
  opts: WaitForFinalStatusOptions = {},
): Promise<{ intent: ResolvedPaymentIntent; timedOut: boolean; stopped: boolean }> {
  const intervalMs = opts.intervalMs ?? 2500;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;

  const start = Date.now();

  while (true) {
    if (opts.signal?.aborted) {
      throw createAbortError();
    }

    const intent = await resolveIntent(clientSecret, {
      ...opts,
      signal: opts.signal,
    });
    opts.onUpdate?.(intent);

    if (opts.shouldStop?.()) {
      return { intent, timedOut: false, stopped: true };
    }

    // Terminal states for MVP:
    if (intent.status === "succeeded" || intent.status === "expired") {
      return { intent, timedOut: false, stopped: false };
    }

    if (Date.now() - start > timeoutMs) {
      // Return the last known intent; UI decides what to do
      // (e.g., show "awaiting confirmation" and allow close).
      return { intent, timedOut: true, stopped: false };
    }

    await sleepWithAbort(intervalMs, opts.signal);
  }
}
