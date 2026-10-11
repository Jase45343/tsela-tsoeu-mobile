import type { BillingPeriod, CreditAdjustment, Payment, Student } from '@busledger/core';
import type { DB } from '../db/database';

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'local';
export type EntityKind = 'student' | 'period' | 'payment' | 'adjustment' | 'ack';

export interface LocalPayment extends Payment {
  idempotencyKey: string;
  longOffline: boolean;
}

export interface LocalAck {
  id: string;
  paymentId: string;
  number: string;
  balanceShown: number;
  balanceAsOf: string;
  balanceProvisional: boolean;
  generatedAt: string;
  sharedVia: string | null;
}

export interface SyncInfo {
  id: string;
  kind: EntityKind;
  studentId: string | null;
  status: SyncStatus;
  error: string | null;
  rev: number;
}

export interface Snapshot {
  students: Student[];
  periods: BillingPeriod[];
  payments: LocalPayment[];
  adjustments: CreditAdjustment[];
  acks: LocalAck[];
  sync: SyncInfo[];
}

type Row = Record<string, any>;
const b = (v: unknown) => v === 1 || v === true;

export const rowToStudent = (r: Row): Student => ({
  id: r.id, name: r.name, parentName: r.parent_name, parentPhone: r.parent_phone, school: r.school,
  pickupLocation: r.pickup_location, dropoffLocation: r.dropoff_location, monthlyFee: r.monthly_fee,
  onboardedAt: r.onboarded_at, status: r.status,
});
export const rowToPeriod = (r: Row): BillingPeriod => ({
  id: r.id, studentId: r.student_id, year: r.year, month: r.month, periodStart: r.period_start, periodEnd: r.period_end,
  dueDate: r.due_date, amountDue: r.amount_due, cancelled: b(r.cancelled), origin: r.origin,
  needsReview: b(r.needs_review), chargeNote: r.charge_note ?? null,
});
export const rowToPayment = (r: Row): LocalPayment => ({
  id: r.id, studentId: r.student_id, amount: r.amount, method: r.method, paymentDate: r.payment_date,
  reference: r.reference, note: r.note, source: r.source, createdAt: r.created_at, idempotencyKey: r.idempotency_key,
  acknowledgementNumber: r.ack_number, longOffline: b(r.long_offline), voidedAt: r.voided_at, voidReason: r.void_reason,
  correctsPaymentId: r.corrects_payment_id, writeOffPeriodId: r.write_off_period_id ?? null,
});
export const rowToAdjustment = (r: Row): CreditAdjustment => ({
  id: r.id, studentId: r.student_id, type: r.type, amount: r.amount, reason: r.reason, createdAt: r.created_at,
});
export const rowToAck = (r: Row): LocalAck => ({
  id: r.id, paymentId: r.payment_id, number: r.number, balanceShown: r.balance_shown, balanceAsOf: r.balance_as_of,
  balanceProvisional: b(r.balance_provisional), generatedAt: r.generated_at, sharedVia: r.shared_via,
});

export async function loadSnapshot(db: DB): Promise<Snapshot> {
  const [s, p, pay, adj, ack] = await Promise.all([
    db.getAllAsync<Row>('SELECT * FROM students ORDER BY name COLLATE NOCASE'),
    db.getAllAsync<Row>('SELECT * FROM periods'),
    db.getAllAsync<Row>('SELECT * FROM payments'),
    db.getAllAsync<Row>('SELECT * FROM adjustments'),
    db.getAllAsync<Row>('SELECT * FROM acks'),
  ]);
  const paymentStudent = new Map(pay.map((r) => [r.id as string, r.student_id as string]));
  const info = (kind: EntityKind, rows: Row[], studentOf: (r: Row) => string | null): SyncInfo[] =>
    rows.map((r) => ({ id: r.id, kind, studentId: studentOf(r), status: r.sync_status, error: r.sync_error ?? null, rev: r.rev }));
  return {
    students: s.map(rowToStudent),
    periods: p.map(rowToPeriod),
    payments: pay.map(rowToPayment),
    adjustments: adj.map(rowToAdjustment),
    acks: ack.map(rowToAck),
    sync: [
      ...info('student', s, (r) => r.id),
      ...info('period', p, (r) => r.student_id),
      ...info('payment', pay, (r) => r.student_id),
      ...info('adjustment', adj, (r) => r.student_id),
      ...info('ack', ack, (r) => paymentStudent.get(r.payment_id) ?? null),
    ],
  };
}

/* ---------- local writes (always marked pending) ---------- */

export async function saveStudent(db: DB, s: Student): Promise<void> {
  await db.runAsync(
    `INSERT INTO students (id, name, parent_name, parent_phone, school, pickup_location, dropoff_location, monthly_fee, onboarded_at, status, rev, sync_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,'pending')
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent_name=excluded.parent_name, parent_phone=excluded.parent_phone,
       school=excluded.school, pickup_location=excluded.pickup_location, dropoff_location=excluded.dropoff_location,
       monthly_fee=excluded.monthly_fee, status=excluded.status, rev=students.rev+1, sync_status='pending', sync_error=NULL`,
    [s.id, s.name, s.parentName, s.parentPhone, s.school, s.pickupLocation, s.dropoffLocation, s.monthlyFee, s.onboardedAt, s.status],
  );
}

export async function insertPeriod(db: DB, p: BillingPeriod, status: SyncStatus): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO periods (id, student_id, year, month, period_start, period_end, due_date, amount_due, cancelled, origin, needs_review, charge_note, rev, sync_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
    [p.id, p.studentId, p.year, p.month, p.periodStart, p.periodEnd, p.dueDate, p.amountDue, p.cancelled ? 1 : 0, p.origin,
      p.needsReview ? 1 : 0, p.chargeNote ?? null, status],
  );
}

export async function setPeriodCancelled(db: DB, id: string, cancelled: boolean): Promise<void> {
  await db.runAsync(`UPDATE periods SET cancelled = ?, rev = rev + 1, sync_status = 'pending', sync_error = NULL WHERE id = ?`, [cancelled ? 1 : 0, id]);
}

/** A month's charge changed by the driver; the reason is sent to the server and logged. */
export async function setPeriodAmount(db: DB, id: string, amount: number, reason: string): Promise<void> {
  await db.runAsync(
    `UPDATE periods SET amount_due = ?, adjust_reason = ?, charge_note = ?, needs_review = 0, rev = rev + 1, sync_status = 'pending', sync_error = NULL WHERE id = ?`,
    [amount, reason, reason, id],
  );
}

export async function insertPayment(db: DB, p: LocalPayment): Promise<void> {
  await db.runAsync(
    `INSERT INTO payments (id, student_id, amount, method, payment_date, reference, note, source, created_at, idempotency_key, ack_number,
       long_offline, voided_at, void_reason, corrects_payment_id, write_off_period_id, rev, sync_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'pending')`,
    [p.id, p.studentId, p.amount, p.method, p.paymentDate, p.reference ?? null, p.note ?? null, p.source, p.createdAt, p.idempotencyKey,
      p.acknowledgementNumber ?? null, p.longOffline ? 1 : 0, p.voidedAt ?? null, p.voidReason ?? null, p.correctsPaymentId ?? null,
      p.writeOffPeriodId ?? null],
  );
}

export async function voidPayment(db: DB, id: string, reason: string, at: string): Promise<void> {
  await db.runAsync(`UPDATE payments SET voided_at = ?, void_reason = ?, rev = rev + 1, sync_status = 'pending', sync_error = NULL WHERE id = ? AND voided_at IS NULL`, [at, reason, id]);
}

export async function insertAdjustment(db: DB, a: CreditAdjustment): Promise<void> {
  await db.runAsync(`INSERT INTO adjustments (id, student_id, type, amount, reason, created_at, rev, sync_status) VALUES (?,?,?,?,?,?,1,'pending')`,
    [a.id, a.studentId, a.type, a.amount, a.reason, a.createdAt]);
}

export async function insertAck(db: DB, a: LocalAck): Promise<void> {
  await db.runAsync(
    `INSERT INTO acks (id, payment_id, number, balance_shown, balance_as_of, balance_provisional, generated_at, shared_via, rev, sync_status)
     VALUES (?,?,?,?,?,?,?,?,1,'pending')`,
    [a.id, a.paymentId, a.number, a.balanceShown, a.balanceAsOf, a.balanceProvisional ? 1 : 0, a.generatedAt, a.sharedVia],
  );
}

export async function markAckShared(db: DB, id: string, via: string): Promise<void> {
  await db.runAsync(`UPDATE acks SET shared_via = ?, rev = rev + 1, sync_status = 'pending' WHERE id = ?`, [via, id]);
}

export async function retryFailed(db: DB): Promise<void> {
  for (const t of ['students', 'periods', 'payments', 'adjustments', 'acks']) {
    await db.runAsync(`UPDATE ${t} SET sync_status = 'pending', sync_error = NULL WHERE sync_status = 'failed'`);
  }
}
