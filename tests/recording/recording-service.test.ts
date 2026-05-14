import { describe, expect, it } from 'vitest';

import { createRecordingCapture, loadRecordingDetail, listRecordingMetas } from '@/core/recording/recording-service';
import * as capturesRepo from '@/core/storage/captures-repo';
import * as recordingsRepo from '@/core/storage/recordings-repo';
import { setValue } from '@/core/storage/device-info';
import { joinPath } from '@/utils/fs';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';

describe('recording service', () => {
  it('creates a recording capture from real audio and local transcript artifacts', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await fs.writeString('/tmp/live.m4a', 'audio-bytes');

    const detail = await createRecordingCapture(
      {
        title: '产品会议',
        audioUri: '/tmp/live.m4a',
        durationMs: 65_000,
        startedAt: '2026-05-14T10:00:00.000Z',
        languageHints: ['zh-CN'],
        partialProvider: 'ios-speech',
        transcriptText: '我们决定先做本地录音。需要 Ryan 跟进测试。',
        waveformSamples: [0.1, 0.4, 0.8, 0.2],
        partials: [
          {
            elapsed_ms: 1200,
            speaker: 'S1',
            text: '我们决定先做本地录音。需要 Ryan 跟进测试。',
            is_final: true,
          },
        ],
      },
      { db, fs, sourceVersion: 'test' },
    );

    const capture = await capturesRepo.get(db, detail.meta.id);
    const recording = await recordingsRepo.get(db, detail.meta.id);
    expect(capture).toMatchObject({
      kind: 'recording',
      has_audio: 1,
      attachment_count: 9,
    });
    expect(recording).toMatchObject({
      title: '产品会议',
      duration_ms: 65_000,
      final_state: 'done',
      partial_provider: 'ios-speech',
    });
    expect(detail.transcript.segments.map((segment) => segment.text).join(' ')).toContain('本地录音');
    expect(detail.derivatives.decisions?.items?.[0]?.body).toContain('决定');
    expect(detail.derivatives.todos?.items?.[0]?.body).toContain('需要');
    expect(detail.waveform_samples).toEqual([0.1, 0.4, 0.8, 0.2]);
    await expect(fs.readString(joinPath(capture?.local_path ?? '', 'audio.m4a'))).resolves.toBe('audio-bytes');
  });

  it('lists and reloads persisted recordings from Layer 2', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await fs.writeString('/tmp/audio.m4a', 'audio-bytes');

    const created = await createRecordingCapture(
      {
        title: '课堂笔记',
        audioUri: '/tmp/audio.m4a',
        durationMs: 30_000,
        startedAt: '2026-05-14T11:00:00.000Z',
        languageHints: [],
        partialProvider: 'unavailable',
        transcriptText: '',
        waveformSamples: [0.2, 0.5],
        partials: [],
      },
      { db, fs, sourceVersion: 'test' },
    );

    const metas = await listRecordingMetas({ db, fs });
    const reloaded = await loadRecordingDetail(created.meta.id, { db, fs });
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ title: '课堂笔记', final_state: 'done' });
    expect(metas[0]?.waveform_samples).toEqual([0.2, 0.5]);
    expect(reloaded?.audio_uri).toContain('/documents/captures/');
    expect(reloaded?.audio_exists).toBe(true);
    expect(reloaded?.waveform_samples).toEqual([0.2, 0.5]);
    expect(reloaded?.transcript.segments[0]?.text).toContain('暂无可用实时转写');
  });
});
