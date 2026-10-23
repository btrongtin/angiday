// One-off: give places saved before S2/S3 the fields S4 will query (area.legacyDistrict, searchText, empty classification).
// Sets only missing fields; no Nominatim or LLM calls. Usage: pnpm backfill:places [--dry-run]  (reads the root .env)
import { parseArgs } from 'node:util';
import { backfillPlaceDefaults, getMongoClient } from '@angiday/db';
import { loadAppEnv } from '@angiday/shared';
import { findLegacyDistrict } from '@angiday/shared/legacy-district';

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' } } });
const env = loadAppEnv(process.env, ['MONGODB_URI', 'GROUP_ID']);

const client = await getMongoClient(env.MONGODB_URI);
try {
  const db = client.db();
  const result = await backfillPlaceDefaults(db, env.GROUP_ID, { findLegacyDistrict, dryRun: values['dry-run'] === true });
  console.log(`Database: ${db.databaseName}${values['dry-run'] ? ' (dry run, nothing written)' : ''}`);
  console.log(`Scanned ${result.scanned} places, ${result.updated} ${values['dry-run'] ? 'would be ' : ''}updated`);
} finally {
  await client.close();
}
