import * as SecureStore from 'expo-secure-store';

const DEEPSEEK_API_KEY = 'orbit_mobile_deepseek_api_key';

export async function getDeepSeekApiKey(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(DEEPSEEK_API_KEY);
  return value && value.trim().length > 0 ? value : null;
}

export async function setDeepSeekApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    await clearDeepSeekApiKey();
    return;
  }
  await SecureStore.setItemAsync(DEEPSEEK_API_KEY, trimmed, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearDeepSeekApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DEEPSEEK_API_KEY);
}

export async function hasDeepSeekApiKey(): Promise<boolean> {
  return (await getDeepSeekApiKey()) !== null;
}
