import { useState } from 'react';
import { View } from 'react-native';
import {
  firstPeriodAmount, formatMaloti, formatMonth, normalizeLesothoPhone, parseAmount, parts, suggestFirstPeriodChoice, toInputString,
  type FirstPeriodChoice, type ISODate, type Lisente, type Student,
} from '@busledger/core';
import { useT } from '../lib/i18n';
import { Banner, Btn, Chip, ChipRow, DateChooser, Field, Screen, Txt } from './kit';
import { color, space } from './theme';

export interface StudentFormValue {
  student: Omit<Student, 'id' | 'status'>;
  choice: FirstPeriodChoice;
  custom?: Lisente;
}

/** FR-004 and FR-005. When `existing` is given, the onboarding fields are hidden (FR-006). */
export function StudentForm({ existing, today, onSave }: { existing?: Student; today: ISODate; onSave: (v: StudentFormValue) => Promise<void> }) {
  const { t, lang } = useT();
  const [name, setName] = useState(existing?.name ?? '');
  const [parentName, setParentName] = useState(existing?.parentName ?? '');
  const [phone, setPhone] = useState(existing?.parentPhone.replace('+266', '') ?? '');
  const [school, setSchool] = useState(existing?.school ?? '');
  const [pickup, setPickup] = useState(existing?.pickupLocation ?? '');
  const [dropoff, setDropoff] = useState(existing?.dropoffLocation ?? '');
  const [feeText, setFeeText] = useState(existing ? toInputString(existing.monthlyFee) : '');
  const [start, setStart] = useState(existing?.onboardedAt ?? today);
  const [choice, setChoice] = useState<FirstPeriodChoice | null>(null);
  const [customText, setCustomText] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = feeText.trim() === '0' ? 0 : parseAmount(feeText);
  const normalized = normalizeLesothoPhone(phone);
  const suggested = suggestFirstPeriodChoice(start);
  const effectiveChoice = choice ?? suggested;
  const custom = effectiveChoice === 'custom' ? (customText.trim() === '0' ? 0 : parseAmount(customText)) : undefined;
  const { year, month } = parts(start);

  const valid = name.trim() && parentName.trim() && normalized && fee !== null && (effectiveChoice !== 'custom' || custom !== null);

  const save = async () => {
    setTouched(true);
    if (!valid || fee === null || !normalized) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        student: { name: name.trim(), parentName: parentName.trim(), parentPhone: normalized, school: school.trim(), pickupLocation: pickup.trim(), dropoffLocation: dropoff.trim(), monthlyFee: fee, onboardedAt: start },
        choice: effectiveChoice, custom: custom ?? undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const choices: { c: FirstPeriodChoice; label: string }[] = [
    { c: 'full', label: t('choiceFull') }, { c: 'half', label: t('choiceHalf') }, { c: 'free', label: t('choiceFree') }, { c: 'custom', label: t('choiceCustom') },
  ];

  return (
    <Screen footer={<Btn kind="secondary" icon="content-save" label={t('saveStudent')} onPress={save} busy={busy} />}>
      {error ? <Banner tone="danger" text={error} /> : null}
      <Field label={t('studentName')} value={name} onChangeText={setName} autoCapitalize="words" error={touched && !name.trim() ? t('required') : null} />
      <Field label={t('parentName')} value={parentName} onChangeText={setParentName} autoCapitalize="words" error={touched && !parentName.trim() ? t('required') : null} />
      <Field label={t('parentPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="5812 3456" error={touched && !normalized ? t('phoneInvalid') : null} />
      <Field label={t('school')} optional value={school} onChangeText={setSchool} autoCapitalize="words" />
      <Field label={t('pickup')} optional value={pickup} onChangeText={setPickup} />
      <Field label={t('dropoff')} optional value={dropoff} onChangeText={setDropoff} />
      <Field label={t('monthlyFee')} value={feeText} onChangeText={setFeeText} keyboardType="decimal-pad" placeholder="1000"
        error={touched && fee === null ? t('amountInvalid') : null}
        hint={existing && fee !== null && fee !== existing.monthlyFee ? t('feeChangeNote') : undefined} />

      {!existing ? (
        <>
          <DateChooser label={t('startDate')} value={start} onChange={(d) => { setStart(d); setChoice(null); }} today={today} allowFuture />
          <View style={{ gap: space.sm }}>
            <Txt variant="label" bold>{t('firstMonthCharge', { month: formatMonth(year, month, lang) })}</Txt>
            <ChipRow>
              {choices.map(({ c, label }) => (
                <Chip key={c} selected={effectiveChoice === c} onPress={() => setChoice(c)}
                  label={`${label}${c !== 'custom' && fee !== null ? ` ${formatMaloti(firstPeriodAmount(fee, c))}` : ''}${c === suggested ? ` (${t('suggested')})` : ''}`} />
              ))}
            </ChipRow>
            {effectiveChoice === 'custom' ? (
              <Field label={t('amount')} value={customText} onChangeText={setCustomText} keyboardType="decimal-pad" error={touched && custom === null ? t('amountInvalid') : null} />
            ) : null}
            <Txt variant="small" tone={color.inkSoft}>{t('feeChangeNote')}</Txt>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
