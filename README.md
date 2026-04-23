# @kryptopay/sdk

TypeScript SDK for launching KryptoPay checkout in web apps.

This package currently provides:
- Vanilla/browser modal API from `@kryptopay/sdk`
- React modal component from `@kryptopay/sdk/react`

## Installation

```bash
npm install @kryptopay/sdk
```

Also supported:

```bash
yarn add @kryptopay/sdk
pnpm add @kryptopay/sdk
```

React users must have peer dependencies installed:
- `react >= 18`
- `react-dom >= 18`

## Integration Flow

1. Your backend creates a payment intent via KryptoPay API.
2. Backend returns only `client_secret` to your frontend.
3. Frontend opens KryptoPay modal with that `clientSecret`.
4. SDK resolves and tracks payment status until completion.

The browser SDK talks to the hosted KryptoPay API.

Security note: do not expose merchant API keys in production browser code. Create intents from your backend.

## Quick Start (Vanilla)

```ts
import { openKryptoPayModal } from "@kryptopay/sdk";

const modal = openKryptoPayModal({
  clientSecret,
  merchantName: "Acme Store",
  defaultMethod: "wallet",
  allowWallet: true,
  allowManual: true,
  mismatchInfo:
    "If the amount sent does not match the checkout amount, this payment will require manual review.",
  onSuccess: (event) => {
    console.log("paid", event.payment_intent_id, event.tx_hash);
  },
  onError: (err) => {
    console.error(err.code, err.message, err.recoverable);
  },
  onClose: (event) => {
    console.log("checkout closed", event.reason, event.payment_status);
  },
});

// Optional
// modal.close();
// console.log(modal.getState());
```

## Quick Start (React)

```tsx
import { useState } from "react";
import { KryptoPayModal } from "@kryptopay/sdk/react";

export function Checkout({ clientSecret }: { clientSecret: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Pay</button>

      <KryptoPayModal
        open={open}
        clientSecret={clientSecret}
        merchantName="Acme Store"
        mismatchInfo="If the amount sent does not match the checkout amount, this payment will require manual review."
        onClose={(event) => {
          console.log("checkout closed", event.reason, event.payment_status);
          setOpen(false);
        }}
        onSuccess={(event) => {
          console.log("paid", event.payment_intent_id, event.tx_hash);
        }}
      />
    </>
  );
}
```

## Public Exports

- `@kryptopay/sdk`
  - `openKryptoPayModal`
  - `KryptoPayCheckoutOptions` (type)
  - `KryptoPayModalHandle` (type)
- `@kryptopay/sdk/react`
  - `KryptoPayModal`
  - `KryptoPayModalProps` (type)

## API Reference

### `openKryptoPayModal(options)`

Opens the checkout modal immediately and returns a handle:

- `close(): void`
- `getState(): CheckoutState`

Common `options` fields:
- `clientSecret: string` (required)
- `defaultMethod?: "wallet" | "manual"`
- `allowWallet?: boolean`
- `allowManual?: boolean`
- `merchantName?: string`
- `logoUrl?: string`
- `mismatchInfo?: string`
- `theme?: KryptoPayTheme`
- `classNames?: KryptoPayClassNames`
- `labels?: KryptoPayLabels`
- `onClose?: (event) => void`
- `onSuccess?: (event) => void`
- `onAwaitingConfirmation?: (event) => void`
- `onError?: (error) => void`

For the complete type surface, import `KryptoPayCheckoutOptions`.

### `KryptoPayModal` (React)

Props are the same checkout options plus:
- `open: boolean`
- `clientSecret: string`

The component is controlled by `open`; set `open` to `false` on `onClose` to keep UI state in sync.

## Event Payloads

`onSuccess` receives:
- `payment_intent_id: string`
- `tx_hash: string`
- `chain: string`
- `mode: "testnet" | "mainnet"`

`onAwaitingConfirmation` receives:
- `payment_intent_id: string`

`onClose` receives:
- `reason: "close_button" | "backdrop" | "escape_key" | "programmatic" | "success_auto_close"`
- `checkout_state: string`
- `completed: boolean`
- `payment_intent_id?: string`
- `payment_status?: "requires_payment" | "pending_confirmations" | "review_required" | "succeeded" | "expired"`
- `tx_hash?: string`
- `chain?: string`
- `mode?: "testnet" | "mainnet"`

`onError` receives:
- `code: string`
- `message: string`
- `recoverable: boolean`

## Close Semantics

Closing the modal dismisses the SDK UI and stops polling. It does not cancel the underlying payment intent on the server.

- If the modal closes before payment is detected, the intent typically remains `requires_payment` until it is paid or expires.
- If the modal closes after a transfer is submitted or while confirmations are pending, the backend may still move the intent to `pending_confirmations` and later `succeeded`.
- If the backend detects a payment amount mismatch, the intent can move to `review_required`; the SDK shows that state and does not auto-close.
- If the modal auto-closes after success, `onClose` is emitted with `reason: "success_auto_close"` and `completed: true`.

If you need server-side cancellation, that should be implemented as a separate merchant/backend action rather than inferred from dismissing the modal.

## Customization

Use theme tokens, class overrides, and labels:

```ts
openKryptoPayModal({
  clientSecret,
  theme: {
    colors: { brand: "#0ea5e9", background: "#0b1220" },
    radius: { md: 12 },
    font: { family: "Inter, sans-serif", size: 14 },
  },
  classNames: {
    modal: "my-modal",
    primaryButton: "my-primary-btn",
  },
  labels: {
    title: "Checkout",
    payWithWallet: "Pay with Wallet",
    payManually: "Pay Manually",
  },
});
```

## Troubleshooting

- Modal does not open:
  - Ensure a valid `clientSecret` was created from your backend.
  - Ensure the intent was created for the same KryptoPay environment you expect to use.
- React modal never closes:
  - Handle `onClose` and set your `open` state to `false`.
- Why does a closed unpaid checkout still show `requires_payment`?
  - Because dismissing the modal does not cancel the payment intent; use the `onClose` event payload to decide whether to reopen the same intent, create a new one later, or mark the checkout as abandoned in your app.
- CORS or network errors:
  - Confirm your API allows the frontend origin and correct auth flow.

## Notes

- Browser checkout APIs are intended for frontend environments.
