import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, useFonts } from '@expo-google-fonts/atkinson-hyperlegible';
import { AppProvider, useApp } from '../src/data/AppContext';
import { LangContext } from '../src/lib/i18n';
import { LockScreen } from '../src/ui/LockScreen';
import { color, font } from '../src/ui/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold });
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell fontsLoaded={fontsLoaded} />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Shell({ fontsLoaded }: { fontsLoaded: boolean }) {
  const app = useApp();
  const ready = fontsLoaded && app.status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <LangContext.Provider value={{ lang: app.lang, setLang: app.setLang }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.sheet },
          headerTintColor: color.blue,
          headerTitleStyle: { fontFamily: font.bold, color: color.ink, fontSize: 20 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.ground },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack>
      {app.status === 'locked' ? <LockScreen /> : null}
    </LangContext.Provider>
  );
}
