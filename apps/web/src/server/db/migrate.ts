import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const migrationClient = postgres(url, { max: 1 });
  await migrate(drizzle(migrationClient), {
    migrationsFolder: path.join(__dirname, 'migrations'),
  });

  // Apply the hand-written invariant guards (triggers + worker role) that
  // drizzle-kit cannot generate from the schema builder. See
  // ./sql/0001_guard_invariants.sql for why these exist — INV-1.
  let invariantsSql = readFileSync(
    path.join(__dirname, 'sql/0001_guard_invariants.sql'),
    'utf-8',
  );
  const workerPassword = process.env.OVERLAP_WORKER_DB_PASSWORD;
  if (workerPassword) {
    invariantsSql = invariantsSql.replaceAll(
      '__OVERLAP_WORKER_PASSWORD__',
      workerPassword.replaceAll("'", "''"),
    );
    await migrationClient.unsafe(invariantsSql);
  } else {
    console.warn(
      'OVERLAP_WORKER_DB_PASSWORD not set — skipping overlap_worker role ' +
        'creation. The guard_confirmed_free trigger (INV-1) is still applied; ' +
        'the extra worker-role boundary (FIX-4) is not. Set it and re-run before deploying calendar sync (T9).',
    );
    const triggerOnly = invariantsSql.split('-- FIX-4')[0] ?? invariantsSql;
    await migrationClient.unsafe(triggerOnly);
  }

  await migrationClient.end();
  console.log('Migrations + invariant guards applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
