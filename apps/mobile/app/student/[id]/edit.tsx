import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../../src/data/AppContext';
import { useT } from '../../../src/lib/i18n';
import { StudentForm } from '../../../src/ui/StudentForm';

export default function EditStudent() {
  const app = useApp();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const student = app.snapshot.students.find((s) => s.id === id);
  if (!student) return null;
  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <StudentForm existing={student} today={app.today} rules={app.settings} onSave={async (v) => {
        await app.updateStudent({ ...student, ...v.student, onboardedAt: student.onboardedAt });
        router.back();
      }} />
    </>
  );
}
