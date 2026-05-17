import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setDeepSeekApiKey, setVolcengineAsrApiKey } from '@/core/ai/api-key';
import { runAiWorkerTick } from '@/core/ai/worker';
import {
  acceptTranscriptCorrections,
  listPendingTranscriptCorrections,
} from '@/core/ai/transcript-proofread';
import { createRecordingCapture, loadRecordingDetail } from '@/core/recording/recording-service';
import { setAiHotwords, setVolcengineAsrEnabled } from '@/core/settings/app-settings';
import * as aiTasksRepo from '@/core/storage/ai-tasks-repo';
import * as annotationsRepo from '@/core/storage/recording-annotations-repo';
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

  it('does not enqueue text AI generation when no usable transcript exists', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await setDeepSeekApiKey('sk-test');
    await setVolcengineAsrEnabled(db, false);
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
    const notesTask = await aiTasksRepo.getByCapture(db, created.meta.id);
    const transcriptionTask = await aiTasksRepo.getByCapture(db, created.meta.id, 'recording_transcription');
    expect(result).toMatchObject({ processed: 0 });
    expect(notesTask).toBeNull();
    expect(transcriptionTask).toBeNull();
  });

  it('recognizes imported audio with Volcengine ASR and writes transcript locally', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await setVolcengineAsrApiKey('volc-key');
    await fs.writeString('/tmp/import.mp3', 'audio-bytes');
    vi.stubGlobal('fetch', (input: string, init: { headers: Record<string, string>; body: string }) => {
      expect(input).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash');
      expect(init.headers['X-Api-Key']).toBe('volc-key');
      expect(init.headers['X-Api-Resource-Id']).toBe('volc.bigasr.auc_turbo');
      expect(JSON.parse(init.body)).toMatchObject({
        audio: { data: Buffer.from('audio-bytes', 'utf8').toString('base64') },
        request: {
          model_name: 'bigmodel',
          enable_speaker_info: true,
          ssd_version: '200',
          show_utterances: true,
        },
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => ({
            'X-Api-Status-Code': '20000000',
            'X-Api-Message': 'OK',
            'X-Tt-Logid': 'log-1',
          })[name] ?? null,
        },
        text: () => Promise.resolve(JSON.stringify({
          audio_info: { duration: 2100 },
          result: {
            text: '今天讨论 Orbit Mobile 录音导入。好，我来跟进。',
            utterances: [
              {
                start_time: 0,
                end_time: 1600,
                text: '今天讨论 Orbit Mobile 录音导入。',
                additions: { speaker: '1' },
                words: [
                  { start_time: 0, end_time: 300, text: '今天', confidence: 0.91 },
                ],
              },
              {
                start_time: 1600,
                end_time: 3100,
                text: '好，我来跟进。',
                additions: { speaker: '2' },
              },
            ],
          },
        })),
      });
    });

    const created = await createRecordingCapture(
      {
        title: '导入音频',
        audioUri: '/tmp/import.mp3',
        audioFilename: 'audio.mp3',
        audioMime: 'audio/mpeg',
        durationMs: 0,
        startedAt: '2026-05-17T10:00:00.000Z',
        languageHints: ['zh-CN'],
        partialProvider: 'audio-import',
        transcriptText: '',
        waveformSamples: [],
        partials: [],
      },
      { db, fs, sourceVersion: 'test' },
    );

    const result = await runAiWorkerTick({ db, fs, limit: 1, now: new Date('2026-05-17T10:01:00.000Z') });
    const transcriptionTask = await aiTasksRepo.getByCapture(db, created.meta.id, 'recording_transcription');
    const notesTask = await aiTasksRepo.getByCapture(db, created.meta.id, 'recording_notes');
    const detail = await loadRecordingDetail(created.meta.id, { db, fs });
    const recording = await recordingsRepo.get(db, created.meta.id);
    const capture = await capturesRepo.get(db, created.meta.id);
    const manifest = JSON.parse(await fs.readString(`${capture?.local_path}/manifest.json`)) as {
      content: string;
      attachments: Array<{ type: string; transcription?: string; transcription_source?: string }>;
      recording?: { diarization_provider?: string | null; speakers?: Array<{ id: string }> };
    };

    expect(result).toMatchObject({ processed: 1, succeeded: 1 });
    expect(transcriptionTask).toMatchObject({ status: 'succeeded' });
    expect(notesTask).toMatchObject({ status: 'queued', provider: 'deepseek' });
    expect(recording).toMatchObject({
      final_state: 'done',
      final_provider: 'volcengine:volc.bigasr.auc_turbo',
      speaker_count: 2,
    });
    expect(detail?.transcript.segments[0]).toMatchObject({
      text: '今天讨论 Orbit Mobile 录音导入。',
      start_ms: 0,
      end_ms: 1600,
      speaker: 'S1',
    });
    expect(detail?.transcript.segments[1]).toMatchObject({
      text: '好，我来跟进。',
      start_ms: 1600,
      end_ms: 3100,
      speaker: 'S2',
    });
    expect(detail?.transcript.speakers.map((speaker) => speaker.id)).toEqual(['S1', 'S2']);
    expect(manifest.content).toContain('今天讨论 Orbit Mobile 录音导入。');
    expect(manifest.attachments.find((item) => item.type === 'audio')).toMatchObject({
      transcription: '今天讨论 Orbit Mobile 录音导入。\n好，我来跟进。',
      transcription_source: 'volcengine:volc.bigasr.auc_turbo',
    });
    expect(manifest.recording).toMatchObject({
      diarization_provider: 'volcengine:volc.bigasr.auc_turbo',
      speakers: [{ id: 'S1' }, { id: 'S2' }],
    });
  });

  it('generates hotword-aware transcript corrections and accepts them into local transcript files', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await setDeepSeekApiKey('sk-test');
    await setAiHotwords(db, ['Orbit Mobile']);
    await fs.writeString('/tmp/audio.m4a', 'audio-bytes');
    vi.stubGlobal('fetch', () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              corrections: [{
                segment_id: 0,
                original_text: '欧比特 Mobile',
                corrected_text: 'Orbit Mobile',
                reason: '命中用户热词',
                confidence: 0.96,
                hotword: 'Orbit Mobile',
              }],
            }),
          },
        }],
      })),
    }));

    const created = await createRecordingCapture(
      {
        title: '热词会议',
        audioUri: '/tmp/audio.m4a',
        durationMs: 20_000,
        startedAt: '2026-05-17T10:00:00.000Z',
        languageHints: ['zh-CN'],
        partialProvider: 'ios-speech',
        transcriptText: '今天讨论欧比特 Mobile 的录音校对。',
        waveformSamples: [],
        partials: [],
      },
      { db, fs, sourceVersion: 'test' },
    );
    const notesTask = await aiTasksRepo.getByCapture(db, created.meta.id, 'recording_notes');
    await aiTasksRepo.markSkipped(db, notesTask?.id ?? '', 'test.skip_notes');

    const result = await runAiWorkerTick({ db, fs, limit: 1 });
    const proofreadTask = await aiTasksRepo.getByCapture(db, created.meta.id, 'recording_proofread');
    const corrections = await listPendingTranscriptCorrections(db, created.meta.id);

    expect(result).toMatchObject({ processed: 1, succeeded: 1 });
    expect(proofreadTask).toMatchObject({ status: 'succeeded' });
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      original_text: '欧比特 Mobile',
      corrected_text: 'Orbit Mobile',
      hotword: 'Orbit Mobile',
    });

    await acceptTranscriptCorrections(db, created.meta.id, [corrections[0]?.id ?? ''], fs);
    const detail = await loadRecordingDetail(created.meta.id, { db, fs });
    const capture = await capturesRepo.get(db, created.meta.id);
    const manifest = JSON.parse(await fs.readString(`${capture?.local_path}/manifest.json`)) as {
      content: string;
      attachments: Array<{ type: string; transcription?: string }>;
    };
    const annotationRows = await annotationsRepo.listByRecording(db, created.meta.id, 'transcript_correction');
    const accepted = annotationRows
      .map((row) => annotationsRepo.parsePayload<{ status?: string }>(row))
      .find(Boolean);

    expect(detail?.transcript.segments[0]?.text).toContain('Orbit Mobile');
    expect(manifest.content).toContain('Orbit Mobile');
    expect(manifest.attachments.find((item) => item.type === 'audio')?.transcription).toContain('Orbit Mobile');
    expect(await listPendingTranscriptCorrections(db, created.meta.id)).toHaveLength(0);
    expect(accepted).toMatchObject({ status: 'accepted' });
  });
});
