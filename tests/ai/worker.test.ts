import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setDeepSeekApiKey } from '@/core/ai/api-key';
import { runAiWorkerTick } from '@/core/ai/worker';
import { createRecordingCapture, loadRecordingDetail } from '@/core/recording/recording-service';
import * as aiTasksRepo from '@/core/storage/ai-tasks-repo';
import * as capturesRepo from '@/core/storage/captures-repo';
import { setValue } from '@/core/storage/device-info';
import * as recordingsRepo from '@/core/storage/recordings-repo';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';
import { __clearSecureStore } from '../setup/expo-secure-store-mock';

describe('AI worker', () => {
  beforeEach(() => {
    __clearSecureStore();
    vi.unstubAllGlobals();
  });

  it('generates DeepSeek derivatives and atomically updates persisted recording files', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await setDeepSeekApiKey('sk-test');
    await fs.writeString('/tmp/live.m4a', 'audio-bytes');
    vi.stubGlobal('fetch', () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              semantic_title: '本地录音方案评审',
              summary_markdown: '## 概述\nDeepSeek 生成的总结',
              outline: [{ title: '先做本地录音', start_ms: 0 }],
              decisions: [{ title: '先做本地录音', body: '决定先做本地录音', start_ms: 0, end_ms: 1000 }],
              risks: [{ title: '测试风险', body: '需要真机测试', start_ms: 1000, end_ms: 2000 }],
              todos: [{ title: 'Ryan 跟进', body: 'Ryan 跟进测试', owner: 'Ryan', start_ms: 2000, end_ms: 3000 }],
            }),
          },
        }],
      })),
    }));

    const created = await createRecordingCapture(
      {
        title: '产品会议',
        audioUri: '/tmp/live.m4a',
        durationMs: 65_000,
        startedAt: '2026-05-14T10:00:00.000Z',
        languageHints: ['zh-CN'],
        partialProvider: 'ios-speech',
        transcriptText: '我们决定先做本地录音。需要 Ryan 跟进测试。',
        waveformSamples: [0.1],
        partials: [],
      },
      { db, fs, sourceVersion: 'test' },
    );

    const result = await runAiWorkerTick({ db, fs, limit: 1, now: new Date('2026-05-15T00:00:00.000Z') });
    const task = await aiTasksRepo.getByCapture(db, created.meta.id);
    const detail = await loadRecordingDetail(created.meta.id, { db, fs });
    const capture = await capturesRepo.get(db, created.meta.id);
    const recording = await recordingsRepo.get(db, created.meta.id);
    const manifest = JSON.parse(await fs.readString(`${capture?.local_path}/manifest.json`)) as {
      content: string;
    };

    expect(result).toMatchObject({ processed: 1, succeeded: 1 });
    expect(task).toMatchObject({ status: 'succeeded', attempts: 1 });
    expect(recording?.title).toBe('本地录音方案评审');
    expect(detail?.meta.title).toBe('本地录音方案评审');
    expect(manifest.content.startsWith('本地录音方案评审\n\n')).toBe(true);
    expect(capture?.content_preview).toContain('本地录音方案评审');
    expect(detail?.derivatives.summary?.provider).toBe('deepseek-v4-flash');
    expect(detail?.derivatives.summary?.body).toContain('DeepSeek 生成的总结');
    await expect(fs.readString(`${capture?.local_path}/summary.json`)).resolves.toContain('deepseek-v4-flash');
    await expect(fs.readString(`${capture?.local_path}/manifest.json.sha256`)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('skips AI generation when no usable transcript exists', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await setDeepSeekApiKey('sk-test');
    await fs.writeString('/tmp/audio.m4a', 'audio-bytes');

    const created = await createRecordingCapture(
      {
        title: '空转写',
        audioUri: '/tmp/audio.m4a',
        durationMs: 10_000,
        startedAt: '2026-05-14T10:00:00.000Z',
        languageHints: [],
        partialProvider: 'unavailable',
        transcriptText: '',
        waveformSamples: [],
        partials: [],
      },
      { db, fs, sourceVersion: 'test' },
    );

    const result = await runAiWorkerTick({ db, fs, limit: 1 });
    const task = await aiTasksRepo.getByCapture(db, created.meta.id);
    expect(result).toMatchObject({ processed: 1, skipped: 1 });
    expect(task).toMatchObject({ status: 'skipped', last_error: 'ai.no_transcript' });
  });
});
