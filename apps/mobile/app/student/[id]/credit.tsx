import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatMaloti, parseAmount, toInputString, type CreditAdjustmentType } from '@busledger/core';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { Btn, Chip, ChipRow, Field, Screen, Sheet, Txt } from '../../../src/ui/kit';
import { space } from '../../../src/ui/theme';

/** FR-039: reduce a student's credit without voiding any payment. */
export default function SettleCredit() {
  const app = useApp();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = app.accountById.get(id);
  const [type, setType] = useState<CreditAdjustmentType>('refunded_outside_app');
  const [amountText, setAmountText] = useState(a ? toInputString(a.credit) : '');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!a) return null;

  const amount = parseAmount(amountText);
  const tooMuch = amount !== null && amount > a.credit;
  const save = async () => {
    setTouched(true);
    if (!amount || tooMuch || !reason.trim()) return;
    setBusy(true);
    await app.addCreditAdjustment(a.student.id, type, amount, reason.trim());
    router.back();
  };

  return (
    <Screen footer={<Btn kind="secondary" label={t('saveAdjustment')} onPress={save} busy={busy} />}>
      <Stack.Screen options={{ title: t('settleCredit') }} />
      <Sheet><Txt variant="heading" bold>{t('available', { amount: formatMaloti(a.credit) })}</Txt></Sheet>
      <View style={{ gap: space.sm }}>
        <ChipRow>
          <Chip label={t('adjRefunded')} selected={type === 'refunded_outside_app'} onPress={() => setType('refunded_outside_app')} />
          <Chip label={t('adjWrittenOff')} selected={type === 'written_off'} onPress={() => setType('written_off')} />
          <Chip label={t('adjOther')} selected={type === 'other'} onPress={() => setType('other')} />
        </ChipRow>
      </View>
      <Field label={t('amount')} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad"
        error={touched && !amount ? t('amountInvalid') : tooMuch ? t('adjTooMuch') : null} />
      <Field label={t('adjReason')} value={reason} onChangeText={setReason} multiline error={touched && !reason.trim() ? t('required') : null} />
      <Txt variant="small">{t('notMoney')}</Txt>
    </Screen>
  );
}
