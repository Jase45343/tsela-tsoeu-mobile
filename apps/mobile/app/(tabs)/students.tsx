import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { compareByUrgency, formatMaloti } from '@busledger/core';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { matchesStudent } from '../../src/lib/search';
import { Btn, Chip, ChipRow, Divider, Field, ListRow, StatusTag, Txt } from '../../src/ui/kit';
import { color, space } from '../../src/ui/theme';

type Filter = 'all' | 'owing' | 'clear' | 'left';

/** FR-007: offline search by student, parent or phone; FR-019: owing list sorted by days overdue. */
export default function Students() {
  const app = useApp();
  const { t } = useT();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const rows = app.accounts.filter((a) => {
      if (!matchesStudent(a, q.trim())) return false;
      if (filter === 'left') return a.student.status === 'inactive';
      if (a.student.status === 'inactive') return filter === 'all';
      if (filter === 'owing') return a.net > 0;
      if (filter === 'clear') return a.net <= 0;
      return true;
    });
    return filter === 'owing' ? rows.sort(compareByUrgency) : rows;
  }, [app.accounts, q, filter]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.lg, gap: space.md, backgroundColor: color.ground }}>
        <Field label={t('searchStudents')} value={q} onChangeText={setQ} placeholder={t('searchStudents')} autoCorrect={false} />
        <ChipRow>
          <Chip label={t('filterAll')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={t('filterOwing')} selected={filter === 'owing'} onPress={() => setFilter('owing')} />
          <Chip label={t('filterUpToDate')} selected={filter === 'clear'} onPress={() => setFilter('clear')} />
          <Chip label={t('filterLeft')} selected={filter === 'left'} onPress={() => setFilter('left')} />
        </ChipRow>
      </View>
      <FlatList
        data={list}
        keyExtractor={(a) => a.student.id}
        style={{ backgroundColor: color.sheet }}
        ItemSeparatorComponent={Divider}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ padding: space.xl }}>
            <Txt tone={color.inkSoft}>{app.accounts.length === 0 ? t('noStudents') : t('noMatches', { q })}</Txt>
          </View>
        }
        renderItem={({ item: a }) => (
          <ListRow
            title={a.student.name}
            subtitle={[a.student.parentName, a.student.school].filter(Boolean).join(' · ')}
            onPress={() => router.push(`/student/${a.student.id}`)}
            right={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <StatusTag tag={a.student.status === 'inactive' ? 'inactive' : a.status} />
                {a.net !== 0 ? <Txt variant="label" bold tone={a.net > 0 ? color.owing : color.paid}>{formatMaloti(Math.abs(a.net))}</Txt> : null}
              </View>
            }
          />
        )}
      />
      <View style={{ padding: space.lg, backgroundColor: color.sheet, borderTopWidth: 1, borderTopColor: color.rule }}>
        <Btn kind="secondary" icon="account-plus" label={t('addStudent')} onPress={() => router.push('/student/new')} />
      </View>
    </View>
  );
}
