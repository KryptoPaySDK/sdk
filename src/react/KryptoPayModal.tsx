// src/react/KryptoPayModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { KryptoPayCheckoutOptions } from "../core/types";
import type { CheckoutState } from "../ui/state";
import { CheckoutController } from "../ui/controller";
import { ensureStylesInjected } from "../ui/styles";
import { applyThemeToElement } from "../ui/theme";

export type KryptoPayModalProps = Omit<
  KryptoPayCheckoutOptions,
  "clientSecret"
> & {
  open: boolean;
  clientSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch; // injection for Cosmos/tests
};

/**
 * React renderer for the KryptoPay checkout modal.
 *
 * Key idea:
 * - UI is "dumb": it only renders CheckoutState.
 * - The CheckoutController owns all business logic (resolve intent, wallet flow, polling, callbacks).
 */
export function KryptoPayModal(props: KryptoPayModalProps) {
  const [state, setState] = useState<CheckoutState>({ type: "idle" });

  // Ensure base modal styles exist once.
  useEffect(() => {
    ensureStylesInjected();
  }, []);

  /**
   * Callback refs:
   * The controller is memoized; if we passed callbacks directly, they'd become stale on re-render.
   * We store callbacks in refs and call the latest version from stable wrappers.
   */
  const onCloseRef = useRef(props.onClose);
  const onSuccessRef = useRef(props.onSuccess);
  const onAwaitingRef = useRef(props.onAwaitingConfirmation);
  const onErrorRef = useRef(props.onError);

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);
  useEffect(() => {
    onSuccessRef.current = props.onSuccess;
  }, [props.onSuccess]);
  useEffect(() => {
    onAwaitingRef.current = props.onAwaitingConfirmation;
  }, [props.onAwaitingConfirmation]);
  useEffect(() => {
    onErrorRef.current = props.onError;
  }, [props.onError]);

  /**
   * Create one controller per checkout session.
   * A "session" is essentially "this clientSecret + runtime options that affect logic".
   */
  const controller = useMemo(() => {
    return new CheckoutController({
      clientSecret: props.clientSecret,
      baseUrl: props.baseUrl,
      fetchImpl: props.fetchImpl,

      defaultMethod: props.defaultMethod,
      allowManual: props.allowManual,
      allowWallet: props.allowWallet,

      // Stable wrappers call the most recent callbacks.
      onClose: () => onCloseRef.current?.(),
      onSuccess: (e) => onSuccessRef.current?.(e),
      onAwaitingConfirmation: (e) => onAwaitingRef.current?.(e),
      onError: (e) => onErrorRef.current?.(e),
    });
  }, [
    props.clientSecret,
    props.baseUrl,
    props.fetchImpl,
    props.defaultMethod,
    props.allowManual,
    props.allowWallet,
  ]);

  // Subscribe to controller state updates.
  useEffect(() => controller.subscribe(setState), [controller]);

  // Drive controller open/close from the `open` prop.
  useEffect(() => {
    if (props.open) {
      void controller.open();
    } else {
      controller.close();
    }
  }, [props.open, controller]);

  if (!props.open) return null;

  return (
    <Overlay
      state={state}
      controller={controller}
      merchantName={props.merchantName}
      logoUrl={props.logoUrl}
      labels={props.labels}
      classNames={props.classNames}
      theme={props.theme}
      overlayOpacity={props.overlayOpacity}
      zIndex={props.zIndex}
      size={props.size}
      onBackdropClick={() => controller.close()}
    />
  );
}

function Overlay(props: {
  state: CheckoutState;
  controller: CheckoutController;
  merchantName?: string;
  logoUrl?: string;
  labels?: KryptoPayCheckoutOptions["labels"];
  classNames?: KryptoPayCheckoutOptions["classNames"];
  theme?: KryptoPayCheckoutOptions["theme"];
  overlayOpacity?: number;
  zIndex?: number;
  size?: KryptoPayCheckoutOptions["size"];
  onBackdropClick: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Apply theme tokens / css variables at the overlay root.
  useEffect(() => {
    if (!overlayRef.current) return;
    applyThemeToElement(overlayRef.current, {
      theme: props.theme,
      overlayOpacity: props.overlayOpacity,
      zIndex: props.zIndex,
      size: props.size,
    });
  }, [props.theme, props.overlayOpacity, props.zIndex, props.size]);

  const cn = props.classNames ?? {};
  const labels = props.labels ?? {};
  const mode = getIntentModeFromState(props.state);

  return (
    <div
      ref={overlayRef}
      className={`kp-overlay ${cn.overlay ?? ""}`}
      onMouseDown={(e) => {
        // Only close when clicking the backdrop itself.
        if (e.target === e.currentTarget) props.onBackdropClick();
      }}
    >
      <div className={`kp-modal ${cn.modal ?? ""}`}>
        <div className={`kp-header ${cn.header ?? ""}`}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {props.logoUrl ? (
              <img
                src={props.logoUrl}
                alt=""
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  objectFit: "cover",
                }}
              />
            ) : null}

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="kp-title">{labels.title ?? "Checkout"}</div>

                {/* Show badge only for testnet (keeps mainnet UI clean). */}
                {mode === "testnet" ? (
                  <span className="kp-badge" data-variant="testnet">
                    Test mode
                  </span>
                ) : null}
              </div>

              {props.merchantName ? (
                <div className={`kp-muted ${cn.helperText ?? ""}`}>
                  {props.merchantName}
                </div>
              ) : null}
            </div>
          </div>

          <button
            className={`kp-btn ${cn.secondaryButton ?? ""}`}
            onClick={() => props.controller.close()}
            type="button"
          >
            {labels.close ?? "Close"}
          </button>
        </div>

        <div className={`kp-body ${cn.body ?? ""}`}>
          <RenderBody
            state={props.state}
            controller={props.controller}
            labels={labels}
            classNames={cn}
          />
        </div>

        <div className={`kp-footer ${cn.footer ?? ""}`}>
          <RenderFooter
            state={props.state}
            controller={props.controller}
            labels={labels}
            classNames={cn}
          />
        </div>
      </div>
    </div>
  );
}

function RenderBody(props: {
  state: CheckoutState;
  controller: CheckoutController;
  labels: NonNullable<KryptoPayCheckoutOptions["labels"]>;
  classNames: NonNullable<KryptoPayCheckoutOptions["classNames"]>;
}) {
  const s = props.state;
  const labels = props.labels;
  const cn = props.classNames;

  if (s.type === "loading_intent") {
    return <p className="kp-muted">Preparing checkout…</p>;
  }

  if (s.type === "choose_method") {
    return (
      <>
        {s.message ? <p className="kp-muted">{s.message}</p> : null}

        <div className="kp-row">
          <div>Amount</div>
          <div>
            {formatAmount(s.intent.amount_units, s.intent.decimals)}{" "}
            {s.intent.token_symbol}
          </div>
        </div>

        <div className="kp-row">
          <div>Chain</div>
          <div>{s.intent.chain}</div>
        </div>

        <div className={`kp-tabs ${cn.tabs ?? ""}`}>
          <Tab
            label={labels.payWithWallet ?? "Pay with wallet"}
            active={s.selected === "wallet"}
            className={cn.tab}
            onClick={() => props.controller.selectMethod("wallet")}
          />
          <Tab
            label={labels.payManually ?? "Pay manually"}
            active={s.selected === "manual"}
            className={cn.tab}
            onClick={() => props.controller.selectMethod("manual")}
          />
        </div>

        <p className="kp-muted">
          Choose how you want to pay. If wallet connection fails, manual payment
          is available.
        </p>
      </>
    );
  }

  // Wallet states (parity with vanilla)
  if (s.type === "wallet_connecting") {
    return (
      <p className="kp-muted">{labels.connectWallet ?? "Connecting wallet…"}</p>
    );
  }

  if (s.type === "wallet_switching_chain") {
    return (
      <p className="kp-muted">{labels.switchNetwork ?? "Switching network…"}</p>
    );
  }

  if (s.type === "wallet_sending") {
    return (
      <>
        <p className="kp-muted">
          {labels.sendPayment ?? "Confirm the payment in your wallet…"}
        </p>
        <div className="kp-row" style={{ marginTop: 10 }}>
          <div>From</div>
          <div>{shortAddr(s.from)}</div>
        </div>
      </>
    );
  }

  if (s.type === "wallet_submitted") {
    return (
      <>
        <p className="kp-muted">Transaction submitted.</p>
        <div className="kp-row" style={{ marginTop: 10 }}>
          <div>Tx Hash</div>
          <div
            className="kp-muted"
            style={{ overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {s.txHash}
          </div>
        </div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          Waiting for confirmations…
        </p>
      </>
    );
  }

  // Manual flow
  if (s.type === "manual_instructions") {
    return (
      <>
        <p className="kp-muted">Send the exact amount to the address below.</p>

        <div className="kp-row">
          <div>Amount</div>
          <div>
            {formatAmount(s.intent.amount_units, s.intent.decimals)}{" "}
            {s.intent.token_symbol}
          </div>
        </div>

        <div className="kp-row">
          <div>Chain</div>
          <div>{s.intent.chain}</div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="kp-muted" style={{ marginBottom: 6 }}>
            Destination address
          </div>
          <div className={`kp-code ${cn.codeBlock ?? ""}`}>
            {s.intent.expected_wallet}
          </div>
        </div>

        <p className="kp-muted" style={{ marginTop: 12 }}>
          We’ll update automatically once payment is detected.
        </p>
      </>
    );
  }

  if (s.type === "waiting") {
    const statusText =
      s.intent.status === "requires_payment"
        ? "Waiting for payment…"
        : s.intent.status === "pending_confirmations"
          ? "Payment detected, awaiting confirmations…"
          : "Updating…";

    return (
      <>
        <p className="kp-muted">{statusText}</p>
        <div className="kp-row">
          <div>Status</div>
          <div>{s.intent.status}</div>
        </div>
      </>
    );
  }

  if (s.type === "awaiting_confirmation") {
    return (
      <>
        <div className="kp-title">
          {labels.awaitingConfirmationTitle ??
            "Payment is awaiting confirmation"}
        </div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          {labels.awaitingConfirmationBody ??
            "Your transfer was detected. Confirmations can take a bit. You can close this window and confirm later in your dashboard, or keep waiting here."}
        </p>
      </>
    );
  }

  if (s.type === "success") {
    return (
      <>
        <div className="kp-title kp-success">
          {labels.successTitle ?? "Payment successful"}
        </div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          {labels.successBody ?? "You can close this window."}
        </p>
      </>
    );
  }

  if (s.type === "expired") {
    return (
      <>
        <div className="kp-title kp-danger">Payment expired</div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          This payment intent expired. Please start again from the merchant
          checkout.
        </p>
      </>
    );
  }

  if (s.type === "error") {
    return (
      <>
        <div className="kp-title kp-danger">Something went wrong</div>
        <p
          className={`kp-muted ${cn.errorText ?? ""}`}
          style={{ marginTop: 8 }}
        >
          {s.error.message} ({s.error.code})
        </p>
        {s.error.recoverable ? (
          <p className="kp-muted" style={{ marginTop: 8 }}>
            Please try again.
          </p>
        ) : null}
      </>
    );
  }

  return null;
}

function RenderFooter(props: {
  state: CheckoutState;
  controller: CheckoutController;
  labels: NonNullable<KryptoPayCheckoutOptions["labels"]>;
  classNames: NonNullable<KryptoPayCheckoutOptions["classNames"]>;
}) {
  const s = props.state;
  const labels = props.labels;
  const cn = props.classNames;

  if (s.type === "choose_method") {
    return (
      <button
        className={`kp-btn kp-btn-primary ${cn.primaryButton ?? ""}`}
        onClick={() => void props.controller.continue()}
        type="button"
      >
        Continue
      </button>
    );
  }

  if (s.type === "awaiting_confirmation") {
    return (
      <>
        <button
          className={`kp-btn ${cn.secondaryButton ?? ""}`}
          onClick={() => props.controller.close()}
          type="button"
        >
          {labels.close ?? "Close"}
        </button>
        <button
          className={`kp-btn kp-btn-primary ${cn.primaryButton ?? ""}`}
          onClick={() => void props.controller.keepWaiting()}
          type="button"
        >
          {labels.keepWaiting ?? "Keep waiting"}
        </button>
      </>
    );
  }

  if (s.type === "success" || s.type === "expired" || s.type === "error") {
    return (
      <button
        className={`kp-btn kp-btn-primary ${cn.primaryButton ?? ""}`}
        onClick={() => props.controller.close()}
        type="button"
      >
        {labels.close ?? "Close"}
      </button>
    );
  }

  // In-progress states: no footer buttons (close is always available in header).
  return null;
}

function Tab(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`kp-tab ${props.className ?? ""}`}
      data-active={props.active ? "true" : "false"}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

/**
 * Extract mode from any CheckoutState that contains an `intent`.
 * Keeping this in the renderer avoids adding UI concepts to the controller.
 */
function getIntentModeFromState(
  state: CheckoutState,
): "testnet" | "mainnet" | null {
  const s: any = state;
  return s?.intent?.mode ?? null;
}

/**
 * Converts integer base units into a human string.
 * MVP formatting (no locale).
 */
function formatAmount(amountUnits: number, decimals: number) {
  const s = String(amountUnits).padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function shortAddr(addr: string) {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
