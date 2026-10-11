import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatMaloti, formatMonth, parseAmount, toInputString } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { useT } from '../src/lib/i18n';
import { Btn, Chip, ChipRow, Field, Screen, Sheet, Txt } from '../src/ui/kit';
import { color, space } from '../src/ui/theme';
import { byDaysAmount, parseDays } from '../src/lib/days';

/** Change one month's charge by hand, with a reason that is kept and logged. */
export default function Charge() {
  const app = useApp();
  const { t, lang } = useT();
  const { periodId } = useLocalSearchParams<{ periodId: string }>();
  const account = app.accounts.find((a) => a.periods.some((v) => v.period.id === periodId));
  const view = account?.periods.find((v) => v.period.id === periodId);
  const [amountText, setAmountText] = useState(view ? toInputString(view.period.amountDue) : '');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!account || !view) return null;

  const p = view.period;
  const amount = amountText.trim() === '0' ? 0 : parseAmount(amountText);
  const days = parseDays(p.chargeNote);
  const fee = account.student.monthlyFee;
  const quick: { label: string; value: number }[] = [
    { label: `${t('choiceFull')} ${formatMaloti(fee)}`, value: fee },
    ...(days ? [{ label: `${t('choiceProrata')} ${formatMaloti(byDaysAmount(fee, days))}`, value: byDaysAmount(fee, days) }] : []),
    { label: `${t('choiceHalf')} ${formatMaloti(Math.round(fee / 2))}`, value: Math.round(fee / 2) },
    { label: t('choiceFree'), value: 0 },
  ];

  const save = async () => {
    setTouched(true);
    if (amount === null || !reason.trim()) return;
    setBusy(true);
    await app.adjustCharge(p.id, amount, reason.trim());
    router.back();
  };

  return (
    <Screen footer={<Btn kind="primary" icon="content-save" label={t('saveCharge')} onPress={save} busy={busy} disabled={amount === null || amount === p.amountDue || !reason.trim()} />}>
      <Stack.Screen options={{ title: t('changeCharge') }} />
      <Sheet>
        <Txt variant="heading" bold>{account.student.name}</Txt>
        <Txt>{t('chargeFor', { month: formatMonth(p.year, p.month, lang) })} · {t('currentCharge', { amount: formatMaloti(p.amountDue) })}</Txt>
        {days ? <Txt variant="small" tone={color.inkSoft}>{t('daysRun', { open: days.open, normal: days.normal })}</Txt> : null}
      </Sheet>
      <View style={{ gap: space.sm }}>
        <ChipRow>{quick.map((q) => <Chip key={q.label} label={q.label} selected={amount === q.value} onPress={() => setAmountText(toInputString(q.value))} />)}</ChipRow>
        <Field label={t('amount')} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" error={touched && amount === null ? t('amountInvalid') : null} />
      </View>
      <Field label={t('changeReason')} value={reason} onChangeText={setReason} multiline error={touched && !reason.trim() ? t('required') : null} />
      <Txt variant="small" tone={color.inkSoft}>{t('chargeExplain')}</Txt>
    </Screen>
  );
}
