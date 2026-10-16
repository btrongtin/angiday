import { type Db, MongoClient } from 'mongodb';

// One client per process: Lambda containers and the Next.js server reuse it across requests
// (Phase 1 plan → Mongo connection). Cached on globalThis so Next dev hot reload doesn't leak clients.
const cache = globalThis as typeof globalThis & { __angidayMongoClients?: Map<string, Promise<MongoClient>> };

export function getMongoClient(uri: string): Promise<MongoClient> {
  const clients = (cache.__angidayMongoClients ??= new Map());
  let client = clients.get(uri);
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5_000 }).connect();
    // Forget a failed connect so the next call retries instead of reusing the rejection.
    client.catch(() => clients.delete(uri));
    clients.set(uri, client);
  }
  return client;
}

/** The database named in the URI path (`…mongodb.net/angiday?…`). */
export async function getDb(uri: string): Promise<Db> {
  return (await getMongoClient(uri)).db();
}
