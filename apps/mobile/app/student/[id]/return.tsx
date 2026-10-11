import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatMaloti, parseAmount, toInputString } from '@busledger/core';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { Banner, Btn, Field, Screen, Sheet, Txt } from '../../../src/ui/kit';
import { color } from '../../../src/ui/theme';

/**
 * FR-039: record paid-ahead money the driver gave back to the parent.
 * Paid-ahead money the driver keeps needs no action: it pays the coming months automatically.
 */
export default function ReturnPaidAhead() {
  const app = useApp();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = app.accountById.get(id);
  const [amountText, setAmountText] = useState(a ? toInputString(a.credit) : '');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!a) return null;

  const amount = parseAmount(amountText);
  const tooMuch = amount !== null && amount > a.credit;
  const save = async () => {
    setTouched(true);
    if (!amount || tooMuch || !note.trim()) return;
    setBusy(true);
    await app.returnPaidAhead(a.student.id, amount, note.trim());
    router.back();
  };

  return (
    <Screen footer={<Btn kind="primary" icon="cash-refund" label={t('saveReturn')} onPress={save} busy={busy} />}>
      <Stack.Screen options={{ title: t('returnPaidAhead') }} />
      <Sheet>
        <Txt variant="heading" bold>{a.student.name}</Txt>
        <Txt>{t('paidAheadAvailable', { amount: formatMaloti(a.credit) })}</Txt>
      </Sheet>
      <Txt tone={color.inkSoft}>{t('returnHint')}</Txt>
      <Field label={t('amountReturned')} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad"
        error={touched && !amount ? t('amountInvalid') : tooMuch ? t('returnTooMuch') : null} />
      <Field label={t('returnNote')} value={note} onChangeText={setNote} multiline error={touched && !note.trim() ? t('required') : null} />
      <Banner tone="info" text={t('notMoney')} />
    </Screen>
  );
}
