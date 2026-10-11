import { router, Stack } from 'expo-router';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { StudentForm } from '../../src/ui/StudentForm';

export default function NewStudent() {
  const app = useApp();
  const { t } = useT();
  return (
    <>
      <Stack.Screen options={{ title: t('addStudent') }} />
      <StudentForm today={app.today} rules={app.settings} onSave={async (v) => {
        const id = await app.addStudent(v.student, v.choice, v.custom);
        router.replace(`/student/${id}`);
      }} />
    </>
  );
}
