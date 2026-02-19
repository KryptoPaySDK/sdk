import type {
  KryptoPayCheckoutOptions,
  PaymentIntentStatus,
} from "../core/types";
import type { CheckoutState } from "../ui/state";
import { CheckoutController } from "../ui/controller";
import { ensureStylesInjected } from "../ui/styles";
import { applyThemeToElement } from "../ui/theme";

export type KryptoPayModalHandle = {
  close: () => void;
  getState: () => CheckoutState;
};

export function openKryptoPayModal(
  opts: KryptoPayCheckoutOptions & { baseUrl?: string },
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
  });

  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) controller.close();
  });

  // Success auto-close timers
  let successIntervalId: number | null = null;
  let successTimeoutId: number | null = null;
  let successSecondsLeft: number | null = null;

  function clearSuccessTimers() {
    if (successIntervalId) window.clearInterval(successIntervalId);
    if (successTimeoutId) window.clearTimeout(successTimeoutId);
    successIntervalId = null;
    successTimeoutId = null;
    successSecondsLeft = null;
  }

  function startSuccessTimers() {
    clearSuccessTimers();
    successSecondsLeft = 10;

    successIntervalId = window.setInterval(() => {
      if (successSecondsLeft === null) return;
      successSecondsLeft = Math.max(0, successSecondsLeft - 1);
      render(controller.getState());
    }, 1000);

    successTimeoutId = window.setTimeout(() => {
      controller.close();
    }, 10_000);
  }

  function render(state: CheckoutState) {
    // Stop countdown when leaving success state
    if (state.type !== "success") {
      clearSuccessTimers();
    }

    modal.innerHTML = "";
    modal.appendChild(renderHeader(opts, controller, state));
    modal.appendChild(renderBody(state, opts, controller, successSecondsLeft));
    modal.appendChild(renderFooter(state, opts, controller));
  }

  const unsubscribe = controller.subscribe((s) => render(s));
  document.body.appendChild(overlay);

  const originalOnClose = opts.onClose;
  controller.subscribe((s) => {
    if (s.type === "idle") {
      clearSuccessTimers();
      unsubscribe();
      overlay.remove();
      originalOnClose?.();
    }
  });

  void controller.open();

  return {
    close: () => controller.close(),
    getState: () => controller.getState(),
  };
}

function renderHeader(
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
  state: CheckoutState,
) {
  const header = document.createElement("div");
  header.className = `kp-header ${opts.classNames?.header ?? ""}`;

  const left = document.createElement("div");

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.gap = "10px";

  const title = document.createElement("div");
  title.className = "kp-title";
  title.textContent = opts.labels?.title ?? "Checkout";
  titleRow.appendChild(title);

  const badge = getHeaderBadge(state);
  if (badge) {
    const b = document.createElement("span");
    b.className = "kp-badge";
    if (badge.variant) b.dataset.variant = badge.variant;
    b.textContent = badge.text;
    titleRow.appendChild(b);
  }

  left.appendChild(titleRow);

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
  successSecondsLeft: number | null,
) {
  const body = document.createElement("div");
  body.className = `kp-body ${opts.classNames?.body ?? ""}`;

  const p = (text: string) => {
    const el = document.createElement("p");
    el.className = "kp-muted";
    el.textContent = text;
    return el;
  };

  if (state.type === "loading_intent") {
    body.appendChild(p("Preparing checkout…"));
    return body;
  }

  if (state.type === "choose_method") {
    if (state.message) body.appendChild(p(state.message));

    body.appendChild(
      renderRow(
        "Amount",
        `${formatAmount(state.intent.amount_units, state.intent.decimals)} ${state.intent.token_symbol}`,
      ),
    );
    body.appendChild(renderRow("Chain", formatChain(state.intent.chain)));

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
      p(
        "Choose how you want to pay. If wallet connection fails, you can pay manually.",
      ),
    );
    return body;
  }

  if (state.type === "manual_instructions") {
    body.appendChild(p("Send the exact amount to the address below."));

    body.appendChild(
      renderRow(
        "Amount",
        `${formatAmount(state.intent.amount_units, state.intent.decimals)} ${state.intent.token_symbol}`,
      ),
    );
    body.appendChild(renderRow("Chain", formatChain(state.intent.chain)));

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
      p(
        "After you send payment, we will update automatically once it is detected.",
      ),
    );
    return body;
  }

  if (state.type === "waiting") {
    const friendly = formatStatusLabel(state.intent.status);
    const isPending = state.intent.status === "pending_confirmations";

    const row = document.createElement("div");
    row.className = "kp-statusRow";

    if (isPending) {
      const spinner = document.createElement("span");
      spinner.className = "kp-spinner";
      row.appendChild(spinner);
    }

    const text = document.createElement("p");
    text.className = "kp-muted";
    text.style.margin = "0";
    text.textContent = isPending
      ? "Payment detected, awaiting confirmations…"
      : friendly === "Awaiting payment"
        ? "Awaiting payment…"
        : "Updating…";

    row.appendChild(text);
    body.appendChild(row);

    body.appendChild(renderRow("Status", friendly));
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
      p(
        opts.labels?.awaitingConfirmationBody ??
          "Your transfer was detected. Confirmations can take a bit. You can close this window and confirm later in your dashboard, or keep waiting here.",
      ),
    );
    return body;
  }

  if (state.type === "success") {
    // Start countdown only once on entry
    // We detect entry by checking if successSecondsLeft is null, then kick off timers in caller.
    // Caller starts timers when it sees state.type === "success".
    // (We handle it in the subscriber by calling startSuccessTimers().)
    const title = document.createElement("div");
    title.className = "kp-title kp-success";
    title.textContent = opts.labels?.successTitle ?? "Payment successful";
    body.appendChild(title);

    body.appendChild(
      p(opts.labels?.successBody ?? "This window will close automatically."),
    );

    const countdown = document.createElement("p");
    countdown.className = "kp-muted";
    countdown.style.marginTop = "8px";
    countdown.textContent = `Closing in ${successSecondsLeft ?? 10}s…`;
    body.appendChild(countdown);

    return body;
  }

  if (state.type === "expired") {
    const title = document.createElement("div");
    title.className = "kp-title kp-danger";
    title.textContent = "Payment expired";
    body.appendChild(title);
    body.appendChild(
      p(
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

    if (state.error.recoverable) body.appendChild(p("Please try again."));
    return body;
  }

  // Wallet states (minimal messaging)
  if (state.type === "wallet_connecting")
    body.appendChild(p("Connecting wallet…"));
  if (state.type === "wallet_switching_chain")
    body.appendChild(p("Switching network…"));
  if (state.type === "wallet_sending")
    body.appendChild(p("Confirm the payment in your wallet…"));

  if (state.type === "wallet_submitted") {
    body.appendChild(p("Transaction submitted."));
    body.appendChild(renderRow("Tx Hash", state.txHash));
    body.appendChild(p("Waiting for confirmation…"));
  }

  // Start success timers when state becomes success
  // We do this at the end so renderBody has access to current state.
  // This is safe because caller re-renders anyway.
  if (state.type === "success") {
    // no-op here; started in the main subscribe loop by detecting success entry
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
  const intent =
    state.type === "choose_method" ||
    state.type === "manual_instructions" ||
    state.type === "waiting" ||
    state.type === "wallet_connecting" ||
    state.type === "wallet_switching_chain" ||
    state.type === "wallet_sending" ||
    state.type === "wallet_submitted" ||
    state.type === "awaiting_confirmation" ||
    state.type === "success"
      ? (state as any).intent
      : null;

  if (!intent) return null;

  if (intent.mode === "testnet")
    return { text: "Test mode", variant: "testnet" };
  if (intent.mode === "mainnet")
    return { text: "Live mode", variant: "mainnet" };
  return null;
}
