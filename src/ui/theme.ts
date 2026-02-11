import type { KryptoPayCheckoutOptions } from "../core/types";

/**
 * Minimal internal defaults.
 * We keep these stable so the modal looks acceptable even with no theme passed.
 */
const DEFAULT_VARS: Record<string, string> = {
  "--kp-color-brand": "#4F46E5",
  "--kp-color-bg": "#0B0F19",
  "--kp-color-surface": "#111827",
  "--kp-color-text": "#E5E7EB",
  "--kp-color-muted-text": "#9CA3AF",
  "--kp-color-border": "rgba(255,255,255,0.12)",
  "--kp-color-success": "#22C55E",
  "--kp-color-danger": "#EF4444",

  "--kp-radius-sm": "10px",
  "--kp-radius-md": "14px",
  "--kp-radius-lg": "18px",

  "--kp-font-family":
    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  "--kp-font-size": "14px",

  "--kp-shadow-modal": "0 20px 60px rgba(0,0,0,0.45)",
  "--kp-overlay-opacity": "0.55",
  "--kp-z-index": "9999",
};

/**
 * Apply theme options to a DOM element using CSS variables.
 * Works for both React and Vanilla because it only touches the DOM.
 */
export function applyThemeToElement(
  el: HTMLElement,
  opts: Pick<
    KryptoPayCheckoutOptions,
    "theme" | "overlayOpacity" | "zIndex" | "size"
  >,
) {
  // Start with defaults
  for (const [k, v] of Object.entries(DEFAULT_VARS)) {
    el.style.setProperty(k, v);
  }

  // Overlay opacity and z-index are top-level knobs (not inside theme)
  if (typeof opts.overlayOpacity === "number") {
    el.style.setProperty("--kp-overlay-opacity", String(opts.overlayOpacity));
  }
  if (typeof opts.zIndex === "number") {
    el.style.setProperty("--kp-z-index", String(opts.zIndex));
  }

  // Apply token overrides
  const t = opts.theme;
  if (!t) return;

  if (t.colors?.brand) el.style.setProperty("--kp-color-brand", t.colors.brand);
  if (t.colors?.background)
    el.style.setProperty("--kp-color-bg", t.colors.background);
  if (t.colors?.surface)
    el.style.setProperty("--kp-color-surface", t.colors.surface);
  if (t.colors?.text) el.style.setProperty("--kp-color-text", t.colors.text);
  if (t.colors?.mutedText)
    el.style.setProperty("--kp-color-muted-text", t.colors.mutedText);
  if (t.colors?.border)
    el.style.setProperty("--kp-color-border", t.colors.border);
  if (t.colors?.success)
    el.style.setProperty("--kp-color-success", t.colors.success);
  if (t.colors?.danger)
    el.style.setProperty("--kp-color-danger", t.colors.danger);

  if (typeof t.radius?.sm === "number")
    el.style.setProperty("--kp-radius-sm", `${t.radius.sm}px`);
  if (typeof t.radius?.md === "number")
    el.style.setProperty("--kp-radius-md", `${t.radius.md}px`);
  if (typeof t.radius?.lg === "number")
    el.style.setProperty("--kp-radius-lg", `${t.radius.lg}px`);

  if (t.font?.family) el.style.setProperty("--kp-font-family", t.font.family);
  if (typeof t.font?.size === "number")
    el.style.setProperty("--kp-font-size", `${t.font.size}px`);

  if (t.shadow?.modal)
    el.style.setProperty("--kp-shadow-modal", t.shadow.modal);
}
