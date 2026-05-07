import { Stack } from 'expo-router';
import { View } from 'react-native';

import { GlobalStatusBar } from '../src/ui/components/global-status-bar';

export default function RootLayout(): React.ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <GlobalStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="recent" />
        <Stack.Screen name="detail/[id]" />
      </Stack>
    </View>
  );
}
