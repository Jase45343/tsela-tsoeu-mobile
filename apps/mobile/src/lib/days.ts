import type { Lisente } from '@busledger/core';

/** "4/23" (a period's charge note) → { open: 4, normal: 23 } school days. */
export function parseDays(note: string | null | undefined): { open: number; normal: number } | null {
  const m = /^(\d+)\/(\d+)$/.exec(note ?? '');
  return m ? { open: Number(m[1]), normal: Number(m[2]) } : null;
}

/** The fee scaled to the school days the bus runs, in whole maloti. */
export const byDaysAmount = (amount: Lisente, d: { open: number; normal: number }) => Math.round((amount * d.open) / d.normal / 100) * 100;
