import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatDateLong, formatMaloti, formatMonth, formatPhone } from '@busledger/core';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { Banner, Btn, Divider, Figure, ListRow, Screen, SectionTitle, Sheet, StatusTag, Txt } from '../../../src/ui/kit';
import { color, space } from '../../../src/ui/theme';

/** FR-021: one student's account. */
export default function StudentAccountScreen() {
  const app = useApp();
  const { t, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = app.accountById.get(id);
  const [open, setOpen] = useState<string | null>(null);
  if (!a) return <Screen><Txt>—</Txt></Screen>;

  const s = a.student;
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
        <Banner tone="warn" text={t('leftCreditPrompt', { name: s.name, amount: formatMaloti(a.credit) })} action={{ label: t('settleCredit'), onPress: () => router.push(`/student/${s.id}/credit`) }} />
      ) : null}

      <View style={{ gap: space.sm }}>
        {a.net > 0 ? <Btn kind="secondary" icon="whatsapp" label={t('sendReminder')} onPress={() => router.push(`/student/${s.id}/remind`)} /> : null}
        {a.credit > 0 && active ? <Btn kind="secondary" icon="cash-refund" label={t('settleCredit')} onPress={() => router.push(`/student/${s.id}/credit`)} /> : null}
      </View>

      <SectionTitle>{t('months')}</SectionTitle>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {a.periods.map((v, i) => (
          <View key={v.period.id}>
            {i ? <Divider /> : null}
            <ListRow
              title={formatMonth(v.period.year, v.period.month, lang)}
              subtitle={
                v.period.cancelled ? undefined
                  : `${t('recordedOf', { a: formatMaloti(v.state.amountRecorded), b: formatMaloti(v.period.amountDue) })}${v.overdue ? ` · ${t('daysOverdue', { n: v.daysOverdue })}` : ''}${v.period.origin === 'provisional' ? ` · ${t('notConfirmed')}` : ''}`
              }
              right={<StatusTag tag={v.state.status} />}
              onPress={v.period.origin === 'provisional' ? undefined : () => setOpen(open === v.period.id ? null : v.period.id)}
            />
            {open === v.period.id ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
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
              title={formatMaloti(p.amount)}
              subtitle={`${formatDateLong(p.paymentDate, lang)} · ${p.method}${p.acknowledgementNumber ? ` · ${p.acknowledgementNumber}` : ''}`}
              right={p.voidedAt ? <StatusTag tag="cancelled" label={t('voided')} /> : undefined}
              onPress={() => router.push(`/payment/${p.id}`)}
            />
          </View>
        ))}
        {a.adjustments.map((adj) => (
          <View key={adj.id}>
            <Divider />
            <ListRow title={`− ${formatMaloti(adj.amount)}`} subtitle={`${t('creditAdjustmentLabel')} · ${adj.reason}`} />
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
