import { createGoogle } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/**
 * The only file that names a provider or a model id (ADR-0009). The extract default is provisional until the
 * owner confirms the free-tier Flash model in AI Studio (S3 plan, Task 0); `GEMINI_EXTRACT_MODEL` overrides it.
 */
export const DEFAULT_MODEL_IDS = { extract: 'gemini-3.5-flash' } as const;

export interface AiConfig {
  apiKey: string;
  /** Overrides `DEFAULT_MODEL_IDS.extract`. */
  extractModelId?: string | undefined;
}

export function getModel(purpose: 'extract', config: AiConfig): Exclude<LanguageModel, string> {
  const google = createGoogle({ apiKey: config.apiKey });
  return google(config.extractModelId ?? DEFAULT_MODEL_IDS[purpose]);
}
