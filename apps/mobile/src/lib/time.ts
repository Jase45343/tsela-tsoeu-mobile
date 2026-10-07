import { formatDateLong, type Lang } from '@busledger/core';
import { translate } from './i18n';

export function ago(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return translate(lang, 'justNow');
  if (mins < 60) return translate(lang, 'minutesAgo', { n: mins });
  const h = Math.floor(mins / 60);
  if (h < 24) return translate(lang, 'hoursAgo', { n: h });
  return translate(lang, 'daysAgo', { n: Math.floor(h / 24) });
}

/** "6 October 2026, 14:05" in Maseru time (UTC+2). */
export function dateTimeLabel(iso: string, lang: Lang): string {
  const local = new Date(Date.parse(iso) + 2 * 3_600_000).toISOString();
  return `${formatDateLong(local.slice(0, 10), lang)}, ${local.slice(11, 16)}`;
}
