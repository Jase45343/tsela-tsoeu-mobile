import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatMaloti, formatMonth, parseAmount, toInputString } from '@busledger/core';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { Btn, Field, Screen, Sheet, Txt } from '../../../src/ui/kit';
import { color } from '../../../src/ui/theme';

/** Forgive what a parent owes for one month. Logged with the reason; undone by voiding it from the payments list. */
export default function WriteOff() {
  const app = useApp();
  const { t, lang } = useT();
  const { id, periodId } = useLocalSearchParams<{ id: string; periodId: string }>();
  const a = app.accountById.get(id);
  const view = a?.periods.find((v) => v.period.id === periodId);
  const [amountText, setAmountText] = useState(view ? toInputString(view.state.balance) : '');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!a || !view) return null;

  const owed = view.state.balance;
  const month = formatMonth(view.period.year, view.period.month, lang);
  const amount = parseAmount(amountText);
  const tooMuch = amount !== null && amount > owed;
  const save = async () => {
    setTouched(true);
    if (!amount || tooMuch || !reason.trim()) return;
    setBusy(true);
    await app.writeOff(view.period.id, amount, reason.trim());
    router.back();
  };

  return (
    <Screen footer={<Btn kind="danger" icon="eraser" label={t('saveWriteOff')} onPress={save} busy={busy} />}>
      <Stack.Screen options={{ title: t('writeOff') }} />
      <Sheet>
        <Txt variant="heading" bold>{a.student.name}</Txt>
        <Txt>{t('owedFor', { month, amount: formatMaloti(owed) })}</Txt>
      </Sheet>
      <Txt tone={color.inkSoft}>{t('writeOffHint')}</Txt>
      <Field label={t('amountWrittenOff')} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad"
        error={touched && !amount ? t('amountInvalid') : tooMuch ? t('writeOffTooMuch') : null} />
      <Field label={t('writeOffReason')} value={reason} onChangeText={setReason} multiline error={touched && !reason.trim() ? t('required') : null} />
    </Screen>
  );
}
