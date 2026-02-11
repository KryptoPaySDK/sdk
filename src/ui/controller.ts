import { resolveIntent } from "../core/http";
import { waitForFinalStatus } from "../core/polling";
import type { ResolvedPaymentIntent } from "../core/types";
import type { ControllerConfig, CheckoutState, PaymentMethod } from "./state";
import { toPublicError } from "./state";

/**
 * CheckoutController
 *
 * This is the heart of the SDK UI logic.
 * It is NOT tied to React or the DOM.
 *
 * React wrapper will:
 * - create a controller
 * - subscribe to state updates
 * - render based on state
 *
 * Vanilla wrapper will:
 * - create a controller
 * - subscribe to state updates
 * - render to DOM based on state
 *
 * The point is: one state machine, two renderers.
 */
export class CheckoutController {
  private config: ControllerConfig;
  private state: CheckoutState = { type: "idle" };

  private listeners = new Set<(state: CheckoutState) => void>();

  // Polling control
  private isRunning = false;
  private stopRequested = false;

  // Used to implement the "awaiting confirmation" UX rule.
  private awaitingThresholdMs = 60_000; // 60 seconds
  private pollIntervalMs = 2_500;
  private pollTimeoutMs = 10 * 60_000; // 10 minutes total

  constructor(config: ControllerConfig) {
    this.config = {
      allowManual: true,
      allowWallet: true,
      defaultMethod: "wallet",
      ...config,
    };

    // If wallet is disabled, default to manual; if manual disabled, default wallet.
    if (!this.config.allowWallet) this.config.defaultMethod = "manual";
    if (!this.config.allowManual) this.config.defaultMethod = "wallet";
  }

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   *
   * Important:
   * React useEffect cleanups must return void.
   * Set.delete() returns boolean, so we wrap it in a block to avoid returning boolean.
   */
  subscribe(fn: (state: CheckoutState) => void) {
    this.listeners.add(fn);

    // Emit immediately so the UI can render the current state right away.
    fn(this.state);

    // Cleanup must return void, not boolean.
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState() {
    return this.state;
  }

  /**
   * Emits a new state to subscribers.
   */
  private setState(next: CheckoutState) {
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }

  /**
   * Open the modal: resolves the intent, then transitions to choose_method.
   */
  async open() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stopRequested = false;

    this.setState({ type: "loading_intent" });

    try {
      const intent = await resolveIntent(this.config.clientSecret, {
        baseUrl: this.config.baseUrl,
      });

      // Decide initial tab
      const selected = this.getInitialMethod();

      this.setState({
        type: "choose_method",
        intent,
        selected,
      });
    } catch (err) {
      const pub = toPublicError(err);
      this.config.onError?.(pub);
      this.setState({ type: "error", error: pub });
    }
  }

  /**
   * Close requested by user.
   * Stops background polling and notifies consumer.
   */
  close() {
    this.stopRequested = true;
    this.isRunning = false;
    this.config.onClose?.();
    this.setState({ type: "idle" });
  }

  /**
   * User explicitly selects a method tab (wallet/manual).
   * (Wallet flow is stubbed for now; manual is implemented.)
   */
  selectMethod(method: PaymentMethod) {
    if (this.state.type !== "choose_method") return;

    // If the merchant disabled this method, ignore
    if (method === "wallet" && !this.config.allowWallet) return;
    if (method === "manual" && !this.config.allowManual) return;

    this.setState({
      ...this.state,
      selected: method,
    });
  }

  /**
   * Continue from choose_method into the selected method flow.
   */
  async continue() {
    if (this.state.type !== "choose_method") return;

    const { intent, selected } = this.state;

    if (selected === "manual") {
      // Manual instructions screen + start polling.
      this.setState({ type: "manual_instructions", intent });
      await this.startPolling(intent);
      return;
    }

    // Wallet flow: stub now.
    // We will implement:
    // - connect wallet
    // - switch chain
    // - send USDC transfer
    // - then start polling
    //
    // For now, we push users to manual to keep MVP functional.
    this.setState({
      type: "choose_method",
      intent,
      selected: "manual",
      message:
        "Wallet payments will be available soon. Please pay manually for now.",
    });

    // Optional: auto-enter manual
    this.setState({ type: "manual_instructions", intent });
    await this.startPolling(intent);
  }

  /**
   * If user is in "awaiting confirmation", they can choose to keep waiting.
   */
  async keepWaiting() {
    const current = this.state;
    if (current.type !== "awaiting_confirmation") return;

    // Go back to waiting state but keep pendingConfirmationsSince
    this.setState({
      type: "waiting",
      intent: current.intent,
      pendingConfirmationsSince: Date.now(),
    });

    await this.startPolling(current.intent);
  }

  /**
   * Figure out the initial payment method tab to show.
   */
  private getInitialMethod(): PaymentMethod {
    const pref = this.config.defaultMethod ?? "wallet";
    if (pref === "wallet" && this.config.allowWallet) return "wallet";
    if (pref === "manual" && this.config.allowManual) return "manual";

    // Fallback if preferred method is not allowed
    if (this.config.allowWallet) return "wallet";
    return "manual";
  }

  /**
   * Polling loop:
   * - calls resolve repeatedly
   * - transitions based on intent.status
   * - implements the "awaiting confirmation after 60s" UX rule
   *
   * NOTE: This uses waitForFinalStatus() from Task 2,
   * but also adds intermediate state transitions on every update.
   */
  private async startPolling(initialIntent: ResolvedPaymentIntent) {
    if (this.stopRequested) return;

    let pendingSince: number | undefined;

    // Enter waiting state immediately
    this.setState({
      type: "waiting",
      intent: initialIntent,
      pendingConfirmationsSince: undefined,
    });

    try {
      const result = await waitForFinalStatus(this.config.clientSecret, {
        baseUrl: this.config.baseUrl,
        intervalMs: this.pollIntervalMs,
        timeoutMs: this.pollTimeoutMs,
        onUpdate: (intent) => {
          if (this.stopRequested) return;

          // Track how long we've been in pending_confirmations
          if (intent.status === "pending_confirmations") {
            if (!pendingSince) pendingSince = Date.now();

            const elapsed = Date.now() - pendingSince;

            // Once it crosses threshold, we show the awaiting confirmation screen.
            // This matches your UX requirement: "You can safely close and confirm in dashboard later."
            if (elapsed >= this.awaitingThresholdMs) {
              this.config.onAwaitingConfirmation?.({
                payment_intent_id: intent.id,
              });
              this.setState({ type: "awaiting_confirmation", intent });
              return;
            }

            this.setState({
              type: "waiting",
              intent,
              pendingConfirmationsSince: pendingSince,
            });
            return;
          }

          // If it goes back to requires_payment, reset pending timer
          if (intent.status === "requires_payment") {
            pendingSince = undefined;
            this.setState({
              type: "waiting",
              intent,
              pendingConfirmationsSince: undefined,
            });
            return;
          }

          // For other statuses we let the final handler below manage it.
          this.setState({
            type: "waiting",
            intent,
            pendingConfirmationsSince: pendingSince,
          });
        },
      });

      if (this.stopRequested) return;

      const finalIntent = result.intent;

      if (finalIntent.status === "succeeded") {
        // Success is ONLY watcher-confirmed success
        this.config.onSuccess?.({
          payment_intent_id: finalIntent.id,
          tx_hash: (finalIntent as any).tx_hash ?? "",
          chain: finalIntent.chain,
          mode: finalIntent.mode,
        });
        this.setState({ type: "success", intent: finalIntent });
        return;
      }

      if (finalIntent.status === "expired") {
        this.setState({ type: "expired", intent: finalIntent });
        return;
      }

      // Timeout case (not a terminal status)
      // We convert it into "awaiting confirmation" if we're pending_confirmations,
      // otherwise keep waiting.
      if (result.timedOut) {
        if (finalIntent.status === "pending_confirmations") {
          this.config.onAwaitingConfirmation?.({
            payment_intent_id: finalIntent.id,
          });
          this.setState({ type: "awaiting_confirmation", intent: finalIntent });
          return;
        }

        // Still requires_payment or other non-final state.
        // Leave the UI in waiting state; user can close or keep waiting.
        this.setState({
          type: "waiting",
          intent: finalIntent,
          pendingConfirmationsSince: pendingSince,
        });
        return;
      }
    } catch (err) {
      if (this.stopRequested) return;
      const pub = toPublicError(err);
      this.config.onError?.(pub);

      const lastIntent =
        this.state.type === "waiting" ||
        this.state.type === "manual_instructions" ||
        this.state.type === "choose_method" ||
        this.state.type === "awaiting_confirmation"
          ? this.state.intent
          : undefined;

      this.setState({ type: "error", error: pub, lastIntent });
    }
  }
}
