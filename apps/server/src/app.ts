import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import {
  creditAdjustmentsCsv,
  dailyReport,
  normalizeLesothoPhone,
  paymentsCsv,
  studentsCsv,
  summarizeMonth,
  todayInMaseru,
} from '@busledger/core';
import type { Db } from './db';
import { ensurePeriods, loadAccounts, loadSettings, reallocate } from './ledger';
import { DeviceBody, isoDate, LoginBody, RegisterBody, ResetConfirmBody, ResetRequestBody, SettingsBody, SyncBody } from './schemas';
import { hashSecret, isWeakPin, sha256, sixDigitCode, verifySecret } from './security';
import { applyPush, pullChanges } from './sync';

export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

export const consoleSms: SmsSender = {
  async send(phone, message) {
    console.log(`[sms:dev] to ${phone}: ${message}`);
  },
};

export interface AppOptions {
  db: Db;
  jwtSecret: string;
  sms?: SmsSender;
  now?: () => Date;
  /** Token lifetime. Tokens are re-issued on every sync, so active devices never expire. */
  tokenTtl?: string;
  logger?: boolean;
  rateLimit?: boolean;
}

interface TokenClaims { sub: string }
declare module '@fastify/jwt' {
  interface FastifyJWT { payload: TokenClaims; user: TokenClaims }
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MINUTES = 10;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function body<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db } = opts;
  const now = opts.now ?? (() => new Date());
  const sms = opts.sms ?? consoleSms;
  const ttl = opts.tokenTtl ?? '30d';
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });

  await app.register(jwt, { secret: opts.jwtSecret });
  if (opts.rateLimit !== false) await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: 'request', message: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: 'server', message: 'Something went wrong on the server. Try again.' });
  });

  const authLimit = opts.rateLimit === false ? {} : { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  const sign = (userId: string) => app.jwt.sign({ sub: userId }, { expiresIn: ttl });

  async function requireUser(req: FastifyRequest): Promise<string> {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'unauthenticated', 'Sign in again.');
    }
    const userId = req.user.sub;
    const { rows } = await db.query<{ closed_at: string | null }>('SELECT closed_at FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new HttpError(401, 'unauthenticated', 'Sign in again.');
    if (rows[0].closed_at && !req.url.startsWith('/v1/account')) throw new HttpError(403, 'account_closed', 'This account is closed. Reopen it to continue.');
    return userId;
  }

  const publicUser = async (userId: string) => {
    const { rows } = await db.query<{ id: string; name: string; phone: string; email: string | null; closed_at: string | null }>(
      'SELECT id, name, phone, email, closed_at FROM users WHERE id = $1',
      [userId],
    );
    const s = await loadSettings(db, userId);
    const u = rows[0]!;
    return { id: u.id, name: u.name, phone: u.phone, email: u.email, closedAt: u.closed_at, ...s };
  };

  app.get('/health', async () => ({ ok: true }));

  /* ----- auth (FR-001..FR-003) ----- */

  app.post('/v1/auth/register', authLimit, async (req) => {
    const b = body(RegisterBody, req.body);
    const phone = normalizeLesothoPhone(b.phone);
    if (!phone) throw new HttpError(400, 'invalid_phone', 'Enter a Lesotho phone number, e.g. 5812 3456.');
    if (isWeakPin(b.pin)) throw new HttpError(400, 'weak_pin', 'Choose a PIN that is not a repeated or sequential number.');
    const exists = await db.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
    if (exists.rows.length) throw new HttpError(409, 'phone_taken', 'An account already uses this phone number. Sign in instead.');
    await db.query('INSERT INTO users (id, name, phone, email, business_name, pin_hash) VALUES ($1,$2,$3,$4,$5,$6)', [
      b.id, b.name, phone, b.email ?? null, b.businessName, await hashSecret(b.pin),
    ]);
    return { token: sign(b.id), user: await publicUser(b.id) };
  });

  app.post('/v1/auth/login', authLimit, async (req) => {
    const b = body(LoginBody, req.body);
    const phone = normalizeLesothoPhone(b.phone);
    const fail = () => new HttpError(401, 'bad_credentials', 'Phone number or PIN is wrong.');
    if (!phone) throw fail();
    const { rows } = await db.query<{ id: string; pin_hash: string; failed_logins: number; locked_until: string | null }>(
      'SELECT id, pin_hash, failed_logins, locked_until FROM users WHERE phone = $1',
      [phone],
    );
    const u = rows[0];
    if (!u) throw fail();
    if (u.locked_until && new Date(u.locked_until) > now()) {
      throw new HttpError(429, 'locked', `Too many wrong PINs. Try again after ${LOCK_MINUTES} minutes, or reset your PIN.`);
    }
    if (!(await verifySecret(b.pin, u.pin_hash))) {
      const failed = u.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS ? new Date(now().getTime() + LOCK_MINUTES * 60_000).toISOString() : null;
      await db.query('UPDATE users SET failed_logins = $2, locked_until = $3 WHERE id = $1', [u.id, lock ? 0 : failed, lock]);
      throw fail();
    }
    await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
    return { token: sign(u.id), user: await publicUser(u.id) };
  });

  app.post('/v1/auth/reset/request', authLimit, async (req, reply) => {
    const b = body(ResetRequestBody, req.body);
    const phone = normalizeLesothoPhone(b.phone);
    const u = phone ? (await db.query<{ id: string }>('SELECT id FROM users WHERE phone = $1', [phone])).rows[0] : undefined;
    if (u && phone) {
      const code = sixDigitCode();
      const expires = new Date(now().getTime() + RESET_TTL_MINUTES * 60_000).toISOString();
      await db.query(
        `INSERT INTO reset_codes (user_id, code_hash, expires_at, attempts) VALUES ($1,$2,$3,0)
         ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
        [u.id, sha256(code), expires],
      );
      await sms.send(phone, `Bus Ledger PIN reset code: ${code}. It expires in ${RESET_TTL_MINUTES} minutes.`);
    }
    // Same answer either way, so the endpoint does not reveal which numbers have accounts.
    return reply.status(202).send({ ok: true });
  });

  app.post('/v1/auth/reset/confirm', authLimit, async (req) => {
    const b = body(ResetConfirmBody, req.body);
    const phone = normalizeLesothoPhone(b.phone);
    const bad = () => new HttpError(400, 'bad_code', 'That code is wrong or has expired. Request a new one.');
    if (!phone) throw bad();
    if (isWeakPin(b.newPin)) throw new HttpError(400, 'weak_pin', 'Choose a PIN that is not a repeated or sequential number.');
    const { rows } = await db.query<{ id: string; code_hash: string; expires_at: string; attempts: number }>(
      'SELECT u.id, r.code_hash, r.expires_at, r.attempts FROM users u JOIN reset_codes r ON r.user_id = u.id WHERE u.phone = $1',
      [phone],
    );
    const r = rows[0];
    if (!r || new Date(r.expires_at) < now() || r.attempts >= 5) throw bad();
    if (r.code_hash !== sha256(b.code)) {
      await db.query('UPDATE reset_codes SET attempts = attempts + 1 WHERE user_id = $1', [r.id]);
      throw bad();
    }
    await db.query('UPDATE users SET pin_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', [r.id, await hashSecret(b.newPin)]);
    await db.query('DELETE FROM reset_codes WHERE user_id = $1', [r.id]);
    return { token: sign(r.id), user: await publicUser(r.id) };
  });

  /* ----- devices (FR-023) ----- */

  app.post('/v1/devices', async (req) => {
    const userId = await requireUser(req);
    const b = body(DeviceBody, req.body);
    const existing = (await db.query<{ user_id: string; ack_prefix: string }>('SELECT user_id, ack_prefix FROM devices WHERE id = $1', [b.id])).rows[0];
    if (existing) {
      if (existing.user_id !== userId) throw new HttpError(403, 'forbidden', 'Device belongs to another account.');
      return { deviceId: b.id, ackPrefix: existing.ack_prefix };
    }
    const seq = (await db.query<{ n: number }>("SELECT nextval('device_prefix_seq') AS n")).rows[0]!.n;
    const prefix = `DEV${seq}`;
    await db.query('INSERT INTO devices (id, user_id, ack_prefix, name) VALUES ($1,$2,$3,$4)', [b.id, userId, prefix, b.name ?? null]);
    return { deviceId: b.id, ackPrefix: prefix };
  });

  /* ----- settings (NFR-010) ----- */

  app.get('/v1/me', async (req) => publicUser(await requireUser(req)));

  app.put('/v1/settings', async (req) => {
    const userId = await requireUser(req);
    const b = body(SettingsBody, req.body);
    // Due day and grace days apply to periods generated from now on; past periods keep their dates.
    await db.query(
      `UPDATE users SET name = COALESCE($2, name), business_name = COALESCE($3, business_name),
         email = CASE WHEN $4::boolean THEN $5 ELSE email END,
         due_day = COALESCE($6, due_day), grace_days = COALESCE($7, grace_days),
         payment_methods = COALESCE($8::jsonb, payment_methods), server_seq = nextval('change_seq') WHERE id = $1`,
      [userId, b.name ?? null, b.businessName ?? null, b.email !== undefined, b.email ?? null, b.dueDay ?? null, b.graceDays ?? null,
        b.paymentMethods ? JSON.stringify(b.paymentMethods) : null],
    );
    return publicUser(userId);
  });

  /* ----- sync (FR-032) ----- */

  app.post('/v1/sync', async (req) => {
    const userId = await requireUser(req);
    const b = body(SyncBody, req.body);
    const device = (await db.query<{ user_id: string }>('SELECT user_id FROM devices WHERE id = $1', [b.deviceId])).rows[0];
    if (!device || device.user_id !== userId) throw new HttpError(403, 'unknown_device', 'Register this device before syncing.');
    const today = todayInMaseru(now());

    const out = await db.transaction(async (tx) => {
      // One sync at a time per operator keeps the change cursor gap-free.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
      const results = await applyPush(tx, { userId, deviceId: b.deviceId, today }, b.push);
      await tx.query('UPDATE devices SET last_sync_at = now() WHERE id = $1', [b.deviceId]);
      const pull = await pullChanges(tx, userId, b.cursor);
      return { results, ...pull };
    });
    return { ...out, settings: await loadSettings(db, userId), serverToday: today, token: sign(userId) };
  });

  /* ----- reports and export (FR-026..FR-029) ----- */

  const MonthQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12) });

  app.get('/v1/reports/monthly', async (req) => {
    const userId = await requireUser(req);
    const q = body(MonthQuery, req.query);
    const accounts = await loadAccounts(db, userId, todayInMaseru(now()));
    return summarizeMonth(accounts, q.year, q.month);
  });

  app.get('/v1/reports/daily', async (req) => {
    const userId = await requireUser(req);
    const q = body(z.object({ date: isoDate }), req.query);
    const accounts = await loadAccounts(db, userId, todayInMaseru(now()));
    return dailyReport(accounts.flatMap((a) => a.payments), q.date);
  });

  app.get('/v1/export/:kind', async (req: FastifyRequest<{ Params: { kind: string } }>, reply: FastifyReply) => {
    const userId = await requireUser(req);
    const accounts = await loadAccounts(db, userId, todayInMaseru(now()));
    const kind = req.params.kind;
    const csv =
      kind === 'students.csv' ? studentsCsv(accounts)
      : kind === 'payments.csv' ? paymentsCsv(accounts)
      : kind === 'credit-adjustments.csv' ? creditAdjustmentsCsv(accounts)
      : null;
    if (!csv) throw new HttpError(404, 'not_found', 'Unknown export.');
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${kind}"`).send(csv);
  });

  /* ----- account closure (FR-037) ----- */

  app.post('/v1/account/close', async (req) => {
    const userId = await requireUser(req);
    await db.query('UPDATE users SET closed_at = now() WHERE id = $1 AND closed_at IS NULL', [userId]);
    return publicUser(userId);
  });

  app.post('/v1/account/reopen', async (req) => {
    const userId = await requireUser(req);
    await db.query('UPDATE users SET closed_at = NULL WHERE id = $1', [userId]);
    return publicUser(userId);
  });

  return app;
}

/** Scheduled job: generate this month's periods for every open account (FR-008). */
export async function generateAllPeriods(db: Db, today: string): Promise<number> {
  const users = (await db.query<{ id: string }>('SELECT id FROM users WHERE closed_at IS NULL')).rows;
  let n = 0;
  for (const u of users) {
    await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [u.id]);
      const touched = await ensurePeriods(tx, u.id, today);
      for (const s of touched) await reallocate(tx, u.id, s);
      n += touched.size;
    });
  }
  return n;
}

/** Scheduled job: permanently delete accounts closed more than 90 days ago (FR-037). */
export async function purgeClosedAccounts(db: Db, at: Date): Promise<number> {
  const cutoff = new Date(at.getTime() - 90 * 86_400_000).toISOString();
  const { rows } = await db.query<{ id: string }>('DELETE FROM users WHERE closed_at IS NOT NULL AND closed_at < $1 RETURNING id', [cutoff]);
  return rows.length;
}
