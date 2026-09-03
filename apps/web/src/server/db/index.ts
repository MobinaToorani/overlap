import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Lazily-created singleton so importing this module never opens a
 * connection at build time — Next.js can statically analyze/collect page
 * data without a DATABASE_URL being present.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    _db = drizzle(postgres(url), { schema });
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;
export * as schema from './schema';
