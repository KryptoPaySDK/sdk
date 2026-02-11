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
.kp-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  border: 1px solid var(--kp-color-border);
  border-radius: var(--kp-radius-sm);
  padding: 10px;
  overflow-x: auto;
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
