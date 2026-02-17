import type { ResolvedPaymentIntent } from "../core/types";
import type { KryptoPayCheckoutOptions } from "../core/types";
import type { KryptoPayError } from "../core/errors";

/**
 * The user can choose how they want to pay.
 * Wallet and manual are both supported; wallet falls back to manual on failure (MVP).
 */
export type PaymentMethod = "wallet" | "manual";

/**
 * These are the top-level UI states the modal can be in.
 * React and Vanilla will render different UI, but they will both use these states.
 */
export type CheckoutState =
  | { type: "idle" }
  | { type: "loading_intent" }
  | {
      type: "choose_method";
      intent: ResolvedPaymentIntent;
      selected: PaymentMethod;
      message?: string; // optional banner text (e.g. wallet connect failed)
    }
  | {
      type: "manual_instructions";
      intent: ResolvedPaymentIntent;
    }
  | {
      type: "waiting";
      intent: ResolvedPaymentIntent;
      /**
       * When we last observed status == pending_confirmations.
       * Used for "awaiting confirmation" UX threshold.
       */
      pendingConfirmationsSince?: number;
    }
  | {
      type: "awaiting_confirmation";
      intent: ResolvedPaymentIntent;
    }
  | { type: "success"; intent: ResolvedPaymentIntent }
  | { type: "expired"; intent: ResolvedPaymentIntent }
  | {
      type: "error";
      error: { code: string; message: string; recoverable: boolean };
      lastIntent?: ResolvedPaymentIntent;
    }
  | { type: "wallet_connecting"; intent: ResolvedPaymentIntent }
  | { type: "wallet_switching_chain"; intent: ResolvedPaymentIntent }
  | { type: "wallet_sending"; intent: ResolvedPaymentIntent; from: string }
  | { type: "wallet_submitted"; intent: ResolvedPaymentIntent; txHash: string };

/**
 * We keep controller config separate from state.
 * This is derived from the public SDK options.
 */
export type ControllerConfig = Pick<
  KryptoPayCheckoutOptions,
  | "clientSecret"
  | "defaultMethod"
  | "allowWallet"
  | "allowManual"
  | "merchantName"
  | "logoUrl"
  | "labels"
  | "theme"
  | "classNames"
  | "size"
  | "zIndex"
  | "overlayOpacity"
  | "onClose"
  | "onSuccess"
  | "onAwaitingConfirmation"
  | "onError"
> & {
  baseUrl?: string; // allow overriding API URL from UI wrappers
  fetchImpl?: typeof fetch;
};

/**
 * Normalize errors into the public onError() shape.
 * Goal: consistent codes/messages across wallets and fetch failures.
 */
export function toPublicError(err: unknown): {
  code: string;
  message: string;
  recoverable: boolean;
} {
  // --- Wallet / EIP-1193 / MetaMask-style errors ---
  // Many wallets throw errors with a numeric `code`.
  // Common codes:
  // - 4001: user rejected the request
  // - -32002: request already pending in wallet UI
  // - 4902: chain not added in wallet
  const e = err as any;
  const maybeCode = e?.code;

  if (typeof maybeCode === "number") {
    if (maybeCode === 4001) {
      return {
        code: "wallet_user_rejected",
        message: "You cancelled the request in your wallet.",
        recoverable: true,
      };
    }

    if (maybeCode === -32002) {
      return {
        code: "wallet_request_pending",
        message:
          "A wallet request is already pending. Open your wallet to continue or cancel the pending request.",
        recoverable: true,
      };
    }

    if (maybeCode === 4902) {
      return {
        code: "wallet_chain_not_added",
        message:
          "Your wallet doesn't have this network added. Please switch networks manually in your wallet or use manual payment.",
        recoverable: true,
      };
    }

    // Default wallet error
    return {
      code: "wallet_error",
      message:
        typeof e?.message === "string" && e.message.trim().length
          ? e.message
          : "Wallet error",
      recoverable: true,
    };
  }

  // Some providers put codes as strings
  if (typeof maybeCode === "string") {
    return {
      code: maybeCode,
      message:
        typeof e?.message === "string" && e.message.trim().length
          ? e.message
          : "Unknown error",
      recoverable: true,
    };
  }

  // If the error is already a KryptoPayError, keep its information
  const maybe = err as Partial<KryptoPayError> & {
    code?: string;
    recoverable?: boolean;
    message?: string;
  };

  if (
    maybe &&
    typeof maybe.code === "string" &&
    typeof maybe.recoverable === "boolean"
  ) {
    return {
      code: maybe.code,
      message:
        typeof maybe.message === "string" ? maybe.message : "Unknown error",
      recoverable: maybe.recoverable,
    };
  }

  // Generic fallback
  return {
    code: "unknown_error",
    message: err instanceof Error ? err.message : "Unknown error",
    recoverable: false,
  };
}
