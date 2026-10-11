import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  compareMonths, dailyReport, filterPayments, formatDateLong, formatMaloti, formatMonth, makeDate, daysInMonth, nextMonth, outlookForMonth, parts, prevMonth, summarizeMonth,
  FORECAST_MONTHS,
} from '@busledger/core';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { shareCsv } from '../../src/lib/share';
import { Btn, Chip, ChipRow, DateChooser, Divider, Figure, ListRow, Screen, SectionTitle, Sheet, StatusTag, Txt } from '../../src/ui/kit';
import { color, space } from '../../src/ui/theme';

/** FR-026 daily, FR-027 monthly, FR-028 history with filters, FR-029 export. All computed on the phone, so they work offline. */
export default function Reports() {
  const app = useApp();
  const { t, lang } = useT();
  const [view, setView] = useState<'day' | 'month'>('day');
  const [day, setDay] = useState(app.today);
  const [ym, setYm] = useState(() => { const p = parts(app.today); return { year: p.year, month: p.month }; });
  const [method, setMethod] = useState<string | null>(null);

  const allPayments = useMemo(() => app.accounts.flatMap((a) => a.payments), [app.accounts]);
  const daily = useMemo(() => dailyReport(allPayments, day), [allPayments, day]);
  const monthly = useMemo(() => summarizeMonth(app.accounts, ym.year, ym.month), [app.accounts, ym]);
  const history = useMemo(() => filterPayments(app.accounts, {
    from: view === 'day' ? day : makeDate(ym.year, ym.month, 1),
    to: view === 'day' ? day : makeDate(ym.year, ym.month, daysInMonth(ym.year, ym.month)),
    method: method ?? undefined,
  }), [app.accounts, view, day, ym, method]);
  const names = useMemo(() => new Map(app.accounts.map((a) => [a.student.id, a.student.name])), [app.accounts]);
  const current = parts(app.today);
  const ahead = (ym.year - current.year) * 12 + (ym.month - current.month);
  const future = compareMonths(ym, current) > 0;
  const outlook = useMemo(() => (future ? outlookForMonth(app.accounts, ym.year, ym.month, app.today, app.settings) : null), [future, app.accounts, ym, app.today, app.settings]);

  return (
    <Screen>
      <ChipRow>
        <Chip label={t('day')} selected={view === 'day'} onPress={() => setView('day')} />
        <Chip label={t('month')} selected={view === 'month'} onPress={() => setView('month')} />
      </ChipRow>

      {view === 'day' ? (
        <>
          <DateChooser label={t('day')} value={day} onChange={setDay} today={app.today} />
          <Sheet>
            <Txt variant="heading" bold>{formatDateLong(day, lang)}</Txt>
            <Figure label={t('totalRecorded')} value={formatMaloti(daily.total)} note={t('recordsCount', { n: daily.count })} />
            {daily.count === 0 ? <Txt tone={color.inkSoft}>{t('noRecordsDay')}</Txt> : (
              <>
                <Divider />
                <Txt variant="label" bold>{t('byMethod')}</Txt>
                {daily.byMethod.map((m) => (
                  <View key={m.method} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt>{m.method} ({m.count})</Txt><Txt bold>{formatMaloti(m.total)}</Txt>
                  </View>
                ))}
              </>
            )}
          </Sheet>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Btn kind="quiet" icon="chevron-left" label="" onPress={() => setYm(prevMonth(ym.year, ym.month))} />
            <Txt variant="heading" bold>{formatMonth(ym.year, ym.month, lang)}</Txt>
            <Btn kind="quiet" icon="chevron-right" label="" disabled={ahead >= FORECAST_MONTHS} onPress={() => setYm(nextMonth(ym.year, ym.month))} />
          </View>
          {outlook ? (
            <>
              <Sheet>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  <StatusTag tag="paid" label={t('nCovered', { n: outlook.fullyCovered })} />
                  {outlook.partlyCovered ? <StatusTag tag="partial" label={t('nPartly', { n: outlook.partlyCovered })} /> : null}
                  <StatusTag tag="cancelled" label={t('nNotYet', { n: outlook.notCovered })} />
                </View>
                <Figure label={t('expectedIn', { month: formatMonth(ym.year, ym.month, lang) })} value={formatMaloti(outlook.expected)} />
                <Figure label={t('alreadyPaidAhead')} value={formatMaloti(outlook.covered)} tone={outlook.covered ? color.paid : color.ink} />
                <Figure label={t('stillToCollect')} value={formatMaloti(outlook.toCollect)} />
                {outlook.needsDecision ? <Txt variant="small" tone={color.partial}>{t('nDecide', { n: outlook.needsDecision })}</Txt> : null}
                {outlook.estimate ? <Txt variant="small" tone={color.inkSoft}>{t('forecastNote')}</Txt> : null}
              </Sheet>
              <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
                {outlook.rows.map(({ account, forecast: f }, i) => (
                  <View key={account.student.id}>
                    {i ? <Divider /> : null}
                    <ListRow
                      title={account.student.name}
                      subtitle={f.toCollect === 0 ? t('coveredFull') : f.covered ? t('coveredPart', { covered: formatMaloti(f.covered), charge: formatMaloti(f.charge) }) : t('toCollect', { amount: formatMaloti(f.toCollect) })}
                      right={f.toCollect === 0 ? <StatusTag tag="paid" label={t('coveredFull')} /> : <Txt variant="label" bold>{formatMaloti(f.toCollect)}</Txt>}
                      onPress={() => router.push(`/student/${account.student.id}`)}
                    />
                  </View>
                ))}
              </Sheet>
            </>
          ) : (
          <Sheet>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <StatusTag tag="paid" label={`${monthly.paid} ${t('paid')}`} />
              <StatusTag tag="partial" label={`${monthly.partial} ${t('partial')}`} />
              <StatusTag tag="unpaid" label={`${monthly.unpaid} ${t('unpaid')}`} />
              {monthly.cancelled ? <StatusTag tag="cancelled" label={`${monthly.cancelled} ${t('cancelled')}`} /> : null}
            </View>
            <Figure label={t('expected', { month: formatMonth(ym.year, ym.month, lang) })} value={formatMaloti(monthly.expected)} />
            <Figure label={t('recordedFor', { month: formatMonth(ym.year, ym.month, lang) })} value={formatMaloti(monthly.recorded)} />
            <Figure label={t('outstandingFor', { month: formatMonth(ym.year, ym.month, lang) })} value={formatMaloti(monthly.outstanding)} tone={monthly.outstanding ? color.owing : color.paid} />
            <Figure label={t('receivedIn', { month: formatMonth(ym.year, ym.month, lang) })} value={formatMaloti(monthly.received)} />
            {monthly.writtenOff ? <Figure label={t('writtenOff')} value={formatMaloti(monthly.writtenOff)} /> : null}
            {monthly.creditAdjustmentsCount ? <Figure label={t('exportReturned')} value={formatMaloti(monthly.creditAdjustmentsTotal)} /> : null}
          </Sheet>
          )}
        </>
      )}

      <Btn kind="secondary" icon="calendar-arrow-right" label={t('paidAheadList')} onPress={() => router.push('/paid-ahead')} />

      {view === 'month' && future ? null : (
        <>
      <SectionTitle>{t('history')}</SectionTitle>
      <ChipRow>
        <Chip label={t('filterAll')} selected={!method} onPress={() => setMethod(null)} />
        {app.settings.paymentMethods.map((m) => <Chip key={m} label={m} selected={method === m} onPress={() => setMethod(m)} />)}
      </ChipRow>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {history.length === 0 ? <View style={{ padding: space.lg }}><Txt tone={color.inkSoft}>{t('noRecordsDay')}</Txt></View> : null}
        {history.map((p, i) => (
          <View key={p.id}>
            {i ? <Divider /> : null}
            <ListRow title={`${names.get(p.studentId) ?? ''} · ${formatMaloti(p.amount)}`} subtitle={`${formatDateLong(p.paymentDate, lang)} · ${p.method}`} onPress={() => router.push(`/payment/${p.id}`)} />
          </View>
        ))}
      </Sheet>

        </>
      )}

      <SectionTitle>{t('exportCsv')}</SectionTitle>
      <View style={{ gap: space.sm }}>
        <Btn kind="secondary" icon="file-delimited-outline" label={t('exportPayments')} onPress={() => void shareCsv('payments', app.accounts)} />
        <Btn kind="secondary" icon="file-delimited-outline" label={t('exportStudents')} onPress={() => void shareCsv('students', app.accounts)} />
        <Btn kind="secondary" icon="file-delimited-outline" label={t('exportReturned')} onPress={() => void shareCsv('returned', app.accounts)} />
      </View>
    </Screen>
  );
}
