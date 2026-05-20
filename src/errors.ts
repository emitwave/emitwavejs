import type { ApiErrorBody } from "./types.js";

export class EmitWaveError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "EmitWaveError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export function createErrorFromResponse(
  status: number,
  body: ApiErrorBody,
): EmitWaveError {
  return new EmitWaveError(
    body.error.message,
    body.error.code,
    status,
    body.error.details,
    body.request_id,
  );
}
