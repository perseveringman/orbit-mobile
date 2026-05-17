import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBootstrap } from '../src/ui/components/app-bootstrap';
import { GlobalStatusBar } from '../src/ui/components/global-status-bar';

export default function RootLayout(): React.ReactElement {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <AppBootstrap />
      <GlobalStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="recent" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="hotwords" />
        <Stack.Screen name="detail/[id]" />
        <Stack.Screen name="recording/index" />
        <Stack.Screen name="recording/asr-test-latest" />
        <Stack.Screen name="recording/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recording/x1" />
        <Stack.Screen name="recording/x1-debug" />
        <Stack.Screen name="recording/[id]/index" />
        <Stack.Screen name="recording/[id]/notes" />
        <Stack.Screen name="recording/[id]/ask" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaView>
  );
}
