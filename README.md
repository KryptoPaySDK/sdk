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
  onSuccess: (event) => {
    console.log("paid", event.payment_intent_id, event.tx_hash);
  },
  onError: (err) => {
    console.error(err.code, err.message, err.recoverable);
  },
  onClose: () => {
    console.log("checkout closed");
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
        onClose={() => setOpen(false)}
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
- `theme?: KryptoPayTheme`
- `classNames?: KryptoPayClassNames`
- `labels?: KryptoPayLabels`
- `onClose?: () => void`
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

`onError` receives:
- `code: string`
- `message: string`
- `recoverable: boolean`

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
- CORS or network errors:
  - Confirm your API allows the frontend origin and correct auth flow.

## Notes

- Browser checkout APIs are intended for frontend environments.
