import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBook,
  buildPeriod,
  coveredUntil,
  DEFAULT_BILLING_RULES,
  DEFAULT_SETTINGS,
  forecastStudent,
  outlookForMonth,
  type Student,
} from '../src/index';

const M = (m: number) => m * 100;
const today = '2026-10-11';
const student = (id: string, over: Partial<Student> = {}): Student => ({
  id, name: id, parentName: 'P', parentPhone: '+26658123456', school: 'Maseru Prep', pickupLocation: '', dropoffLocation: '',
  monthlyFee: M(1500), onboardedAt: '2026-10-01', status: 'active', ...over,
});
const oct = (sid: string) => buildPeriod({ id: `${sid}-oct`, studentId: sid, year: 2026, month: 10, amountDue: M(1500), dueDay: 1, origin: 'server' });
const pay = (sid: string, amount: number) => ({ id: `${sid}-pay`, studentId: sid, amount, method: 'Cash', paymentDate: '2026-10-05', source: 'manual' as const, createdAt: '2026-10-05T08:00:00Z' });

const book = (rules = DEFAULT_BILLING_RULES) =>
  buildBook({
    students: [student('mpho'), student('lineo'), student('thabo', { onboardedAt: '2026-12-02' })],
    periods: [oct('mpho'), oct('lineo'), { ...buildPeriod({ id: 'thabo-dec', studentId: 'thabo', year: 2026, month: 12, amountDue: M(1000), dueDay: 1, origin: 'onboarding' }), dueDate: '2026-12-02' }],
    payments: [pay('mpho', M(4500)), pay('lineo', M(1500))],
    adjustments: [],
    today,
    settings: DEFAULT_SETTINGS,
  });

describe('coming months', () => {
  it('shows a parent who paid three months as covered to December', () => {
    const mpho = book().find((a) => a.student.id === 'mpho')!;
    const f = forecastStudent(mpho, today, DEFAULT_BILLING_RULES, 4);
    assert.deepEqual(f.map((x) => [x.month, x.covered, x.toCollect, x.estimate]), [
      [11, M(1500), 0, true],
      [12, M(1500), 0, true],
      [1, 0, M(1500), true],
      [2, 0, M(1500), true],
    ]);
    assert.deepEqual(coveredUntil(f), { year: 2026, month: 12 });
    assert.equal(mpho.paidAhead, M(3000));
  });

  it('nothing covered ahead → no coverage month', () => {
    const lineo = book().find((a) => a.student.id === 'lineo')!;
    assert.equal(coveredUntil(forecastStudent(lineo, today, DEFAULT_BILLING_RULES)), null);
  });

  it('uses the real charge for months that already exist and skips months before a student starts', () => {
    const thabo = book().find((a) => a.student.id === 'thabo')!;
    const f = forecastStudent(thabo, today, DEFAULT_BILLING_RULES, 3);
    assert.deepEqual(f.map((x) => [x.month, x.charge, x.estimate]), [[12, M(1000), false], [1, M(1500), true]]);
  });

  it('estimates holiday months with the driver\'s rule', () => {
    const rules = { ...DEFAULT_BILLING_RULES, holidayRule: 'by_days' as const, closures: [{ id: 'c', school: 'Maseru Prep', from: '2026-12-05', to: '2027-01-18', label: '' }] };
    const mpho = book(rules).find((a) => a.student.id === 'mpho')!;
    const f = forecastStudent(mpho, today, rules, 3);
    // Nov M1500, Dec 4/23 → M261, so M3000 paid ahead reaches into January (9/21 → M643).
    assert.deepEqual(f.map((x) => [x.month, x.charge, x.covered]), [[11, M(1500), M(1500)], [12, M(261), M(261)], [1, M(643), M(643)]]);
  });

  it('totals a future month across students', () => {
    const o = outlookForMonth(book(), 2026, 12, today, DEFAULT_BILLING_RULES);
    assert.equal(o.students, 3);
    assert.equal(o.expected, M(1500) + M(1500) + M(1000));
    assert.equal(o.covered, M(1500));
    assert.equal(o.toCollect, M(2500));
    assert.deepEqual([o.fullyCovered, o.partlyCovered, o.notCovered], [1, 0, 2]);
    assert.equal(o.rows[0]!.account.student.id, 'mpho');
    assert.equal(outlookForMonth(book(), 2026, 10, today, DEFAULT_BILLING_RULES).students, 0); // not a future month
  });
});
