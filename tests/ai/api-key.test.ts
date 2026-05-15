import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDeepSeekApiKey,
  getDeepSeekApiKey,
  hasDeepSeekApiKey,
  setDeepSeekApiKey,
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
