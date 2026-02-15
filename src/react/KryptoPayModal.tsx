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
  fetchImpl?: typeof fetch; // enables Cosmos/tests without backend
};

/**
 * React renderer for the KryptoPay checkout modal.
 *
 * The UI stays dumb: it renders based on controller state.
 * All business logic lives in CheckoutController.
 */
export function KryptoPayModal(props: KryptoPayModalProps) {
  const [state, setState] = useState<CheckoutState>({ type: "idle" });

  // Inject minimal styles once.
  useEffect(() => {
    ensureStylesInjected();
  }, []);

  /**
   * Callback refs:
   * The controller is created once per "session" (clientSecret),
   * so callbacks passed at creation time would become stale on re-render.
   * We store them in refs and pass stable wrapper functions to controller.
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
   * Create controller once per checkout session.
   * Recreate only when values that affect business logic change.
   */
  const controller = useMemo(() => {
    return new CheckoutController({
      clientSecret: props.clientSecret,
      baseUrl: props.baseUrl,
      fetchImpl: props.fetchImpl,

      defaultMethod: props.defaultMethod,
      allowManual: props.allowManual,
      allowWallet: props.allowWallet,

      // stable wrappers -> always call latest callbacks from refs
      onClose: () => onCloseRef.current?.(),
      onSuccess: (e) => onSuccessRef.current?.(e),
      onAwaitingConfirmation: (e) => onAwaitingRef.current?.(e),
      onError: (e) => onErrorRef.current?.(e),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.clientSecret,
    props.baseUrl,
    props.fetchImpl,
    props.defaultMethod,
    props.allowManual,
    props.allowWallet,
  ]);

  // Subscribe once to controller state updates.
  useEffect(() => controller.subscribe(setState), [controller]);

  // Open/close driven by prop.
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
      labels={props.labels}
      classNames={props.classNames}
      merchantName={props.merchantName}
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
  labels?: KryptoPayCheckoutOptions["labels"];
  classNames?: KryptoPayCheckoutOptions["classNames"];
  theme?: KryptoPayCheckoutOptions["theme"];
  overlayOpacity?: number;
  zIndex?: number;
  size?: KryptoPayCheckoutOptions["size"];
  onBackdropClick: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      ref={overlayRef}
      className={`kp-overlay ${cn.overlay ?? ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onBackdropClick();
      }}
    >
      <div className={`kp-modal ${cn.modal ?? ""}`}>
        <div className={`kp-header ${cn.header ?? ""}`}>
          <div>
            <div className="kp-title">{props.labels?.title ?? "Checkout"}</div>
            {props.merchantName ? (
              <div className={`kp-muted ${cn.helperText ?? ""}`}>
                {props.merchantName}
              </div>
            ) : null}
          </div>

          <button
            className={`kp-btn ${cn.secondaryButton ?? ""}`}
            onClick={() => props.controller.close()}
            type="button"
          >
            {props.labels?.close ?? "Close"}
          </button>
        </div>

        <div className={`kp-body ${cn.body ?? ""}`}>
          <RenderBody
            state={props.state}
            controller={props.controller}
            labels={props.labels}
            classNames={cn}
          />
        </div>

        <div className={`kp-footer ${cn.footer ?? ""}`}>
          <RenderFooter
            state={props.state}
            controller={props.controller}
            labels={props.labels}
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
  labels?: KryptoPayCheckoutOptions["labels"];
  classNames: NonNullable<KryptoPayCheckoutOptions["classNames"]>;
}) {
  const s = props.state;

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

        <div className={`kp-tabs ${props.classNames.tabs ?? ""}`}>
          <Tab
            label={props.labels?.payWithWallet ?? "Pay with wallet"}
            active={s.selected === "wallet"}
            className={props.classNames.tab}
            onClick={() => props.controller.selectMethod("wallet")}
          />
          <Tab
            label={props.labels?.payManually ?? "Pay manually"}
            active={s.selected === "manual"}
            className={props.classNames.tab}
            onClick={() => props.controller.selectMethod("manual")}
          />
        </div>

        <p className="kp-muted">
          You can pay with a connected wallet or manually send the funds. If
          wallet payment fails, manual payment is available.
        </p>
      </>
    );
  }

  // WALLET STATES
  if (s.type === "wallet_connecting") {
    return (
      <>
        <p className="kp-muted">Connecting to your wallet…</p>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          Approve the connection request in your wallet.
        </p>
      </>
    );
  }

  if (s.type === "wallet_switching_chain") {
    return (
      <>
        <p className="kp-muted">Switching network…</p>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          Approve the network switch request in your wallet.
        </p>
      </>
    );
  }

  if (s.type === "wallet_sending") {
    return (
      <>
        <p className="kp-muted">Confirm the payment in your wallet…</p>
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

  // MANUAL FLOW
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
          <div className={`kp-code ${props.classNames.codeBlock ?? ""}`}>
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
          {props.labels?.awaitingConfirmationTitle ??
            "Payment is awaiting confirmation"}
        </div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          {props.labels?.awaitingConfirmationBody ??
            "Your transfer was detected. Confirmations can take a bit. You can close this window and confirm later in your dashboard, or keep waiting here."}
        </p>
      </>
    );
  }

  if (s.type === "success") {
    return (
      <>
        <div className="kp-title kp-success">
          {props.labels?.successTitle ?? "Payment successful"}
        </div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          {props.labels?.successBody ?? "You can close this window."}
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
          className={`kp-muted ${props.classNames.errorText ?? ""}`}
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
  labels?: KryptoPayCheckoutOptions["labels"];
  classNames: NonNullable<KryptoPayCheckoutOptions["classNames"]>;
}) {
  const s = props.state;

  if (s.type === "choose_method") {
    return (
      <button
        className={`kp-btn kp-btn-primary ${props.classNames.primaryButton ?? ""}`}
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
          className={`kp-btn ${props.classNames.secondaryButton ?? ""}`}
          onClick={() => props.controller.close()}
          type="button"
        >
          {props.labels?.close ?? "Close"}
        </button>
        <button
          className={`kp-btn kp-btn-primary ${props.classNames.primaryButton ?? ""}`}
          onClick={() => void props.controller.keepWaiting()}
          type="button"
        >
          {props.labels?.keepWaiting ?? "Keep waiting"}
        </button>
      </>
    );
  }

  if (
    s.type === "wallet_connecting" ||
    s.type === "wallet_switching_chain" ||
    s.type === "wallet_sending" ||
    s.type === "wallet_submitted" ||
    s.type === "manual_instructions" ||
    s.type === "waiting"
  ) {
    // MVP: do not show footer buttons while in-progress.
    // User can always close via header.
    return null;
  }

  if (s.type === "success" || s.type === "expired" || s.type === "error") {
    return (
      <button
        className={`kp-btn kp-btn-primary ${props.classNames.primaryButton ?? ""}`}
        onClick={() => props.controller.close()}
        type="button"
      >
        {props.labels?.close ?? "Close"}
      </button>
    );
  }

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

function formatAmount(amountUnits: number, decimals: number) {
  if (decimals === 0) return String(amountUnits);
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
