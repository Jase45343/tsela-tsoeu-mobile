import { computeLedger, type Ledger } from './allocation';
import { addDays, diffDays, parts } from './dates';
import { isUpcoming } from './charges';
import type {
  AccountStatus,
  BillingPeriod,
  CreditAdjustment,
  ISODate,
  Lisente,
  OperatorSettings,
  Payment,
  PeriodState,
  Student,
} from './types';

/** FR-019: overdue once today is past due date + grace days and a balance remains. */
export function isOverdue(period: BillingPeriod, state: PeriodState, today: ISODate, graceDays: number): boolean {
  if (period.cancelled || state.balance <= 0 || isUpcoming(period, today)) return false;
  return today > addDays(period.dueDate, graceDays);
}

export function daysOverdue(period: BillingPeriod, state: PeriodState, today: ISODate, graceDays: number): number {
  if (!isOverdue(period, state, today, graceDays)) return 0;
  return diffDays(addDays(period.dueDate, graceDays), today);
}

export interface PeriodView {
  period: BillingPeriod;
  state: PeriodState;
  overdue: boolean;
  daysOverdue: number;
  /** The month has not begun yet, so nothing is owed for it. */
  upcoming: boolean;
}

export interface StudentAccount {
  student: Student;
  ledger: Ledger;
  /** Periods newest first. */
  periods: PeriodView[];
  payments: Payment[];
  adjustments: CreditAdjustment[];
  /** Sum of balances on unpaid / partially paid periods that have begun. */
  outstanding: Lisente;
  /** Sum of balances on overdue periods. */
  arrears: Lisente;
  /** Paid ahead and not yet counted toward any month (can be returned to the parent). */
  credit: Lisente;
  /** Paid towards months that have not begun yet. */
  prepaid: Lisente;
  /** Everything the family has paid ahead: credit + prepaid. Shown to drivers as "Paid ahead". */
  paidAhead: Lisente;
  /** Owed but forgiven by the driver, across all months. */
  writtenOff: Lisente;
  /** outstanding − credit − prepaid; negative means the family is ahead. */
  net: Lisente;
  status: AccountStatus;
  maxDaysOverdue: number;
  /** True if any figure depends on a period created provisionally on this device. */
  hasProvisionalPeriods: boolean;
}

export function accountStatusFor(arrears: Lisente, credit: Lisente): AccountStatus {
  if (arrears > 0) return 'in_arrears';
  if (credit > 0) return 'in_advance';
  return 'current';
}

export function buildStudentAccount(args: {
  student: Student;
  periods: BillingPeriod[];
  payments: Payment[];
  adjustments: CreditAdjustment[];
  today: ISODate;
  settings: OperatorSettings;
}): StudentAccount {
  const { student, periods, payments, adjustments, today, settings } = args;
  const ledger = computeLedger({ periods, payments, adjustments });

  const views: PeriodView[] = periods
    .map((period) => {
      const state = ledger.periods.get(period.id)!;
      return {
        period,
        state,
        overdue: isOverdue(period, state, today, settings.graceDays),
        daysOverdue: daysOverdue(period, state, today, settings.graceDays),
        upcoming: isUpcoming(period, today),
      };
    })
    .sort((a, b) => (a.period.periodStart < b.period.periodStart ? 1 : -1));

  let outstanding = 0;
  let arrears = 0;
  let prepaid = 0;
  let maxDays = 0;
  for (const v of views) {
    if (v.upcoming) {
      prepaid += v.state.amountRecorded;
      continue;
    }
    if (v.state.status === 'unpaid' || v.state.status === 'partial') outstanding += v.state.balance;
    if (v.overdue) {
      arrears += v.state.balance;
      maxDays = Math.max(maxDays, v.daysOverdue);
    }
  }

  return {
    student,
    ledger,
    periods: views,
    payments: [...payments].sort((a, b) => (a.paymentDate === b.paymentDate ? (a.createdAt < b.createdAt ? 1 : -1) : a.paymentDate < b.paymentDate ? 1 : -1)),
    adjustments: [...adjustments].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    outstanding,
    arrears,
    credit: ledger.credit,
    prepaid,
    paidAhead: ledger.credit + prepaid,
    writtenOff: ledger.totalWrittenOff,
    net: outstanding - ledger.credit - prepaid,
    status: accountStatusFor(arrears, ledger.credit + prepaid),
    maxDaysOverdue: maxDays,
    hasProvisionalPeriods: periods.some((p) => p.origin === 'provisional'),
  };
}

/** Group flat tables by student and build every account. */
export function buildBook(args: {
  students: Student[];
  periods: BillingPeriod[];
  payments: Payment[];
  adjustments: CreditAdjustment[];
  today: ISODate;
  settings: OperatorSettings;
}): StudentAccount[] {
  const by = <T extends { studentId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.studentId);
      if (list) list.push(r);
      else m.set(r.studentId, [r]);
    }
    return m;
  };
  const periods = by(args.periods);
  const payments = by(args.payments);
  const adjustments = by(args.adjustments);
  return args.students.map((student) =>
    buildStudentAccount({
      student,
      periods: periods.get(student.id) ?? [],
      payments: payments.get(student.id) ?? [],
      adjustments: adjustments.get(student.id) ?? [],
      today: args.today,
      settings: args.settings,
    }),
  );
}

/** The period for a given month, if the student has one. */
export function periodForMonth(account: StudentAccount, year: number, month: number): PeriodView | undefined {
  return account.periods.find((v) => v.period.year === year && v.period.month === month);
}

/** Sort for the "who owes" list: most days overdue, then largest balance. */
export function compareByUrgency(a: StudentAccount, b: StudentAccount): number {
  if (a.maxDaysOverdue !== b.maxDaysOverdue) return b.maxDaysOverdue - a.maxDaysOverdue;
  if (a.net !== b.net) return b.net - a.net;
  return a.student.name.localeCompare(b.student.name);
}

export function currentMonth(today: ISODate): { year: number; month: number } {
  const { year, month } = parts(today);
  return { year, month };
}
