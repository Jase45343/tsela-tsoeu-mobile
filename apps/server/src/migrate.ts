import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

const here = dirname(fileURLToPath(import.meta.url));

// dist/migrations when bundled, ../migrations when run from source.
const defaultDir = existsSync(join(here, 'migrations')) ? join(here, 'migrations') : join(here, '..', 'migrations');

export async function migrate(db: Db, dir = defaultDir): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    await db.exec(`BEGIN;\n${sql.replace(/CREATE TABLE schema_migrations[^;]*;/, '')}\nINSERT INTO schema_migrations(name) VALUES ('${f}');\nCOMMIT;`);
    applied.push(f);
  }
  return applied;
}
