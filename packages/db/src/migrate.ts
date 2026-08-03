import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

/**
 * Runs hand-authored + drizzle-kit-generated .sql files in migrations/ in
 * filename order, tracked in a `_migrations` table. Kept deliberately simple
 * for Phase 0; revisit if concurrent/rollback semantics are needed later.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const sql = postgres(connectionString, { max: 1 });
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const applied = new Set((await sql`SELECT name FROM _migrations`).map((r) => r.name as string));
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const contents = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Applying migration ${file}...`);
    // Run the migration and its bookkeeping row in one transaction so a crash
    // between the two can't leave a migration applied-but-unrecorded (which
    // would make the next run retry it and fail on e.g. a duplicate CREATE TYPE).
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
  }

  await sql.end();
  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
