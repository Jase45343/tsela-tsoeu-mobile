import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { acknowledgementLines, formatDateLong, formatMaloti, formatMonth, type AcknowledgementData } from '@busledger/core';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { acknowledgementPlainText, openWhatsApp, shareAcknowledgementPdf } from '../../src/lib/share';
import { dateTimeLabel } from '../../src/lib/time';
import { Banner, Btn, Field, Screen, SectionTitle, Sheet, StatusTag, Txt } from '../../src/ui/kit';
import { color, space } from '../../src/ui/theme';

/** FR-022/FR-024 acknowledgement, plus void and correction (FR-016). */
export default function PaymentDetail() {
  const app = useApp();
  const { t, lang } = useT();
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const payment = app.snapshot.payments.find((p) => p.id === id);
  const ack = app.snapshot.acks.find((a) => a.paymentId === id);
  const account = payment ? app.accountById.get(payment.studentId) : undefined;
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!payment || !account) return <Screen><Txt>—</Txt></Screen>;

  const data: AcknowledgementData | null = ack ? {
    number: ack.number, businessName: app.settings.businessName || app.profile?.name || '', studentName: account.student.name,
    amount: payment.amount, paymentDate: payment.paymentDate, method: payment.method, reference: payment.reference,
    balance: ack.balanceShown, balanceAsOf: dateTimeLabel(ack.balanceAsOf, lang), balanceProvisional: ack.balanceProvisional,
  } : null;

  const allocations = account.ledger.allocations.filter((a) => a.paymentId === payment.id);
  const periodName = (pid: string) => {
    const v = account.periods.find((x) => x.period.id === pid);
    return v ? formatMonth(v.period.year, v.period.month, lang) : '';
  };
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  const creditPart = payment.voidedAt ? 0 : payment.amount - allocated;

  const share = async (via: 'whatsapp' | 'pdf') => {
    if (!data || !ack) return;
    if (via === 'whatsapp') await openWhatsApp(account.student.parentPhone, acknowledgementPlainText(data, lang));
    else await shareAcknowledgementPdf(data, lang);
    await app.markAckShared(ack.id, via);
  };

  const doVoid = async () => {
    setBusy(true);
    await app.voidPayment(payment.id, reason.trim());
    setBusy(false);
    setVoiding(false);
  };

  return (
    <Screen footer={isNew ? <Btn kind="secondary" label={t('done')} onPress={() => router.dismissTo('/')} /> : undefined}>
      <Stack.Screen options={{ title: ack?.number ?? t('kindPayment') }} />
      {isNew ? <Banner tone="info" icon="check-circle" text={t('paymentRecorded')} /> : null}
      {payment.voidedAt ? <Banner tone="danger" icon="cancel" text={`${t('voided')}: ${payment.voidReason ?? ''}`} /> : null}

      {data ? (
        <Sheet>
          <Txt variant="heading" bold>{acknowledgementLines(data, lang).title}</Txt>
          {acknowledgementLines(data, lang).rows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <Txt tone={color.inkSoft} style={{ flex: 1 }}>{k}</Txt><Txt bold>{v}</Txt>
            </View>
          ))}
          <Txt variant="small" tone={color.inkSoft}>{acknowledgementLines(data, lang).footer}</Txt>
          {!payment.voidedAt ? (
            <View style={{ gap: space.sm }}>
              <Btn kind="secondary" icon="whatsapp" label={t('sendWhatsApp')} onPress={() => void share('whatsapp')} />
              <Btn kind="secondary" icon="file-pdf-box" label={t('sharePdf')} onPress={() => void share('pdf')} />
            </View>
          ) : null}
        </Sheet>
      ) : null}

      {ack && !payment.voidedAt && account.net !== ack.balanceShown ? (
        <Banner tone="info" text={t('balanceChanged', { amount: account.net >= 0 ? formatMaloti(account.net) : `${t('aheadBy')} ${formatMaloti(-account.net)}` })} />
      ) : null}

      {!payment.voidedAt ? (
        <>
          <SectionTitle>{t('allocatedTo')}</SectionTitle>
          <Sheet>
            {allocations.filter((a) => a.target === 'period').map((a) => (
              <View key={a.targetId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt>{periodName(a.targetId)}</Txt><Txt bold>{formatMaloti(a.amount)}</Txt>
              </View>
            ))}
            {allocations.filter((a) => a.target === 'adjustment').map((a) => (
              <View key={a.targetId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt>{t('creditAdjustmentLabel')}</Txt><Txt bold>{formatMaloti(a.amount)}</Txt>
              </View>
            ))}
            {creditPart > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt>{t('creditPart')}</Txt><Txt bold tone={color.paid}>{formatMaloti(creditPart)}</Txt>
              </View>
            ) : null}
            {app.unsyncedStudents.has(account.student.id) ? <StatusTag tag="partial" label={t('notConfirmed')} /> : null}
          </Sheet>

          {voiding ? (
            <Sheet>
              <Txt>{t('voidExplain')}</Txt>
              <Field label={t('voidReason')} value={reason} onChangeText={setReason} autoFocus />
              <Btn kind="danger" label={t('voidConfirm')} onPress={doVoid} busy={busy} disabled={!reason.trim()} />
              <Btn kind="quiet" label={t('cancel')} onPress={() => setVoiding(false)} />
            </Sheet>
          ) : (
            <View style={{ gap: space.sm }}>
              <Btn kind="secondary" icon="pencil" label={t('correctRecord')} onPress={() => router.push(`/record?correct=${payment.id}`)} />
              <Btn kind="danger" icon="cancel" label={t('voidRecord')} onPress={() => setVoiding(true)} />
            </View>
          )}
        </>
      ) : null}
      <Txt variant="small" tone={color.inkSoft}>{formatDateLong(payment.paymentDate, lang)} · {payment.method}</Txt>
    </Screen>
  );
}
