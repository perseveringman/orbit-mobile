import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDeepSeekApiKey,
  clearVolcengineAsrCredentials,
  getDeepSeekApiKey,
  getVolcengineAsrCredentials,
  hasDeepSeekApiKey,
  hasVolcengineAsrCredentials,
  setDeepSeekApiKey,
  setVolcengineAsrApiKey,
  setVolcengineAsrLegacyKeys,
} from '@/core/ai/api-key';
import { __clearSecureStore } from '../setup/expo-secure-store-mock';

describe('DeepSeek API key storage', () => {
  beforeEach(() => {
    __clearSecureStore();
  });

  it('stores, reads, and clears the key from SecureStore', async () => {
    await expect(hasDeepSeekApiKey()).resolves.toBe(false);

    await setDeepSeekApiKey('  sk-test  ');
    await expect(getDeepSeekApiKey()).resolves.toBe('sk-test');
    await expect(hasDeepSeekApiKey()).resolves.toBe(true);

    await clearDeepSeekApiKey();
    await expect(getDeepSeekApiKey()).resolves.toBeNull();
  });

  it('treats blank values as clear', async () => {
    await setDeepSeekApiKey('sk-test');
    await setDeepSeekApiKey('  ');
    await expect(getDeepSeekApiKey()).resolves.toBeNull();
  });
});

describe('Volcengine ASR credential storage', () => {
  beforeEach(() => {
    __clearSecureStore();
  });

  it('stores App ID and Secret credentials from SecureStore', async () => {
    await expect(hasVolcengineAsrCredentials()).resolves.toBe(false);

    await setVolcengineAsrLegacyKeys('  app-id  ', '  secret-token  ');
    await expect(getVolcengineAsrCredentials()).resolves.toEqual({
      apiKey: null,
      appKey: 'app-id',
      accessKey: 'secret-token',
    });
    await expect(hasVolcengineAsrCredentials()).resolves.toBe(true);
  });

  it('switches cleanly between X-Api-Key and App ID credentials', async () => {
    await setVolcengineAsrApiKey('x-api-key');
    await expect(getVolcengineAsrCredentials()).resolves.toEqual({
      apiKey: 'x-api-key',
      appKey: null,
      accessKey: null,
    });

    await setVolcengineAsrLegacyKeys('app-id', 'secret-token');
    await expect(getVolcengineAsrCredentials()).resolves.toEqual({
      apiKey: null,
      appKey: 'app-id',
      accessKey: 'secret-token',
    });
  });

  it('clears every Volcengine credential field together', async () => {
    await setVolcengineAsrLegacyKeys('app-id', 'secret-token');
    await clearVolcengineAsrCredentials();
    await expect(getVolcengineAsrCredentials()).resolves.toBeNull();
  });
});
