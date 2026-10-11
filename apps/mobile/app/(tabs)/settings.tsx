import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { Banner, Btn, Chip, ChipRow, Divider, Field, ListRow, Screen, SectionTitle, Sheet, Txt } from '../../src/ui/kit';
import { color, space } from '../../src/ui/theme';

/** NFR-010: operator settings without a code release; FR-037 account closure. */
export default function Settings() {
  const app = useApp();
  const { t } = useT();
  const [business, setBusiness] = useState(app.settings.businessName);
  const [name, setName] = useState(app.profile?.name ?? '');
  const [dueDay, setDueDay] = useState(String(app.settings.dueDay));
  const [grace, setGrace] = useState(String(app.settings.graceDays));
  const [methods, setMethods] = useState(app.settings.paymentMethods.join('\n'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    setBusiness(app.settings.businessName);
    setDueDay(String(app.settings.dueDay));
    setGrace(String(app.settings.graceDays));
    setMethods(app.settings.paymentMethods.join('\n'));
  }, [app.settings]);

  const due = Number(dueDay);
  const graceN = Number(grace);
  const methodList = methods.split('\n').map((m) => m.trim()).filter(Boolean);
  const valid = Number.isInteger(due) && due >= 1 && due <= 28 && Number.isInteger(graceN) && graceN >= 0 && graceN <= 60 && methodList.length > 0 && name.trim();

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setMessage(null);
    try {
      await app.updateRemoteSettings({ name: name.trim(), businessName: business.trim(), dueDay: due, graceDays: graceN, paymentMethods: methodList });
      setMessage({ tone: 'info', text: t('done') });
    } catch {
      setMessage({ tone: 'danger', text: t('settingsOnline') });
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    const pending = app.pendingCount + app.failedCount;
    if (pending) return Alert.alert(t('signOut'), t('signOutPending', { n: pending }));
    Alert.alert(t('signOut'), app.profile?.phone ?? '', [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: () => void app.signOut() },
    ]);
  };

  const close = () => Alert.alert(t('closeAccount'), t('closeAccountInfo'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('closeAccount'), style: 'destructive', onPress: () => void app.closeAccount().catch(() => setMessage({ tone: 'danger', text: t('couldNotReach') })) },
  ]);

  return (
    <Screen>
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        <ListRow title={t('billingRules')} subtitle={`${t(({ full: 'fmFull', ask: 'fmAsk', half_after: 'fmHalf', prorata: 'fmProrata' } as const)[app.settings.firstMonthRule])} · ${t(({ same: 'hrSame', by_days: 'hrByDays', half_or_ask: 'hrHalfOrAsk' } as const)[app.settings.holidayRule])}`} onPress={() => router.push('/billing')} />
        <Divider />
        <ListRow title={t('syncStatus')} subtitle={app.failedCount ? t('failedCount', { n: app.failedCount }) : app.pendingCount ? t('pendingCount', { n: app.pendingCount }) : t('allSynced')} onPress={() => router.push('/sync')} />
      </Sheet>

      <View style={{ gap: space.sm }}>
        <Txt variant="label" bold>{t('language')}</Txt>
        <ChipRow>
          <Chip label="English" selected={app.lang === 'en'} onPress={() => app.setLang('en')} />
          <Chip label="Sesotho" selected={app.lang === 'st'} onPress={() => app.setLang('st')} />
        </ChipRow>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="label" bold>{t('lockAfter', { n: app.lockMinutes })}</Txt>
        <ChipRow>{[1, 5, 15, 30].map((m) => <Chip key={m} label={`${m}`} selected={app.lockMinutes === m} onPress={() => app.setLockMinutes(m)} />)}</ChipRow>
      </View>

      <SectionTitle>{t('business')}</SectionTitle>
      <Txt variant="small" tone={color.inkSoft}>{t('settingsOnline')}</Txt>
      {message ? <Banner tone={message.tone} text={message.text} /> : null}
      <Field label={t('business')} value={business} onChangeText={setBusiness} />
      <Field label={t('yourName')} value={name} onChangeText={setName} error={!name.trim() ? t('required') : null} />
      <Field label={t('dueDay')} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" hint="1–28" error={dueDay && !(due >= 1 && due <= 28) ? '1–28' : null} />
      <Field label={t('graceDays')} value={grace} onChangeText={setGrace} keyboardType="number-pad" hint="0–60" error={grace && !(graceN >= 0 && graceN <= 60) ? '0–60' : null} />
      <Field label={t('methods')} value={methods} onChangeText={setMethods} multiline hint={t('methodsHint')} />
      <Btn kind="secondary" icon="content-save" label={t('save')} onPress={save} busy={busy} disabled={!valid} />

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Btn kind="secondary" icon="logout" label={t('signOut')} onPress={signOut} />
        <Btn kind="danger" icon="account-remove-outline" label={t('closeAccount')} onPress={close} />
      </View>
      <Txt variant="small" tone={color.inkSoft} center>{t('appVersion', { v: Constants.expoConfig?.version ?? '' })}</Txt>
    </Screen>
  );
}
