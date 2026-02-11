import type { CoreTypedError } from "./contracts";

export function makeCoreTypedError(
  code: string,
  op: string,
  reason: string,
  details?: Record<string, unknown>,
): CoreTypedError {
  const error: CoreTypedError = { code, op, reason };
  if (details && typeof details === "object" && !Array.isArray(details)) {
    error.details = details;
  }
  return error;
}
