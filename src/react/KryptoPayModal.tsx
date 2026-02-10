import React from "react";
import type { KryptoPayCheckoutOptions } from "../core/types";

export type KryptoPayModalProps = Omit<
  KryptoPayCheckoutOptions,
  "clientSecret"
> & {
  open: boolean;
  clientSecret: string;
};

export function KryptoPayModal(_props: KryptoPayModalProps) {
  return null; // implement later
}
