import { resolveIntent } from "../core/http";
import { waitForFinalStatus } from "../core/polling";
import type { ResolvedPaymentIntent } from "../core/types";
import type { ControllerConfig, CheckoutState, PaymentMethod } from "./state";
import { toPublicError } from "./state";

// Wallet helpers (EOA / injected provider only)
import {
  getInjectedProvider,
  requestAccounts,
  getChainId,
  switchEthereumChain,
} from "../wallet/injected";
import { sendErc20Transfer } from "../wallet/sendUsdc";

function isAbortError(err: unknown): boolean {
  const e = err as { name?: string; code?: string | number } | null;
  return e?.name === "AbortError" || e?.code === "ABORT_ERR";
}

/**
 * CheckoutController
 *
 * Framework-agnostic state machine used by:
 * - React modal renderer
 * - Vanilla modal renderer
 *
 * UI subscribes to state changes and renders.
 * All checkout logic lives here.
 */
export class CheckoutController {
  private config: ControllerConfig;
  private state: CheckoutState = { type: "idle" };

  private listeners = new Set<(state: CheckoutState) => void>();

  // Polling control
  private isRunning = false;
  private stopRequested = false;
  private activePollAbort: AbortController | null = null;
  private activePollRunId = 0;

  // UX: after a while in pending_confirmations, show a safe-to-close screen.
  private awaitingThresholdMs = 60_000; // 60s
  private pollIntervalMs = 2_500;
  private pollTimeoutMs = 10 * 60_000; // 10 minutes

  // Wallet tracking: include tx hash in callbacks even if API doesn't store it yet.
  private lastTxHash: string | null = null;
  private hasEmittedAwaitingConfirmation = false;

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
   */
  subscribe(fn: (state: CheckoutState) => void) {
    this.listeners.add(fn);

    // Emit immediately so UI renders current state right away.
    fn(this.state);

    // Cleanup must return void.
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState() {
    return this.state;
  }

  private setState(next: CheckoutState) {
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }

  /**
   * open()
   * - resolves the payment intent from clientSecret
   * - moves into choose_method
   */
  async open() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.stopRequested = false;
    this.hasEmittedAwaitingConfirmation = false;

    this.setState({ type: "loading_intent" });

    try {
      const intent = await resolveIntent(this.config.clientSecret, {
        fetchImpl: this.config.fetchImpl,
      });

      this.setState({
        type: "choose_method",
        intent,
        selected: this.getInitialMethod(),
      });
    } catch (err) {
      this.isRunning = false;
      const pub = toPublicError(err);
      this.config.onError?.(pub);
      this.setState({ type: "error", error: pub });
    }
  }

  /**
   * close()
   * - stops polling
   * - calls onClose
   * - returns to idle
   */
  close() {
    this.stopAndReset({ emitOnClose: true });
  }

  /**
   * dispose()
   * - stops polling
   * - does NOT call onClose
   * - used by framework wrappers for internal teardown
   */
  dispose() {
    this.stopAndReset({ emitOnClose: false });
  }

  private stopAndReset(opts: { emitOnClose: boolean }) {
    this.stopRequested = true;
    this.isRunning = false;
    this.cancelActivePolling();

    if (opts.emitOnClose) {
      this.config.onClose?.();
    }

    if (this.state.type !== "idle") {
      this.setState({ type: "idle" });
    }
  }

  private cancelActivePolling() {
    if (this.activePollAbort) {
      this.activePollAbort.abort();
      this.activePollAbort = null;
    }
  }

  private emitAwaitingConfirmationOnce(paymentIntentId: string) {
    if (this.hasEmittedAwaitingConfirmation) return;
    this.hasEmittedAwaitingConfirmation = true;
    this.config.onAwaitingConfirmation?.({
      payment_intent_id: paymentIntentId,
    });
  }

  /**
   * Choose wallet/manual tab in the choose_method screen.
   */
  selectMethod(method: PaymentMethod) {
    if (this.state.type !== "choose_method") return;

    if (method === "wallet" && !this.config.allowWallet) return;
    if (method === "manual" && !this.config.allowManual) return;

    this.setState({
      ...this.state,
      selected: method,
    });
  }

  /**
   * Continue into the selected method.
   */
  async continue() {
    if (this.state.type !== "choose_method") return;

    const { intent, selected } = this.state;

    // New attempt => reset tx hash
    this.lastTxHash = null;
    this.hasEmittedAwaitingConfirmation = false;

    if (selected === "manual") {
      await this.startPolling(intent, { preferManualInstructions: true });
      return;
    }

    if (selected === "wallet") {
      await this.startWalletFlow(intent);
      return;
    }
  }

  /**
   * If user is in awaiting_confirmation, they can choose to keep waiting.
   */
  async keepWaiting() {
    if (this.state.type !== "awaiting_confirmation") return;

    this.setState({
      type: "waiting",
      intent: this.state.intent,
      pendingConfirmationsSince: Date.now(),
    });

    await this.startPolling(this.state.intent);
  }

  private getInitialMethod(): PaymentMethod {
    const pref = this.config.defaultMethod ?? "wallet";

    if (pref === "wallet" && this.config.allowWallet) return "wallet";
    if (pref === "manual" && this.config.allowManual) return "manual";

    // fallback
    if (this.config.allowWallet) return "wallet";
    return "manual";
  }

  /**
   * Wallet flow (EOA / injected only, MVP):
   * 1) Connect injected wallet (window.ethereum)
   * 2) Ensure chain matches intent.chain_id (switch if needed)
   * 3) Send USDC transfer (ERC-20 transfer)
   * 4) Poll until watcher confirms (succeeded/expired)
   *
   * MVP decision:
   * - we do NOT call wallet_addEthereumChain.
   * - if switching fails (including 4902), fall back to manual.
   */
  private async startWalletFlow(intent: ResolvedPaymentIntent) {
    try {
      const provider = getInjectedProvider();
      if (!provider) {
        const e = new Error(
          "No injected wallet found. Install a wallet extension or use manual payment.",
        ) as any;
        e.code = "wallet_not_found";
        throw e;
      }

      this.setState({ type: "wallet_connecting", intent });

      const accounts = await requestAccounts(provider);
      const from = accounts?.[0];
      if (!from) {
        const e = new Error("No wallet account available.") as any;
        e.code = "wallet_no_account";
        throw e;
      }

      const currentChainId = await getChainId(provider);
      if (currentChainId !== intent.chain_id) {
        this.setState({ type: "wallet_switching_chain", intent });

        await switchEthereumChain(provider, intent.chain_id);

        // Defensive re-check
        const afterSwitch = await getChainId(provider);
        if (afterSwitch !== intent.chain_id) {
          const e = new Error(
            "Wallet did not switch to the correct network.",
          ) as any;
          e.code = "wallet_wrong_network";
          throw e;
        }
      }

      this.setState({ type: "wallet_sending", intent, from });

      const txHash = await sendErc20Transfer({
        provider,
        from,
        tokenAddress: intent.token_address,
        to: intent.expected_wallet,
        amountUnits: BigInt(intent.amount_units),
      });

      this.lastTxHash = txHash;

      this.setState({ type: "wallet_submitted", intent, txHash });

      // Wait for backend/watcher to detect & confirm the transfer.
      await this.startPolling(intent);
    } catch (err) {
      const pub = toPublicError(err);

      // Wallet failure should not dead-end the user.
      // If manual is allowed, fall back to manual and keep polling.
      if (this.config.allowManual) {
        this.setState({
          type: "choose_method",
          intent,
          selected: "manual",
          message: pub.message,
        });

        // Auto-enter manual to keep flow simple.
        await this.startPolling(intent, { preferManualInstructions: true });
        return;
      }

      this.config.onError?.(pub);
      this.setState({ type: "error", error: pub, lastIntent: intent });
    }
  }

  /**
   * startPolling()
   * - resolves intent repeatedly
   * - updates intermediate UI states
   * - ends on succeeded / expired
   */
  private async startPolling(
    initialIntent: ResolvedPaymentIntent,
    opts: { preferManualInstructions?: boolean } = {},
  ) {
    if (this.stopRequested) return;

    // One active poller per controller. Starting a new run cancels the previous one.
    this.cancelActivePolling();
    const runId = ++this.activePollRunId;
    const pollAbort = new AbortController();
    this.activePollAbort = pollAbort;

    const preferManualInstructions = !!opts.preferManualInstructions;
    let pendingSince: number | undefined;
    let stopForAwaitingConfirmation = false;

    if (preferManualInstructions) {
      this.setState({
        type: "manual_instructions",
        intent: initialIntent,
      });
    } else {
      this.setState({
        type: "waiting",
        intent: initialIntent,
        pendingConfirmationsSince: undefined,
      });
    }

    try {
      const result = await waitForFinalStatus(this.config.clientSecret, {
        fetchImpl: this.config.fetchImpl,
        signal: pollAbort.signal,
        intervalMs: this.pollIntervalMs,
        timeoutMs: this.pollTimeoutMs,
        shouldStop: () =>
          this.stopRequested ||
          runId !== this.activePollRunId ||
          stopForAwaitingConfirmation,
        onUpdate: (intent) => {
          if (this.stopRequested || runId !== this.activePollRunId) return;

          if (intent.status === "pending_confirmations") {
            if (!pendingSince) pendingSince = Date.now();

            const elapsed = Date.now() - pendingSince;
            if (elapsed >= this.awaitingThresholdMs) {
              this.emitAwaitingConfirmationOnce(intent.id);
              this.setState({ type: "awaiting_confirmation", intent });
              stopForAwaitingConfirmation = true;
              return;
            }

            this.setState({
              type: "waiting",
              intent,
              pendingConfirmationsSince: pendingSince,
            });
            return;
          }

          if (intent.status === "requires_payment") {
            pendingSince = undefined;
            if (preferManualInstructions) {
              this.setState({
                type: "manual_instructions",
                intent,
              });
            } else {
              this.setState({
                type: "waiting",
                intent,
                pendingConfirmationsSince: undefined,
              });
            }
            return;
          }

          this.setState({
            type: "waiting",
            intent,
            pendingConfirmationsSince: pendingSince,
          });
        },
      });

      if (this.stopRequested || runId !== this.activePollRunId) return;
      if (result.stopped) return;

      const finalIntent = result.intent;

      if (finalIntent.status === "succeeded") {
        this.config.onSuccess?.({
          payment_intent_id: finalIntent.id,
          // Prefer wallet tx hash if available.
          tx_hash: this.lastTxHash ?? (finalIntent as any).tx_hash ?? "",
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

      // Timeout => if pending_confirmations, show awaiting_confirmation
      if (result.timedOut) {
        if (finalIntent.status === "pending_confirmations") {
          this.emitAwaitingConfirmationOnce(finalIntent.id);
          this.setState({ type: "awaiting_confirmation", intent: finalIntent });
          return;
        }

        if (preferManualInstructions && finalIntent.status === "requires_payment") {
          this.setState({ type: "manual_instructions", intent: finalIntent });
          return;
        }

        this.setState({
          type: "waiting",
          intent: finalIntent,
          pendingConfirmationsSince: pendingSince,
        });
      }
    } catch (err) {
      if (
        isAbortError(err) ||
        this.stopRequested ||
        runId !== this.activePollRunId
      ) {
        return;
      }

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
    } finally {
      if (this.activePollRunId === runId && this.activePollAbort === pollAbort) {
        this.activePollAbort = null;
      }
    }
  }
}
