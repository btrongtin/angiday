import { getParametersByName } from '@aws-lambda-powertools/parameters/ssm';
import { type AppEnv, type AppEnvKey, loadAppEnv } from '@angiday/shared';

type FetchParameters = (names: string[]) => Promise<Record<string, string>>;

/** SSM GetParameters with decryption (SecureString); throws if any name is missing. */
const fetchFromSsm: FetchParameters = async (names) =>
  (await getParametersByName(
    Object.fromEntries(names.map((name) => [name, {}])),
    { decrypt: true },
  )) as Record<string, string>;

/**
 * Lambda env holds only SSM parameter *names* (`<KEY>_PARAM`, set by CDK); the values are read here
 * at cold start and validated with the app env schema. Wrap the call in `memoizeAsync`.
 */
export async function loadLambdaEnv<K extends AppEnvKey>(
  keys: readonly K[],
  env: Record<string, string | undefined>,
  fetchParameters: FetchParameters = fetchFromSsm,
): Promise<Pick<AppEnv, K>> {
  const names = keys.map((key) => {
    const name = env[`${key}_PARAM`];
    if (!name) throw new Error(`${key}_PARAM is not set`);
    return [key, name] as const;
  });
  const values = await fetchParameters(names.map(([, name]) => name));
  return loadAppEnv(Object.fromEntries(names.map(([key, name]) => [key, values[name]])), keys);
}
