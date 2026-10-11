import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { coveredUntil, forecastStudent, formatDateLong, formatMaloti, formatMonth, formatPhone } from '@busledger/core';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { Banner, Btn, Divider, Figure, ListRow, Screen, SectionTitle, Sheet, StatusTag, Txt } from '../../../src/ui/kit';
import { color, space } from '../../../src/ui/theme';
import { parseDays } from '../../../src/lib/days';

/** FR-021: one student's account. */
export default function StudentAccountScreen() {
  const app = useApp();
  const { t, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = app.accountById.get(id);
  const [open, setOpen] = useState<string | null>(null);
  if (!a) return <Screen><Txt>—</Txt></Screen>;

  const s = a.student;
  // Months ahead that paid-ahead money covers, plus the first one that still needs paying.
  const forecast = forecastStudent(a, app.today, app.settings);
  const firstOpen = forecast.findIndex((f) => f.toCollect > 0);
  const coming = a.paidAhead > 0 ? forecast.slice(0, firstOpen === -1 ? forecast.length : firstOpen + 1).filter((f) => !a.periods.some((v) => v.period.year === f.year && v.period.month === f.month)) : [];
  const until = a.paidAhead > 0 ? coveredUntil(forecast) : null;
  const active = s.status === 'active';
  const unsynced = app.unsyncedStudents.has(s.id);

  const toggleActive = () => {
    if (!active) return void app.updateStudent({ ...s, status: 'active' });
    Alert.alert(t('studentLeft'), s.name, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('studentLeft'), style: 'destructive', onPress: () => void app.updateStudent({ ...s, status: 'inactive' }) },
    ]);
  };

  return (
    <Screen footer={active ? <Btn kind="primary" icon="cash-plus" label={t('recordPayment')} onPress={() => router.push(`/record?studentId=${s.id}`)} /> : undefined}>
      <Stack.Screen options={{ title: s.name }} />
      <Sheet>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <StatusTag tag={active ? a.status : 'inactive'} />
          {a.maxDaysOverdue ? <StatusTag tag="unpaid" label={t('daysOverdue', { n: a.maxDaysOverdue })} /> : null}
        </View>
        <Figure
          label={a.net > 0 ? t('owes') : a.net < 0 ? t('aheadBy') : t('nothingOwed')}
          value={formatMaloti(Math.abs(a.net))}
          tone={a.net > 0 ? color.owing : a.net < 0 ? color.paid : color.ink}
          note={unsynced ? t('notConfirmed') : undefined}
        />
        <Divider />
        <Txt>{s.parentName} · {formatPhone(s.parentPhone)}</Txt>
        {s.school || s.pickupLocation ? <Txt variant="small" tone={color.inkSoft}>{[s.school, s.pickupLocation && `${s.pickupLocation} → ${s.dropoffLocation}`].filter(Boolean).join(' · ')}</Txt> : null}
        <Txt variant="small" tone={color.inkSoft}>{t('monthlyFee')}: {formatMaloti(s.monthlyFee)}</Txt>
      </Sheet>

      {!active && a.credit > 0 ? (
        <Banner tone="warn" text={t('leftPaidAheadPrompt', { name: s.name, amount: formatMaloti(a.credit) })} action={{ label: t('returnPaidAhead'), onPress: () => router.push(`/student/${s.id}/return`) }} />
      ) : null}

      <View style={{ gap: space.sm }}>
        {a.net > 0 ? <Btn kind="secondary" icon="whatsapp" label={t('sendReminder')} onPress={() => router.push(`/student/${s.id}/remind`)} /> : null}
        {a.credit > 0 && active ? <Btn kind="quiet" icon="cash-refund" label={t('returnPaidAhead')} onPress={() => router.push(`/student/${s.id}/return`)} /> : null}
      </View>

      {coming.length ? (
        <>
          <SectionTitle>{t('comingMonths')}</SectionTitle>
          <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            {until ? <View style={{ padding: space.lg, paddingBottom: 0 }}><StatusTag tag="in_advance" label={t('coveredUntil', { month: formatMonth(until.year, until.month, lang) })} /></View> : null}
            {coming.map((f, i) => (
              <View key={`${f.year}-${f.month}`}>
                {i || until ? <Divider /> : null}
                <ListRow
                  title={formatMonth(f.year, f.month, lang)}
                  subtitle={[
                    f.toCollect === 0 ? t('coveredFull') : f.covered ? t('coveredPart', { covered: formatMaloti(f.covered), charge: formatMaloti(f.charge) }) : t('toCollect', { amount: formatMaloti(f.toCollect) }),
                    f.estimate ? t('estimated') : null,
                  ].filter(Boolean).join(' · ')}
                  right={f.toCollect === 0 ? <StatusTag tag="paid" label={t('coveredFull')} /> : <Txt variant="label" bold>{formatMaloti(f.toCollect)}</Txt>}
                />
              </View>
            ))}
          </Sheet>
        </>
      ) : null}

      <SectionTitle>{t('months')}</SectionTitle>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {a.periods.map((v, i) => (
          <View key={v.period.id}>
            {i ? <Divider /> : null}
            <ListRow
              title={formatMonth(v.period.year, v.period.month, lang)}
              subtitle={
                v.period.cancelled ? undefined
                  : [
                    t('recordedOf', { a: formatMaloti(v.state.amountRecorded), b: formatMaloti(v.period.amountDue) }),
                    v.overdue ? t('daysOverdue', { n: v.daysOverdue }) : null,
                    v.state.writtenOff ? t('writtenOffAmount', { amount: formatMaloti(v.state.writtenOff) }) : null,
                    parseDays(v.period.chargeNote) ? t('daysRun', parseDays(v.period.chargeNote)!) : v.period.chargeNote,
                    v.period.origin === 'provisional' ? t('notConfirmed') : null,
                  ].filter(Boolean).join(' · ')
              }
              right={
                v.period.needsReview ? <StatusTag tag="partial" label={t('reviewTitle')} />
                  : v.upcoming && v.state.status !== 'paid' ? <StatusTag tag="cancelled" label={t('notStarted')} />
                  : <StatusTag tag={v.state.status} />
              }
              onPress={v.period.origin === 'provisional' ? undefined : () => setOpen(open === v.period.id ? null : v.period.id)}
            />
            {open === v.period.id ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm }}>
                {!v.period.cancelled ? (
                  <Btn kind="secondary" icon="pencil" label={t('changeCharge')} onPress={() => { setOpen(null); router.push(`/charge?periodId=${v.period.id}`); }} />
                ) : null}
                {!v.period.cancelled && !v.upcoming && v.state.balance > 0 ? (
                  <Btn kind="secondary" icon="eraser" label={t('writeOff')} onPress={() => { setOpen(null); router.push(`/student/${s.id}/writeoff?periodId=${v.period.id}`); }} />
                ) : null}
                <Btn kind={v.period.cancelled ? 'secondary' : 'danger'} label={v.period.cancelled ? t('chargeAgain') : t('dontCharge')}
                  onPress={() => { setOpen(null); void app.setPeriodCancelled(v.period.id, !v.period.cancelled); }} />
              </View>
            ) : null}
          </View>
        ))}
      </Sheet>

      <SectionTitle>{t('paymentsTitle')}</SectionTitle>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {a.payments.length === 0 ? <View style={{ padding: space.lg }}><Txt tone={color.inkSoft}>{t('noPayments')}</Txt></View> : null}
        {a.payments.map((p, i) => (
          <View key={p.id}>
            {i ? <Divider /> : null}
            <ListRow
              title={p.source === 'write_off' ? t('writtenOffAmount', { amount: formatMaloti(p.amount) }) : formatMaloti(p.amount)}
              subtitle={p.source === 'write_off'
                ? `${formatDateLong(p.paymentDate, lang)} · ${p.note ?? ''}`
                : `${formatDateLong(p.paymentDate, lang)} · ${p.method}${p.acknowledgementNumber ? ` · ${p.acknowledgementNumber}` : ''}`}
              right={p.voidedAt ? <StatusTag tag="cancelled" label={t('voided')} /> : undefined}
              onPress={() => router.push(`/payment/${p.id}`)}
            />
          </View>
        ))}
        {a.adjustments.map((adj) => (
          <View key={adj.id}>
            <Divider />
            <ListRow title={`− ${formatMaloti(adj.amount)}`} subtitle={`${adj.type === 'refunded_outside_app' ? t('returnedToParent') : t('writtenOff')} · ${adj.reason}`} />
          </View>
        ))}
      </Sheet>

      <View style={{ gap: space.sm }}>
        <Btn kind="quiet" icon="pencil" label={t('edit')} onPress={() => router.push(`/student/${s.id}/edit`)} />
        <Btn kind={active ? 'danger' : 'secondary'} icon={active ? 'account-off-outline' : 'account-check-outline'} label={active ? t('studentLeft') : t('makeActive')} onPress={toggleActive} />
      </View>
    </Screen>
  );
}
