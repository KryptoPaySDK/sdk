import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  KryptoPayCheckoutOptions,
  PaymentIntentStatus,
} from "../core/types";
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
  fetchImpl?: typeof fetch;
};

export function KryptoPayModal(props: KryptoPayModalProps) {
  const [state, setState] = useState<CheckoutState>({ type: "idle" });

  // Success auto-close countdown
  const [successSecondsLeft, setSuccessSecondsLeft] = useState<number | null>(
    null,
  );
  const successTimersRef = useRef<{
    intervalId: number | null;
    timeoutId: number | null;
  }>({
    intervalId: null,
    timeoutId: null,
  });

  const onCloseRef = useRef(props.onClose);
  const onSuccessRef = useRef(props.onSuccess);
  const onAwaitingRef = useRef(props.onAwaitingConfirmation);
  const onErrorRef = useRef(props.onError);

  useEffect(() => void (onCloseRef.current = props.onClose), [props.onClose]);
  useEffect(
    () => void (onSuccessRef.current = props.onSuccess),
    [props.onSuccess],
  );
  useEffect(
    () => void (onAwaitingRef.current = props.onAwaitingConfirmation),
    [props.onAwaitingConfirmation],
  );
  useEffect(() => void (onErrorRef.current = props.onError), [props.onError]);

  useEffect(() => {
    ensureStylesInjected();
  }, []);

  const controller = useMemo(() => {
    return new CheckoutController({
      clientSecret: props.clientSecret,
      baseUrl: props.baseUrl,
      fetchImpl: props.fetchImpl,

      defaultMethod: props.defaultMethod,
      allowManual: props.allowManual,
      allowWallet: props.allowWallet,

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

  useEffect(() => {
    return controller.subscribe(setState);
  }, [controller]);

  useEffect(() => {
    if (props.open) {
      void controller.open();
    } else {
      controller.close();
    }
  }, [props.open, controller]);

  // Success countdown: start when state becomes success; clear otherwise.
  useEffect(() => {
    // Clear any previous timers
    const clear = () => {
      const t = successTimersRef.current;
      if (t.intervalId) window.clearInterval(t.intervalId);
      if (t.timeoutId) window.clearTimeout(t.timeoutId);
      t.intervalId = null;
      t.timeoutId = null;
    };

    if (state.type !== "success") {
      clear();
      setSuccessSecondsLeft(null);
      return;
    }

    clear();
    setSuccessSecondsLeft(10);

    const intervalId = window.setInterval(() => {
      setSuccessSecondsLeft((prev) => {
        if (prev === null) return null;
        return Math.max(0, prev - 1);
      });
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      controller.close();
    }, 10_000);

    successTimersRef.current = { intervalId, timeoutId };

    return () => clear();
  }, [state.type, controller]);

  if (!props.open) return null;

  return (
    <Overlay
      {...props}
      onBackdropClick={() => controller.close()}
      state={state}
      controller={controller}
      successSecondsLeft={successSecondsLeft}
    />
  );
}

function Overlay(
  props: {
    state: CheckoutState;
    controller: CheckoutController;
    onBackdropClick: () => void;
    successSecondsLeft: number | null;
  } & KryptoPayModalProps,
) {
  const overlayRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!overlayRef.current) return;
    applyThemeToElement(overlayRef.current, {
      theme: props.theme,
      overlayOpacity: props.overlayOpacity,
      zIndex: props.zIndex,
      size: props.size,
    });
  }, [props.theme, props.overlayOpacity, props.zIndex, props.size]);

  const classNames = props.classNames ?? {};

  const headerBadge = getHeaderBadge(props.state);

  return (
    <div
      ref={overlayRef}
      className={`kp-overlay ${classNames.overlay ?? ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onBackdropClick();
      }}
    >
      <div className={`kp-modal ${classNames.modal ?? ""}`}>
        <div className={`kp-header ${classNames.header ?? ""}`}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="kp-title">
                {props.labels?.title ?? "Checkout"}
              </div>
              {headerBadge ? (
                <span className="kp-badge" data-variant={headerBadge.variant}>
                  {headerBadge.text}
                </span>
              ) : null}
            </div>

            {props.merchantName ? (
              <div className={`kp-muted ${classNames.helperText ?? ""}`}>
                {props.merchantName}
              </div>
            ) : null}
          </div>

          <button
            className={`kp-btn ${classNames.secondaryButton ?? ""}`}
            onClick={() => props.controller.close()}
            type="button"
          >
            {props.labels?.close ?? "Close"}
          </button>
        </div>

        <div className={`kp-body ${classNames.body ?? ""}`}>
          <RenderBody
            state={props.state}
            controller={props.controller}
            labels={props.labels}
            classNames={classNames}
            successSecondsLeft={props.successSecondsLeft}
          />
        </div>

        <div className={`kp-footer ${classNames.footer ?? ""}`}>
          <RenderFooter
            state={props.state}
            controller={props.controller}
            labels={props.labels}
            classNames={classNames}
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
  successSecondsLeft: number | null;
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
          <div>{formatChain(s.intent.chain)}</div>
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
          Choose how you want to pay. If wallet connection fails, you can pay
          manually.
        </p>
      </>
    );
  }

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
          <div>{formatChain(s.intent.chain)}</div>
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
          After you send payment, we will update automatically once it is
          detected.
        </p>
      </>
    );
  }

  if (s.type === "waiting") {
    const friendly = formatStatusLabel(s.intent.status);

    const isPendingConfirmations = s.intent.status === "pending_confirmations";

    return (
      <>
        <div className="kp-statusRow">
          {isPendingConfirmations ? <span className="kp-spinner" /> : null}
          <p className="kp-muted" style={{ margin: 0 }}>
            {isPendingConfirmations
              ? "Payment detected, awaiting confirmations…"
              : friendly === "Awaiting payment"
                ? "Awaiting payment…"
                : "Updating…"}
          </p>
        </div>

        <div className="kp-row">
          <div>Status</div>
          <div>{friendly}</div>
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
          {props.labels?.successBody ?? "This window will close automatically."}
        </p>

        <p className="kp-muted" style={{ marginTop: 8 }}>
          Closing in {props.successSecondsLeft ?? 10}s…
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

  if (s.type === "wallet_connecting")
    return <p className="kp-muted">Connecting wallet…</p>;
  if (s.type === "wallet_switching_chain")
    return <p className="kp-muted">Switching network…</p>;
  if (s.type === "wallet_sending")
    return <p className="kp-muted">Confirm the payment in your wallet…</p>;

  if (s.type === "wallet_submitted") {
    return (
      <>
        <p className="kp-muted">Transaction submitted.</p>
        <div className="kp-row">
          <div>Tx Hash</div>
          <div
            className="kp-muted"
            style={{ overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {s.txHash}
          </div>
        </div>
        <p className="kp-muted" style={{ marginTop: 8 }}>
          Waiting for confirmation…
        </p>
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
  const s = String(amountUnits).padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function formatChain(chain: string) {
  if (chain === "base") return "Base";
  if (chain === "polygon") return "Polygon";
  return chain;
}

function formatStatusLabel(status: PaymentIntentStatus): string {
  switch (status) {
    case "requires_payment":
      return "Awaiting payment";
    case "pending_confirmations":
      return "Awaiting confirmations";
    case "succeeded":
      return "Successful";
    case "expired":
      return "Expired";
    default:
      return "Updating";
  }
}

function getHeaderBadge(
  state: CheckoutState,
): null | { text: string; variant?: string } {
  // Show badge only once we have an intent loaded.
  const intent =
    state.type === "choose_method" ||
    state.type === "manual_instructions" ||
    state.type === "waiting" ||
    state.type === "wallet_connecting" ||
    state.type === "wallet_switching_chain" ||
    state.type === "wallet_sending" ||
    state.type === "wallet_submitted"
      ? state.intent
      : state.type === "awaiting_confirmation" || state.type === "success"
        ? state.intent
        : null;

  if (!intent) return null;

  if (intent.mode === "testnet")
    return { text: "Test mode", variant: "testnet" };
  if (intent.mode === "mainnet")
    return { text: "Live mode", variant: "mainnet" };
  return null;
}
