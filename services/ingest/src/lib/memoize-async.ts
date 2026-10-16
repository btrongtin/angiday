/**
 * Load something once per Lambda container (config, DB client) and share the promise.
 * A rejected load is forgotten, so one failed cold start doesn't fail every later invocation.
 */
export function memoizeAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
