import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { compareByUrgency, currentMonth, formatMaloti, formatMonth, summarizeMonth } from '@busledger/core';
import { useMemo } from 'react';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { Btn, Divider, Figure, ListRow, Screen, SectionTitle, Sheet, StatusTag, Txt } from '../../src/ui/kit';
import { SyncLine } from '../../src/ui/SyncLine';
import { color, space } from '../../src/ui/theme';

/** FR-020: who has paid, who hasn't, how much, and what is still owed. */
export default function Home() {
  const app = useApp();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const { year, month } = currentMonth(app.today);
  const s = useMemo(() => summarizeMonth(app.accounts, year, month), [app.accounts, year, month]);
  const owing = useMemo(() => app.accounts.filter((a) => a.student.status === 'active' && a.arrears > 0).sort(compareByUrgency).slice(0, 5), [app.accounts]);
  const monthLabel = formatMonth(year, month, lang);
  const star = s.provisional || app.pendingCount > 0;

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <Screen footer={<Btn kind="primary" icon="cash-plus" label={t('recordPayment')} onPress={() => router.push('/record')} />}>
        <View style={{ gap: 2 }}>
          <Txt variant="title">{monthLabel}</Txt>
          <Txt tone={color.inkSoft}>{app.settings.businessName || app.profile?.name}</Txt>
        </View>
        <SyncLine />

        <Sheet>
          <Txt bold>{t('studentsCount', { n: s.activeStudents })}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <StatusTag tag="paid" label={`${s.paid} ${t('paid')}`} />
            <StatusTag tag="partial" label={`${s.partial} ${t('partial')}`} />
            <StatusTag tag="unpaid" label={`${s.unpaid} ${t('unpaid')}`} />
            {s.cancelled ? <StatusTag tag="cancelled" label={`${s.cancelled} ${t('cancelled')}`} /> : null}
          </View>
          <Divider />
          <Figure label={t('outstandingFor', { month: monthLabel })} value={formatMaloti(s.outstanding)} tone={s.outstanding > 0 ? color.owing : color.paid} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <View style={{ flex: 1 }}><Figure label={t('expected', { month: monthLabel })} value={formatMaloti(s.expected)} /></View>
            <View style={{ flex: 1 }}><Figure label={t('recordedFor', { month: monthLabel })} value={formatMaloti(s.recorded)} /></View>
          </View>
          <Divider />
          <Figure label={t('arrearsEarlier')} value={formatMaloti(s.arrearsEarlier)} tone={s.arrearsEarlier > 0 ? color.owing : color.ink} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <View style={{ flex: 1 }}><Figure label={t('receivedIn', { month: monthLabel })} value={formatMaloti(s.received)} /></View>
            <View style={{ flex: 1 }}><Figure label={t('creditHeld')} value={formatMaloti(s.totalCredit)} /></View>
          </View>
          {star ? <Txt variant="small" tone={color.inkSoft}>{t('provisionalNote')}</Txt> : null}
        </Sheet>

        <SectionTitle>{t('mostOverdue')}</SectionTitle>
        <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {owing.length === 0 ? (
            <View style={{ padding: space.lg }}><StatusTag tag="current" label={t('nobodyOverdue')} /></View>
          ) : owing.map((a, i) => (
            <View key={a.student.id}>
              {i ? <Divider /> : null}
              <ListRow
                title={a.student.name}
                subtitle={t('daysOverdue', { n: a.maxDaysOverdue })}
                right={<Txt bold tone={color.owing}>{formatMaloti(a.net)}</Txt>}
                onPress={() => router.push(`/student/${a.student.id}`)}
              />
            </View>
          ))}
        </Sheet>
        <Btn kind="quiet" label={t('seeAll')} onPress={() => router.push('/students')} />
      </Screen>
    </View>
  );
}
