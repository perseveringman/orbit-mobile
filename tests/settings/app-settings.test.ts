import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_VOLCENGINE_ASR_SETTINGS,
  loadAppSettings,
  setAiAutoGenerate,
  setAiBaseUrl,
  setAiEnabled,
  setAiHotwords,
  setAiModel,
  setImageOriginalPolicy,
  setKeepImageOriginal,
  setVolcengineAsrAutoImported,
  setVolcengineAsrBaseUrl,
  setVolcengineAsrBoostingTableId,
  setVolcengineAsrEnabled,
  setVolcengineAsrResourceId,
} from '@/core/settings/app-settings';
import { createMigratedTestDb } from '../setup/in-memory-db';

describe('app settings', () => {
  it('keeps image originals by default and persists opt-out', async () => {
    const db = await createMigratedTestDb();

    await expect(loadAppSettings(db)).resolves.toEqual({
      keepImageOriginal: true,
      imageOriginalPolicy: 'always_original',
      ai: DEFAULT_AI_SETTINGS,
      aiHotwords: [],
      volcengineAsr: DEFAULT_VOLCENGINE_ASR_SETTINGS,
    });

    await setKeepImageOriginal(db, false);
    await expect(loadAppSettings(db)).resolves.toMatchObject({
      keepImageOriginal: false,
      imageOriginalPolicy: 'compressed_only',
    });

    await setKeepImageOriginal(db, true);
    await expect(loadAppSettings(db)).resolves.toMatchObject({
      keepImageOriginal: true,
      imageOriginalPolicy: 'always_original',
    });
  });

  it('persists image original policy', async () => {
    const db = await createMigratedTestDb();

    await setImageOriginalPolicy(db, 'wifi_original');

    await expect(loadAppSettings(db)).resolves.toMatchObject({
      keepImageOriginal: true,
      imageOriginalPolicy: 'wifi_original',
    });
  });

  it('persists non-sensitive AI settings in SQLite', async () => {
    const db = await createMigratedTestDb();

    await setAiEnabled(db, false);
    await setAiAutoGenerate(db, false);
    await setAiModel(db, 'deepseek-v4-pro');
    await setAiBaseUrl(db, 'https://example.com/');

    await expect(loadAppSettings(db)).resolves.toMatchObject({
      ai: {
        enabled: false,
        autoGenerate: false,
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        baseUrl: 'https://example.com',
      },
    });
  });

  it('persists normalized AI hotwords in SQLite', async () => {
    const db = await createMigratedTestDb();

    await setAiHotwords(db, [' Orbit ', 'orbit', '纽曼   X1', '', 'DeepSeek']);

    await expect(loadAppSettings(db)).resolves.toMatchObject({
      aiHotwords: ['Orbit', '纽曼 X1', 'DeepSeek'],
    });
  });

  it('persists non-sensitive Volcengine ASR settings in SQLite', async () => {
    const db = await createMigratedTestDb();

    await setVolcengineAsrEnabled(db, false);
    await setVolcengineAsrAutoImported(db, false);
    await setVolcengineAsrBaseUrl(db, 'https://example.com/');
    await setVolcengineAsrResourceId(db, 'volc.test');
    await setVolcengineAsrBoostingTableId(db, 'boost-123');

    await expect(loadAppSettings(db)).resolves.toMatchObject({
      volcengineAsr: {
        enabled: false,
        autoTranscribeImported: false,
        provider: 'volcengine',
        mode: 'flash',
        baseUrl: 'https://example.com',
        resourceId: 'volc.test',
        boostingTableId: 'boost-123',
      },
    });
  });
});
