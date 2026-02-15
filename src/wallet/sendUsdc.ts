import { encodeFunctionData, parseAbi } from "viem";
import type { Eip1193Provider } from "./injected";

/**
 * Encodes an ERC-20 transfer and sends it using eth_sendTransaction.
 *
 * We do not set gas in MVP; the wallet estimates it.
 */
export async function sendErc20Transfer(args: {
  provider: Eip1193Provider;
  from: string;
  tokenAddress: string;
  to: string;
  amountUnits: bigint;
}): Promise<string> {
  const data = encodeFunctionData({
    abi: parseAbi([
      "function transfer(address to, uint256 amount) returns (bool)",
    ]),
    functionName: "transfer",
    args: [args.to as `0x${string}`, args.amountUnits],
  });

  const txHash = await args.provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: args.from,
        to: args.tokenAddress,
        data,
        value: "0x0",
      },
    ],
  });

  return String(txHash);
}
