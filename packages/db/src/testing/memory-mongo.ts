import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { ensureIndexes } from '../indexes';

/** A real mongod for integration tests (ADR-0015). One per test file; each call gets a fresh database. */
export async function startMemoryMongo(): Promise<{ db: Db; stop: () => Promise<void> }> {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  const db = client.db(`test_${randomUUID().slice(0, 8)}`);
  await ensureIndexes(db);
  return {
    db,
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
}
