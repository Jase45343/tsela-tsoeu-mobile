import type {
  Allocation,
  BillingPeriod,
  CreditAdjustment,
  Lisente,
  Payment,
  PeriodState,
  PeriodStatus,
} from './types';

/**
 * The ledger for one student, computed entirely from recorded facts.
 *
 * Allocation is a pure, deterministic function of the student's periods,
 * non-voided payments and credit adjustments (FR-015). The device runs it to
 * show provisional figures; the server runs the same code to produce the
 * authoritative ones. Same inputs, same output, in any input order.
 */
export interface Ledger {
  allocations: Allocation[];
  periods: Map<string, PeriodState>;
  /** Money received but not yet counted toward any month: paid ahead. (Internally called credit.) */
  credit: Lisente;
  /** How much of each credit adjustment was actually covered by credit. */
  adjustmentsCovered: Map<string, Lisente>;
  /** Credit adjustments that exceed the credit available at their point in the sequence. */
  unfundedAdjustmentIds: string[];
  /** Money received (write-offs excluded). */
  totalRecorded: Lisente;
  totalWrittenOff: Lisente;
}

interface Sink {
  kind: 'period' | 'adjustment';
  id: string;
  sortDate: string; // YYYY-MM-DD
  rank: number; // periods before adjustments on the same date
  tiebreak: string;
  capacity: Lisente;
}

function compareSinks(a: Sink, b: Sink): number {
  if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? -1 : 1;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.tiebreak < b.tiebreak ? -1 : a.tiebreak > b.tiebreak ? 1 : 0;
}

function comparePayments(a: Payment, b: Payment): number {
  if (a.paymentDate !== b.paymentDate) return a.paymentDate < b.paymentDate ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function periodStatusFor(amountDue: Lisente, recorded: Lisente, cancelled: boolean, writtenOff = 0): PeriodStatus {
  if (cancelled) return 'cancelled';
  if (recorded + writtenOff >= amountDue) return 'paid';
  if (recorded > 0 || writtenOff > 0) return 'partial';
  return 'unpaid';
}

export function computeLedger(input: {
  periods: BillingPeriod[];
  payments: Payment[];
  adjustments: CreditAdjustment[];
}): Ledger {
  // Sinks absorb recorded money in chronological order: every non-cancelled
  // period by its start date, and every credit adjustment at the date it was
  // made, so a refund of credit is taken before any later period could use it.
  const allocations: Allocation[] = [];

  // Write-offs first: each forgives part of one specific month, never more than
  // that month's charge, and never turns into paid-ahead money.
  const writtenOff = new Map<string, Lisente>();
  const periodById = new Map(input.periods.map((p) => [p.id, p]));
  let totalWrittenOff = 0;
  for (const w of input.payments.filter((p) => !p.voidedAt && p.source === 'write_off').sort(comparePayments)) {
    const target = w.writeOffPeriodId ? periodById.get(w.writeOffPeriodId) : undefined;
    if (!target || target.cancelled) continue;
    const used = writtenOff.get(target.id) ?? 0;
    const take = Math.min(w.amount, target.amountDue - used);
    if (take <= 0) continue;
    writtenOff.set(target.id, used + take);
    allocations.push({ paymentId: w.id, targetId: target.id, target: 'period', amount: take });
    totalWrittenOff += take;
  }

  const sinks: Sink[] = [];
  for (const p of input.periods) {
    if (p.cancelled) continue;
    sinks.push({ kind: 'period', id: p.id, sortDate: p.periodStart, rank: 0, tiebreak: `${p.periodStart}|${p.id}`, capacity: p.amountDue - (writtenOff.get(p.id) ?? 0) });
  }
  for (const a of input.adjustments) {
    sinks.push({ kind: 'adjustment', id: a.id, sortDate: a.createdAt.slice(0, 10), rank: 1, tiebreak: `${a.createdAt}|${a.id}`, capacity: a.amount });
  }
  sinks.sort(compareSinks);

  const payments = input.payments.filter((p) => !p.voidedAt && p.source !== 'write_off').sort(comparePayments);

  const filled = new Map<string, Lisente>();
  let cursor = 0;
  let totalRecorded = 0;
  let unallocated = 0;

  for (const pay of payments) {
    totalRecorded += pay.amount;
    let remaining = pay.amount;
    while (remaining > 0 && cursor < sinks.length) {
      const sink = sinks[cursor]!;
      const used = filled.get(sink.id) ?? 0;
      const room = sink.capacity - used;
      if (room <= 0) {
        cursor++;
        continue;
      }
      const take = Math.min(room, remaining);
      filled.set(sink.id, used + take);
      allocations.push({ paymentId: pay.id, targetId: sink.id, target: sink.kind, amount: take });
      remaining -= take;
      if (take === room) cursor++;
    }
    unallocated += remaining;
  }

  const periods = new Map<string, PeriodState>();
  for (const p of input.periods) {
    const recorded = p.cancelled ? 0 : filled.get(p.id) ?? 0;
    const off = p.cancelled ? 0 : writtenOff.get(p.id) ?? 0;
    periods.set(p.id, {
      periodId: p.id,
      amountRecorded: recorded,
      writtenOff: off,
      balance: p.cancelled ? 0 : p.amountDue - recorded - off,
      status: periodStatusFor(p.amountDue, recorded, p.cancelled, off),
    });
  }

  const adjustmentsCovered = new Map<string, Lisente>();
  const unfundedAdjustmentIds: string[] = [];
  for (const a of input.adjustments) {
    const covered = filled.get(a.id) ?? 0;
    adjustmentsCovered.set(a.id, covered);
    if (covered < a.amount) unfundedAdjustmentIds.push(a.id);
  }

  return { allocations, periods, credit: unallocated, adjustmentsCovered, unfundedAdjustmentIds, totalRecorded, totalWrittenOff };
}

/**
 * Credit available for a new adjustment right now: the ledger's current credit.
 * FR-039: a credit adjustment may not exceed this.
 */
export function availableCredit(ledger: Ledger): Lisente {
  return ledger.credit;
}
