import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  // Fine at import time in CI (typecheck/lint never construct this config's
  // connection) — but fail loudly the moment someone actually runs
  // db:generate / db:migrate without a configured database.
  console.warn('DATABASE_URL is not set — drizzle-kit commands will fail.');
}

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://placeholder/placeholder',
  },
  strict: true,
  verbose: true,
});
