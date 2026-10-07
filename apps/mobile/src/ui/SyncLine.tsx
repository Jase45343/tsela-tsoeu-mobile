import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../data/AppContext';
import { useT } from '../lib/i18n';
import { ago } from '../lib/time';
import { Banner, Icon, Txt } from './kit';
import { color, space } from './theme';

/** FR-033/FR-034: sync state at a glance, plus the long-offline warnings. */
export function SyncLine() {
  const app = useApp();
  const { t, lang } = useT();
  const when = ago(app.lastSyncAt, lang);
  const days = app.daysSinceSync;
  return (
    <View style={{ gap: space.sm }}>
      {app.syncProblem === 'auth' ? <Banner tone="danger" text={t('signInToSync')} action={{ label: t('signIn'), onPress: () => router.push('/sign-in?reauth=1') }} /> : null}
      {app.syncProblem === 'closed' ? <Banner tone="danger" text={app.syncMessage ?? ''} /> : null}
      {days !== null && days >= 30 ? <Banner tone="danger" icon="cloud-off-outline" text={t('offline30', { n: days })} />
        : days !== null && days >= 7 ? <Banner tone="warn" icon="cloud-off-outline" text={t('offline7', { n: days })} /> : null}
      {app.failedCount ? <Banner tone="danger" text={t('failedCount', { n: app.failedCount })} action={{ label: t('syncStatus'), onPress: () => router.push('/sync') }} /> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/sync')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}>
        <Icon name={app.syncing ? 'cloud-sync-outline' : app.pendingCount ? 'cloud-upload-outline' : app.syncProblem === 'network' ? 'cloud-off-outline' : 'cloud-check-outline'} tone={color.inkSoft} />
        <Txt variant="small" tone={color.inkSoft} style={{ flex: 1 }}>
          {app.syncing ? t('syncing') : when ? t('lastSynced', { when }) : t('neverSynced')}
          {app.pendingCount ? ` · ${t('pendingCount', { n: app.pendingCount })}` : ''}
        </Txt>
      </Pressable>
    </View>
  );
}
