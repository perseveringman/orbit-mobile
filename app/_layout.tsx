import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlobalStatusBar } from '../src/ui/components/global-status-bar';

export default function RootLayout(): React.ReactElement {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <GlobalStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="recent" />
        <Stack.Screen name="detail/[id]" />
      </Stack>
    </SafeAreaView>
  );
}
