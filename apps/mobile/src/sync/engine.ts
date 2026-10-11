import type { DB } from '../db/database';
import { getMeta, setMeta } from '../db/database';
import type { BillingRules } from '@busledger/core';
import { api } from './api';

type Row = Record<string, any>;
type Result = { id: string; status: 'ok' | 'ignored' | 'rejected'; reason?: string; message?: string };

export interface RemoteSettings extends BillingRules {
  dueDay: number;
  graceDays: number;
  businessName: string;
  paymentMethods: string[];
}

interface SyncResponse {
  results: Result[];
  cursor: number;
  token: string;
  settings: RemoteSettings;
  serverToday: string;
  students: Row[];
  periods: Row[];
  payments: Row[];
  creditAdjustments: Row[];
  acknowledgements: Row[];
}

const TABLES = ['students', 'periods', 'payments', 'adjustments', 'acks'] as const;

/**
 * FR-032: push every pending record, apply the server's results, then merge
 * the server's changes. A record edited while the request was in flight keeps
 * its pending status (rev check), and pulled rows never overwrite a local
 * record that has not been accepted yet.
 */
export async function runSync(db: DB, token: string, deviceId: string): Promise<{ token: string; settings: RemoteSettings; failed: number }> {
  const pending = async (table: string) => db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE sync_status = 'pending'`);
  const [students, periods, payments, adjustments, acks] = await Promise.all(TABLES.map(pending));
  const revs = new Map<string, { table: string; rev: number }>();
  for (const [i, rows] of [students, periods, payments, adjustments, acks].entries()) {
    for (const r of rows!) revs.set(r.id, { table: TABLES[i]!, rev: r.rev });
  }

  const push = {
    students: students!.map((r) => ({
      id: r.id, name: r.name, parentName: r.parent_name, parentPhone: r.parent_phone, school: r.school,
      pickupLocation: r.pickup_location, dropoffLocation: r.dropoff_location, monthlyFee: r.monthly_fee,
      onboardedAt: r.onboarded_at, status: r.status,
    })),
    periods: periods!.map((r) => ({ id: r.id, studentId: r.student_id, year: r.year, month: r.month, amountDue: r.amount_due, cancelled: r.cancelled === 1, origin: r.origin, adjustReason: r.adjust_reason ?? null })),
    payments: payments!.map((r) => ({
      id: r.id, studentId: r.student_id, amount: r.amount, method: r.method, paymentDate: r.payment_date, reference: r.reference,
      note: r.note, source: r.source, createdAt: r.created_at, idempotencyKey: r.idempotency_key, acknowledgementNumber: r.ack_number,
      voidedAt: r.voided_at, voidReason: r.void_reason, correctsPaymentId: r.corrects_payment_id, longOffline: r.long_offline === 1,
      writeOffPeriodId: r.write_off_period_id ?? null,
    })),
    creditAdjustments: adjustments!.map((r) => ({ id: r.id, studentId: r.student_id, type: r.type, amount: r.amount, reason: r.reason, createdAt: r.created_at })),
    acknowledgements: acks!.map((r) => ({
      id: r.id, paymentId: r.payment_id, number: r.number, balanceShown: r.balance_shown, balanceAsOf: r.balance_as_of,
      balanceProvisional: r.balance_provisional === 1, generatedAt: r.generated_at, sharedVia: r.shared_via,
    })),
  };

  const cursor = Number((await getMeta(db, 'cursor')) ?? '0');
  const res = await api<SyncResponse>('/v1/sync', { body: { deviceId, cursor, push }, token, timeoutMs: 60_000 });

  let failed = 0;
  await db.withTransactionAsync(async () => { const tx = db;
    for (const r of res.results) {
      const local = revs.get(r.id);
      if (!local) continue;
      if (r.status === 'rejected') {
        failed++;
        await tx.runAsync(`UPDATE ${local.table} SET sync_status = 'failed', sync_error = ? WHERE id = ? AND rev = ?`, [r.message ?? r.reason ?? 'Rejected', r.id, local.rev]);
      } else if (r.status === 'ignored' && r.reason?.startsWith('duplicate_of:') && local.table === 'payments') {
        await tx.runAsync('DELETE FROM acks WHERE payment_id = ?', [r.id]);
        await tx.runAsync('DELETE FROM payments WHERE id = ?', [r.id]);
      } else if (r.status === 'ignored' && local.table === 'periods') {
        await tx.runAsync(`UPDATE periods SET sync_status = 'local' WHERE id = ? AND rev = ?`, [r.id, local.rev]);
      } else {
        await tx.runAsync(`UPDATE ${local.table} SET sync_status = 'synced', sync_error = NULL WHERE id = ? AND rev = ?`, [r.id, local.rev]);
      }
    }

    for (const s of res.students) {
      await tx.runAsync(
        `INSERT INTO students (id, name, parent_name, parent_phone, school, pickup_location, dropoff_location, monthly_fee, onboarded_at, status, rev, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,'synced')
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent_name=excluded.parent_name, parent_phone=excluded.parent_phone, school=excluded.school,
           pickup_location=excluded.pickup_location, dropoff_location=excluded.dropoff_location, monthly_fee=excluded.monthly_fee,
           onboarded_at=excluded.onboarded_at, status=excluded.status WHERE students.sync_status = 'synced'`,
        [s.id, s.name, s.parentName, s.parentPhone, s.school, s.pickupLocation, s.dropoffLocation, s.monthlyFee, s.onboardedAt, s.status],
      );
    }

    for (const p of res.periods) {
      // The server's period replaces any provisional or superseded local row for the same month (BR-6).
      await tx.runAsync(`DELETE FROM periods WHERE student_id = ? AND year = ? AND month = ? AND id != ? AND sync_status IN ('synced','local')`, [p.studentId, p.year, p.month, p.id]);
      try {
        await tx.runAsync(
          `INSERT INTO periods (id, student_id, year, month, period_start, period_end, due_date, amount_due, cancelled, origin, needs_review, charge_note, rev, sync_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'synced')
           ON CONFLICT(id) DO UPDATE SET amount_due=excluded.amount_due, due_date=excluded.due_date, cancelled=excluded.cancelled, origin=excluded.origin,
             needs_review=excluded.needs_review, charge_note=excluded.charge_note
           WHERE periods.sync_status IN ('synced','local')`,
          [p.id, p.studentId, p.year, p.month, p.periodStart, p.periodEnd, p.dueDate, p.amountDue, p.cancelled ? 1 : 0, p.origin,
            p.needsReview ? 1 : 0, p.chargeNote ?? null],
        );
      } catch {
        // A local change for this month is still waiting to sync; it wins until accepted.
      }
    }

    for (const p of res.payments) {
      await tx.runAsync(
        `INSERT INTO payments (id, student_id, amount, method, payment_date, reference, note, source, created_at, idempotency_key, ack_number,
           long_offline, voided_at, void_reason, corrects_payment_id, write_off_period_id, rev, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'synced')
         ON CONFLICT(id) DO UPDATE SET voided_at=excluded.voided_at, void_reason=excluded.void_reason, ack_number=excluded.ack_number
         WHERE payments.sync_status = 'synced'`,
        [p.id, p.studentId, p.amount, p.method, p.paymentDate, p.reference, p.note, p.source, p.createdAt, p.idempotencyKey,
          p.acknowledgementNumber, p.longOffline ? 1 : 0, p.voidedAt, p.voidReason, p.correctsPaymentId, p.writeOffPeriodId ?? null],
      );
    }

    for (const a of res.creditAdjustments) {
      await tx.runAsync(
        `INSERT OR IGNORE INTO adjustments (id, student_id, type, amount, reason, created_at, rev, sync_status) VALUES (?,?,?,?,?,?,1,'synced')`,
        [a.id, a.studentId, a.type, a.amount, a.reason, a.createdAt],
      );
    }

    for (const k of res.acknowledgements) {
      await tx.runAsync(
        `INSERT INTO acks (id, payment_id, number, balance_shown, balance_as_of, balance_provisional, generated_at, shared_via, rev, sync_status)
         VALUES (?,?,?,?,?,?,?,?,1,'synced')
         ON CONFLICT(id) DO UPDATE SET shared_via=excluded.shared_via WHERE acks.sync_status = 'synced'`,
        [k.id, k.paymentId, k.number, k.balanceShown, k.balanceAsOf, k.balanceProvisional ? 1 : 0, k.generatedAt, k.sharedVia],
      );
    }
  });

  await setMeta(db, 'cursor', String(res.cursor));
  await setMeta(db, 'last_sync_at', new Date().toISOString());
  await setMeta(db, 'settings', JSON.stringify(res.settings));
  return { token: res.token, settings: res.settings, failed };
}
