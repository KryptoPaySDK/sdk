import type { ResolvedPaymentIntent } from "../core/types";
import type { KryptoPayCheckoutOptions } from "../core/types";
import type { KryptoPayError } from "../core/errors";

/**
 * The user can choose how they want to pay.
 * Wallet will be implemented in later tasks; Manual is implemented now.
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
      message?: string; // optional banner text (e.g. wallet connect failed later)
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
    };

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
};

/**
 * Small helper to normalize errors into the public onError() shape.
 */
export function toPublicError(err: unknown): {
  code: string;
  message: string;
  recoverable: boolean;
} {
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
