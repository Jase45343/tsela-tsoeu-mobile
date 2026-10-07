import { randomUUID } from 'node:crypto';
import {
  buildBook,
  buildPeriod,
  computeLedger,
  periodsToGenerate,
  type BillingPeriod,
  type CreditAdjustment,
  type ISODate,
  type OperatorSettings,
  type Payment,
  type Student,
  type StudentAccount,
} from '@busledger/core';
import type { Queryable } from './db';

/* ---------- row mapping (snake_case rows -> core types) ---------- */

export interface StudentRow {
  id: string; name: string; parent_name: string; parent_phone: string; school: string;
  pickup_location: string; dropoff_location: string; monthly_fee: number; onboarded_at: string;
  status: 'active' | 'inactive'; updated_at: string; server_seq: number;
}
export interface PeriodRow {
  id: string; student_id: string; year: number; month: number; period_start: string; period_end: string;
  due_date: string; amount_due: number; amount_recorded: number; balance: number; status: string;
  cancelled: boolean; origin: 'server' | 'onboarding'; server_seq: number;
}
export interface PaymentRow {
  id: string; student_id: string; amount: number; method: string; payment_date: string; reference: string | null;
  note: string | null; source: 'manual' | 'voice'; idempotency_key: string; acknowledgement_number: string | null;
  created_at: string; voided_at: string | null; void_reason: string | null; corrects_payment_id: string | null;
  long_offline: boolean; server_seq: number;
}
export interface AdjustmentRow {
  id: string; student_id: string; type: CreditAdjustment['type']; amount: number; reason: string; created_at: string; server_seq: number;
}

export const toStudent = (r: StudentRow): Student => ({
  id: r.id, name: r.name, parentName: r.parent_name, parentPhone: r.parent_phone, school: r.school,
  pickupLocation: r.pickup_location, dropoffLocation: r.dropoff_location, monthlyFee: r.monthly_fee,
  onboardedAt: r.onboarded_at, status: r.status,
});
export const toPeriod = (r: PeriodRow): BillingPeriod => ({
  id: r.id, studentId: r.student_id, year: r.year, month: r.month, periodStart: r.period_start,
  periodEnd: r.period_end, dueDate: r.due_date, amountDue: r.amount_due, cancelled: r.cancelled, origin: r.origin,
});
export const toPayment = (r: PaymentRow): Payment => ({
  id: r.id, studentId: r.student_id, amount: r.amount, method: r.method, paymentDate: r.payment_date,
  reference: r.reference, note: r.note, source: r.source, createdAt: r.created_at, voidedAt: r.voided_at,
  voidReason: r.void_reason, correctsPaymentId: r.corrects_payment_id, acknowledgementNumber: r.acknowledgement_number,
});
export const toAdjustment = (r: AdjustmentRow): CreditAdjustment => ({
  id: r.id, studentId: r.student_id, type: r.type, amount: r.amount, reason: r.reason, createdAt: r.created_at,
});

/* ---------- loading ---------- */

export async function loadStudentLedgerInputs(q: Queryable, studentId: string) {
  const [periods, payments, adjustments] = await Promise.all([
    q.query<PeriodRow>('SELECT * FROM billing_periods WHERE student_id = $1', [studentId]),
    q.query<PaymentRow>('SELECT * FROM payments WHERE student_id = $1', [studentId]),
    q.query<AdjustmentRow>('SELECT * FROM credit_adjustments WHERE student_id = $1', [studentId]),
  ]);
  return {
    periodRows: periods.rows,
    periods: periods.rows.map(toPeriod),
    payments: payments.rows.map(toPayment),
    adjustments: adjustments.rows.map(toAdjustment),
  };
}

export async function loadSettings(q: Queryable, userId: string): Promise<OperatorSettings & { businessName: string; paymentMethods: string[] }> {
  const { rows } = await q.query<{ due_day: number; grace_days: number; business_name: string; payment_methods: string[] }>(
    'SELECT due_day, grace_days, business_name, payment_methods FROM users WHERE id = $1',
    [userId],
  );
  const r = rows[0];
  if (!r) throw new Error('User not found');
  return { dueDay: r.due_day, graceDays: r.grace_days, businessName: r.business_name, paymentMethods: r.payment_methods };
}

export async function loadAccounts(q: Queryable, userId: string, today: ISODate): Promise<StudentAccount[]> {
  const settings = await loadSettings(q, userId);
  const [s, p, pay, adj] = await Promise.all([
    q.query<StudentRow>('SELECT * FROM students WHERE user_id = $1 ORDER BY name', [userId]),
    q.query<PeriodRow>('SELECT * FROM billing_periods WHERE user_id = $1', [userId]),
    q.query<PaymentRow>('SELECT * FROM payments WHERE user_id = $1', [userId]),
    q.query<AdjustmentRow>('SELECT * FROM credit_adjustments WHERE user_id = $1', [userId]),
  ]);
  return buildBook({
    students: s.rows.map(toStudent),
    periods: p.rows.map(toPeriod),
    payments: pay.rows.map(toPayment),
    adjustments: adj.rows.map(toAdjustment),
    today,
    settings,
  });
}

/* ---------- authoritative operations ---------- */

/**
 * FR-008: generate every missing monthly period up to today for this operator.
 * Idempotent: the (student, year, month) unique key makes re-runs harmless.
 * Returns the ids of students that received a new period.
 */
export async function ensurePeriods(q: Queryable, userId: string, today: ISODate): Promise<Set<string>> {
  const { dueDay } = await loadSettings(q, userId);
  const students = await q.query<StudentRow>('SELECT * FROM students WHERE user_id = $1 AND status = $2', [userId, 'active']);
  if (students.rows.length === 0) return new Set();
  const existing = await q.query<{ student_id: string; year: number; month: number }>(
    'SELECT student_id, year, month FROM billing_periods WHERE user_id = $1',
    [userId],
  );
  const todo = periodsToGenerate(
    students.rows.map(toStudent),
    existing.rows.map((r) => ({ studentId: r.student_id, year: r.year, month: r.month })),
    today,
  );
  const touched = new Set<string>();
  for (const t of todo) {
    const p = buildPeriod({ id: randomUUID(), studentId: t.studentId, year: t.year, month: t.month, amountDue: t.amountDue, dueDay, origin: 'server' });
    const ins = await q.query(
      `INSERT INTO billing_periods (id, user_id, student_id, year, month, period_start, period_end, due_date, amount_due, balance, origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'server') ON CONFLICT (student_id, year, month) DO NOTHING RETURNING id`,
      [p.id, userId, p.studentId, p.year, p.month, p.periodStart, p.periodEnd, p.dueDate, p.amountDue],
    );
    if (ins.rows.length) touched.add(t.studentId);
  }
  return touched;
}

/**
 * FR-015: recompute one student's allocations from scratch and refresh the
 * period caches. Bumps server_seq on anything that changed so devices pull it.
 */
export async function reallocate(q: Queryable, userId: string, studentId: string): Promise<void> {
  const input = await loadStudentLedgerInputs(q, studentId);
  const ledger = computeLedger(input);

  for (const row of input.periodRows) {
    const s = ledger.periods.get(row.id)!;
    if (s.amountRecorded !== row.amount_recorded || s.balance !== row.balance || s.status !== row.status) {
      await q.query(
        `UPDATE billing_periods SET amount_recorded = $2, balance = $3, status = $4, server_seq = nextval('change_seq') WHERE id = $1`,
        [row.id, s.amountRecorded, s.balance, s.status],
      );
    }
  }

  await q.query('DELETE FROM payment_allocations WHERE student_id = $1', [studentId]);
  for (const a of ledger.allocations) {
    await q.query(
      'INSERT INTO payment_allocations (user_id, student_id, payment_id, target, target_id, amount) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, studentId, a.paymentId, a.target, a.targetId, a.amount],
    );
  }
  // Signals devices to refresh this student's allocations.
  await q.query(`UPDATE students SET server_seq = nextval('change_seq') WHERE id = $1`, [studentId]);
}

export async function audit(
  q: Queryable,
  e: { userId: string; entityType: string; entityId: string; action: string; deviceId?: string | null; previous?: unknown; next?: unknown },
): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (user_id, entity_type, entity_id, action, actor_user_id, device_id, previous_values, new_values)
     VALUES ($1,$2,$3,$4,$1,$5,$6,$7)`,
    [e.userId, e.entityType, e.entityId, e.action, e.deviceId ?? null, e.previous === undefined ? null : JSON.stringify(e.previous), e.next === undefined ? null : JSON.stringify(e.next)],
  );
}
