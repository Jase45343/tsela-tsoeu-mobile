import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp, generateAllPeriods, purgeClosedAccounts } from '../src/app';
import { pgliteDb, type Db } from '../src/db';
import { migrate } from '../src/migrate';

const M = (m: number) => m * 100;
let clock = new Date('2026-10-06T08:00:00Z');
const sent: { phone: string; message: string }[] = [];

let db: Db;
let app: FastifyInstance;

async function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, token?: string) {
  const res = await app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const json = res.headers['content-type']?.toString().includes('json') ? res.json() : res.body;
  return { status: res.statusCode, body: json as any };
}

async function newOperator(phone: string) {
  const r = await call('POST', '/v1/auth/register', { id: randomUUID(), name: 'Thabo', phone, businessName: 'Thabo Transport', pin: '482915' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const deviceId = randomUUID();
  const d = await call('POST', '/v1/devices', { id: deviceId }, r.body.token);
  return { token: r.body.token as string, userId: r.body.user.id as string, deviceId, prefix: d.body.ackPrefix as string };
}

const studentDto = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: 'Mpho Mokoena', parentName: "'Me Palesa", parentPhone: '5812 3456', school: 'Maseru Prep',
  pickupLocation: 'Ha Thetsane', dropoffLocation: 'Maseru Prep', monthlyFee: M(1000), onboardedAt: '2026-08-18', status: 'active', ...over,
});

const paymentDto = (studentId: string, amount: number, date: string, over: Record<string, unknown> = {}) => {
  const id = randomUUID();
  return { id, studentId, amount, method: 'M-Pesa', paymentDate: date, source: 'manual', createdAt: `${date}T09:00:00.000Z`, idempotencyKey: `key-${id}`, ...over };
};

before(async () => {
  db = await pgliteDb();
  await migrate(db);
  app = await buildApp({ db, jwtSecret: 'test-secret-test-secret-test-secret!!', now: () => clock, rateLimit: false, sms: { async send(phone, message) { sent.push({ phone, message }); } } });
});
after(async () => { await app.close(); await db.close(); });

describe('authentication', () => {
  it('registers, rejects weak PINs and duplicate phones', async () => {
    const weak = await call('POST', '/v1/auth/register', { id: randomUUID(), name: 'A', phone: '62000001', pin: '123456' });
    assert.equal(weak.body.error, 'weak_pin');
    await newOperator('62000002');
    const dup = await call('POST', '/v1/auth/register', { id: randomUUID(), name: 'B', phone: '+266 6200 0002', pin: '482915' });
    assert.equal(dup.status, 409);
  });

  it('locks after five wrong PINs and resets by SMS code', async () => {
    await newOperator('62000003');
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/v1/auth/login', { phone: '62000003', pin: '000001' })).status, 401);
    assert.equal((await call('POST', '/v1/auth/login', { phone: '62000003', pin: '482915' })).body.error, 'locked');

    assert.equal((await call('POST', '/v1/auth/reset/request', { phone: '62000003' })).status, 202);
    assert.equal((await call('POST', '/v1/auth/reset/request', { phone: '69999999' })).status, 202); // no enumeration
    const code = /(\d{6})/.exec(sent.at(-1)!.message)![1];
    assert.equal((await call('POST', '/v1/auth/reset/confirm', { phone: '62000003', code: '000000', newPin: '739204' })).body.error, 'bad_code');
    const ok = await call('POST', '/v1/auth/reset/confirm', { phone: '62000003', code, newPin: '739204' });
    assert.equal(ok.status, 200);
    assert.equal((await call('POST', '/v1/auth/login', { phone: '62000003', pin: '739204' })).status, 200);
  });

  it('issues a unique, stable acknowledgement prefix per device', async () => {
    const op = await newOperator('62000004');
    const again = await call('POST', '/v1/devices', { id: op.deviceId }, op.token);
    assert.equal(again.body.ackPrefix, op.prefix);
    const other = await call('POST', '/v1/devices', { id: randomUUID() }, op.token);
    assert.notEqual(other.body.ackPrefix, op.prefix);
  });
});

describe('sync and bookkeeping', () => {
  let op: Awaited<ReturnType<typeof newOperator>>;
  const studentId = randomUUID();
  const onboardingPeriodId = randomUUID();
  let cursor = 0;

  const sync = async (push: Record<string, unknown[]> = {}, token = op.token, deviceId = op.deviceId) => {
    const r = await call('POST', '/v1/sync', { deviceId, cursor, push }, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    cursor = r.body.cursor;
    return r.body;
  };

  before(async () => { op = await newOperator('62000010'); });

  it('accepts the onboarding period and generates the months since (FR-005, FR-008)', async () => {
    const res = await sync({
      students: [studentDto(studentId)],
      periods: [{ id: onboardingPeriodId, studentId, year: 2026, month: 8, amountDue: M(500), cancelled: false, origin: 'onboarding' }],
    });
    assert.deepEqual(res.results.map((r: any) => r.status), ['ok', 'ok']);
    const months = res.periods.map((p: any) => [p.month, p.amountDue, p.origin]).sort();
    assert.deepEqual(months, [[10, M(1000), 'server'], [8, M(500), 'onboarding'], [9, M(1000), 'server']].sort());
    assert.equal(res.students[0].parentPhone, '+26658123456');
  });

  it('allocates FIFO across periods and reports it back (FR-015)', async () => {
    const pay = paymentDto(studentId, M(1700), '2026-08-20', { acknowledgementNumber: `${op.prefix}-000001` });
    const res = await sync({
      payments: [pay],
      acknowledgements: [{ id: randomUUID(), paymentId: pay.id, number: `${op.prefix}-000001`, balanceShown: M(800), balanceAsOf: clock.toISOString(), balanceProvisional: true, generatedAt: clock.toISOString() }],
    });
    assert.deepEqual(res.results.map((r: any) => r.status), ['ok', 'ok']);
    const byMonth = Object.fromEntries(res.periods.map((p: any) => [p.month, p]));
    assert.equal(byMonth[8].status, 'paid');
    assert.equal(byMonth[9].status, 'paid');
    assert.equal(byMonth[10].amountRecorded, M(200));
    assert.equal(res.allocationsByStudent[studentId].length, 3);
    assert.equal(res.acknowledgements[0].number, `${op.prefix}-000001`);
  });

  it('pulls only what changed since the cursor', async () => {
    const res = await sync();
    assert.equal(res.students.length, 0);
    assert.equal(res.payments.length, 0);
  });

  it('is idempotent on retries and duplicate keys (FR-032)', async () => {
    const pay = paymentDto(studentId, M(100), '2026-10-02');
    await sync({ payments: [pay] });
    const retry = await sync({ payments: [pay] });
    assert.equal(retry.results[0].status, 'ok');
    const dup = await sync({ payments: [{ ...pay, id: randomUUID() }] });
    assert.equal(dup.results[0].status, 'ignored');
    assert.match(dup.results[0].reason, /^duplicate_of:/);
  });

  it('refuses edits, accepts voids, and reallocates (FR-016)', async () => {
    const pay = paymentDto(studentId, M(300), '2026-10-03');
    await sync({ payments: [pay] });
    const edit = await sync({ payments: [{ ...pay, amount: M(30) }] });
    assert.equal(edit.results[0].reason, 'immutable');
    const voided = await sync({ payments: [{ ...pay, voidedAt: clock.toISOString(), voidReason: 'Typed 300, meant 30' }] });
    assert.equal(voided.results[0].status, 'ok');
    const oct = voided.periods.find((p: any) => p.month === 10);
    assert.equal(oct.amountRecorded, M(300)); // 200 carried + 100
    const audit = await db.query<{ action: string }>('SELECT action FROM audit_log WHERE entity_id = $1 ORDER BY id', [pay.id]);
    assert.deepEqual(audit.rows.map((r) => r.action), ['create', 'void']);
  });

  it('ignores provisional periods from devices (BR-6)', async () => {
    const res = await sync({ periods: [{ id: randomUUID(), studentId, year: 2026, month: 11, amountDue: M(1000), cancelled: false, origin: 'provisional' }] });
    assert.equal(res.results[0].status, 'ignored');
  });

  it('turns an overpayment into credit, guards credit adjustments, and supports cancellation (FR-010, FR-039)', async () => {
    await sync({ payments: [paymentDto(studentId, M(1200), '2026-10-04')] }); // Oct full (700 left) → 500 credit
    const tooMuch = await sync({ creditAdjustments: [{ id: randomUUID(), studentId, type: 'refunded_outside_app', amount: M(600), reason: 'Refund', createdAt: clock.toISOString() }] });
    assert.equal(tooMuch.results[0].reason, 'exceeds_credit');

    const octId = (await db.query<{ id: string }>('SELECT id FROM billing_periods WHERE student_id = $1 AND month = 10', [studentId])).rows[0]!.id;
    const cancel = await sync({
      students: [studentDto(studentId, { status: 'inactive' })],
      periods: [{ id: octId, studentId, year: 2026, month: 10, amountDue: M(1000), cancelled: true, origin: 'server' }],
    });
    const oct = cancel.periods.find((p: any) => p.month === 10);
    assert.equal(oct.status, 'cancelled');

    const refund = await sync({ creditAdjustments: [{ id: randomUUID(), studentId, type: 'refunded_outside_app', amount: M(1500), reason: 'Left school; returned prepayment', createdAt: clock.toISOString() }] });
    assert.equal(refund.results[0].status, 'ok');
    const report = await call('GET', '/v1/reports/monthly?year=2026&month=10', undefined, op.token);
    assert.equal(report.body.totalCredit, 0);
    assert.equal(report.body.cancelled, 1);
    assert.equal(report.body.creditAdjustmentsTotal, M(1500));
  });

  it('records a fee change from next month without touching past periods (FR-009)', async () => {
    const s2 = randomUUID();
    await sync({ students: [studentDto(s2, { name: 'Lineo', onboardedAt: '2026-10-01' })] });
    await sync({ students: [studentDto(s2, { name: 'Lineo', onboardedAt: '2026-10-01', monthlyFee: M(1200) })] });
    const fc = await db.query<{ effective_from: string; new_fee: number }>('SELECT effective_from, new_fee FROM fee_changes WHERE student_id = $1', [s2]);
    assert.deepEqual(fc.rows[0], { effective_from: '2026-11-01', new_fee: M(1200) });
    const oct = await db.query<{ amount_due: number }>('SELECT amount_due FROM billing_periods WHERE student_id = $1 AND month = 10', [s2]);
    assert.equal(oct.rows[0]!.amount_due, M(1000));

    clock = new Date('2026-11-01T06:00:00Z');
    assert.ok((await generateAllPeriods(db, '2026-11-01')) >= 1);
    const nov = await db.query<{ amount_due: number }>('SELECT amount_due FROM billing_periods WHERE student_id = $1 AND month = 11', [s2]);
    assert.equal(nov.rows[0]!.amount_due, M(1200));
    clock = new Date('2026-10-06T08:00:00Z');
  });

  it('keeps operators apart', async () => {
    const other = await newOperator('62000011');
    const r = await call('POST', '/v1/sync', { deviceId: other.deviceId, cursor: 0, push: { payments: [paymentDto(studentId, M(100), '2026-10-05')] } }, other.token);
    assert.equal(r.body.results[0].reason, 'unknown_student');
    assert.equal(r.body.students.length, 0);
    const wrongDevice = await call('POST', '/v1/sync', { deviceId: op.deviceId, cursor: 0 }, other.token);
    assert.equal(wrongDevice.status, 403);
  });

  it('exports CSV (FR-029)', async () => {
    const r = await call('GET', '/v1/export/payments.csv', undefined, op.token);
    assert.equal(r.status, 200);
    assert.match(r.body as string, /^payment_id,acknowledgement,student,amount/);
    assert.match(r.body as string, /2026-08:500\.00 2026-09:1000\.00 adjustment:200\.00/);
  });
});

describe('billing rules and school calendars', () => {
  it('saves rules and closures, and generates holiday months by them', async () => {
    const op = await newOperator('62000030');
    const closure = { id: randomUUID(), school: 'Maseru Prep', from: '2026-12-05', to: '2027-01-18', label: 'Summer holidays' };
    const bad = await call('PUT', '/v1/settings', { schoolClosures: [{ ...closure, from: '2027-01-18', to: '2026-12-05' }] }, op.token);
    assert.equal(bad.status, 400);
    const saved = await call('PUT', '/v1/settings', { holidayRule: 'half_or_ask', firstMonthRule: 'half_after', halfCutoffDay: 20, schoolClosures: [closure] }, op.token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.holidayRule, 'half_or_ask');
    assert.equal(saved.body.closures.length, 1);

    const sid = randomUUID();
    clock = new Date('2026-11-10T08:00:00Z');
    let cursor = 0;
    const sync = async (push: Record<string, unknown[]> = {}) => {
      const r = await call('POST', '/v1/sync', { deviceId: op.deviceId, cursor, push }, op.token);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      cursor = r.body.cursor;
      return r.body;
    };
    const first = await sync({
      students: [studentDto(sid, { onboardedAt: '2026-11-09' })],
      periods: [{ id: randomUUID(), studentId: sid, year: 2026, month: 11, amountDue: M(1000), cancelled: false, origin: 'onboarding' }],
    });
    // First payment falls due on the start date, not the 1st.
    assert.equal(first.periods[0].dueDate, '2026-11-09');
    assert.equal(first.settings.holidayRule, 'half_or_ask');

    clock = new Date('2026-12-01T06:00:00Z');
    await generateAllPeriods(db, '2026-12-01');
    const dec = (await sync()).periods.find((p: any) => p.month === 12);
    assert.equal(dec.needsReview, true); // 4 of 23 school days
    assert.equal(dec.chargeNote, '4/23');

    // A changed charge needs a reason, and clears the review flag.
    const noReason = await sync({ periods: [{ id: dec.id, studentId: sid, year: 2026, month: 12, amountDue: 0, cancelled: false, origin: 'server' }] });
    assert.equal(noReason.results[0].reason, 'reason_required');
    const decided = await sync({ periods: [{ id: dec.id, studentId: sid, year: 2026, month: 12, amountDue: 0, cancelled: false, origin: 'server', adjustReason: 'School closed most of December' }] });
    const decAfter = decided.periods.find((p: any) => p.month === 12);
    assert.equal(decAfter.amountDue, 0);
    assert.equal(decAfter.needsReview, false);
    assert.equal(decAfter.status, 'paid');
    const audit = await db.query<{ action: string }>('SELECT action FROM audit_log WHERE entity_id = $1', [dec.id]);
    assert.deepEqual(audit.rows.map((r) => r.action), ['charge_adjust']);

    // Switching to the by-days rule applies from the next month generated.
    await call('PUT', '/v1/settings', { holidayRule: 'by_days' }, op.token);
    clock = new Date('2027-01-01T06:00:00Z');
    await generateAllPeriods(db, '2027-01-01');
    const jan = (await sync()).periods.find((p: any) => p.month === 1);
    assert.equal(jan.amountDue, M(429)); // 9 of 21 school days, whole maloti
    assert.equal(jan.needsReview, false);
    clock = new Date('2026-10-06T08:00:00Z');
  });
});

describe('account closure (FR-037)', () => {
  it('blocks a closed account, allows reopening, and purges after 90 days', async () => {
    const op = await newOperator('62000020');
    await call('POST', '/v1/account/close', {}, op.token);
    assert.equal((await call('POST', '/v1/sync', { deviceId: op.deviceId, cursor: 0 }, op.token)).body.error, 'account_closed');
    await call('POST', '/v1/account/reopen', {}, op.token);
    assert.equal((await call('POST', '/v1/sync', { deviceId: op.deviceId, cursor: 0 }, op.token)).status, 200);
    await call('POST', '/v1/account/close', {}, op.token);
    assert.equal(await purgeClosedAccounts(db, new Date(Date.now() + 89 * 86_400_000)), 0);
    assert.equal(await purgeClosedAccounts(db, new Date(Date.now() + 91 * 86_400_000)), 1);
  });
});
