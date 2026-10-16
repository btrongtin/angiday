// S0 wiring export. S1 replaces it with zod schemas (Place, Tag, …).
export const SHARED_PACKAGE = '@angiday/shared';

export { appEnvShape, loadAppEnv, type AppEnv } from './app-env';
export { parseEnv } from './env';
