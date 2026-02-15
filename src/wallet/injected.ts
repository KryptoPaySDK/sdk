/**
 * Minimal EIP-1193 provider type (MetaMask, Coinbase Wallet, etc.)
 * We keep it small so we don't depend on wallet-specific libraries.
 */
export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | object }) => Promise<any>;
};

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const anyWindow = window as any;
  const eth = anyWindow.ethereum as Eip1193Provider | undefined;
  return eth ?? null;
}

export async function requestAccounts(
  provider: Eip1193Provider,
): Promise<string[]> {
  return provider.request({ method: "eth_requestAccounts" });
}

export async function getChainId(provider: Eip1193Provider): Promise<number> {
  const hex = await provider.request({ method: "eth_chainId" });
  // hex is like "0x1"
  return Number.parseInt(String(hex), 16);
}

/**
 * Ask the wallet to switch chain.
 * If the chain is not added in the wallet, MetaMask may throw 4902.
 * For MVP, we do not auto-add the chain; we just fail and fall back to manual.
 */
export async function switchEthereumChain(
  provider: Eip1193Provider,
  chainId: number,
): Promise<void> {
  const hexChainId = "0x" + chainId.toString(16);
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hexChainId }],
  });
}
