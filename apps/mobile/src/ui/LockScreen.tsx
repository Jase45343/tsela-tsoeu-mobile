import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../data/AppContext';
import { useT } from '../lib/i18n';
import { Btn, Field, Icon, Txt } from './kit';
import { color, space } from './theme';

/** FR-002: after the idle period, or on a cold start, the PIN is asked again. Works offline. */
export function LockScreen() {
  const app = useApp();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await app.unlock(pin);
    setBusy(false);
    if (!ok) { setWrong(true); setPin(''); }
  };

  const forgot = () => {
    const pending = app.pendingCount + app.failedCount;
    Alert.alert(t('forgotPin'), pending ? t('signOutPending', { n: pending }) : t('forgotPinLocked'), [
      { text: t('cancel'), style: 'cancel' },
      ...(pending ? [] : [{ text: t('signOut'), style: 'destructive' as const, onPress: () => void app.signOut() }]),
    ]);
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ground, paddingTop: insets.top + space.xxl, padding: space.xl, gap: space.xl }]}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <Icon name="lock" size={48} tone={color.blue} />
        <Txt variant="title" center>{t('unlockTitle')}</Txt>
        {app.profile ? <Txt tone={color.inkSoft} center>{app.profile.name}</Txt> : null}
      </View>
      <Field label="PIN" value={pin} onChangeText={(v) => { setPin(v.replace(/\D/g, '')); setWrong(false); }} keyboardType="number-pad" secureTextEntry maxLength={8} autoFocus onSubmitEditing={submit} error={wrong ? t('wrongPin') : null} />
      <Btn kind="primary" label={t('unlock')} onPress={submit} busy={busy} disabled={pin.length < 6} />
      <Btn kind="quiet" label={t('forgotPin')} onPress={forgot} />
    </View>
  );
}
