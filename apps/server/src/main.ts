import { todayInMaseru } from '@busledger/core';
import { buildApp, generateAllPeriods, purgeClosedAccounts } from './app';
import { pgDb } from './db';
import { migrate } from './migrate';

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing environment variable ${k}`);
  return v;
};

const jwtSecret = env('JWT_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const db = pgDb(env('DATABASE_URL'));
const applied = await migrate(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

// SMS for PIN resets: plug a provider in here (see README). Development logs codes to the console.
const app = await buildApp({ db, jwtSecret, logger: true });

const runJobs = async () => {
  try {
    const n = await generateAllPeriods(db, todayInMaseru());
    if (n) app.log.info(`Generated periods for ${n} students`);
    const purged = await purgeClosedAccounts(db, new Date());
    if (purged) app.log.info(`Purged ${purged} closed accounts`);
  } catch (e) {
    app.log.error(e, 'scheduled job failed');
  }
};
await runJobs();
setInterval(runJobs, 60 * 60 * 1000).unref();

await app.listen({ host: '0.0.0.0', port: Number(env('PORT', '8080')) });
