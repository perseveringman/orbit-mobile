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
import { Link, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createCapture } from '../../core/capture/atomic-write';
import type { CaptureAttachment } from '../../core/capture/types';
import { loadAppSettings, type ImageOriginalPolicy } from '../../core/settings/app-settings';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import { writeWidgetSnapshot } from '../../core/widget/snapshot';
import type { VoiceRecordingResult } from '../../core/audio/recorder';
import type { LiveTranscriptionState } from '../../core/audio/transcription';
import type { PickedImage } from '../../core/image/picker';
import { ComposerIcon } from '../components/composer-icons';
import { MediaPicker } from '../components/media-picker';
import { VoiceButton } from '../components/voice-button';
import { useDraft } from '../hooks/use-draft';

interface PendingVoice {
  id: string;
  uri: string;
  durationMs?: number | null;
  recordedAt: string;
  transcription?: string;
  transcriptionSource?: string;
}

export function CaptureScreen(): React.ReactElement {
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  const draft = useDraft();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const voiceTranscriptBaseRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [liveTranscription, setLiveTranscription] = useState<LiveTranscriptionState | null>(null);
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const [pendingVoices, setPendingVoices] = useState<PendingVoice[]>([]);
  const canSave =
    draft.content.trim().length > 0 || pendingImages.length > 0 || pendingVoices.length > 0;

  useEffect(() => {
    const focusHandle = setTimeout(() => inputRef.current?.focus(), 50);
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

  useEffect(() => {
    function updateKeyboardInset(event: KeyboardEvent): void {
      const overlap = Math.max(0, window.height - event.endCoordinates.screenY - insets.bottom);
      setKeyboardInset(overlap);
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, updateKeyboardInset);
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, window.height]);

  async function save(): Promise<void> {
    const content = draft.content.trim();
    if (!canSave || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const db = await openDb();
      const settings = await loadAppSettings(db);
      const imageAttachments = imageCaptureAttachments(pendingImages, settings.imageOriginalPolicy);
      const voiceAttachments = voiceCaptureAttachments(pendingVoices, content);
      await createCapture(
        {
          content:
            content ||
            fallbackContent({
              hasImages: pendingImages.length > 0,
              hasVoices: pendingVoices.length > 0,
            }),
          sessionId: draft.sessionId,
          attachments: [...voiceAttachments, ...imageAttachments],
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await draft.clear();
      setPendingImages([]);
      setPendingVoices([]);
      setLiveTranscription(null);
      voiceTranscriptBaseRef.current = null;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('已保存 ✓');
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  function appendImages(images: PickedImage[]): void {
    if (images.length === 0) return;
    setPendingImages((current) => [...current, ...images].slice(0, 10));
    setMessage(images.length === 1 ? '图片已加入' : `${images.length} 张图片已加入`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function appendVoice(result: VoiceRecordingResult): void {
    const transcript = liveTranscription?.transcript.trim() ?? '';
    setPendingVoices((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        uri: result.uri,
        durationMs: result.durationMs,
        recordedAt: new Date().toISOString(),
        transcription: transcript || undefined,
        transcriptionSource: transcript
          ? liveTranscription?.source === 'ios-speech'
            ? 'ios-speech'
            : 'manual'
          : undefined,
      },
    ]);
    setLiveTranscription(null);
    voiceTranscriptBaseRef.current = null;
    setMessage('语音已加入');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.status}>○ 本地优先</Text>
        <View style={styles.topBarLinks}>
          <Link href="/recording" style={styles.recordingLink}>
            录音
          </Link>
          <Link href="/recent" style={styles.recentLink}>
            最近
          </Link>
          <Link href="/settings" style={styles.recentLink}>
            设置
          </Link>
        </View>
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
          <Text style={styles.clipboardText}>
            {isUrl(clipboardText) ? '保存剪贴板链接' : '粘贴剪贴板内容'}
          </Text>
          {isUrl(clipboardText) ? (
            <Text numberOfLines={1} style={styles.clipboardUrl}>
              {clipboardText}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {message ? <Text style={styles.toast}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.composer, { marginBottom: keyboardInset + insets.bottom }]}>
        <TextInput
          ref={inputRef}
          autoFocus
          blurOnSubmit={false}
          multiline
          placeholder="捕捉这一刻……"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          textAlignVertical="top"
          value={draft.content}
          onChangeText={(value) => draft.setContent(value)}
        />

        {pendingImages.length > 0 || pendingVoices.length > 0 ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.previewRail}
            contentContainerStyle={styles.previewRailContent}
          >
            {pendingImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.imagePreview}>
                <Image source={{ uri: image.uri }} style={styles.imageThumb} />
                <Pressable
                  accessibilityLabel="移除图片"
                  accessibilityRole="button"
                  onPress={() => {
                    setPendingImages((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    );
                  }}
                  style={styles.removeButton}
                >
                  <ComposerIcon name="x" color="#ffffff" size={14} />
                </Pressable>
              </View>
            ))}
            {pendingVoices.map((voice, index) => (
              <View key={voice.id} style={styles.voicePreview}>
                <ComposerIcon name="mic" color="#4338ca" size={18} />
                <Text style={styles.voicePreviewText}>{formatDuration(voice.durationMs)}</Text>
                <Pressable
                  accessibilityLabel="移除语音"
                  accessibilityRole="button"
                  onPress={() => {
                    setPendingVoices((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    );
                  }}
                  style={styles.voiceRemoveButton}
                >
                  <ComposerIcon name="x" color="#64748b" size={12} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.bottomBar}>
          <VoiceButton
            disabled={saving}
            onTranscript={(state) => {
              setLiveTranscription(state);
              if (voiceTranscriptBaseRef.current === null) {
                voiceTranscriptBaseRef.current = draft.content.trimEnd();
              }
              const base = voiceTranscriptBaseRef.current;
              draft.setContent(base ? `${base}\n${state.transcript}` : state.transcript);
            }}
            onRecorded={appendVoice}
            onError={(voiceError) => {
              voiceTranscriptBaseRef.current = null;
              setError(voiceError instanceof Error ? voiceError.message : String(voiceError));
            }}
          />
          <MediaPicker
            disabled={saving}
            onPicked={appendImages}
            onError={(imageError) => {
              setError(imageError instanceof Error ? imageError.message : String(imageError));
            }}
          />
          <Pressable
            accessibilityLabel="持续录音"
            accessibilityRole="button"
            disabled={saving}
            onPress={() => router.push('/recording/new')}
            onLongPress={() => router.push('/recording/new')}
            style={({ pressed }) => [
              styles.iconButton,
              styles.recordingButton,
              saving && styles.iconButtonDisabled,
              pressed && !saving && styles.iconButtonPressed,
            ]}
          >
            <ComposerIcon name="recording" color="#dc2626" size={22} />
          </Pressable>
          {keyboardInset > 0 ? (
            <Pressable
              accessibilityLabel="收起键盘"
              accessibilityRole="button"
              onPress={() => {
                Keyboard.dismiss();
              }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <ComposerIcon name="keyboard" color="#334155" size={22} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="插入标签"
              accessibilityRole="button"
              onPress={() => {
                const next = draft.content.length === 0 ? '# ' : `${draft.content.trimEnd()}\n# `;
                draft.setContent(next);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <ComposerIcon name="hash" color="#334155" size={22} />
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="保存"
            accessibilityRole="button"
            disabled={saving || !canSave}
            style={({ pressed }) => [
              styles.saveButton,
              (saving || !canSave) && styles.saveButtonDisabled,
              pressed && canSave && styles.saveButtonPressed,
            ]}
            onPress={() => {
              void save();
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ComposerIcon name="send" color="#fff" size={24} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function imageCaptureAttachments(
  images: PickedImage[],
  policy: ImageOriginalPolicy,
): CaptureAttachment[] {
  return images.flatMap((image, index) => {
    const capturedAt = new Date().toISOString();
    const compressed: CaptureAttachment = {
      type: 'image',
      filename: `photo-${index + 1}.jpg`,
      localUri: image.uri,
      mime: image.mime,
      byte_size: image.byteSize,
      width: image.width,
      height: image.height,
      captured_at: capturedAt,
    };
    if (policy === 'compressed_only' || !image.compressed || image.originalUri === image.uri) {
      return [compressed];
    }
    return [
      compressed,
      {
        type: 'file',
        filename: originalImageFilename(image.originalFilename, index),
        localUri: image.originalUri,
        mime: image.originalMime,
        captured_at: capturedAt,
        sync_hint: policy === 'wifi_original' ? 'wifi_only' : undefined,
      },
    ];
  });
}

function voiceCaptureAttachments(voices: PendingVoice[], content: string): CaptureAttachment[] {
  return voices.map((voice, index) => ({
    type: 'audio',
    filename: voices.length === 1 ? 'audio.m4a' : `audio-${index + 1}.m4a`,
    localUri: voice.uri,
    mime: 'audio/m4a',
    duration_ms: voice.durationMs ?? undefined,
    recorded_at: voice.recordedAt,
    transcription: (voice.transcription ?? content) || undefined,
    transcription_source: voice.transcriptionSource ?? (content ? 'manual' : undefined),
  }));
}

function fallbackContent({
  hasImages,
  hasVoices,
}: {
  hasImages: boolean;
  hasVoices: boolean;
}): string {
  if (hasVoices && hasImages) return '图文语音记录';
  if (hasVoices) return '语音记录';
  return '';
}

function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs < 1000) return '0:01';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function originalImageFilename(filename: string, index: number): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const extension = safe.includes('.') ? safe.split('.').filter(Boolean).at(-1) : 'jpg';
  return `original-photo-${index + 1}.${extension ?? 'jpg'}`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 30,
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
  topBarLinks: {
    flexDirection: 'row',
    gap: 16,
  },
  recordingLink: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '700',
  },
  restored: {
    color: '#0f766e',
    fontSize: 13,
    marginTop: 6,
  },
  clipboard: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12,
  },
  clipboardText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  clipboardUrl: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
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
  composer: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ef',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    fontSize: 22,
    lineHeight: 31,
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  previewRail: {
    flexGrow: 0,
    maxHeight: 90,
  },
  previewRailContent: {
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  imagePreview: {
    borderRadius: 8,
    height: 76,
    width: 76,
  },
  imageThumb: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    height: 76,
    width: 76,
  },
  removeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -6,
    top: -6,
    width: 24,
  },
  voicePreview: {
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    height: 44,
    paddingLeft: 12,
    paddingRight: 8,
  },
  voicePreviewText: {
    color: '#4338ca',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  voiceRemoveButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  bottomBar: {
    alignItems: 'center',
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  iconButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  recordingButton: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 52,
  },
  saveButtonDisabled: {
    opacity: 0.35,
  },
  saveButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
});
