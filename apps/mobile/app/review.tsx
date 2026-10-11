import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatMaloti, formatMonth } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { useT } from '../src/lib/i18n';
import { Btn, Divider, ListRow, Screen, Sheet, StatusTag, Txt } from '../src/ui/kit';
import { color, space } from '../src/ui/theme';
import { byDaysAmount, parseDays } from '../src/lib/days';

/**
 * Holiday months the driver's "half or ask" rule leaves for them to decide,
 * grouped by month and school so a whole school can be settled in one tap.
 */
export default function Review() {
  const app = useApp();
  const { t, lang } = useT();
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; year: number; month: number; school: string; days: { open: number; normal: number } | null; items: typeof app.toReview }>();
    for (const item of app.toReview) {
      const p = item.view.period;
      const school = item.account.student.school.trim();
      const key = `${p.year}-${p.month}|${school.toLowerCase()}`;
      const g = map.get(key) ?? { key, year: p.year, month: p.month, school, days: parseDays(p.chargeNote), items: [] };
      g.items.push(item);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month || a.school.localeCompare(b.school));
  }, [app.toReview]);

  const applyAll = async (g: (typeof groups)[number], choice: 'full' | 'days' | 'free') => {
    setBusy(`${g.key}:${choice}`);
    const label = choice === 'full' ? t('choiceFull') : choice === 'free' ? t('choiceFree') : t('choiceProrata');
    const changes = g.items.map(({ view }) => ({
      periodId: view.period.id,
      amount: choice === 'free' ? 0 : choice === 'days' && g.days ? byDaysAmount(view.period.amountDue, g.days) : view.period.amountDue,
    }));
    await app.adjustCharges(changes, t('holidayReason', { choice: label }));
    setBusy(null);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('reviewTitle') }} />
      {groups.length === 0 ? <StatusTag tag="paid" label={t('nothingToReview')} /> : <Txt tone={color.inkSoft}>{t('reviewHint')}</Txt>}
      {groups.map((g) => (
        <Sheet key={g.key}>
          <View style={{ gap: 2 }}>
            <Txt variant="heading" bold>{`${formatMonth(g.year, g.month, lang)} · ${g.school || t('noSchool')}`}</Txt>
            {g.days ? <Txt variant="small" tone={color.inkSoft}>{t('daysRun', { open: g.days.open, normal: g.days.normal })}</Txt> : null}
          </View>
          <View style={{ gap: space.sm }}>
            <Btn kind="secondary" label={t('allFull')} busy={busy === `${g.key}:full`} onPress={() => void applyAll(g, 'full')} />
            {g.days ? <Btn kind="secondary" label={t('allByDays')} busy={busy === `${g.key}:days`} onPress={() => void applyAll(g, 'days')} /> : null}
            <Btn kind="secondary" label={t('allFree')} busy={busy === `${g.key}:free`} onPress={() => void applyAll(g, 'free')} />
          </View>
          <View style={{ marginHorizontal: -space.lg }}>
            {g.items.map(({ account, view }) => (
              <View key={view.period.id}>
                <Divider />
                <ListRow title={account.student.name} subtitle={t('currentCharge', { amount: formatMaloti(view.period.amountDue) })}
                  onPress={() => router.push(`/charge?periodId=${view.period.id}`)} />
              </View>
            ))}
          </View>
        </Sheet>
      ))}
    </Screen>
  );
}
