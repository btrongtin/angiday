/**
 * What our code needs from a logger. Powertools `Logger` satisfies it; tests pass `createTestLog()`.
 * The extra context is a rest parameter (not an optional one) so the type matches Powertools'
 * `LogItemExtraInput` (a union that excludes `undefined`) — an optional param would not.
 */
export interface Log {
  info(message: string, ...extra: Record<string, unknown>[]): void;
  warn(message: string, ...extra: Record<string, unknown>[]): void;
  error(message: string, ...extra: Record<string, unknown>[]): void;
}

/** A logger whose persistent keys (updateId, route) are added per SQS record and removed after it. */
export interface KeyedLog extends Log {
  appendKeys(keys: Record<string, unknown>): void;
  removeKeys(keys: string[]): void;
}

/** Errors as plain fields, so they survive JSON logging. */
export function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
    : { errorMessage: String(error) };
}
