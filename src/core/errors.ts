export type LaErrorCode =
  | "CLI_USAGE"
  | "COMMAND_NOT_MODEL_CALLABLE"
  | "CONFIG_INVALID"
  | "CONFIG_LOAD_FAILED"
  | "MISSING_API_KEY"
  | "MODEL_PROVIDER_ERROR"
  | "MODEL_PROVIDER_HTTP_ERROR"
  | "MODEL_PROVIDER_UNSUPPORTED"
  | "MODEL_RESPONSE_INVALID"
  | "MODEL_ROUTE_INVALID"
  | "NO_QUICK_COMMAND"
  | "PROMPT_LOAD_FAILED"
  | "UNKNOWN_COMMAND";

export interface ErrorPayload {
  ok: false;
  error: {
    code: LaErrorCode;
    message: string;
    details?: unknown;
  };
}

export class LaError extends Error {
  readonly code: LaErrorCode;
  readonly details?: unknown;
  readonly exitCode: number;

  constructor(
    code: LaErrorCode,
    message: string,
    options: { details?: unknown; exitCode?: number } = {},
  ) {
    super(message);
    this.name = "LaError";
    this.code = code;
    this.details = options.details;
    this.exitCode = options.exitCode ?? 1;
  }
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof LaError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: {
      code: "CONFIG_LOAD_FAILED",
      message,
    },
  };
}

export function exitCodeFor(error: unknown): number {
  return error instanceof LaError ? error.exitCode : 1;
}
