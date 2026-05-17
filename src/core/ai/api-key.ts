import * as SecureStore from 'expo-secure-store';

const DEEPSEEK_API_KEY = 'orbit_mobile_deepseek_api_key';
const VOLCENGINE_ASR_API_KEY = 'orbit_mobile_volcengine_asr_api_key';
const VOLCENGINE_ASR_APP_KEY = 'orbit_mobile_volcengine_asr_app_key';
const VOLCENGINE_ASR_ACCESS_KEY = 'orbit_mobile_volcengine_asr_access_key';

export interface VolcengineAsrCredentials {
  apiKey: string | null;
  appKey: string | null;
  accessKey: string | null;
}

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

export async function getVolcengineAsrCredentials(): Promise<VolcengineAsrCredentials | null> {
  const [apiKey, appKey, accessKey] = await Promise.all([
    readSecret(VOLCENGINE_ASR_API_KEY),
    readSecret(VOLCENGINE_ASR_APP_KEY),
    readSecret(VOLCENGINE_ASR_ACCESS_KEY),
  ]);
  if (apiKey) {
    return { apiKey, appKey: null, accessKey: null };
  }
  if (appKey && accessKey) {
    return { apiKey: null, appKey, accessKey };
  }
  return null;
}

export async function setVolcengineAsrApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    await SecureStore.deleteItemAsync(VOLCENGINE_ASR_API_KEY);
    return;
  }
  await SecureStore.setItemAsync(VOLCENGINE_ASR_API_KEY, trimmed, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function setVolcengineAsrLegacyKeys(appKey: string, accessKey: string): Promise<void> {
  const normalizedAppKey = appKey.trim();
  const normalizedAccessKey = accessKey.trim();
  if (!normalizedAppKey || !normalizedAccessKey) {
    await clearVolcengineAsrLegacyKeys();
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(VOLCENGINE_ASR_APP_KEY, normalizedAppKey, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(VOLCENGINE_ASR_ACCESS_KEY, normalizedAccessKey, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  ]);
}

export async function clearVolcengineAsrCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(VOLCENGINE_ASR_API_KEY),
    clearVolcengineAsrLegacyKeys(),
  ]);
}

export async function hasVolcengineAsrCredentials(): Promise<boolean> {
  return (await getVolcengineAsrCredentials()) !== null;
}

async function clearVolcengineAsrLegacyKeys(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(VOLCENGINE_ASR_APP_KEY),
    SecureStore.deleteItemAsync(VOLCENGINE_ASR_ACCESS_KEY),
  ]);
}

async function readSecret(key: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(key);
  return value && value.trim().length > 0 ? value : null;
}
