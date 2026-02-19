import { KryptoPayError } from "./errors";
import type { ResolvedPaymentIntent } from "./types";

export type HttpClientOptions = {
  baseUrl?: string; // e.g. https://api.kryptopay.xyz
  fetchImpl?: typeof fetch; // injection for tests
};

export const DEFAULT_BASE_URL = "http://localhost:3000";

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

/**
 * Your API currently returns snake_case keys.
 * This normalizer also supports camelCase keys so the SDK remains resilient
 * if you ever adjust the API response shape or wrap fields differently.
 */
function normalizeResolvedIntent(raw: any): Partial<ResolvedPaymentIntent> {
  if (!raw || typeof raw !== "object") return {};

  // support both "confirmations_required" and "confirmationsRequired", etc
  const normalized: Partial<ResolvedPaymentIntent> = {
    id: raw.id,
    status: raw.status,

    mode: raw.mode,
    chain: raw.chain,
    chain_id: raw.chain_id ?? raw.chainId,
    confirmations_required:
      raw.confirmations_required ?? raw.confirmationsRequired,

    amount_units: raw.amount_units ?? raw.amountUnits,
    decimals: raw.decimals,

    token_symbol: raw.token_symbol ?? raw.tokenSymbol,
    token_address: raw.token_address ?? raw.tokenAddress,

    expected_wallet: raw.expected_wallet ?? raw.expectedWallet,

    expires_at: raw.expires_at ?? raw.expiresAt,
    lane: raw.lane,
    metadata: raw.metadata ?? {},
  };

  // Defensive defaults (these are safe for UI rendering)
  if (!normalized.metadata) normalized.metadata = {};
  if (!normalized.lane) normalized.lane = "sdk" as any;

  return normalized;
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
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = opts.fetchImpl ?? fetch;

  let res: Response;

  try {
    res = await fetchFn(`${baseUrl}/v1/payment_intents/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // IMPORTANT: your API expects snake_case key
      body: JSON.stringify({ client_secret: clientSecret }),
    });
  } catch (err) {
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
    throw new KryptoPayError({
      code: "intent_not_found",
      message: "Payment intent not found.",
      recoverable: false,
      cause: payload,
    });
  }

  if (res.status === 410) {
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

  const intent = normalizeResolvedIntent(payload);

  // Validate response shape (exact keys we rely on after normalization)
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
