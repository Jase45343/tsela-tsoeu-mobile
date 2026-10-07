import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeLesothoPhone, type Lang } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { ApiError } from '../src/sync/api';
import { useT } from '../src/lib/i18n';
import { Banner, Btn, Chip, ChipRow, Field, Icon, Screen, Txt } from '../src/ui/kit';
import { color, space } from '../src/ui/theme';

type Mode = 'signIn' | 'register' | 'reset';

export default function SignIn() {
  const app = useApp();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const { reauth } = useLocalSearchParams<{ reauth?: string }>();
  const [mode, setMode] = useState<Mode>('signIn');
  const [phone, setPhone] = useState(app.profile?.phone.replace('+266', '') ?? '');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  if (app.status === 'ready' && !reauth) return <Redirect href="/" />;

  const phoneOk = !!normalizeLesothoPhone(phone);
  const pinOk = /^\d{6,8}$/.test(pin);

  const run = async (fn: () => Promise<void>) => {
    setTouched(true);
    setError(null);
    setBusy(true);
    try {
      await fn();
      if (reauth) router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? t('needInternetFirst') : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!phoneOk || (mode !== 'reset' && !pinOk) || (mode === 'register' && !name.trim())) { setTouched(true); return; }
    if (mode === 'signIn') return run(() => app.login(phone, pin));
    if (mode === 'register') return run(() => app.register({ name: name.trim(), phone, businessName: business.trim(), pin }));
    if (!codeSent) return run(async () => { await app.requestReset(phone); setCodeSent(true); });
    if (!pinOk) { setTouched(true); return; }
    return run(() => app.confirmReset(phone, code, pin));
  };

  const switchMode = (m: Mode) => { setMode(m); setError(null); setTouched(false); setCodeSent(false); setPin(''); };

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <View style={{ backgroundColor: color.blue, paddingTop: insets.top + space.xl, paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="bus-school" size={36} tone={color.yellow} />
          <Txt variant="title" tone={color.sheet}>Bus Ledger</Txt>
        </View>
        <Txt tone={color.sheet}>{t('welcome')}</Txt>
        <ChipRow>
          {(['en', 'st'] as Lang[]).map((l) => (
            <Chip key={l} label={l === 'en' ? 'English' : 'Sesotho'} selected={lang === l} onPress={() => app.setLang(l)} />
          ))}
        </ChipRow>
      </View>
      <Screen
        footer={
          <>
            <Btn kind="primary" busy={busy} onPress={submit}
              label={mode === 'signIn' ? t('signIn') : mode === 'register' ? t('createAccount') : codeSent ? t('setPin') : t('sendCode')} />
            {mode === 'signIn' ? <Btn kind="quiet" label={t('newHere')} onPress={() => switchMode('register')} />
              : <Btn kind="quiet" label={t('haveAccount')} onPress={() => switchMode('signIn')} />}
          </>
        }
      >
        <Txt variant="title">{mode === 'signIn' ? t('signIn') : mode === 'register' ? t('createAccount') : t('forgotPin')}</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}
        {mode === 'register' ? (
          <>
            <Field label={t('yourName')} value={name} onChangeText={setName} autoCapitalize="words" error={touched && !name.trim() ? t('required') : null} />
            <Field label={t('business')} optional value={business} onChangeText={setBusiness} autoCapitalize="words" />
          </>
        ) : null}
        <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="5812 3456" autoComplete="tel"
          error={touched && !phoneOk ? t('phoneInvalid') : null} editable={!codeSent} />
        {mode === 'reset' && codeSent ? (
          <>
            <Banner tone="info" text={t('codeSent')} />
            <Field label={t('smsCode')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" />
          </>
        ) : null}
        {mode !== 'reset' || codeSent ? (
          <Field label={mode === 'reset' ? t('newPin') : t('pin')} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
            keyboardType="number-pad" secureTextEntry maxLength={8} error={touched && !pinOk ? t('pin') : null} />
        ) : null}
        {mode === 'signIn' ? <Btn kind="quiet" label={t('forgotPin')} onPress={() => switchMode('reset')} /> : null}
      </Screen>
    </View>
  );
}
