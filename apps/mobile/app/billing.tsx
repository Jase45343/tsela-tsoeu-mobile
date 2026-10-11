import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { formatDateLong, type FirstMonthRule, type HolidayRule, type SchoolClosure } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { useT } from '../src/lib/i18n';
import { Banner, Btn, Chip, ChipRow, DateField, Divider, Field, Icon, Screen, SectionTitle, Sheet, Txt } from '../src/ui/kit';
import { color, space } from '../src/ui/theme';

/**
 * Each driver's own billing rules: how a new student's first month is charged,
 * how holiday months are charged, and each school's closed dates.
 * Saved online (like other settings) and applied to months created afterwards.
 */
export default function Billing() {
  const app = useApp();
  const { t, lang } = useT();
  const [firstMonthRule, setFirstMonthRule] = useState<FirstMonthRule>(app.settings.firstMonthRule);
  const [cutoff, setCutoff] = useState(String(app.settings.halfCutoffDay));
  const [holidayRule, setHolidayRule] = useState<HolidayRule>(app.settings.holidayRule);
  const [closures, setClosures] = useState<SchoolClosure[]>(app.settings.closures);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  // New holiday being added
  const [school, setSchool] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  const schools = useMemo(
    () => [...new Set(app.snapshot.students.map((s) => s.school.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [app.snapshot.students],
  );

  const cutoffN = Number(cutoff);
  const cutoffOk = Number.isInteger(cutoffN) && cutoffN >= 2 && cutoffN <= 28;
  const rangeBad = !!from && !!to && to < from;

  const addClosure = () => {
    if (!from || !to || rangeBad) return;
    setClosures((c) => [...c, { id: randomUUID(), school, from, to, label: label.trim() }].sort((a, b) => a.from.localeCompare(b.from)));
    setAdding(false);
    setFrom(null);
    setTo(null);
    setLabel('');
  };

  const save = async () => {
    if (firstMonthRule === 'half_after' && !cutoffOk) return;
    setBusy(true);
    setMessage(null);
    try {
      await app.updateRemoteSettings({ firstMonthRule, halfCutoffDay: cutoffOk ? cutoffN : app.settings.halfCutoffDay, holidayRule, closures });
      setMessage({ tone: 'info', text: t('saved') });
    } catch {
      setMessage({ tone: 'danger', text: t('settingsOnline') });
    } finally {
      setBusy(false);
    }
  };

  const firstOptions: { v: FirstMonthRule; k: Parameters<typeof t>[0] }[] = [
    { v: 'full', k: 'fmFull' }, { v: 'ask', k: 'fmAsk' }, { v: 'half_after', k: 'fmHalf' }, { v: 'prorata', k: 'fmProrata' },
  ];
  const holidayOptions: { v: HolidayRule; k: Parameters<typeof t>[0] }[] = [
    { v: 'same', k: 'hrSame' }, { v: 'by_days', k: 'hrByDays' }, { v: 'half_or_ask', k: 'hrHalfOrAsk' },
  ];

  return (
    <Screen footer={<Btn kind="primary" icon="content-save" label={t('saveRules')} onPress={save} busy={busy} />}>
      <Stack.Screen options={{ title: t('billingRules') }} />
      <Txt tone={color.inkSoft}>{t('billingRulesHint')}</Txt>
      {message ? <Banner tone={message.tone} text={message.text} /> : null}

      <SectionTitle>{t('firstMonthTitle')}</SectionTitle>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {firstOptions.map((o, i) => (
          <View key={o.v}>
            {i ? <Divider /> : null}
            <Option label={t(o.k)} selected={firstMonthRule === o.v} onPress={() => setFirstMonthRule(o.v)} />
          </View>
        ))}
      </Sheet>
      {firstMonthRule === 'half_after' ? (
        <Field label={t('cutoffDay')} value={cutoff} onChangeText={setCutoff} keyboardType="number-pad" hint="2–28" error={!cutoffOk ? '2–28' : null} />
      ) : null}

      <SectionTitle>{t('holidayTitle')}</SectionTitle>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {holidayOptions.map((o, i) => (
          <View key={o.v}>
            {i ? <Divider /> : null}
            <Option label={t(o.k)} selected={holidayRule === o.v} onPress={() => setHolidayRule(o.v)} />
          </View>
        ))}
      </Sheet>

      <SectionTitle>{t('calendars')}</SectionTitle>
      <Txt variant="small" tone={color.inkSoft}>{t('calendarsHint')}</Txt>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {closures.length === 0 ? <View style={{ padding: space.lg }}><Txt tone={color.inkSoft}>{t('noClosures')}</Txt></View> : null}
        {closures.map((c, i) => (
          <View key={c.id}>
            {i ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt bold>{c.label || (c.school ?? t('allSchools'))}</Txt>
                <Txt variant="small" tone={color.inkSoft}>{`${c.label ? `${c.school ?? t('allSchools')} · ` : ''}${formatDateLong(c.from, lang)} – ${formatDateLong(c.to, lang)}`}</Txt>
              </View>
              <Btn kind="quiet" label={t('removeClosure')} onPress={() => setClosures((all) => all.filter((x) => x.id !== c.id))} />
            </View>
          </View>
        ))}
      </Sheet>

      {adding ? (
        <Sheet>
          <Txt variant="label" bold>{t('whichSchool')}</Txt>
          <ChipRow>
            <Chip label={t('allSchools')} selected={school === null} onPress={() => setSchool(null)} />
            {schools.map((sc) => <Chip key={sc} label={sc} selected={school === sc} onPress={() => setSchool(sc)} />)}
          </ChipRow>
          <Field label={t('closureLabel')} optional value={label} onChangeText={setLabel} />
          <DateField label={t('closedFrom')} value={from} onChange={(d) => { setFrom(d); if (!to || to < d) setTo(d); }} />
          <DateField label={t('closedTo')} value={to} onChange={setTo} minimumDate={from ?? undefined} />
          {rangeBad ? <Banner tone="danger" text={t('toBeforeFrom')} /> : null}
          <Btn kind="secondary" icon="plus" label={t('addClosure')} onPress={addClosure} disabled={!from || !to || rangeBad} />
          <Btn kind="quiet" label={t('cancel')} onPress={() => setAdding(false)} />
        </Sheet>
      ) : (
        <Btn kind="secondary" icon="calendar-plus" label={t('addClosure')} onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 60, backgroundColor: pressed ? color.brandTint : 'transparent' })}>
      <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} tone={selected ? color.brand : color.muted} />
      <Txt style={{ flex: 1 }} bold={selected}>{label}</Txt>
    </Pressable>
  );
}
