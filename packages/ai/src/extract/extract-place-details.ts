import { type PlaceExtraction, placeExtractionSchema } from '@angiday/shared';
import { generateText, type LanguageModel, type ModelMessage, NoObjectGeneratedError, Output } from 'ai';
import { cleanExtraction } from './clean-extraction';
import { buildExtractionPrompt, type ExtractionInput } from './prompt';

export interface ExtractionResult {
  details: PlaceExtraction;
  /** Model calls made (1 = valid on the first try). */
  attempts: number;
  inputTokens: number;
  outputTokens: number;
}

/** The model kept answering outside the schema. Transport errors (429, network…) are NOT wrapped in this. */
export class ExtractionFailedError extends Error {
  constructor(
    readonly attempts: number,
    cause: unknown,
  ) {
    super(`LLM output did not match the schema after ${attempts} attempts`, { cause });
    this.name = 'ExtractionFailedError';
  }
}

export interface ExtractOptions {
  model: LanguageModel;
  abortSignal?: AbortSignal | undefined;
  /** Model calls before giving up (first try + re-prompts). Default 3 (ADR-0009: max 2 re-prompts). */
  maxAttempts?: number;
  /** Gemini reasoning effort; reasoning tokens count as output tokens and add latency. Omit for the model default. */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high' | undefined;
}

/**
 * Structured extraction with a re-prompt loop: an answer that fails the zod schema goes back to the model together
 * with the validation error. `maxRetries: 0` leaves transport retries (429, 5xx, timeouts) to SQS redelivery (ADR-0009).
 */
export async function extractPlaceDetails(input: ExtractionInput, options: ExtractOptions): Promise<ExtractionResult> {
  const { system, prompt } = buildExtractionPrompt(input);
  const maxAttempts = options.maxAttempts ?? 3;
  const messages: ModelMessage[] = [{ role: 'user', content: prompt }];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await generateText({
        model: options.model,
        system,
        messages,
        output: Output.object({ schema: placeExtractionSchema }),
        maxRetries: 0,
        ...(options.thinkingLevel ? { providerOptions: { google: { thinkingConfig: { thinkingLevel: options.thinkingLevel } } } } : {}),
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      });
      inputTokens += result.usage.inputTokens ?? 0;
      outputTokens += result.usage.outputTokens ?? 0;
      return { details: cleanExtraction(result.output), attempts: attempt, inputTokens, outputTokens };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      inputTokens += error.usage?.inputTokens ?? 0;
      outputTokens += error.usage?.outputTokens ?? 0;
      if (attempt >= maxAttempts) throw new ExtractionFailedError(attempt, error);
      const reason = error.cause instanceof Error ? error.cause.message : error.message;
      messages.push(
        { role: 'assistant', content: error.text ?? '' },
        {
          role: 'user',
          content: `Your previous answer did not match the schema: ${reason}. Reply again with only the corrected JSON object.`,
        },
      );
    }
  }
}
