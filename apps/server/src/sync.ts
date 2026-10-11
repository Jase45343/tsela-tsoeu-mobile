import {
  computeLedger,
  normalizeLesothoPhone,
  nextMonth,
  parts,
  makeDate,
  periodBounds,
  dueDateFor,
  firstDueDate,
  type ISODate,
} from '@busledger/core';
import type { z } from 'zod';
import type { Queryable } from './db';
import {
  audit,
  ensurePeriods,
  loadSettings,
  loadStudentLedgerInputs,
  reallocate,
  type AdjustmentRow,
  type PaymentRow,
  type PeriodRow,
  type StudentRow,
} from './ledger';
import {
  AcknowledgementDTO,
  CreditAdjustmentDTO,
  PaymentDTO,
  PeriodPush,
  StudentDTO,
  type SyncBody,
} from './schemas';

export type RecordResult =
  | { id: string; status: 'ok' }
  | { id: string; status: 'ignored'; reason: string }
  | { id: string; status: 'rejected'; reason: string; message: string };

export interface SyncContext {
  userId: string;
  deviceId: string;
  today: ISODate;
}

const ok = (id: string): RecordResult => ({ id, status: 'ok' });
const rejected = (id: string, reason: string, message: string): RecordResult => ({ id, status: 'rejected', reason, message });
const ignored = (id: string, reason: string): RecordResult => ({ id, status: 'ignored', reason });
const idOf = (raw: unknown): string => (raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : 'unknown');

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): { ok: true; value: z.infer<T> } | { ok: false; result: RecordResult } {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, result: rejected(idOf(raw), 'invalid', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')) };
}

async function ownedStudent(q: Queryable, userId: string, studentId: string): Promise<StudentRow | undefined> {
  const { rows } = await q.query<StudentRow & { user_id: string }>('SELECT * FROM students WHERE id = $1', [studentId]);
  const r = rows[0];
  return r && r.user_id === userId ? r : undefined;
}

/* ---------------- push ---------------- */

export async function applyPush(q: Queryable, ctx: SyncContext, push: z.infer<typeof SyncBody>['push']) {
  const results: RecordResult[] = [];
  const touched = new Set<string>();
  const { dueDay } = await loadSettings(q, ctx.userId);

  // 1. Students (last write wins; single device per account in the MVP).
  for (const raw of push.students) {
    const p = parse(StudentDTO, raw);
    if (!p.ok) { results.push(p.result); continue; }
    const s = p.value;
    const phone = normalizeLesothoPhone(s.parentPhone);
    if (!phone) { results.push(rejected(s.id, 'invalid_phone', 'Parent phone must be a Lesotho number')); continue; }
    const existing = await q.query<StudentRow & { user_id: string }>('SELECT * FROM students WHERE id = $1', [s.id]);
    const prev = existing.rows[0];
    if (prev && prev.user_id !== ctx.userId) { results.push(rejected(s.id, 'forbidden', 'Not your record')); continue; }
    if (!prev) {
      await q.query(
        `INSERT INTO students (id, user_id, name, parent_name, parent_phone, school, pickup_location, dropoff_location, monthly_fee, onboarded_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [s.id, ctx.userId, s.name, s.parentName, phone, s.school, s.pickupLocation, s.dropoffLocation, s.monthlyFee, s.onboardedAt, s.status],
      );
    } else {
      if (prev.monthly_fee !== s.monthlyFee) {
        // FR-009: applies from the next generated period only.
        const t = parts(ctx.today);
        const n = nextMonth(t.year, t.month);
        await q.query(
          `INSERT INTO fee_changes (id, student_id, old_fee, new_fee, effective_from, created_by) VALUES (gen_random_uuid(), $1,$2,$3,$4,$5)`,
          [s.id, prev.monthly_fee, s.monthlyFee, makeDate(n.year, n.month, 1), ctx.userId],
        );
      }
      await q.query(
        `UPDATE students SET name=$2, parent_name=$3, parent_phone=$4, school=$5, pickup_location=$6, dropoff_location=$7,
           monthly_fee=$8, status=$9, updated_at=now(), server_seq=nextval('change_seq') WHERE id=$1`,
        [s.id, s.name, s.parentName, phone, s.school, s.pickupLocation, s.dropoffLocation, s.monthlyFee, s.status],
      );
    }
    results.push(ok(s.id));
  }

  // 2. Periods: onboarding periods (FR-005), cancellations (FR-010) and charges changed by hand.
  for (const raw of push.periods) {
    const p = parse(PeriodPush, raw);
    if (!p.ok) { results.push(p.result); continue; }
    const per = p.value;
    const student = await ownedStudent(q, ctx.userId, per.studentId);
    if (!student) { results.push(rejected(per.id, 'unknown_student', 'Student not found')); continue; }

    const byId = await q.query<PeriodRow>('SELECT * FROM billing_periods WHERE id = $1 AND student_id = $2', [per.id, per.studentId]);
    const row = byId.rows[0];
    if (row) {
      if (row.amount_due !== per.amountDue) {
        if (!per.adjustReason) {
          results.push(rejected(per.id, 'reason_required', 'Give a reason when changing a month\'s charge.'));
          continue;
        }
        await q.query(
          `UPDATE billing_periods SET amount_due = $2, needs_review = false, charge_note = $3, server_seq = nextval('change_seq') WHERE id = $1`,
          [row.id, per.amountDue, per.adjustReason],
        );
        await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'period', entityId: row.id, action: 'charge_adjust', previous: { amountDue: row.amount_due }, next: { amountDue: per.amountDue, reason: per.adjustReason } });
        touched.add(per.studentId);
      }
      if (row.cancelled !== per.cancelled) {
        await q.query(`UPDATE billing_periods SET cancelled = $2, server_seq = nextval('change_seq') WHERE id = $1`, [row.id, per.cancelled]);
        await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'period', entityId: row.id, action: per.cancelled ? 'cancel' : 'uncancel', previous: { cancelled: row.cancelled }, next: { cancelled: per.cancelled } });
        touched.add(per.studentId);
      }
      results.push(ok(per.id));
      continue;
    }
    if (per.origin !== 'onboarding') {
      // Provisional periods are always replaced by the server's own (BR-6).
      results.push(ignored(per.id, 'server_generates_periods'));
      continue;
    }
    const onboard = parts(student.onboarded_at);
    if (per.year !== onboard.year || per.month !== onboard.month) {
      results.push(rejected(per.id, 'not_first_period', 'Only the onboarding month can be created on a device'));
      continue;
    }
    const byKey = await q.query<PeriodRow>('SELECT * FROM billing_periods WHERE student_id = $1 AND year = $2 AND month = $3', [per.studentId, per.year, per.month]);
    const clash = byKey.rows[0];
    if (clash?.origin === 'onboarding') { results.push(ignored(per.id, 'already_onboarded')); continue; }
    if (clash) {
      // The server generated this month before the onboarding record arrived: the operator's choice wins.
      await q.query(
        `UPDATE billing_periods SET amount_due = $2, origin = 'onboarding', cancelled = $3, due_date = $4, needs_review = false, server_seq = nextval('change_seq') WHERE id = $1`,
        [clash.id, per.amountDue, per.cancelled, firstDueDate(clash.due_date, student.onboarded_at)],
      );
      await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'period', entityId: clash.id, action: 'first_period_override', previous: { amountDue: clash.amount_due }, next: { amountDue: per.amountDue } });
    } else {
      const b = periodBounds(per.year, per.month);
      await q.query(
        `INSERT INTO billing_periods (id, user_id, student_id, year, month, period_start, period_end, due_date, amount_due, balance, cancelled, origin)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,'onboarding')`,
        [per.id, ctx.userId, per.studentId, per.year, per.month, b.periodStart, b.periodEnd, firstDueDate(dueDateFor(per.year, per.month, dueDay), student.onboarded_at), per.amountDue, per.cancelled],
      );
    }
    touched.add(per.studentId);
    results.push(ok(per.id));
  }

  // 3. Fill any missing months before money is allocated.
  for (const id of await ensurePeriods(q, ctx.userId, ctx.today)) touched.add(id);

  // 4. Payments: insert-only, except voiding (FR-016).
  for (const raw of push.payments) {
    const p = parse(PaymentDTO, raw);
    if (!p.ok) { results.push(p.result); continue; }
    const pay = p.value;
    if (!(await ownedStudent(q, ctx.userId, pay.studentId))) { results.push(rejected(pay.id, 'unknown_student', 'Student not found')); continue; }

    const existing = (await q.query<PaymentRow & { user_id: string }>('SELECT * FROM payments WHERE id = $1', [pay.id])).rows[0];
    if (existing && existing.user_id !== ctx.userId) { results.push(rejected(pay.id, 'forbidden', 'Not your record')); continue; }

    if (!existing) {
      const dup = await q.query<{ id: string }>('SELECT id FROM payments WHERE user_id = $1 AND idempotency_key = $2', [ctx.userId, pay.idempotencyKey]);
      if (dup.rows[0]) { results.push(ignored(pay.id, `duplicate_of:${dup.rows[0].id}`)); continue; }
      if (pay.correctsPaymentId) {
        const orig = (await q.query<{ user_id: string }>('SELECT user_id FROM payments WHERE id = $1', [pay.correctsPaymentId])).rows[0];
        if (!orig || orig.user_id !== ctx.userId) { results.push(rejected(pay.id, 'unknown_original', 'The record being corrected was not found')); continue; }
      }
      await q.query(
        `INSERT INTO payments (id, user_id, student_id, amount, method, payment_date, reference, note, source, idempotency_key,
           acknowledgement_number, device_id, created_by, created_at, long_offline, voided_at, void_reason, corrects_payment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$2,$13,$14,$15,$16,$17)`,
        [pay.id, ctx.userId, pay.studentId, pay.amount, pay.method, pay.paymentDate, pay.reference ?? null, pay.note ?? null, pay.source,
          pay.idempotencyKey, pay.acknowledgementNumber ?? null, ctx.deviceId, pay.createdAt, pay.longOffline, pay.voidedAt ?? null,
          pay.voidReason ?? null, pay.correctsPaymentId ?? null],
      );
      const { voidedAt: _v, voidReason: _r, ...created } = pay;
      await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'payment', entityId: pay.id, action: pay.correctsPaymentId ? 'adjust' : 'create', next: created });
      if (pay.voidedAt) {
        await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'payment', entityId: pay.id, action: 'void', previous: { voidedAt: null }, next: { voidedAt: pay.voidedAt, voidReason: pay.voidReason } });
      }
      touched.add(pay.studentId);
      results.push(ok(pay.id));
      continue;
    }

    const changed =
      existing.student_id !== pay.studentId || existing.amount !== pay.amount || existing.method !== pay.method ||
      existing.payment_date !== pay.paymentDate || (existing.reference ?? null) !== (pay.reference ?? null) ||
      (existing.note ?? null) !== (pay.note ?? null);
    if (changed) {
      results.push(rejected(pay.id, 'immutable', 'Payment records cannot be edited. Void it and record a correction instead.'));
      continue;
    }
    if (pay.voidedAt && !existing.voided_at) {
      await q.query(`UPDATE payments SET voided_at = $2, void_reason = $3, server_seq = nextval('change_seq') WHERE id = $1`, [pay.id, pay.voidedAt, pay.voidReason ?? null]);
      await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'payment', entityId: pay.id, action: 'void', previous: { voidedAt: null }, next: { voidedAt: pay.voidedAt, voidReason: pay.voidReason } });
      touched.add(pay.studentId);
    } else if (!pay.voidedAt && existing.voided_at) {
      results.push(rejected(pay.id, 'already_voided', 'A voided record cannot be restored. Record the payment again.'));
      continue;
    }
    results.push(ok(pay.id));
  }

  // 5. Credit adjustments: insert-only, may not exceed available credit (FR-039).
  for (const raw of push.creditAdjustments) {
    const p = parse(CreditAdjustmentDTO, raw);
    if (!p.ok) { results.push(p.result); continue; }
    const a = p.value;
    if (!(await ownedStudent(q, ctx.userId, a.studentId))) { results.push(rejected(a.id, 'unknown_student', 'Student not found')); continue; }
    const existing = (await q.query<AdjustmentRow>('SELECT * FROM credit_adjustments WHERE id = $1', [a.id])).rows[0];
    if (existing) { results.push(ok(a.id)); continue; }
    const ledger = computeLedger(await loadStudentLedgerInputs(q, a.studentId));
    if (a.amount > ledger.credit) {
      results.push(rejected(a.id, 'exceeds_credit', `Only ${ledger.credit} lisente of credit is available`));
      continue;
    }
    await q.query(
      `INSERT INTO credit_adjustments (id, user_id, student_id, type, amount, reason, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$2,$7)`,
      [a.id, ctx.userId, a.studentId, a.type, a.amount, a.reason, a.createdAt],
    );
    await audit(q, { userId: ctx.userId, deviceId: ctx.deviceId, entityType: 'credit_adjustment', entityId: a.id, action: 'create', next: a });
    touched.add(a.studentId);
    results.push(ok(a.id));
  }

  // 6. Acknowledgements: numbers are unique by device prefix and never rejected (FR-023).
  for (const raw of push.acknowledgements) {
    const p = parse(AcknowledgementDTO, raw);
    if (!p.ok) { results.push(p.result); continue; }
    const k = p.value;
    const owner = (await q.query<{ user_id: string }>('SELECT user_id FROM payments WHERE id = $1', [k.paymentId])).rows[0];
    if (!owner || owner.user_id !== ctx.userId) { results.push(rejected(k.id, 'unknown_payment', 'Payment not found')); continue; }
    await q.query(
      `INSERT INTO acknowledgements (id, user_id, payment_id, number, balance_shown, balance_as_of, balance_provisional, generated_at, shared_via)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET shared_via = EXCLUDED.shared_via, server_seq = nextval('change_seq')`,
      [k.id, ctx.userId, k.paymentId, k.number, k.balanceShown, k.balanceAsOf, k.balanceProvisional, k.generatedAt, k.sharedVia ?? null],
    );
    results.push(ok(k.id));
  }

  for (const studentId of touched) await reallocate(q, ctx.userId, studentId);
  return results;
}

/* ---------------- pull ---------------- */

export async function pullChanges(q: Queryable, userId: string, cursor: number) {
  const [students, periods, payments, adjustments, acks] = await Promise.all([
    q.query<StudentRow>('SELECT * FROM students WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq', [userId, cursor]),
    q.query<PeriodRow>('SELECT * FROM billing_periods WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq', [userId, cursor]),
    q.query<PaymentRow>('SELECT * FROM payments WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq', [userId, cursor]),
    q.query<AdjustmentRow>('SELECT * FROM credit_adjustments WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq', [userId, cursor]),
    q.query<{ id: string; payment_id: string; number: string; balance_shown: number; balance_as_of: string; balance_provisional: boolean; generated_at: string; shared_via: string | null; server_seq: number }>(
      'SELECT * FROM acknowledgements WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq', [userId, cursor]),
  ]);

  const studentIds = students.rows.map((s) => s.id);
  const allocations = studentIds.length
    ? (await q.query<{ student_id: string; payment_id: string; target: 'period' | 'adjustment'; target_id: string; amount: number }>(
        'SELECT student_id, payment_id, target, target_id, amount FROM payment_allocations WHERE student_id = ANY($1::uuid[]) ORDER BY id',
        [studentIds],
      )).rows
    : [];
  const allocationsByStudent: Record<string, { paymentId: string; target: string; targetId: string; amount: number }[]> = {};
  for (const id of studentIds) allocationsByStudent[id] = [];
  for (const a of allocations) allocationsByStudent[a.student_id]!.push({ paymentId: a.payment_id, target: a.target, targetId: a.target_id, amount: a.amount });

  const maxSeq = (await q.query<{ m: number | null }>(
    `SELECT GREATEST(
       (SELECT max(server_seq) FROM students WHERE user_id = $1),
       (SELECT max(server_seq) FROM billing_periods WHERE user_id = $1),
       (SELECT max(server_seq) FROM payments WHERE user_id = $1),
       (SELECT max(server_seq) FROM credit_adjustments WHERE user_id = $1),
       (SELECT max(server_seq) FROM acknowledgements WHERE user_id = $1)) AS m`,
    [userId],
  )).rows[0]?.m;

  return {
    cursor: Math.max(cursor, maxSeq ?? 0),
    students: students.rows.map((r) => ({
      id: r.id, name: r.name, parentName: r.parent_name, parentPhone: r.parent_phone, school: r.school,
      pickupLocation: r.pickup_location, dropoffLocation: r.dropoff_location, monthlyFee: r.monthly_fee,
      onboardedAt: r.onboarded_at, status: r.status, updatedAt: r.updated_at,
    })),
    periods: periods.rows.map((r) => ({
      id: r.id, studentId: r.student_id, year: r.year, month: r.month, periodStart: r.period_start, periodEnd: r.period_end,
      dueDate: r.due_date, amountDue: r.amount_due, cancelled: r.cancelled, origin: r.origin,
      needsReview: r.needs_review, chargeNote: r.charge_note,
      amountRecorded: r.amount_recorded, balance: r.balance, status: r.status,
    })),
    payments: payments.rows.map((r) => ({
      id: r.id, studentId: r.student_id, amount: r.amount, method: r.method, paymentDate: r.payment_date,
      reference: r.reference, note: r.note, source: r.source, createdAt: r.created_at, idempotencyKey: r.idempotency_key,
      acknowledgementNumber: r.acknowledgement_number, voidedAt: r.voided_at, voidReason: r.void_reason,
      correctsPaymentId: r.corrects_payment_id, longOffline: r.long_offline,
    })),
    creditAdjustments: adjustments.rows.map((r) => ({
      id: r.id, studentId: r.student_id, type: r.type, amount: r.amount, reason: r.reason, createdAt: r.created_at,
    })),
    acknowledgements: acks.rows.map((r) => ({
      id: r.id, paymentId: r.payment_id, number: r.number, balanceShown: r.balance_shown, balanceAsOf: r.balance_as_of,
      balanceProvisional: r.balance_provisional, generatedAt: r.generated_at, sharedVia: r.shared_via,
    })),
    allocationsByStudent,
  };
}
