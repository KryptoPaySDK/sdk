import { KryptoPayError } from "./errors";
import type { ResolvedPaymentIntent } from "./types";

export type HttpClientOptions = {
  baseUrl?: string; // internal override for tests/dev
  fetchImpl?: typeof fetch; // injection for tests
  signal?: AbortSignal;
};

export const DEFAULT_BASE_URL = "https://api.kryptopay.xyz";

const INTERNAL_API_BASE_URL_OVERRIDE_KEY =
  "__KRYPTOPAY_INTERNAL_API_BASE_URL_OVERRIDE__";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function getInternalBaseUrlOverride(): string | undefined {
  const value = (globalThis as Record<string, unknown>)[
    INTERNAL_API_BASE_URL_OVERRIDE_KEY
  ];

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return normalizeBaseUrl(value);
}

export function setInternalApiBaseUrlOverride(baseUrl?: string) {
  const target = globalThis as Record<string, unknown>;

  if (!baseUrl || !baseUrl.trim()) {
    delete target[INTERNAL_API_BASE_URL_OVERRIDE_KEY];
    return;
  }

  target[INTERNAL_API_BASE_URL_OVERRIDE_KEY] = normalizeBaseUrl(baseUrl);
}

/**
 * Parse JSON safely (some error responses might be empty or non-JSON).
 */
async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isAbortError(err: unknown): boolean {
  const e = err as { name?: string; code?: string | number } | null;
  return e?.name === "AbortError" || e?.code === "ABORT_ERR";
}

/**
 * resolveIntent()
 *
 * Calls your public resolve endpoint:
 * POST /v1/payment_intents/resolve
 *
 * This endpoint is what the SDK modal uses to:
 * - get payment details (amount, expected wallet, token address)
 * - show confirmations required
 * - track status (requires_payment -> pending_confirmations -> succeeded)
 */
export async function resolveIntent(
  clientSecret: string,
  opts: HttpClientOptions = {},
): Promise<ResolvedPaymentIntent> {
  const baseUrl =
    opts.baseUrl ?? getInternalBaseUrlOverride() ?? DEFAULT_BASE_URL;
  const fetchFn = opts.fetchImpl ?? fetch;

  let res: Response;

  try {
    res = await fetchFn(`${baseUrl}/v1/payment_intents/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      // IMPORTANT: your API expects snake_case key
      body: JSON.stringify({ client_secret: clientSecret }),
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }

    throw new KryptoPayError({
      code: "network_error",
      message: "Network error while resolving payment intent.",
      recoverable: true,
      cause: err,
    });
  }

  const payload = await safeJson(res);

  // Map your API error codes to SDK-stable error codes.
  if (res.status === 400) {
    throw new KryptoPayError({
      code: "invalid_body",
      message: "Invalid request body for resolve endpoint.",
      recoverable: false,
      cause: payload,
    });
  }

  if (res.status === 404) {
    // Your API returns { error: "intent_not_found" }
    throw new KryptoPayError({
      code: "intent_not_found",
      message: "Payment intent not found.",
      recoverable: false,
      cause: payload,
    });
  }

  if (res.status === 410) {
    // Your API returns { error: "intent_expired" }
    throw new KryptoPayError({
      code: "intent_expired",
      message: "Payment intent has expired.",
      recoverable: false,
      cause: payload,
    });
  }

  if (res.status === 429) {
    throw new KryptoPayError({
      code: "rate_limited",
      message: "Too many requests. Please try again shortly.",
      recoverable: true,
      cause: payload,
    });
  }

  if (!res.ok) {
    throw new KryptoPayError({
      code: "server_error",
      message: `Server error while resolving payment intent (HTTP ${res.status}).`,
      recoverable: res.status >= 500,
      cause: payload,
    });
  }

  // Validate response shape (exact keys we rely on)
  const intent = payload as Partial<ResolvedPaymentIntent>;

  const required: (keyof ResolvedPaymentIntent)[] = [
    "id",
    "status",
    "mode",
    "chain",
    "chain_id",
    "confirmations_required",
    "amount_units",
    "decimals",
    "token_symbol",
    "token_address",
    "expected_wallet",
    "expires_at",
    "lane",
    "metadata",
  ];

  for (const k of required) {
    if (intent[k] === undefined || intent[k] === null) {
      throw new KryptoPayError({
        code: "invalid_response",
        message: `Resolve endpoint response missing field: ${String(k)}`,
        recoverable: false,
        cause: payload,
      });
    }
  }

  return intent as ResolvedPaymentIntent;
}
