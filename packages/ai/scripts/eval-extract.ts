// Manual prompt-quality check against the real model (ADR-0015); never runs in CI.
// Usage: pnpm eval:extract [--save-fixtures] [--only <sample-id>] [--thinking minimal|low|medium|high]   (reads the root .env)
// --save-fixtures writes src/extract/fixtures/gemini-<id>.json for every sample that was valid on the first attempt.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { type PlaceExtraction, loadAppEnv, matchTags, normalizeTagName, stripMapsUrls } from '@angiday/shared';
import { wrapLanguageModel } from 'ai';
import { DEFAULT_MODEL_IDS, extractPlaceDetails, getModel, type ExtractionInput } from '../src/index';

/** Free-tier requests per minute of the chosen model (AI Studio → rate limits). Owner confirms in S3 Task 0. */
const REQUESTS_PER_MINUTE = 10;

interface Sample {
  id: string;
  text: string;
  place: ExtractionInput['place'];
  existingTags: string[];
  expect?: Partial<Pick<PlaceExtraction, 'cuisine' | 'dishType' | 'priceRange' | 'tags'>>;
}

const { values } = parseArgs({
  options: { 'save-fixtures': { type: 'boolean' }, only: { type: 'string' }, thinking: { type: 'string' } },
});
const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
const thinkingLevel = THINKING_LEVELS.find((level) => level === values.thinking);
if (values.thinking !== undefined && thinkingLevel === undefined) throw new Error(`--thinking must be one of ${THINKING_LEVELS.join(', ')}`);
const env = loadAppEnv(process.env, ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_EXTRACT_MODEL']);
const modelId = env.GEMINI_EXTRACT_MODEL ?? DEFAULT_MODEL_IDS.extract;

const samplesUrl = new URL('../eval/extract-samples.json', import.meta.url);
const fixturesDir = new URL('../src/extract/fixtures/', import.meta.url);
const samples = (JSON.parse(await readFile(samplesUrl, 'utf-8')) as Sample[]).filter(
  (sample) => values.only === undefined || sample.id === values.only,
);

// Capture the model's raw text of the first call so a fixture can replay exactly what Gemini said.
const rawTexts: string[] = [];
let reasoningTokens = 0;
let elapsedMs = 0;
const model = wrapLanguageModel({
  model: getModel('extract', { apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY, extractModelId: env.GEMINI_EXTRACT_MODEL }),
  middleware: {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate }) => {
      const started = Date.now();
      const result = await doGenerate();
      elapsedMs += Date.now() - started;
      reasoningTokens += result.usage.outputTokens.reasoning ?? 0;
      rawTexts.push(result.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(''));
      return result;
    },
  },
});

const same = (a: readonly string[], b: readonly string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
let matched = 0;
let total = 0;

console.log(`Model: ${modelId}, thinking: ${thinkingLevel ?? 'model default'}, ${samples.length} samples`);
for (const [index, sample] of samples.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, Math.ceil(60 / REQUESTS_PER_MINUTE) * 1000));
  const note = stripMapsUrls(sample.text);
  const input: ExtractionInput = { note, place: sample.place, existingTagNames: sample.existingTags };
  rawTexts.length = 0;
  reasoningTokens = 0;
  elapsedMs = 0;
  try {
    const result = await extractPlaceDetails(input, { model, thinkingLevel, abortSignal: AbortSignal.timeout(60_000) });
    const existing = sample.existingTags.map((name) => ({ id: name, normalized: normalizeTagName(name) }));
    const tags = matchTags({ proposed: result.details.tags, existing, note });
    const finalTags = [...tags.tagIds, ...tags.toCreate];
    const checks: [string, boolean, unknown][] = [];
    const { expect: want } = sample;
    if (want?.cuisine) checks.push(['cuisine', same(want.cuisine, result.details.cuisine), result.details.cuisine]);
    if (want?.dishType) checks.push(['dishType', same(want.dishType, result.details.dishType), result.details.dishType]);
    if (want && 'priceRange' in want) checks.push(['priceRange', want.priceRange === result.details.priceRange, result.details.priceRange]);
    if (want?.tags) checks.push(['tags', same(want.tags.map(normalizeTagName), finalTags.map(normalizeTagName)), finalTags]);
    for (const [, ok] of checks) {
      total += 1;
      if (ok) matched += 1;
    }
    console.log(
      `${sample.id}: attempts=${result.attempts} tokens=${result.inputTokens}+${result.outputTokens} (reasoning ${reasoningTokens}) ${(elapsedMs / 1000).toFixed(1)}s highlights=${JSON.stringify(result.details.highlights)}`,
    );
    for (const [field, ok, actual] of checks) console.log(`  ${ok ? '✓' : '✗'} ${field}: ${JSON.stringify(actual)}`);
    // Shown even when the sample has no `expect.tags`, so the proposed tags can be judged by eye.
    if (!want?.tags) console.log(`  · tags (not checked): ${JSON.stringify(finalTags)}`);

    if (values['save-fixtures']) {
      if (result.attempts === 1 && rawTexts[0] !== undefined) {
        await mkdir(fixturesDir, { recursive: true });
        const fixture = { sampleId: sample.id, modelId, capturedAt: new Date().toISOString(), input, rawText: rawTexts[0], details: result.details };
        await writeFile(new URL(`gemini-${sample.id}.json`, fixturesDir), `${JSON.stringify(fixture, null, 2)}\n`);
      } else {
        console.log('  (not saved: needed a re-prompt)');
      }
    }
  } catch (error) {
    console.log(`${sample.id}: FAILED ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${matched}/${total} fields matched`);
