import type { KryptoPayCheckoutOptions } from "../core/types";
import type { CheckoutState } from "../ui/state";
import { CheckoutController } from "../ui/controller";
import { ensureStylesInjected } from "../ui/styles";
import { applyThemeToElement } from "../ui/theme";

export type KryptoPayModalHandle = {
  close: () => void;
  getState: () => CheckoutState;
};

/**
 * Vanilla modal renderer:
 * - mounts DOM
 * - subscribes to controller state
 * - re-renders on state changes
 * - cleans up when controller transitions to idle
 *
 * NOTE: onClose is owned by the controller.
 * We do not call opts.onClose here to avoid double-calling.
 */
export function openKryptoPayModal(
  opts: KryptoPayCheckoutOptions & {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  },
): KryptoPayModalHandle {
  ensureStylesInjected();

  const overlay = document.createElement("div");
  overlay.className = `kp-overlay ${opts.classNames?.overlay ?? ""}`;

  const modal = document.createElement("div");
  modal.className = `kp-modal ${opts.classNames?.modal ?? ""}`;
  overlay.appendChild(modal);

  applyThemeToElement(overlay, {
    theme: opts.theme,
    overlayOpacity: opts.overlayOpacity,
    zIndex: opts.zIndex,
    size: opts.size,
  });

  const controller = new CheckoutController({
    ...opts,
    baseUrl: opts.baseUrl,
    fetchImpl: opts.fetchImpl,
  });

  // Backdrop click closes
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) controller.close();
  });

  // Mount once
  document.body.appendChild(overlay);

  const unsubscribe = controller.subscribe((s) => {
    render(modal, s, opts, controller);

    // When controller closes, it sets state to idle. We cleanup here.
    if (s.type === "idle") {
      unsubscribe();
      overlay.remove();
    }
  });

  // Open immediately
  void controller.open();

  return {
    close: () => controller.close(),
    getState: () => controller.getState(),
  };
}

function render(
  modal: HTMLElement,
  state: CheckoutState,
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
) {
  modal.innerHTML = "";
  modal.appendChild(renderHeader(opts, controller));
  modal.appendChild(renderBody(state, opts, controller));
  modal.appendChild(renderFooter(state, opts, controller));
}

function renderHeader(
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
) {
  const header = document.createElement("div");
  header.className = `kp-header ${opts.classNames?.header ?? ""}`;

  const left = document.createElement("div");

  const title = document.createElement("div");
  title.className = "kp-title";
  title.textContent = opts.labels?.title ?? "Checkout";
  left.appendChild(title);

  if (opts.merchantName) {
    const sub = document.createElement("div");
    sub.className = `kp-muted ${opts.classNames?.helperText ?? ""}`;
    sub.textContent = opts.merchantName;
    left.appendChild(sub);
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = `kp-btn ${opts.classNames?.secondaryButton ?? ""}`;
  closeBtn.textContent = opts.labels?.close ?? "Close";
  closeBtn.onclick = () => controller.close();

  header.appendChild(left);
  header.appendChild(closeBtn);
  return header;
}

function renderBody(
  state: CheckoutState,
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
) {
  const body = document.createElement("div");
  body.className = `kp-body ${opts.classNames?.body ?? ""}`;

  const muted = (text: string) => {
    const p = document.createElement("p");
    p.className = "kp-muted";
    p.textContent = text;
    return p;
  };

  if (state.type === "loading_intent") {
    body.appendChild(muted("Preparing checkout…"));
    return body;
  }

  if (state.type === "choose_method") {
    if (state.message) body.appendChild(muted(state.message));

    body.appendChild(
      renderRow(
        "Amount",
        `${formatAmount(state.intent.amount_units, state.intent.decimals)} ${state.intent.token_symbol}`,
      ),
    );
    body.appendChild(renderRow("Chain", state.intent.chain));

    const tabs = document.createElement("div");
    tabs.className = `kp-tabs ${opts.classNames?.tabs ?? ""}`;

    tabs.appendChild(
      renderTab(
        opts.labels?.payWithWallet ?? "Pay with wallet",
        state.selected === "wallet",
        () => controller.selectMethod("wallet"),
        opts.classNames?.tab,
      ),
    );

    tabs.appendChild(
      renderTab(
        opts.labels?.payManually ?? "Pay manually",
        state.selected === "manual",
        () => controller.selectMethod("manual"),
        opts.classNames?.tab,
      ),
    );

    body.appendChild(tabs);
    body.appendChild(
      muted(
        "You can pay with a connected wallet or manually send the funds. If wallet payment fails, manual payment is available.",
      ),
    );
    return body;
  }

  // WALLET STATES
  if (state.type === "wallet_connecting") {
    body.appendChild(muted("Connecting to your wallet…"));
    body.appendChild(muted("Approve the connection request in your wallet."));
    return body;
  }

  if (state.type === "wallet_switching_chain") {
    body.appendChild(muted("Switching network…"));
    body.appendChild(
      muted("Approve the network switch request in your wallet."),
    );
    return body;
  }

  if (state.type === "wallet_sending") {
    body.appendChild(muted("Confirm the payment in your wallet…"));
    body.appendChild(renderRow("From", shortAddr(state.from)));
    return body;
  }

  if (state.type === "wallet_submitted") {
    body.appendChild(muted("Transaction submitted."));
    body.appendChild(renderRow("Tx Hash", state.txHash));
    body.appendChild(muted("Waiting for confirmations…"));
    return body;
  }

  // MANUAL FLOW
  if (state.type === "manual_instructions") {
    body.appendChild(muted("Send the exact amount to the address below."));

    body.appendChild(
      renderRow(
        "Amount",
        `${formatAmount(state.intent.amount_units, state.intent.decimals)} ${state.intent.token_symbol}`,
      ),
    );
    body.appendChild(renderRow("Chain", state.intent.chain));

    const label = document.createElement("div");
    label.className = "kp-muted";
    label.style.marginTop = "12px";
    label.style.marginBottom = "6px";
    label.textContent = "Destination address";
    body.appendChild(label);

    const code = document.createElement("div");
    code.className = `kp-code ${opts.classNames?.codeBlock ?? ""}`;
    code.textContent = state.intent.expected_wallet;
    body.appendChild(code);

    body.appendChild(
      muted("We’ll update automatically once payment is detected."),
    );
    return body;
  }

  if (state.type === "waiting") {
    const statusText =
      state.intent.status === "requires_payment"
        ? "Waiting for payment…"
        : state.intent.status === "pending_confirmations"
          ? "Payment detected, awaiting confirmations…"
          : "Updating…";

    body.appendChild(muted(statusText));
    body.appendChild(renderRow("Status", state.intent.status));
    return body;
  }

  if (state.type === "awaiting_confirmation") {
    const title = document.createElement("div");
    title.className = "kp-title";
    title.textContent =
      opts.labels?.awaitingConfirmationTitle ??
      "Payment is awaiting confirmation";
    body.appendChild(title);

    body.appendChild(
      muted(
        opts.labels?.awaitingConfirmationBody ??
          "Your transfer was detected. Confirmations can take a bit. You can close this window and confirm later in your dashboard, or keep waiting here.",
      ),
    );
    return body;
  }

  if (state.type === "success") {
    const title = document.createElement("div");
    title.className = "kp-title kp-success";
    title.textContent = opts.labels?.successTitle ?? "Payment successful";
    body.appendChild(title);

    body.appendChild(
      muted(opts.labels?.successBody ?? "You can close this window."),
    );
    return body;
  }

  if (state.type === "expired") {
    const title = document.createElement("div");
    title.className = "kp-title kp-danger";
    title.textContent = "Payment expired";
    body.appendChild(title);

    body.appendChild(
      muted(
        "This payment intent expired. Please start again from the merchant checkout.",
      ),
    );
    return body;
  }

  if (state.type === "error") {
    const title = document.createElement("div");
    title.className = "kp-title kp-danger";
    title.textContent = "Something went wrong";
    body.appendChild(title);

    const msg = document.createElement("p");
    msg.className = `kp-muted ${opts.classNames?.errorText ?? ""}`;
    msg.textContent = `${state.error.message} (${state.error.code})`;
    msg.style.marginTop = "8px";
    body.appendChild(msg);

    if (state.error.recoverable) body.appendChild(muted("Please try again."));
    return body;
  }

  return body;
}

function renderFooter(
  state: CheckoutState,
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
) {
  const footer = document.createElement("div");
  footer.className = `kp-footer ${opts.classNames?.footer ?? ""}`;

  const primary = (text: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.className = `kp-btn kp-btn-primary ${opts.classNames?.primaryButton ?? ""}`;
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  };

  const secondary = (text: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.className = `kp-btn ${opts.classNames?.secondaryButton ?? ""}`;
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  };

  if (state.type === "choose_method") {
    footer.appendChild(primary("Continue", () => void controller.continue()));
    return footer;
  }

  if (state.type === "awaiting_confirmation") {
    footer.appendChild(
      secondary(opts.labels?.close ?? "Close", () => controller.close()),
    );
    footer.appendChild(
      primary(
        opts.labels?.keepWaiting ?? "Keep waiting",
        () => void controller.keepWaiting(),
      ),
    );
    return footer;
  }

  if (
    state.type === "success" ||
    state.type === "expired" ||
    state.type === "error"
  ) {
    footer.appendChild(
      primary(opts.labels?.close ?? "Close", () => controller.close()),
    );
    return footer;
  }

  // In-progress states: no footer buttons (header close always available)
  return footer;
}

function renderRow(left: string, right: string) {
  const row = document.createElement("div");
  row.className = "kp-row";

  const l = document.createElement("div");
  l.textContent = left;

  const r = document.createElement("div");
  r.textContent = right;

  row.appendChild(l);
  row.appendChild(r);
  return row;
}

function renderTab(
  label: string,
  active: boolean,
  onClick: () => void,
  className?: string,
) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `kp-tab ${className ?? ""}`;
  btn.dataset.active = active ? "true" : "false";
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

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
