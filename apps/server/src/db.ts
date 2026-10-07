import pg from 'pg';

/** Minimal query interface shared by node-postgres (production) and PGlite (tests). */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const OID = { int8: 20, date: 1082, timestamptz: 1184, timestamp: 1114 } as const;

const toIso = (v: string) => new Date(v).toISOString();

/** Postgres via node-postgres pool. DATABASE_URL in production. */
export function pgDb(connectionString: string): Db {
  const types = {
    getTypeParser(oid: number, format?: 'text' | 'binary') {
      if (oid === OID.int8) return (v: string) => Number(v);
      if (oid === OID.date) return (v: string) => v;
      if (oid === OID.timestamptz || oid === OID.timestamp) return toIso;
      return pg.types.getTypeParser(oid, format);
    },
  } as unknown as pg.CustomTypesConfig;
  const pool = new pg.Pool({ connectionString, types, max: 10 });

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query<R>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params);
            return { rows: r.rows as R[] };
          },
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/** In-process Postgres (WASM) used by the test suite and local demos. */
export async function pgliteDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite({
    parsers: {
      [OID.int8]: (v: string) => Number(v),
      [OID.date]: (v: string) => v,
      [OID.timestamptz]: toIso,
      [OID.timestamp]: toIso,
    },
  });
  // PGlite runs one statement at a time, so a mutex serialises callers
  // the way a pool would with separate connections.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    query: <T>(sql: string, params: unknown[] = []) =>
      serial(async () => ({ rows: (await db.query<T>(sql, params)).rows })),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
      serial(() =>
        db.transaction(async (t) =>
          fn({ query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await t.query<R>(sql, params)).rows }) }),
        ),
      ),
    exec: (sql: string) => serial(async () => void (await db.exec(sql))),
    close: () => db.close(),
  };
}
