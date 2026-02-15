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

/**
 * CheckoutController
 *
 * Framework-agnostic state machine that powers:
 * - React modal renderer
 * - Vanilla modal renderer
 *
 * It controls:
 * - resolving intents
 * - wallet/manual flows
 * - polling + status transitions
 * - awaiting-confirmation UX
 */
export class CheckoutController {
  private config: ControllerConfig;
  private state: CheckoutState = { type: "idle" };

  private listeners = new Set<(state: CheckoutState) => void>();

  // Polling control
  private isRunning = false;
  private stopRequested = false;

  // "Awaiting confirmation" UX
  private awaitingThresholdMs = 60_000; // 60 seconds
  private pollIntervalMs = 2_500;
  private pollTimeoutMs = 10 * 60_000; // 10 minutes total

  // Wallet tracking (useful for callbacks/UI even before API stores tx_hash)
  private lastTxHash: string | null = null;

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
   * Returns an unsubscribe function (must return void for React useEffect cleanup).
   */
  subscribe(fn: (state: CheckoutState) => void) {
    this.listeners.add(fn);
    fn(this.state);

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
   * Resolves the intent from clientSecret and enters choose_method.
   */
  async open() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.stopRequested = false;

    this.setState({ type: "loading_intent" });

    try {
      const intent = await resolveIntent(this.config.clientSecret, {
        baseUrl: this.config.baseUrl,
        fetchImpl: this.config.fetchImpl,
      });

      this.setState({
        type: "choose_method",
        intent,
        selected: this.getInitialMethod(),
      });
    } catch (err) {
      const pub = toPublicError(err);
      this.config.onError?.(pub);
      this.setState({ type: "error", error: pub });
    }
  }

  /**
   * Close ends the modal session:
   * - stops background polling
   * - transitions back to idle
   */
  close() {
    this.stopRequested = true;
    this.isRunning = false;

    this.config.onClose?.();
    this.setState({ type: "idle" });
  }

  /**
   * Switch tab between wallet/manual on the choose_method screen.
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
   * Continue from choose_method into the selected flow.
   */
  async continue() {
    if (this.state.type !== "choose_method") return;

    const { intent, selected } = this.state;

    // New attempt: clear previous wallet hash (if any)
    this.lastTxHash = null;

    if (selected === "manual") {
      this.setState({ type: "manual_instructions", intent });
      await this.startPolling(intent);
      return;
    }

    if (selected === "wallet") {
      await this.startWalletFlow(intent);
      return;
    }
  }

  /**
   * If user is on awaiting_confirmation screen, they can choose to keep waiting.
   */
  async keepWaiting() {
    const current = this.state;
    if (current.type !== "awaiting_confirmation") return;

    this.setState({
      type: "waiting",
      intent: current.intent,
      pendingConfirmationsSince: Date.now(),
    });

    await this.startPolling(current.intent);
  }

  private getInitialMethod(): PaymentMethod {
    const pref = this.config.defaultMethod ?? "wallet";

    if (pref === "wallet" && this.config.allowWallet) return "wallet";
    if (pref === "manual" && this.config.allowManual) return "manual";

    if (this.config.allowWallet) return "wallet";
    return "manual";
  }

  /**
   * Wallet flow (EOA / injected only, MVP):
   * 1) connect wallet
   * 2) ensure chain matches intent.chain_id
   * 3) send ERC-20 transfer to expected_wallet
   * 4) poll until succeeded/expired
   *
   * MVP decision: if chain switch fails (including 4902), fall back to manual.
   */
  private async startWalletFlow(intent: ResolvedPaymentIntent) {
    try {
      const provider = getInjectedProvider();
      if (!provider) {
        throw new Error(
          "No injected wallet found. Install MetaMask or use manual payment.",
        );
      }

      this.setState({ type: "wallet_connecting", intent });

      const accounts = await requestAccounts(provider);
      const from = accounts?.[0];
      if (!from) throw new Error("No wallet account available.");

      const currentChainId = await getChainId(provider);

      if (currentChainId !== intent.chain_id) {
        this.setState({ type: "wallet_switching_chain", intent });

        // Option 1: do not add chain; attempt switch only.
        await switchEthereumChain(provider, intent.chain_id);

        const afterSwitch = await getChainId(provider);
        if (afterSwitch !== intent.chain_id) {
          throw new Error("Wallet did not switch to the correct network.");
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

      // Wait for backend/watcher to detect and confirm.
      await this.startPolling(intent);
    } catch (err) {
      const pub = toPublicError(err);

      // Wallet failure should guide the user to manual if available.
      if (this.config.allowManual) {
        this.setState({
          type: "choose_method",
          intent,
          selected: "manual",
          message: pub.message,
        });

        this.setState({ type: "manual_instructions", intent });
        await this.startPolling(intent);
        return;
      }

      this.config.onError?.(pub);
      this.setState({ type: "error", error: pub, lastIntent: intent });
    }
  }

  /**
   * Polling loop:
   * - repeatedly resolves intent
   * - updates UI based on intermediate statuses
   * - enters awaiting_confirmation if pending_confirmations > threshold
   */
  private async startPolling(initialIntent: ResolvedPaymentIntent) {
    if (this.stopRequested) return;

    let pendingSince: number | undefined;

    this.setState({
      type: "waiting",
      intent: initialIntent,
      pendingConfirmationsSince: undefined,
    });

    try {
      const result = await waitForFinalStatus(this.config.clientSecret, {
        baseUrl: this.config.baseUrl,
        fetchImpl: this.config.fetchImpl,
        intervalMs: this.pollIntervalMs,
        timeoutMs: this.pollTimeoutMs,
        onUpdate: (intent) => {
          if (this.stopRequested) return;

          if (intent.status === "pending_confirmations") {
            if (!pendingSince) pendingSince = Date.now();

            const elapsed = Date.now() - pendingSince;
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

          if (intent.status === "requires_payment") {
            pendingSince = undefined;
            this.setState({
              type: "waiting",
              intent,
              pendingConfirmationsSince: undefined,
            });
            return;
          }

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
        this.config.onSuccess?.({
          payment_intent_id: finalIntent.id,
          tx_hash: this.lastTxHash ?? "",
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

      if (result.timedOut) {
        if (finalIntent.status === "pending_confirmations") {
          this.config.onAwaitingConfirmation?.({
            payment_intent_id: finalIntent.id,
          });
          this.setState({ type: "awaiting_confirmation", intent: finalIntent });
          return;
        }

        this.setState({
          type: "waiting",
          intent: finalIntent,
          pendingConfirmationsSince: pendingSince,
        });
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
