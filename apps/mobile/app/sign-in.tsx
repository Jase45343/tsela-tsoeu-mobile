import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, formatDateLong, normalizeLesothoPhone, todayInMaseru, type Lang } from '@busledger/core';
import { AccountClosedError, useApp } from '../src/data/AppContext';
import { ApiError } from '../src/sync/api';
import { useT } from '../src/lib/i18n';
import { Banner, Btn, Field, Icon, Screen, Sheet, Txt, type IconName } from '../src/ui/kit';
import { color, font, radius, space } from '../src/ui/theme';

const LOGO_ON_DARK = require('../assets/logo-on-dark.png');
const PHOTO = require('../assets/welcome-photo.jpg');

type Mode = 'welcome' | 'signIn' | 'register' | 'reset';

export default function SignIn() {
  const app = useApp();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const { reauth } = useLocalSearchParams<{ reauth?: string }>();
  const [mode, setMode] = useState<Mode>(reauth || app.profile ? 'signIn' : 'welcome');
  const [phone, setPhone] = useState(app.profile?.phone.replace('+266', '') ?? '');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);

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
      if (e instanceof AccountClosedError) {
        setClosedAt(e.closedAt);
        return;
      }
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

  const switchMode = (m: Mode) => { setMode(m); setError(null); setTouched(false); setCodeSent(false); setPin(''); setClosedAt(null); };
  const closedDay = closedAt ? todayInMaseru(new Date(closedAt)) : null;

  const langSwitch = (
    <View style={s.langRow}>
      {(['en', 'st'] as Lang[]).map((l) => (
        <Pressable key={l} accessibilityRole="button" accessibilityState={{ selected: lang === l }} onPress={() => app.setLang(l)}
          style={[s.langChip, lang === l && { backgroundColor: color.sand }]}>
          <Txt variant="small" bold tone={lang === l ? color.night : color.sand}>{l === 'en' ? 'English' : 'Sesotho'}</Txt>
        </Pressable>
      ))}
    </View>
  );

  if (mode === 'welcome') {
    const feature = (icon: IconName, label: string) => (
      <View style={s.feature}>
        <View style={s.featureIcon}><Icon name={icon} size={26} tone={color.sand} /></View>
        <Txt variant="label" tone={color.sand} center>{label}</Txt>
      </View>
    );
    return (
      <View style={{ flex: 1, backgroundColor: color.night }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }}>
          <View style={{ paddingHorizontal: space.lg }}>{langSwitch}</View>
          <View style={{ alignItems: 'center', paddingHorizontal: space.xl, gap: space.sm, marginTop: space.lg }}>
            <Image source={LOGO_ON_DARK} style={{ width: 168, height: 90 }} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Txt style={s.brand} center>Tsela-Tšoeu</Txt>
            <Txt variant="small" bold tone={color.sandSoft} center style={{ letterSpacing: 2.5 }}>{t('appSubtitle').toUpperCase()}</Txt>
            <View style={s.rule} />
            <Txt variant="title" tone={color.sand} center style={{ fontFamily: font.regular }}>{t('tagline1')}{'\n'}{t('tagline2')}</Txt>
            <Txt tone={color.sandSoft} center style={{ maxWidth: 340 }}>{t('welcomeBody')}</Txt>
          </View>
          <Image source={PHOTO} style={{ width: '100%', aspectRatio: 740 / 500, marginTop: space.md }} resizeMode="cover" accessible={false} />
          <View style={{ paddingHorizontal: space.lg, gap: space.lg, marginTop: -space.xl }}>
            <View style={s.features}>
              {feature('account-group-outline', t('featStudents'))}
              <View style={s.featureRule} />
              {feature('credit-card-outline', t('featPayments'))}
              <View style={s.featureRule} />
              {feature('chart-bar', t('featReports'))}
            </View>
            <Pressable accessibilityRole="button" onPress={() => switchMode('register')}
              style={({ pressed }) => [s.cta, { backgroundColor: pressed ? color.actionPressed : color.action }]}>
              <Txt variant="heading" bold tone={color.onAction}>{t('getStarted')}</Txt>
              <Icon name="arrow-right" tone={color.onAction} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => switchMode('signIn')} style={s.login}>
              <Txt bold tone={color.copper} style={{ textDecorationLine: 'underline' }}>{t('logIn')}</Txt>
              <Icon name="arrow-right" size={20} tone={color.copper} />
            </Pressable>
            <View style={{ alignItems: 'center', gap: 2, marginTop: space.sm }}>
              <Txt variant="small" bold tone={color.sandSoft} style={{ letterSpacing: 2.5 }}>LESOTHO</Txt>
              <Txt variant="small" tone={color.sandSoft} center>{t('footerLine')}</Txt>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <View style={{ backgroundColor: color.night, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {!reauth && !app.profile ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => switchMode('welcome')} style={s.back}>
              <Icon name="arrow-left" tone={color.sand} />
            </Pressable>
          ) : <View />}
          {langSwitch}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Image source={LOGO_ON_DARK} style={{ width: 64, height: 34 }} resizeMode="contain" />
          <Txt variant="title" tone={color.sand}>Tsela-Tšoeu</Txt>
        </View>
      </View>
      <Screen
        footer={closedAt ? (
          <>
            <Btn kind="primary" icon="account-reactivate" busy={busy} label={t('reopenAccount')} onPress={() => void run(() => app.reopenAndSignIn())} />
            <Btn kind="quiet" label={t('cancel')} onPress={() => switchMode('signIn')} />
          </>
        ) : (
          <>
            <Btn kind="primary" busy={busy} onPress={submit}
              label={mode === 'signIn' ? t('signIn') : mode === 'register' ? t('createAccount') : codeSent ? t('setPin') : t('sendCode')} />
            {mode === 'signIn' ? <Btn kind="quiet" label={t('newHere')} onPress={() => switchMode('register')} />
              : <Btn kind="quiet" label={t('haveAccount')} onPress={() => switchMode('signIn')} />}
          </>
        )}
      >
        <Txt variant="title">{mode === 'signIn' ? t('signIn') : mode === 'register' ? t('createAccount') : t('forgotPin')}</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}
        {closedDay ? (
          <Sheet>
            <Txt variant="heading" bold>{t('accountClosedTitle')}</Txt>
            <Txt>{t('accountClosedBody', { closed: formatDateLong(closedDay, lang), until: formatDateLong(addDays(closedDay, 90), lang) })}</Txt>
          </Sheet>
        ) : null}
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

const s = StyleSheet.create({
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs },
  langChip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.sandSoft, justifyContent: 'center' },
  brand: { fontFamily: font.bold, fontSize: 44, lineHeight: 52, color: color.sand, letterSpacing: -1 },
  rule: { width: 56, height: 3, borderRadius: 2, backgroundColor: color.copper, marginVertical: space.sm },
  features: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  feature: { flex: 1, alignItems: 'center', gap: space.sm },
  featureIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center' },
  featureRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: color.sandSoft, opacity: 0.5, marginVertical: space.sm },
  cta: { minHeight: 60, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: 1, borderColor: color.copper },
  login: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  back: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
});
