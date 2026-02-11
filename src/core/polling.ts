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
};

export async function waitForFinalStatus(
  clientSecret: string,
  opts: WaitForFinalStatusOptions = {},
): Promise<{ intent: ResolvedPaymentIntent; timedOut: boolean }> {
  const intervalMs = opts.intervalMs ?? 2500;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;

  const start = Date.now();

  while (true) {
    const intent = await resolveIntent(clientSecret, opts);
    opts.onUpdate?.(intent);

    // Terminal states for MVP:
    if (intent.status === "succeeded" || intent.status === "expired") {
      return { intent, timedOut: false };
    }

    if (Date.now() - start > timeoutMs) {
      // Return the last known intent; UI decides what to do
      // (e.g., show "awaiting confirmation" and allow close).
      return { intent, timedOut: true };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
