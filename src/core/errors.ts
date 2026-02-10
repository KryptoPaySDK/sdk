export type KryptoPayErrorCode =
  | "network_error"
  | "invalid_body"
  | "intent_not_found"
  | "intent_expired"
  | "invalid_response"
  | "server_error"
  | "rate_limited";

export class KryptoPayError extends Error {
  public readonly code: KryptoPayErrorCode;
  public readonly recoverable: boolean;
  public readonly cause?: unknown;

  constructor(args: {
    code: KryptoPayErrorCode;
    message: string;
    recoverable: boolean;
    cause?: unknown;
  }) {
    super(args.message);
    this.code = args.code;
    this.recoverable = args.recoverable;
    this.cause = args.cause;
  }
}
