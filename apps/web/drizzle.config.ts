import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js reads .env.local automatically; plain node scripts like this one
// do not — bare `dotenv/config` only loads `.env`. Without this, putting
// DATABASE_URL in .env.local (the file the app itself uses) would leave
// db:generate/db:migrate insisting it wasn't set.
//
// Two sequential calls rather than dotenv's array form: the array form
// returns an error if ANY listed file is missing, and .env legitimately
// doesn't exist here. dotenv never overwrites an already-set variable, so
// .env.local still wins.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

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
  // Defense in depth alongside schema.ts's real fix (authUsers is
  // deliberately NOT exported from schema.ts, so drizzle-kit's `generate`
  // never sees it as a table to manage — see that file's comment). This
  // additionally stops `generate`/`push` from touching anything outside
  // `public` even if a future schema.ts change re-exports something from
  // another schema without thinking it through.
  schemaFilter: ['public'],
});
