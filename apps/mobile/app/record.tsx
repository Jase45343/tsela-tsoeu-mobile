import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { buildStudentAccount, formatDateLong, formatMaloti, parseAmount, toInputString } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { useT } from '../src/lib/i18n';
import { matchesStudent } from '../src/lib/search';
import { Banner, Btn, Chip, ChipRow, DateChooser, Divider, Field, ListRow, Screen, Sheet, StatusTag, Txt } from '../src/ui/kit';
import { color, space } from '../src/ui/theme';

/**
 * FR-011 + FR-014. For a returning student: Record → student → amount chip → Save record (NFR-001, ≤ 4 taps).
 * The form itself is the review: every field is shown in plain words above the save button.
 * With ?correct=<paymentId> it records a correction (FR-016): the original is voided and replaced.
 */
export default function Record() {
  const app = useApp();
  const { t, lang } = useT();
  const params = useLocalSearchParams<{ studentId?: string; correct?: string }>();
  const original = params.correct ? app.snapshot.payments.find((p) => p.id === params.correct) : undefined;

  const [studentId, setStudentId] = useState<string | undefined>(original?.studentId ?? params.studentId);
  const [query, setQuery] = useState('');
  const [amountText, setAmountText] = useState(original ? toInputString(original.amount) : '');
  const [method, setMethod] = useState(original?.method ?? app.lastMethod ?? app.settings.paymentMethods[0] ?? 'Cash');
  const [date, setDate] = useState(original?.paymentDate ?? app.today);
  const [reference, setReference] = useState(original?.reference ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [more, setMore] = useState(!!(original?.reference || original?.note));
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = studentId ? app.accountById.get(studentId) : undefined;
  const amount = parseAmount(amountText);
  const methods = app.settings.paymentMethods.includes(method) ? app.settings.paymentMethods : [...app.settings.paymentMethods, method];

  // Recently paid first, so a returning student is one tap away.
  const candidates = useMemo(() => {
    const last = new Map<string, string>();
    for (const p of app.snapshot.payments) if (p.source !== 'write_off' && (last.get(p.studentId) ?? '') < p.createdAt) last.set(p.studentId, p.createdAt);
    return app.accounts
      .filter((a) => a.student.status === 'active' && matchesStudent(a, query.trim()))
      .sort((a, b) => (last.get(b.student.id) ?? '').localeCompare(last.get(a.student.id) ?? '') || a.student.name.localeCompare(b.student.name));
  }, [app.accounts, app.snapshot.payments, query]);

  const after = useMemo(() => {
    if (!account || !amount) return null;
    const payments = account.payments.map((p) => (p.id === original?.id ? { ...p, voidedAt: 'now' } : p));
    return buildStudentAccount({
      student: account.student, periods: account.periods.map((v) => v.period), adjustments: account.adjustments,
      payments: [...payments, { id: 'preview', studentId: account.student.id, amount, method, paymentDate: date, source: 'manual', createdAt: new Date().toISOString() }],
      today: app.today, settings: app.settings,
    });
  }, [account, amount, method, date, original?.id, app.today, app.settings]);

  const save = async () => {
    setTouched(true);
    if (!studentId || !amount || (original && !reason.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const input = { studentId, amount, method, paymentDate: date, reference, note };
      const id = original ? await app.correctPayment(original.id, reason.trim(), input) : await app.recordPayment(input);
      router.replace(`/payment/${id}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const title = original ? t('correction', { n: original.acknowledgementNumber ?? '' }) : t('recordPayment');

  if (!account) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <Txt variant="heading" bold>{t('whoPaid')}</Txt>
        <Field label={t('searchStudents')} value={query} onChangeText={setQuery} placeholder={t('searchStudents')} autoCorrect={false} />
        <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {candidates.length === 0 ? <View style={{ padding: space.lg }}><Txt tone={color.inkSoft}>{app.accounts.length ? t('noMatches', { q: query }) : t('noStudents')}</Txt></View> : null}
          {candidates.map((a, i) => (
            <View key={a.student.id}>
              {i ? <Divider /> : null}
              <ListRow title={a.student.name} subtitle={a.student.parentName} onPress={() => setStudentId(a.student.id)}
                right={a.net > 0 ? <Txt variant="label" bold tone={color.owing}>{formatMaloti(a.net)}</Txt> : undefined} />
            </View>
          ))}
        </Sheet>
        {app.accounts.length === 0 ? <Btn kind="secondary" label={t('addStudent')} onPress={() => router.replace('/student/new')} /> : null}
      </Screen>
    );
  }

  const quick = [account.student.monthlyFee, account.net > 0 ? account.net : 0].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  return (
    <Screen footer={<Btn kind="primary" icon="content-save" label={t('saveRecord')} onPress={save} busy={busy} disabled={!amount || (!!original && !reason.trim())} />}>
      <Stack.Screen options={{ title }} />
      {error ? <Banner tone="danger" text={error} /> : null}
      {original ? <Banner tone="info" text={t('correctExplain')} /> : null}

      <Sheet>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading" bold>{account.student.name}</Txt>
            <Txt variant="small" tone={color.inkSoft}>{account.net > 0 ? `${t('owes')} ${formatMaloti(account.net)}` : account.net < 0 ? `${t('aheadBy')} ${formatMaloti(-account.net)}` : t('nothingOwed')}</Txt>
          </View>
          {!original ? <Btn kind="quiet" label={t('change')} onPress={() => setStudentId(undefined)} /> : null}
        </View>
      </Sheet>

      <View style={{ gap: space.sm }}>
        <Field label={t('amount')} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="500"
          error={touched && !amount ? t('amountInvalid') : null} />
        <ChipRow>
          {quick.map((v) => (
            <Chip key={v} label={`${v === account.student.monthlyFee ? t('fullFee') : t('allOwed')} ${formatMaloti(v)}`} selected={amount === v} onPress={() => setAmountText(toInputString(v))} />
          ))}
        </ChipRow>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="label" bold>{t('howPaid')}</Txt>
        <ChipRow>{methods.map((m) => <Chip key={m} label={m} selected={m === method} onPress={() => setMethod(m)} />)}</ChipRow>
      </View>

      <DateChooser label={t('datePaid')} value={date} onChange={setDate} today={app.today} />

      {more ? (
        <>
          <Field label={t('reference')} optional value={reference} onChangeText={setReference} autoCapitalize="characters" />
          <Field label={t('note')} optional value={note} onChangeText={setNote} multiline />
        </>
      ) : <Btn kind="quiet" icon="plus" label={t('moreDetails')} onPress={() => setMore(true)} />}

      {original ? <Field label={t('voidReason')} value={reason} onChangeText={setReason} error={touched && !reason.trim() ? t('required') : null} /> : null}

      <Sheet style={{ borderWidth: 2, borderColor: color.brand }}>
        <Txt variant="heading" bold>{t('checkBeforeSaving')}</Txt>
        {[
          [t('kindStudent'), account.student.name],
          [t('amount'), amount ? formatMaloti(amount) : '—'],
          [t('howPaid'), method],
          [t('datePaid'), formatDateLong(date, lang)],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Txt tone={color.inkSoft}>{k}</Txt><Txt bold style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Txt>
          </View>
        ))}
        {after ? (
          <StatusTag tag={after.net > 0 ? 'partial' : after.net < 0 ? 'in_advance' : 'paid'}
            label={t('afterSaving', { name: account.student.name, state: after.net > 0 ? t('willOwe', { amount: formatMaloti(after.net) }) : after.net < 0 ? t('willBeAhead', { amount: formatMaloti(-after.net) }) : t('willBeClear') })} />
        ) : null}
        <Txt variant="small" tone={color.inkSoft}>{t('notMoney')}</Txt>
      </Sheet>
    </Screen>
  );
}
