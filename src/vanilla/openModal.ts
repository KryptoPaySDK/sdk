// src/vanilla/openModal.ts
import type { KryptoPayCheckoutOptions } from "../core/types";
import type { CheckoutState } from "../ui/state";
import { CheckoutController } from "../ui/controller";
import { ensureStylesInjected } from "../ui/styles";
import { applyThemeToElement } from "../ui/theme";

const SUCCESS_AUTO_CLOSE_SECONDS = 10;

/**
 * Handle returned from the vanilla API so a merchant can close the modal programmatically.
 */
export type KryptoPayModalHandle = {
  close: () => void;
  getState: () => CheckoutState;
};

/**
 * Vanilla renderer:
 * - mounts DOM into document.body
 * - subscribes to controller state and re-renders
 * - cleans up when controller transitions to idle
 *
 * Important:
 * - We do NOT call opts.onClose here. The controller owns onClose.
 * - Cleanup is triggered by observing state.type === "idle".
 */
export function openKryptoPayModal(
  opts: KryptoPayCheckoutOptions & {
    fetchImpl?: typeof fetch;
  },
): KryptoPayModalHandle {
  ensureStylesInjected();

  const overlay = document.createElement("div");
  overlay.className = `kp-overlay ${opts.classNames?.overlay ?? ""}`;

  const modal = document.createElement("div");
  modal.className = `kp-modal ${opts.classNames?.modal ?? ""}`;
  overlay.appendChild(modal);

  // Apply theme tokens / CSS vars at overlay root (same behavior as React).
  applyThemeToElement(overlay, {
    theme: opts.theme,
    overlayOpacity: opts.overlayOpacity,
    zIndex: opts.zIndex,
    size: opts.size,
  });

  const controller = new CheckoutController({
    clientSecret: opts.clientSecret,
    fetchImpl: opts.fetchImpl,

    defaultMethod: opts.defaultMethod,
    allowManual: opts.allowManual,
    allowWallet: opts.allowWallet,

    // Pass callbacks through (controller will call them).
    onClose: opts.onClose,
    onSuccess: opts.onSuccess,
    onAwaitingConfirmation: opts.onAwaitingConfirmation,
    onError: opts.onError,
  });

  // Backdrop click closes the modal.
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) controller.close("backdrop");
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      controller.close("escape_key");
    }
  };
  window.addEventListener("keydown", onKeyDown);

  // Mount once.
  document.body.appendChild(overlay);

  let successSecondsLeft: number | null = null;
  let successIntervalId: number | null = null;
  let successTimeoutId: number | null = null;
  let prevType: CheckoutState["type"] | null = null;
  let hasStarted = false;

  const clearSuccessTimers = () => {
    if (successIntervalId) window.clearInterval(successIntervalId);
    if (successTimeoutId) window.clearTimeout(successTimeoutId);
    successIntervalId = null;
    successTimeoutId = null;
    successSecondsLeft = null;
  };

  const startSuccessTimers = () => {
    clearSuccessTimers();
    successSecondsLeft = SUCCESS_AUTO_CLOSE_SECONDS;

    successIntervalId = window.setInterval(() => {
      if (successSecondsLeft === null) return;
      successSecondsLeft = Math.max(0, successSecondsLeft - 1);
      render(modal, controller.getState(), opts, controller, successSecondsLeft);
    }, 1000);

    successTimeoutId = window.setTimeout(
      () => controller.close("success_auto_close"),
      SUCCESS_AUTO_CLOSE_SECONDS * 1000,
    );
  };

  // `subscribe` may synchronously emit the current state, so initialize first.
  let unsubscribe: (() => void) | null = null;
  unsubscribe = controller.subscribe((state) => {
    if (state.type === "success" && prevType !== "success") {
      startSuccessTimers();
    } else if (state.type !== "success" && prevType === "success") {
      clearSuccessTimers();
    }

    prevType = state.type;
    render(modal, state, opts, controller, successSecondsLeft);

    // When controller closes, it sets state to idle. Clean up DOM + subscription.
    if (state.type === "idle" && hasStarted) {
      clearSuccessTimers();
      unsubscribe?.();
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    }
  });

  // Open immediately (vanilla usage pattern).
  hasStarted = true;
  void controller.open();

  return {
    close: () => controller.close("programmatic"),
    getState: () => controller.getState(),
  };
}

function render(
  modal: HTMLElement,
  state: CheckoutState,
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
  successSecondsLeft: number | null,
) {
  modal.innerHTML = "";
  modal.appendChild(renderHeader(state, opts, controller));
  modal.appendChild(renderBody(state, opts, controller, successSecondsLeft));
  const footer = renderFooter(state, opts, controller);
  if (footer) {
    modal.appendChild(footer);
  }
}

function renderHeader(
  state: CheckoutState,
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
) {
  const header = document.createElement("div");
  header.className = `kp-header ${opts.classNames?.header ?? ""}`;

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.gap = "10px";
  left.style.alignItems = "center";

  if (opts.logoUrl) {
    const img = document.createElement("img");
    img.src = opts.logoUrl;
    img.alt = "";
    img.style.width = "24px";
    img.style.height = "24px";
    img.style.borderRadius = "6px";
    img.style.objectFit = "cover";
    left.appendChild(img);
  }

  const textWrap = document.createElement("div");

  // Title row: title + optional mode badge
  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.gap = "8px";

  const title = document.createElement("div");
  title.className = "kp-title";
  title.textContent = opts.labels?.title ?? "Checkout";
  titleRow.appendChild(title);

  const mode = getIntentModeFromState(state);
  if (mode === "testnet") {
    const badge = document.createElement("span");
    badge.className = "kp-badge";
    badge.dataset.variant = "testnet";
    badge.textContent = "Test mode";
    titleRow.appendChild(badge);
  }

  textWrap.appendChild(titleRow);

  if (opts.merchantName) {
    const sub = document.createElement("div");
    sub.className = `kp-muted ${opts.classNames?.helperText ?? ""}`;
    sub.textContent = opts.merchantName;
    textWrap.appendChild(sub);
  }

  left.appendChild(textWrap);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = `kp-iconBtn ${opts.classNames?.secondaryButton ?? ""} ${opts.classNames?.closeButton ?? ""}`;
  closeBtn.setAttribute("aria-label", opts.labels?.close ?? "Close");
  closeBtn.onclick = () => controller.close("close_button");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 12 12");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const lineA = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineA.setAttribute("d", "M2 2l8 8");
  lineA.setAttribute("stroke", "currentColor");
  lineA.setAttribute("stroke-width", "1.5");
  lineA.setAttribute("stroke-linecap", "round");

  const lineB = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineB.setAttribute("d", "M10 2L2 10");
  lineB.setAttribute("stroke", "currentColor");
  lineB.setAttribute("stroke-width", "1.5");
  lineB.setAttribute("stroke-linecap", "round");

  icon.appendChild(lineA);
  icon.appendChild(lineB);
  closeBtn.appendChild(icon);

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

  const labels = opts.labels ?? {};

  const p = (text: string) => {
    const el = document.createElement("p");
    el.className = "kp-muted";
    el.textContent = text;
    return el;
  };

  if (state.type === "loading_intent") {
    body.appendChild(appendLoadingStatus("Preparing checkout..."));
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
    body.appendChild(renderRow("Chain", state.intent.chain));

    const tabs = document.createElement("div");
    tabs.className = `kp-tabs ${opts.classNames?.tabs ?? ""}`;

    tabs.appendChild(
      renderTab(
        labels.payWithWallet ?? "Pay with wallet",
        state.selected === "wallet",
        () => controller.selectMethod("wallet"),
        opts.classNames?.tab,
      ),
    );
    tabs.appendChild(
      renderTab(
        labels.payManually ?? "Pay manually",
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

  // Wallet states (parity with React)
  if (state.type === "wallet_connecting") {
    body.appendChild(
      appendLoadingStatus(labels.connectWallet ?? "Connecting wallet..."),
    );
    return body;
  }

  if (state.type === "wallet_switching_chain") {
    body.appendChild(
      appendLoadingStatus(labels.switchNetwork ?? "Switching network..."),
    );
    return body;
  }

  if (state.type === "wallet_sending") {
    body.appendChild(
      p(labels.sendPayment ?? "Confirm the payment in your wallet..."),
    );
    body.appendChild(renderRow("From", shortAddr(state.from)));
    return body;
  }

  if (state.type === "wallet_submitted") {
    body.appendChild(p("Transaction submitted."));
    body.appendChild(renderRow("Tx Hash", state.txHash));
    body.appendChild(appendLoadingStatus("Waiting for confirmations..."));
    return body;
  }

  // Manual flow
  if (state.type === "manual_instructions") {
    body.appendChild(p("Send the exact amount to the address below."));

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
      renderPanel(
        "Important",
        "Send the exact amount shown above. Sending less or more can delay confirmation and may require manual review.",
        "warning",
      ),
    );

    body.appendChild(p("We'll update automatically once payment is detected."));
    return body;
  }

  if (state.type === "waiting") {
    const statusText =
      state.intent.status === "requires_payment"
        ? "Waiting for payment..."
        : state.intent.status === "pending_confirmations"
          ? "Payment detected, awaiting confirmations..."
          : "Updating...";

    body.appendChild(appendLoadingStatus(statusText));
    body.appendChild(renderRow("Status", formatStatusLabel(state.intent.status)));
    return body;
  }

  if (state.type === "awaiting_confirmation") {
    const title = document.createElement("div");
    title.className = "kp-title";
    title.textContent =
      labels.awaitingConfirmationTitle ?? "Payment is awaiting confirmation";
    body.appendChild(title);

    body.appendChild(
      p(
        labels.awaitingConfirmationBody ??
          "Your transfer was detected. Confirmations can take a bit. You can close this window and confirm later in your dashboard, or keep waiting here.",
      ),
    );
    return body;
  }

  if (state.type === "success") {
    const title = document.createElement("div");
    title.className = "kp-title kp-success";
    title.textContent = labels.successTitle ?? "Payment successful";
    body.appendChild(title);

    body.appendChild(
      p(labels.successBody ?? "This window will close automatically."),
    );
    body.appendChild(
      p(`Closing in ${successSecondsLeft ?? SUCCESS_AUTO_CLOSE_SECONDS}s...`),
    );
    return body;
  }

  if (state.type === "review_required") {
    const title = document.createElement("div");
    title.className = "kp-title kp-danger";
    title.textContent = "Payment mismatch";
    body.appendChild(title);

    body.appendChild(
      p(
        `We detected a payment, but the amount sent was ${formatMismatchReason(
          state.intent.mismatch_reason,
        )}. This payment needs manual review.`,
      ),
    );

    body.appendChild(
      renderPanelRows(
        "Mismatch details",
        [
          [
            "Expected amount",
            `${formatAmount(state.intent.amount_units, state.intent.decimals)} ${state.intent.token_symbol}`,
          ],
          [
            "Amount sent",
            typeof state.intent.paid_amount_units === "number"
              ? `${formatAmount(state.intent.paid_amount_units, state.intent.decimals)} ${state.intent.token_symbol}`
              : "Not available",
          ],
          ["Reason", formatMismatchLabel(state.intent.mismatch_reason)],
        ],
        "danger",
      ),
    );

    if (state.intent.mismatch_tx_hash) {
      body.appendChild(renderRow("Tx Hash", state.intent.mismatch_tx_hash));
    }

    if (opts.mismatchInfo) {
      body.appendChild(renderPanel("Information", opts.mismatchInfo, "warning"));
    }

    body.appendChild(
      p("Please contact the merchant to resolve this payment manually."),
    );
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

  return body;
}

function renderFooter(
  state: CheckoutState,
  opts: KryptoPayCheckoutOptions,
  controller: CheckoutController,
): HTMLElement | null {
  const footer = document.createElement("div");
  footer.className = `kp-footer ${opts.classNames?.footer ?? ""}`;

  const labels = opts.labels ?? {};

  const primary = (text: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.className = `kp-btn kp-btn-primary ${opts.classNames?.primaryButton ?? ""}`;
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
      primary(
        labels.keepWaiting ?? "Keep waiting",
        () => void controller.keepWaiting(),
      ),
    );
    return footer;
  }

  if (
    state.type === "success" ||
    state.type === "review_required" ||
    state.type === "expired" ||
    state.type === "error"
  ) {
    footer.appendChild(
      primary(labels.close ?? "Close", () => controller.close("close_button")),
    );
    return footer;
  }

  // In-progress states: no footer buttons (close is always in header).
  return null;
}

function renderRow(left: string, right: string) {
  const row = document.createElement("div");
  row.className = "kp-row";

  const l = document.createElement("div");
  l.className = "kp-rowLabel";
  l.textContent = left;

  const r = document.createElement("div");
  r.className = "kp-rowValue";
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

function appendLoadingStatus(text: string) {
  const wrap = document.createElement("div");
  wrap.className = "kp-statusRow";
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");

  const spinner = document.createElement("span");
  spinner.className = "kp-spinner";
  spinner.setAttribute("aria-hidden", "true");
  wrap.appendChild(spinner);

  const msg = document.createElement("p");
  msg.className = "kp-muted";
  msg.style.margin = "0";
  msg.textContent = text;
  wrap.appendChild(msg);

  return wrap;
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "requires_payment":
      return "Awaiting payment";
    case "pending_confirmations":
      return "Awaiting confirmations";
    case "succeeded":
      return "Succeeded";
    case "review_required":
      return "Review required";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function getIntentModeFromState(
  state: CheckoutState,
): "testnet" | "mainnet" | null {
  const s: any = state;
  return s?.intent?.mode ?? null;
}

function formatAmount(amountUnits: number, decimals: number) {
  const s = String(amountUnits).padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function formatMismatchReason(reason?: "underpaid" | "overpaid" | null) {
  if (reason === "underpaid") return "lower than expected";
  if (reason === "overpaid") return "higher than expected";
  return "different from the expected amount";
}

function formatMismatchLabel(reason?: "underpaid" | "overpaid" | null) {
  if (reason === "underpaid") return "Amount sent was lower than expected";
  if (reason === "overpaid") return "Amount sent was higher than expected";
  return "Amount sent did not match the expected amount";
}

function renderPanel(
  title: string,
  text: string,
  variant: "warning" | "danger",
) {
  const panel = document.createElement("div");
  panel.className = "kp-panel";
  panel.dataset.variant = variant;

  const heading = document.createElement("div");
  heading.className = "kp-panelTitle";
  heading.dataset.tone = variant;
  heading.textContent = title;
  panel.appendChild(heading);

  const body = document.createElement("p");
  body.className = "kp-muted";
  body.style.margin = "0";
  body.textContent = text;
  panel.appendChild(body);

  return panel;
}

function renderPanelRows(
  title: string,
  rows: Array<[string, string]>,
  variant: "warning" | "danger",
) {
  const panel = document.createElement("div");
  panel.className = "kp-panel";
  panel.dataset.variant = variant;

  const heading = document.createElement("div");
  heading.className = "kp-panelTitle";
  heading.dataset.tone = variant;
  heading.textContent = title;
  panel.appendChild(heading);

  for (const [left, right] of rows) {
    panel.appendChild(renderRow(left, right));
  }

  return panel;
}

function shortAddr(addr: string) {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
