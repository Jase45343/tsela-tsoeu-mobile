import { View } from 'react-native';
import { Stack } from 'expo-router';
import { formatMaloti } from '@busledger/core';
import { useApp } from '../src/data/AppContext';
import { useT, type StringKey } from '../src/lib/i18n';
import { Banner, Btn, Divider, ListRow, Screen, Sheet, StatusTag, Txt } from '../src/ui/kit';
import { SyncLine } from '../src/ui/SyncLine';
import { color, space } from '../src/ui/theme';

const KIND: Record<string, StringKey> = { student: 'kindStudent', period: 'kindPeriod', payment: 'kindPayment', adjustment: 'kindAdjustment', ack: 'kindAck' };

/** FR-033: per-record sync state, with manual retry. */
export default function SyncScreen() {
  const app = useApp();
  const { t } = useT();
  const names = new Map(app.snapshot.students.map((s) => [s.id, s.name]));
  const amounts = new Map(app.snapshot.payments.map((p) => [p.id, p.amount]));
  const open = app.snapshot.sync.filter((i) => i.status === 'pending' || i.status === 'failed').sort((a, b) => (a.status === b.status ? 0 : a.status === 'failed' ? -1 : 1));

  return (
    <Screen footer={<Btn kind="secondary" icon="cloud-sync-outline" label={app.syncing ? t('syncing') : t('syncNow')} busy={app.syncing} onPress={() => void app.sync()} />}>
      <Stack.Screen options={{ title: t('syncStatus') }} />
      <SyncLine />
      {app.syncProblem === 'network' ? <Banner tone="warn" icon="cloud-off-outline" text={t('couldNotReach')} /> : null}
      {app.syncProblem === 'server' && app.syncMessage ? <Banner tone="danger" text={app.syncMessage} /> : null}
      {app.failedCount ? <Btn kind="secondary" icon="refresh" label={t('retry')} onPress={() => void app.retryFailed()} /> : null}
      <Sheet style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {open.length === 0 ? <View style={{ padding: space.lg }}><StatusTag tag="paid" label={t('allSynced')} /></View> : null}
        {open.map((i, n) => (
          <View key={`${i.kind}-${i.id}`}>
            {n ? <Divider /> : null}
            <ListRow
              title={`${t(KIND[i.kind] ?? 'kindPayment')}${i.studentId ? ` · ${names.get(i.studentId) ?? ''}` : ''}${amounts.has(i.id) ? ` · ${formatMaloti(amounts.get(i.id)!)}` : ''}`}
              subtitle={i.status === 'failed' ? <Txt variant="small" tone={color.owing}>{i.error ?? t('failed')}</Txt> : t('pending')}
              right={<StatusTag tag={i.status === 'failed' ? 'unpaid' : 'partial'} label={i.status === 'failed' ? t('failed') : t('pending')} />}
            />
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}
