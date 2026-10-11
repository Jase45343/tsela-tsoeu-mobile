import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useApp } from '../../src/data/AppContext';
import { useT } from '../../src/lib/i18n';
import { Icon, type IconName } from '../../src/ui/kit';
import { color, font } from '../../src/ui/theme';

export default function TabsLayout() {
  const app = useApp();
  const { t } = useT();
  if (app.status === 'signedOut') return <Redirect href="/sign-in" />;
  const icon = (name: IconName) => ({ color: c }: { color: unknown }) => <Icon name={name} size={26} tone={String(c)} />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.inkSoft,
        tabBarLabelStyle: { fontFamily: font.bold, fontSize: 13 },
        tabBarStyle: { height: 68, paddingTop: 6, paddingBottom: 8, backgroundColor: color.sheet },
        headerStyle: { backgroundColor: color.sheet },
        headerTitleStyle: { fontFamily: font.bold, color: color.ink, fontSize: 20 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: color.ground },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabHome'), tabBarIcon: icon('bus-school'), headerShown: false }} />
      <Tabs.Screen name="students" options={{ title: t('tabStudents'), tabBarIcon: icon('account-group') }} />
      <Tabs.Screen name="reports" options={{ title: t('tabReports'), tabBarIcon: icon('chart-box-outline') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabSettings'), tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
