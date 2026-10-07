import type { StudentAccount } from './accounts';
import { compareMonths, monthKey } from './dates';
import type { CreditAdjustment, ISODate, Lisente, Payment } from './types';

export interface MonthSummary {
  year: number;
  month: number;
  activeStudents: number;
  paid: number;
  partial: number;
  unpaid: number;
  cancelled: number;
  /** Sum of amount due on this month's periods. */
  expected: Lisente;
  /** Sum recorded against this month's periods (after FIFO allocation). */
  recorded: Lisente;
  /** expected − recorded for this month's periods. */
  outstanding: Lisente;
  /** Cash received in this month, whichever periods it paid for. */
  received: Lisente;
  /** Balances on overdue periods from earlier months. */
  arrearsEarlier: Lisente;
  /** Credit held across all students. */
  totalCredit: Lisente;
  creditAdjustmentsCount: number;
  creditAdjustmentsTotal: Lisente;
  /** True if any figure includes a provisional period. */
  provisional: boolean;
}

/** FR-020 dashboard and FR-027 monthly report. */
export function summarizeMonth(accounts: StudentAccount[], year: number, month: number): MonthSummary {
  const key = monthKey(year, month);
  const s: MonthSummary = {
    year,
    month,
    activeStudents: 0,
    paid: 0,
    partial: 0,
    unpaid: 0,
    cancelled: 0,
    expected: 0,
    recorded: 0,
    outstanding: 0,
    received: 0,
    arrearsEarlier: 0,
    totalCredit: 0,
    creditAdjustmentsCount: 0,
    creditAdjustmentsTotal: 0,
    provisional: false,
  };

  for (const acc of accounts) {
    if (acc.student.status === 'active') s.activeStudents++;
    s.totalCredit += acc.credit;

    for (const v of acc.periods) {
      const cmp = compareMonths(v.period, { year, month });
      if (cmp === 0) {
        if (v.period.origin === 'provisional') s.provisional = true;
        if (v.state.status === 'cancelled') {
          s.cancelled++;
          continue;
        }
        s.expected += v.period.amountDue;
        s.recorded += v.state.amountRecorded;
        s.outstanding += v.state.balance;
        if (v.state.status === 'paid') s.paid++;
        else if (v.state.status === 'partial') s.partial++;
        else s.unpaid++;
      } else if (cmp < 0 && v.overdue) {
        s.arrearsEarlier += v.state.balance;
      }
    }

    for (const p of acc.payments) {
      if (!p.voidedAt && p.paymentDate.startsWith(key)) s.received += p.amount;
    }
    for (const a of acc.adjustments) {
      if (a.createdAt.startsWith(key)) {
        s.creditAdjustmentsCount++;
        s.creditAdjustmentsTotal += a.amount;
      }
    }
  }
  return s;
}

export interface DailyReport {
  date: ISODate;
  count: number;
  total: Lisente;
  byMethod: { method: string; count: number; total: Lisente }[];
}

/** FR-026: payment records dated on a given day (voided records excluded). */
export function dailyReport(payments: Payment[], date: ISODate): DailyReport {
  const methods = new Map<string, { count: number; total: Lisente }>();
  let count = 0;
  let total = 0;
  for (const p of payments) {
    if (p.voidedAt || p.paymentDate !== date) continue;
    count++;
    total += p.amount;
    const m = methods.get(p.method) ?? { count: 0, total: 0 };
    m.count++;
    m.total += p.amount;
    methods.set(p.method, m);
  }
  const byMethod = [...methods.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.total - a.total || a.method.localeCompare(b.method));
  return { date, count, total, byMethod };
}

export interface HistoryFilter {
  from?: ISODate;
  to?: ISODate;
  studentId?: string;
  method?: string;
  /** Only payments allocated (in whole or part) to this period. */
  periodId?: string;
  includeVoided?: boolean;
}

/** FR-028: filter payment history. */
export function filterPayments(accounts: StudentAccount[], f: HistoryFilter): Payment[] {
  const out: Payment[] = [];
  for (const acc of accounts) {
    if (f.studentId && acc.student.id !== f.studentId) continue;
    const inPeriod = f.periodId
      ? new Set(acc.ledger.allocations.filter((a) => a.targetId === f.periodId).map((a) => a.paymentId))
      : null;
    for (const p of acc.payments) {
      if (!f.includeVoided && p.voidedAt) continue;
      if (f.from && p.paymentDate < f.from) continue;
      if (f.to && p.paymentDate > f.to) continue;
      if (f.method && p.method !== f.method) continue;
      if (inPeriod && !inPeriod.has(p.id)) continue;
      out.push(p);
    }
  }
  return out.sort((a, b) => (a.paymentDate === b.paymentDate ? (a.createdAt < b.createdAt ? 1 : -1) : a.paymentDate < b.paymentDate ? 1 : -1));
}

export function sumAdjustments(adjustments: CreditAdjustment[]): Lisente {
  return adjustments.reduce((t, a) => t + a.amount, 0);
}
