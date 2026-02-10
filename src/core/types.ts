export type KryptoPayTheme = {
  colors?: Partial<{
    brand: string;
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    border: string;
    success: string;
    danger: string;
  }>;
  radius?: Partial<{ sm: number; md: number; lg: number }>;
  font?: Partial<{ family: string; size: number }>;
  shadow?: Partial<{ modal: string }>;
};

export type KryptoPayClassNames = Partial<{
  overlay: string;
  modal: string;
  header: string;
  body: string;
  footer: string;
  tabs: string;
  tab: string;
  primaryButton: string;
  secondaryButton: string;
  codeBlock: string;
  helperText: string;
  errorText: string;
}>;

export type KryptoPayLabels = Partial<{
  title: string;
  payWithWallet: string;
  payManually: string;
  connectWallet: string;
  switchNetwork: string;
  sendPayment: string;
  awaitingConfirmationTitle: string;
  awaitingConfirmationBody: string;
  close: string;
  keepWaiting: string;
  successTitle: string;
  successBody: string;
}>;

export type KryptoPayCheckoutOptions = {
  clientSecret: string;

  defaultMethod?: "wallet" | "manual";
  allowWallet?: boolean;
  allowManual?: boolean;

  theme?: KryptoPayTheme;
  classNames?: KryptoPayClassNames;
  size?: "sm" | "md" | "lg";
  zIndex?: number;
  overlayOpacity?: number;

  merchantName?: string;
  logoUrl?: string;
  labels?: KryptoPayLabels;

  onClose?: () => void;
  onSuccess?: (event: {
    payment_intent_id: string;
    tx_hash: string;
    chain: string;
    mode: "testnet" | "mainnet";
  }) => void;
  onAwaitingConfirmation?: (event: { payment_intent_id: string }) => void;
  onError?: (err: {
    code: string;
    message: string;
    recoverable: boolean;
  }) => void;
};

/**
 * These statuses are backed by your DB enum `payment_status`:
 * - requires_payment
 * - pending_confirmations
 * - succeeded
 * - expired
 */
export type PaymentIntentStatus =
  | "requires_payment"
  | "pending_confirmations"
  | "succeeded"
  | "expired";

export type Mode = "testnet" | "mainnet";
export type ChainKey = "base" | "polygon";
export type Lane = "sdk" | "manual";

/**
 * Exact response shape returned by POST /v1/payment_intents/resolve
 * (based directly on your API route file).
 *
 * Keeping this aligned to the API contract is critical because
 * the modal uses these fields to:
 * - render manual payment instructions
 * - validate chain
 * - show confirmations required
 * - decide when to stop polling
 */
export type ResolvedPaymentIntent = {
  id: string;
  status: PaymentIntentStatus;

  mode: Mode;
  chain: ChainKey;
  chain_id: number;
  confirmations_required: number;

  amount_units: number;
  decimals: number;

  token_symbol: string; // "USDC"
  token_address: string;

  expected_wallet: string;

  expires_at: string; // ISO
  lane: Lane;

  metadata: Record<string, unknown>;
};
