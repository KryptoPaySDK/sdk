import React, { useEffect, useMemo, useState } from "react";
import type { KryptoPayCheckoutOptions } from "../core/types";
import type { CheckoutState, PaymentMethod } from "../ui/state";
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
};

/**
 * React wrapper:
 * - creates controller
 * - subscribes to state
 * - renders based on state
 *
 * Important design choice:
 * we do not put business logic in React.
 * business logic stays inside CheckoutController.
 */
export function KryptoPayModal(props: KryptoPayModalProps) {
  const [state, setState] = useState<CheckoutState>({ type: "idle" });

  // Ensure styles exist for the modal UI
  useEffect(() => {
    ensureStylesInjected();
  }, []);

  // Create controller once per clientSecret (new payment, new controller).
  const controller = useMemo(() => {
    return new CheckoutController({
      ...props,
      clientSecret: props.clientSecret,
      baseUrl: props.baseUrl,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clientSecret]);

  // Subscribe to controller state updates
  useEffect(() => {
    return controller.subscribe(setState);
  }, [controller]);

  // Open and close behavior driven by `open` prop
  useEffect(() => {
    if (props.open) {
      void controller.open();
    } else {
      // When parent closes, we close controller too
      controller.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, controller]);

  // If not open, render nothing
  if (!props.open) return null;

  return (
    <Overlay
      {...props}
      onBackdropClick={() => controller.close()}
      state={state}
      controller={controller}
    />
  );
}

function Overlay(
  props: {
    state: CheckoutState;
    controller: CheckoutController;
    onBackdropClick: () => void;
  } & KryptoPayModalProps,
) {
  // Apply theme variables directly on overlay root.
  // This keeps styling consistent between React and vanilla.
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

  return (
    <div
      ref={overlayRef}
      className={`kp-overlay ${classNames.overlay ?? ""}`}
      onMouseDown={(e) => {
        // Close if user clicks backdrop, not the modal itself
        if (e.target === e.currentTarget) props.onBackdropClick();
      }}
    >
      <div className={`kp-modal ${classNames.modal ?? ""}`}>
        <div className={`kp-header ${classNames.header ?? ""}`}>
          <div>
            <div className="kp-title">{props.labels?.title ?? "Checkout"}</div>
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
          After you send payment, we will update automatically once it is
          detected.
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

  // Footer buttons depend on state
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

  // Manual instructions and waiting states usually need no footer buttons in MVP
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
 * Converts integer base units into a human string.
 * For MVP we keep it simple.
 * Later we can add better formatting and locale support.
 */
function formatAmount(amountUnits: number, decimals: number) {
  const s = String(amountUnits).padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
