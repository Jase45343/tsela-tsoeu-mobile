import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';

export type DB = SQLite.SQLiteDatabase;

const KEY_NAME = 'busledger.dbkey';
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** NFR-004: the local database is encrypted with SQLCipher; its key lives in the Android Keystore via SecureStore. */
async function databaseKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    key = toHex(getRandomBytes(32));
    await SecureStore.setItemAsync(KEY_NAME, key);
  }
  return key;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE students (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_name TEXT NOT NULL, parent_phone TEXT NOT NULL,
     school TEXT NOT NULL DEFAULT '', pickup_location TEXT NOT NULL DEFAULT '', dropoff_location TEXT NOT NULL DEFAULT '',
     monthly_fee INTEGER NOT NULL, onboarded_at TEXT NOT NULL, status TEXT NOT NULL,
     rev INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL, sync_error TEXT);
   CREATE TABLE periods (
     id TEXT PRIMARY KEY, student_id TEXT NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL,
     period_start TEXT NOT NULL, period_end TEXT NOT NULL, due_date TEXT NOT NULL, amount_due INTEGER NOT NULL,
     cancelled INTEGER NOT NULL DEFAULT 0, origin TEXT NOT NULL,
     rev INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL, sync_error TEXT,
     UNIQUE (student_id, year, month));
   CREATE TABLE payments (
     id TEXT PRIMARY KEY, student_id TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL,
     payment_date TEXT NOT NULL, reference TEXT, note TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL,
     idempotency_key TEXT NOT NULL UNIQUE, ack_number TEXT, long_offline INTEGER NOT NULL DEFAULT 0,
     voided_at TEXT, void_reason TEXT, corrects_payment_id TEXT,
     rev INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL, sync_error TEXT);
   CREATE INDEX payments_student ON payments(student_id);
   CREATE TABLE adjustments (
     id TEXT PRIMARY KEY, student_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL,
     reason TEXT NOT NULL, created_at TEXT NOT NULL,
     rev INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL, sync_error TEXT);
   CREATE TABLE acks (
     id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, number TEXT NOT NULL UNIQUE, balance_shown INTEGER NOT NULL,
     balance_as_of TEXT NOT NULL, balance_provisional INTEGER NOT NULL, generated_at TEXT NOT NULL, shared_via TEXT,
     rev INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL, sync_error TEXT);
   CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v1.4: holiday months the driver must decide, and logged changes to a month's charge.
  `ALTER TABLE periods ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE periods ADD COLUMN charge_note TEXT;
   ALTER TABLE periods ADD COLUMN adjust_reason TEXT;`,
];

let opening: Promise<DB> | null = null;

/** Opens the database once per app session, so two callers can never race to create different keys. */
export function openDb(): Promise<DB> {
  opening ??= openDbOnce().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}

async function openDbOnce(): Promise<DB> {
  const key = await databaseKey();
  const db = await SQLite.openDatabaseAsync('busledger.db');
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => { const tx = db;
      await tx.execAsync(MIGRATIONS[version]!);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
  return db;
}

/** Remove every record (sign-out or a different operator signing in). */
export async function wipe(db: DB): Promise<void> {
  await db.execAsync('DELETE FROM acks; DELETE FROM adjustments; DELETE FROM payments; DELETE FROM periods; DELETE FROM students; DELETE FROM meta;');
}

export async function getMeta(db: DB, key: string): Promise<string | null> {
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]))?.value ?? null;
}

export async function setMeta(db: DB, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}
