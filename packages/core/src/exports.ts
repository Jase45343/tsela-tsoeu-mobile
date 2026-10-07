import type { StudentAccount } from './accounts';
import { csvAmount, toCsv } from './csv';

/** FR-029 exports, shared by the app (offline) and the server. */
export function studentsCsv(accounts: StudentAccount[]): string {
  return toCsv(accounts, [
    { header: 'student_id', value: (a) => a.student.id },
    { header: 'name', value: (a) => a.student.name },
    { header: 'parent_name', value: (a) => a.student.parentName },
    { header: 'parent_phone', value: (a) => a.student.parentPhone },
    { header: 'school', value: (a) => a.student.school },
    { header: 'pickup', value: (a) => a.student.pickupLocation },
    { header: 'dropoff', value: (a) => a.student.dropoffLocation },
    { header: 'monthly_fee', value: (a) => csvAmount(a.student.monthlyFee) },
    { header: 'onboarded', value: (a) => a.student.onboardedAt },
    { header: 'status', value: (a) => a.student.status },
    { header: 'outstanding', value: (a) => csvAmount(a.outstanding) },
    { header: 'arrears', value: (a) => csvAmount(a.arrears) },
    { header: 'credit', value: (a) => csvAmount(a.credit) },
    { header: 'account_status', value: (a) => a.status },
  ]);
}

export function paymentsCsv(accounts: StudentAccount[]): string {
  const rows = accounts.flatMap((a) => {
    const periodLabel = new Map(a.periods.map((v) => [v.period.id, `${v.period.year}-${String(v.period.month).padStart(2, '0')}`]));
    return a.payments.map((p) => {
      const allocated = a.ledger.allocations
        .filter((x) => x.paymentId === p.id)
        .map((x) => `${x.target === 'period' ? periodLabel.get(x.targetId) ?? x.targetId : 'adjustment'}:${csvAmount(x.amount)}`)
        .join(' ');
      return { a, p, allocated };
    });
  });
  return toCsv(rows, [
    { header: 'payment_id', value: (r) => r.p.id },
    { header: 'acknowledgement', value: (r) => r.p.acknowledgementNumber },
    { header: 'student', value: (r) => r.a.student.name },
    { header: 'amount', value: (r) => csvAmount(r.p.amount) },
    { header: 'method', value: (r) => r.p.method },
    { header: 'payment_date', value: (r) => r.p.paymentDate },
    { header: 'reference', value: (r) => r.p.reference },
    { header: 'note', value: (r) => r.p.note },
    { header: 'source', value: (r) => r.p.source },
    { header: 'recorded_at', value: (r) => r.p.createdAt },
    { header: 'voided_at', value: (r) => r.p.voidedAt },
    { header: 'void_reason', value: (r) => r.p.voidReason },
    { header: 'corrects_payment_id', value: (r) => r.p.correctsPaymentId },
    { header: 'allocated_to', value: (r) => r.allocated },
  ]);
}

export function creditAdjustmentsCsv(accounts: StudentAccount[]): string {
  const rows = accounts.flatMap((a) => a.adjustments.map((adj) => ({ a, adj })));
  return toCsv(rows, [
    { header: 'adjustment_id', value: (r) => r.adj.id },
    { header: 'student', value: (r) => r.a.student.name },
    { header: 'type', value: (r) => r.adj.type },
    { header: 'amount', value: (r) => csvAmount(r.adj.amount) },
    { header: 'reason', value: (r) => r.adj.reason },
    { header: 'created_at', value: (r) => r.adj.createdAt },
  ]);
}
