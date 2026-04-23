/**
 * A minimal CSS baseline for the modal.
 * This is intentionally small and framework-agnostic.
 * Developers can override via theme tokens and classNames.
 */
const CSS = `
.kp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,var(--kp-overlay-opacity));
  z-index: var(--kp-z-index);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-family: var(--kp-font-family);
  font-size: var(--kp-font-size);
  color: var(--kp-color-text);
}
.kp-modal {
  width: 100%;
  max-width: 520px;
  background: var(--kp-color-surface);
  border: 1px solid var(--kp-color-border);
  border-radius: var(--kp-radius-md);
  box-shadow: var(--kp-shadow-modal);
  overflow: hidden;
}
.kp-header {
  padding: 16px 16px 10px;
  border-bottom: 1px solid var(--kp-color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.kp-title {
  font-weight: 600;
}
.kp-body {
  padding: 16px;
}
.kp-footer {
  padding: 14px 16px 16px;
  border-top: 1px solid var(--kp-color-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.kp-muted {
  color: var(--kp-color-muted-text);
}
.kp-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.kp-tabs {
  display: flex;
  gap: 8px;
  margin: 10px 0 14px;
}
.kp-tab {
  padding: 8px 10px;
  border: 1px solid var(--kp-color-border);
  border-radius: var(--kp-radius-sm);
  background: transparent;
  color: var(--kp-color-text);
  cursor: pointer;
}
.kp-tab[data-active="true"] {
  border-color: var(--kp-color-brand);
}
.kp-btn {
  padding: 10px 12px;
  border-radius: var(--kp-radius-sm);
  border: 1px solid var(--kp-color-border);
  cursor: pointer;
  background: transparent;
  color: var(--kp-color-text);
}
.kp-btn-primary {
  background: var(--kp-color-brand);
  border-color: var(--kp-color-brand);
  color: white;
}
.kp-iconBtn {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--kp-color-border);
  cursor: pointer;
  background: transparent;
  color: var(--kp-color-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.kp-iconBtn svg {
  width: 12px;
  height: 12px;
  stroke: currentColor;
  stroke-width: 1.5;
  fill: none;
}
.kp-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  border: 1px solid var(--kp-color-border);
  border-radius: var(--kp-radius-sm);
  padding: 10px;
  overflow-x: auto;
}
.kp-panel {
  margin-top: 12px;
  padding: 12px;
  border-radius: var(--kp-radius-sm);
  border: 1px solid var(--kp-color-border);
  background: rgba(255,255,255,0.03);
}
.kp-panel[data-variant="warning"] {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.10);
}
.kp-panel[data-variant="danger"] {
  border-color: rgba(239, 68, 68, 0.42);
  background: rgba(239, 68, 68, 0.08);
}
.kp-panelTitle {
  font-weight: 600;
  margin-bottom: 6px;
}
.kp-panelTitle[data-tone="warning"] {
  color: #fbbf24;
}
.kp-panelTitle[data-tone="danger"] {
  color: var(--kp-color-danger);
}
.kp-rowLabel {
  color: var(--kp-color-muted-text);
}
.kp-rowValue {
  font-weight: 600;
  text-align: right;
}

.kp-badge {
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,0.12);
  background: rgba(0,0,0,0.04);
}

.kp-badge[data-variant="testnet"] {
  border-color: rgba(255,165,0,0.35);
  background: rgba(255,165,0,0.12);
}

.kp-statusRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kp-spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,0.22);
  border-top-color: var(--kp-color-text);
  flex: 0 0 auto;
  animation: kp-spin 0.8s linear infinite;
}

@keyframes kp-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .kp-spinner {
    animation: none;
  }
}

.kp-success { color: var(--kp-color-success); }
.kp-danger { color: var(--kp-color-danger); }
`;

/**
 * Injects the stylesheet once per page.
 * Both React and Vanilla can call this safely.
 */
export function ensureStylesInjected() {
  const id = "kryptopay-sdk-styles";
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = CSS;
  document.head.appendChild(style);
}
