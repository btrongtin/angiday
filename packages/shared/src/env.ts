import { z } from 'zod';

type EnvSource = Record<string, string | undefined>;

/**
 * Validate environment variables with zod. Callers pass the source (`process.env`) so this
 * package stays runtime-agnostic (it also runs in the browser).
 *
 * The error names each bad variable and zod's reason, never the value: values are secrets.
 */
export function parseEnv<Shape extends z.ZodRawShape>(
  shape: Shape,
  source: EnvSource,
): z.infer<z.ZodObject<Shape>> {
  const result = z.object(shape).safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n- ${problems.join('\n- ')}`);
}
