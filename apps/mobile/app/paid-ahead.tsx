import { useMemo } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { coveredUntil, forecastStudent, formatMaloti, formatMonth } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { useT } from '../src/lib/i18n';
import { Divider, Figure, ListRow, Screen, Sheet, Txt } from '../src/ui/kit';
import { color, space } from '../src/ui/theme';

/** Every family with money paid ahead: how much, and how far it reaches. */
export default function PaidAhead() {
  const app = useApp();
  const { t, lang } = useT();
  const rows = useMemo(
    () => app.accounts
      .filter((a) => a.paidAhead > 0)
      .map((a) => ({ a, until: coveredUntil(forecastStudent(a, app.today, app.settings)) }))
      .sort((x, y) => y.a.paidAhead - x.a.paidAhead),
    [app.accounts, app.today, app.settings],
  );
  const total = rows.reduce((s, r) => s + r.a.paidAhead, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('paidAheadList') }} />
      <Txt tone={color.inkSoft}>{t('paidAheadListHint')}</Txt>
      <Sheet><Figure label={t('paidAheadTotal')} value={formatMaloti(total)} tone={total ? color.paid : color.ink} /></Sheet>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? <View style={{ padding: space.lg }}><Txt tone={color.inkSoft}>{t('nobodyPaidAhead')}</Txt></View> : null}
        {rows.map(({ a, until }, i) => (
          <View key={a.student.id}>
            {i ? <Divider /> : null}
            <ListRow
              title={a.student.name}
              subtitle={until ? t('coveredUntil', { month: formatMonth(until.year, until.month, lang) }) : t('coversNextOnly')}
              right={<Txt bold tone={color.paid}>{formatMaloti(a.paidAhead)}</Txt>}
              onPress={() => router.push(`/student/${a.student.id}`)}
            />
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}
