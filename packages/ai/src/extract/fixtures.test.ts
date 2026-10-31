import { readdirSync, readFileSync } from 'node:fs';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { extractPlaceDetails } from './extract-place-details';
import type { ExtractionInput } from './prompt';

interface GeminiFixture {
  sampleId: string;
  modelId: string;
  input: ExtractionInput;
  /** What the model said, verbatim, on the first attempt. */
  rawText: string;
  /** What `extractPlaceDetails` returned for it when the fixture was captured (`pnpm eval:extract --save-fixtures`). */
  details: unknown;
}

const dir = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(dir)
  .filter((file) => file.startsWith('gemini-') && file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(file, dir), 'utf-8')) as GeminiFixture);

describe('real Gemini answers', () => {
  it('has fixtures to replay', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((fixture) => [fixture.sampleId, fixture] as const))(
    '%s parses as-is on the first attempt and cleans to the captured details',
    async (_id, fixture) => {
      const model = new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: 'text' as const, text: fixture.rawText }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        }),
      });

      const result = await extractPlaceDetails(fixture.input, { model });

      expect(result.attempts).toBe(1);
      expect(result.details).toEqual(fixture.details);
    },
  );
});
