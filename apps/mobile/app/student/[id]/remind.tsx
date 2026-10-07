import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { reminderText, type Lang } from '@busledger/core';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { openWhatsApp } from '../../../src/lib/share';
import { Banner, Btn, Chip, ChipRow, Field, Screen, Sheet, Txt } from '../../../src/ui/kit';
import { space } from '../../../src/ui/theme';

/** FR-025: an informational WhatsApp message the operator reviews and sends. Never automatic, never a payment link. */
export default function Remind() {
  const app = useApp();
  const { t, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = app.accountById.get(id);
  const [msgLang, setMsgLang] = useState<Lang>(lang);
  const [instructions, setInstructions] = useState('');
  if (!a) return null;

  const periods = a.periods
    .filter((v) => v.state.balance > 0 && !v.period.cancelled)
    .map((v) => ({ year: v.period.year, month: v.period.month, balance: v.state.balance }))
    .reverse();
  const text = reminderText({
    parentName: a.student.parentName, studentName: a.student.name, businessName: app.settings.businessName || app.profile?.name || '',
    periods, total: Math.max(a.net, 0), instructions,
  }, msgLang);

  if (a.net <= 0) return <Screen><Stack.Screen options={{ title: t('sendReminder') }} /><Banner tone="info" text={t('nothingToRemind')} /></Screen>;

  return (
    <Screen footer={<Btn kind="secondary" icon="whatsapp" label={t('openWhatsApp')} onPress={async () => { await openWhatsApp(a.student.parentPhone, text); router.back(); }} />}>
      <Stack.Screen options={{ title: t('reminderTitle', { name: a.student.parentName }) }} />
      <View style={{ gap: space.sm }}>
        <Txt variant="label" bold>{t('language')}</Txt>
        <ChipRow>
          <Chip label="English" selected={msgLang === 'en'} onPress={() => setMsgLang('en')} />
          <Chip label="Sesotho" selected={msgLang === 'st'} onPress={() => setMsgLang('st')} />
        </ChipRow>
      </View>
      <Field label={t('instructions')} optional value={instructions} onChangeText={setInstructions} multiline />
      <Sheet><Txt>{text}</Txt></Sheet>
      <Txt variant="small">{t('reminderInfo')}</Txt>
    </Screen>
  );
}
