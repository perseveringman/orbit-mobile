import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getVolcengineAsrCredentials } from '../../../core/ai/api-key';
import { readRecordingAudioBase64, writeRecordingTranscription } from '../../../core/ai/recording-transcription';
import { VolcengineAsrClient } from '../../../core/ai/volcengine-asr-client';
import { loadRecordingDetail } from '../../../core/recording/recording-service';
import { loadAppSettings } from '../../../core/settings/app-settings';
import { openDb } from '../../../core/storage/db';
import * as recordingsRepo from '../../../core/storage/recordings-repo';
import { colors, radius, spacing } from '../theme';

type TestState = 'idle' | 'running' | 'succeeded' | 'failed';

interface TestResult {
  state: TestState;
  message: string;
  recordingId?: string;
  title?: string;
  logId?: string | null;
  preview?: string;
}

export function AsrLatestTestScreen(): React.ReactElement {
  const [result, setResult] = useState<TestResult>({
    state: 'idle',
    message: '准备测试最近一条录音',
  });

  async function runTest(): Promise<void> {
    if (!__DEV__) {
      setResult({ state: 'failed', message: '最近录音 ASR 测试只在开发构建中可用' });
      return;
    }
    setResult({ state: 'running', message: '正在读取最近一条录音...' });
    console.info('[asr-test-latest] start');
    let currentRecordingId: string | null = null;
    let currentAttempts = 0;
    try {
      const db = await openDb();
      const [latest] = await recordingsRepo.list(db, 1);
      if (!latest) {
        throw new Error('没有找到录音');
      }
      currentRecordingId = latest.id;
      currentAttempts = latest.final_attempts + 1;
      setResult({
        state: 'running',
        message: '正在读取火山凭证和本地音频...',
        recordingId: latest.id,
        title: latest.title,
      });
      const [settings, credentials, detail] = await Promise.all([
        loadAppSettings(db),
        getVolcengineAsrCredentials(),
        loadRecordingDetail(latest.id, { db }),
      ]);
      if (!credentials) {
        throw new Error('火山 ASR 凭证未保存');
      }
      if (!detail) {
        throw new Error(`录音详情不可读:${latest.id}`);
      }
      console.info('[asr-test-latest] recording', {
        id: latest.id,
        title: latest.title,
        duration_ms: latest.duration_ms,
        final_state: latest.final_state,
        partial_provider: latest.partial_provider,
        audio_exists: detail.audio_exists,
      });
      await recordingsRepo.updateFinalTranscriptionState(db, latest.id, {
        final_state: 'running',
        final_provider: settings.volcengineAsr.resourceId,
        final_attempts: currentAttempts,
        final_last_error: null,
        final_done_at: null,
      });
      const audio = await readRecordingAudioBase64(db, latest.id);
      console.info('[asr-test-latest] audio', {
        filename: audio.filename,
        mime: audio.mime,
        byte_size: audio.byteSize,
      });
      setResult({
        state: 'running',
        message: `正在上传识别 ${audio.filename}...`,
        recordingId: latest.id,
        title: latest.title,
      });
      const recognition = await new VolcengineAsrClient(settings.volcengineAsr, credentials).recognizeBase64({
        audioBase64: audio.audioBase64,
        languageHints: detail.meta.language_hints,
      });
      await writeRecordingTranscription(db, latest.id, recognition);
      const preview = recognition.text.slice(0, 160);
      console.info('[asr-test-latest] succeeded', {
        id: latest.id,
        log_id: recognition.logId,
        duration_ms: recognition.durationMs,
        segments: recognition.segments.length,
        has_speaker_info: recognition.hasSpeakerInfo,
        preview,
      });
      setResult({
        state: 'succeeded',
        message: '火山 ASR 测试通过，已写回最近一条录音',
        recordingId: latest.id,
        title: latest.title,
        logId: recognition.logId,
        preview,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (currentRecordingId) {
        await openDb()
          .then((db) => recordingsRepo.updateFinalTranscriptionState(db, currentRecordingId as string, {
            final_state: 'failed',
            final_attempts: currentAttempts,
            final_last_error: message,
            final_done_at: null,
          }))
          .catch(() => undefined);
      }
      console.warn('[asr-test-latest] failed', message);
      setResult({ state: 'failed', message });
    }
  }

  useEffect(() => {
    void runTest();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Volcengine ASR</Text>
        <Text style={styles.title}>最近录音识别测试</Text>
        <Text selectable style={styles.status}>{statusText(result.state)}</Text>
        <Text selectable style={styles.message}>{result.message}</Text>
        {result.recordingId ? (
          <Text selectable style={styles.meta}>录音：{result.title} · {result.recordingId}</Text>
        ) : null}
        {result.logId ? <Text selectable style={styles.meta}>Log ID：{result.logId}</Text> : null}
        {result.preview ? <Text selectable style={styles.preview}>{result.preview}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={result.state === 'running'}
          onPress={() => {
            void runTest();
          }}
          style={({ pressed }) => [
            styles.button,
            (pressed || result.state === 'running') && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{result.state === 'running' ? '测试中' : '重新测试'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function statusText(state: TestState): string {
  switch (state) {
    case 'running':
      return '正在测试';
    case 'succeeded':
      return '测试通过';
    case 'failed':
      return '测试失败';
    case 'idle':
      return '等待开始';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  status: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  preview: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 23,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#f8fafc',
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  buttonPressed: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
