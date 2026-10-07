import type { StudentAccount } from '@busledger/core';

export function matchesStudent(a: StudentAccount, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/\s/g, '');
  return [a.student.name, a.student.parentName, a.student.parentPhone].some((v) => v.toLowerCase().replace(/\s/g, '').includes(needle));
}
