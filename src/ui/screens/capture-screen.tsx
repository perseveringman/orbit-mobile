/**
 * capture-screen.tsx — 主输入界面
 *
 * 核心屏：文本输入 + 录音按钮 + 选图。Draft 每 2s 自动保存。
 * 启动 < 1s 到可输入；不等 reconcile 完成。
 *
 * @see docs/UX-PRINCIPLES.md
 * @see docs/ARCHITECTURE.md §7
 *
 */

import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createCapture, createTextCapture } from '../../core/capture/atomic-write';
import { runReconcile } from '../../core/reconcile/reconcile-job';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import type { VoiceRecordingResult } from '../../core/audio/recorder';
import type { PickedImage } from '../../core/image/picker';
import { ImageButton } from '../components/image-button';
import { VoiceButton } from '../components/voice-button';
import { useDraft } from '../hooks/use-draft';

export function CaptureScreen(): React.ReactElement {
  const inputRef = useRef<TextInput>(null);
  const draft = useDraft();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipboardText, setClipboardText] = useState<string | null>(null);

  useEffect(() => {
    const focusHandle = setTimeout(() => inputRef.current?.focus(), 50);
    openDb()
      .then((db) => runReconcile({ db }))
      .catch((reconcileError: unknown) => {
        setError(reconcileError instanceof Error ? reconcileError.message : String(reconcileError));
      });
    Clipboard.hasStringAsync()
      .then((hasString) => (hasString ? Clipboard.getStringAsync() : Promise.resolve('')))
      .then((value) => {
        const trimmed = value.trim();
        if (trimmed.length > 0) setClipboardText(trimmed.slice(0, 5000));
      })
      .catch((clipboardError: unknown) => {
        setError(clipboardError instanceof Error ? clipboardError.message : String(clipboardError));
      });
    return () => clearTimeout(focusHandle);
  }, []);

  async function save(): Promise<void> {
    const content = draft.content.trim();
    if (!content || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const db = await openDb();
      await createTextCapture(
        {
          content,
          sessionId: draft.sessionId,
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await draft.clear();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('已保存 ✓');
      void runSyncTick({ db });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveVoice(result: VoiceRecordingResult): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const db = await openDb();
      const content = draft.content.trim() || '语音记录';
      await createCapture(
        {
          kind: 'voice',
          content,
          sessionId: draft.sessionId,
          attachments: [
            {
              type: 'audio',
              filename: 'audio.m4a',
              localUri: result.uri,
              mime: 'audio/m4a',
              duration_ms: result.durationMs ?? undefined,
              recorded_at: new Date().toISOString(),
              transcription: draft.content.trim() || undefined,
              transcription_source: draft.content.trim() ? 'manual' : undefined,
            },
          ],
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await draft.clear();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('语音已保存 ✓');
      void runSyncTick({ db });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : String(voiceError));
    } finally {
      setSaving(false);
    }
  }

  async function saveImages(images: PickedImage[]): Promise<void> {
    if (images.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const db = await openDb();
      const content = draft.content.trim();
      await createCapture(
        {
          kind: content.length > 0 ? 'mixed' : 'photo',
          content,
          sessionId: draft.sessionId,
          attachments: images.map((image, index) => ({
            type: 'image',
            filename: image.filename || `photo-${index + 1}.jpg`,
            localUri: image.uri,
            mime: image.mime,
            width: image.width,
            height: image.height,
            captured_at: new Date().toISOString(),
          })),
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await draft.clear();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('图片已保存 ✓');
      void runSyncTick({ db });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : String(imageError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.topBar}>
        <Text style={styles.status}>○ 本地优先</Text>
        <Link href="/recent" style={styles.recentLink}>
          最近
        </Link>
      </View>

      {draft.restored ? <Text style={styles.restored}>已恢复上次未完成草稿</Text> : null}
      {clipboardText && draft.content.trim().length === 0 ? (
        <Pressable
          style={styles.clipboard}
          onPress={() => {
            draft.setContent(clipboardText);
            setClipboardText(null);
          }}
        >
          <Text style={styles.clipboardText}>粘贴剪贴板内容</Text>
        </Pressable>
      ) : null}
      {message ? <Text style={styles.toast}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        ref={inputRef}
        autoFocus
        multiline
        placeholder="捕捉这一刻……"
        style={styles.input}
        textAlignVertical="top"
        value={draft.content}
        onChangeText={(value) => draft.setContent(value)}
      />

      <View style={styles.bottomBar}>
        <VoiceButton
          disabled={saving}
          onRecorded={(result) => {
            void saveVoice(result);
          }}
          onError={(voiceError) => {
            setError(voiceError instanceof Error ? voiceError.message : String(voiceError));
          }}
        />
        <ImageButton
          disabled={saving}
          onPicked={(images) => {
            void saveImages(images);
          }}
          onError={(imageError) => {
            setError(imageError instanceof Error ? imageError.message : String(imageError));
          }}
        />
        <Text style={styles.disabledAction}>#</Text>
        <Pressable
          accessibilityRole="button"
          disabled={saving || draft.content.trim().length === 0}
          style={({ pressed }) => [
            styles.saveButton,
            (saving || draft.content.trim().length === 0) && styles.saveButtonDisabled,
            pressed && styles.saveButtonPressed,
          ]}
          onPress={() => {
            void save();
          }}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>完成</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 32,
    justifyContent: 'space-between',
  },
  status: {
    color: '#475569',
    fontSize: 13,
  },
  recentLink: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  restored: {
    color: '#0f766e',
    fontSize: 13,
    marginTop: 8,
  },
  clipboard: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    padding: 12,
  },
  clipboardText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  toast: {
    color: '#166534',
    fontSize: 13,
    marginTop: 8,
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
    marginTop: 8,
  },
  input: {
    flex: 1,
    fontSize: 22,
    lineHeight: 31,
    paddingVertical: 24,
  },
  bottomBar: {
    alignItems: 'center',
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 18,
    minHeight: 58,
    paddingTop: 10,
  },
  disabledAction: {
    fontSize: 24,
    opacity: 0.35,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 999,
    marginLeft: 'auto',
    minWidth: 88,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  saveButtonDisabled: {
    opacity: 0.35,
  },
  saveButtonPressed: {
    opacity: 0.75,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
