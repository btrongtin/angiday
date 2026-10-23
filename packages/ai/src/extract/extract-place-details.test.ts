import type { PlaceExtraction } from '@angiday/shared';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { cleanExtraction } from './clean-extraction';
import { ExtractionFailedError, extractPlaceDetails } from './extract-place-details';
import { buildExtractionPrompt, type ExtractionInput } from './prompt';

const INPUT: ExtractionInput = {
  note: 'bún bò cay, rẻ, hợp hẹn hò',
  place: { name: 'Bún Bò Huế Thiện Tâm', address: null, areaLabel: 'Q2 · Phường Cát Lái' },
  existingTagNames: ['đi nhậu'],
};

const VALID = {
  cuisine: ['vietnamese'],
  dishType: ['noodle_soup'],
  priceRange: 'under_50k',
  highlights: ['bún bò cay'],
  tags: ['hẹn hò'],
};
const INVALID = { ...VALID, cuisine: ['italian'] };

function answer(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

/** A mock model that replies with the queued texts in order, one per call. */
function mockModel(...texts: unknown[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => answer(typeof texts[call] === 'string' ? (texts[call++] as string) : JSON.stringify(texts[call++])),
  });
}

describe('extractPlaceDetails', () => {
  it('returns the parsed details on the first valid answer', async () => {
    const model = mockModel(VALID);

    const result = await extractPlaceDetails(INPUT, { model });

    expect(result.details).toEqual(VALID);
    expect(result).toMatchObject({ attempts: 1, inputTokens: 10, outputTokens: 5 });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('re-prompts with the validation error and succeeds', async () => {
    const model = mockModel(INVALID, VALID);

    const result = await extractPlaceDetails(INPUT, { model });

    expect(result).toMatchObject({ attempts: 2, inputTokens: 20, outputTokens: 10 });
    const secondPrompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(secondPrompt).toContain('did not match the schema');
    expect(secondPrompt).toContain('italian');
  });

  it('gives up after 3 invalid answers', async () => {
    const model = mockModel(INVALID, INVALID, INVALID);

    const error = await extractPlaceDetails(INPUT, { model }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExtractionFailedError);
    expect((error as ExtractionFailedError).attempts).toBe(3);
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it('does not re-prompt on a transport error', async () => {
    const tooMany = new APICallError({
      message: 'Too Many Requests',
      statusCode: 429,
      url: 'https://example.test',
      requestBodyValues: {},
      isRetryable: true,
    });
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw tooMany;
      },
    });

    await expect(extractPlaceDetails(INPUT, { model })).rejects.toBe(tooMany);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('passes the abort signal through', async () => {
    const model = mockModel(VALID);
    const controller = new AbortController();

    await extractPlaceDetails(INPUT, { model, abortSignal: controller.signal });

    expect(model.doGenerateCalls[0]?.abortSignal).toBeDefined();
  });

  it('cleans the answer (dedupes, caps, drops padding)', async () => {
    const model = mockModel({ ...VALID, cuisine: ['vietnamese', 'vietnamese', 'other'], tags: ['#hẹn_hò', 'Hẹn hò'] });

    const { details } = await extractPlaceDetails(INPUT, { model });

    expect(details.cuisine).toEqual(['vietnamese']);
    expect(details.tags).toEqual(['hẹn hò']);
  });
});

describe('cleanExtraction', () => {
  const base: PlaceExtraction = { cuisine: [], dishType: [], priceRange: null, highlights: [], tags: [] };

  it('dedupes enums and drops "other" next to real values', () => {
    expect(cleanExtraction({ ...base, cuisine: ['vietnamese', 'vietnamese', 'other'], dishType: ['other'] })).toMatchObject({
      cuisine: ['vietnamese'],
      dishType: ['other'],
    });
  });

  it('trims, dedupes and drops blank or over-long highlights', () => {
    const highlights = [' bún bò  cay ', '', 'Bún bò cay', 'x'.repeat(61)];
    expect(cleanExtraction({ ...base, highlights }).highlights).toEqual(['bún bò cay']);
  });

  it('caps highlights at 5 and tags at 5', () => {
    const many = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'];
    const cleaned = cleanExtraction({ ...base, highlights: many, tags: many });
    expect(cleaned.highlights).toHaveLength(5);
    expect(cleaned.tags).toHaveLength(5);
  });

  it('merges tag spelling variants and drops over-long names', () => {
    expect(cleanExtraction({ ...base, tags: ['#hẹn_hò', 'Hẹn hò', 'y'.repeat(41), '  '] }).tags).toEqual(['hẹn hò']);
  });
});

describe('buildExtractionPrompt', () => {
  it('names every taxonomy key in the system prompt', () => {
    const { system } = buildExtractionPrompt(INPUT);
    for (const key of ['vietnamese', 'other_asian', 'noodle_soup', 'dry_noodle', 'under_50k', 'over_500k']) {
      expect(system).toContain(key);
    }
  });

  it('puts the note, place and existing tags in the user prompt', () => {
    const { prompt } = buildExtractionPrompt(INPUT);
    for (const text of ['bún bò cay, rẻ, hợp hẹn hò', 'Bún Bò Huế Thiện Tâm', 'Q2 · Phường Cát Lái', 'đi nhậu']) {
      expect(prompt).toContain(text);
    }
  });

  it('says so when there is no note', () => {
    expect(buildExtractionPrompt({ ...INPUT, note: '' }).prompt).toContain('(no note)');
  });
});
