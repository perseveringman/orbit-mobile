import { Stack } from 'expo-router';

export default function RootLayout(): React.ReactElement {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="recent" />
      <Stack.Screen name="detail/[id]" />
    </Stack>
  );
}
