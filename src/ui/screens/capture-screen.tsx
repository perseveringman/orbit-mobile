/**
 * capture-screen.tsx — Markdown Capture 主界面
 *
 * 默认启动页：以 Markdown 为承载体，图片 / 文件 / 短录音都插入为 attachment block。
 * 它不是桌面级 Markdown 编辑器，而是移动端 Capture-grade composer。
 *
 * @see docs/UX-PRINCIPLES.md
 * @see docs/ARCHITECTURE.md §7
 */

import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
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
import type { KeyboardEvent, NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createCapture } from '../../core/capture/atomic-write';
import type { CaptureAttachment } from '../../core/capture/types';
import type { VoiceRecordingResult } from '../../core/audio/recorder';
import type { LiveTranscriptionState } from '../../core/audio/transcription';
import { pickFiles, sanitizeAttachmentFilename, type PickedFile } from '../../core/file/picker';
import type { PickedImage } from '../../core/image/picker';
import { loadAppSettings, type ImageOriginalPolicy } from '../../core/settings/app-settings';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import { writeWidgetSnapshot } from '../../core/widget/snapshot';
import { ComposerIcon, type ComposerIconName } from '../components/composer-icons';
import { MediaPicker } from '../components/media-picker';
import { VoiceButton } from '../components/voice-button';
import { useDraft } from '../hooks/use-draft';

interface PendingMarkdownImage extends PickedImage {
  id: string;
  filename: string;
  capturedAt: string;
  markdownBlock: string;
}

interface PendingMarkdownFile extends PickedFile {
  id: string;
  markdownBlock: string;
}

interface PendingMarkdownVoice {
  id: string;
  uri: string;
  filename: string;
  durationMs?: number | null;
  recordedAt: string;
  transcription?: string;
  transcriptionSource?: string;
  markdownBlock: string;
}

interface ActiveVoiceDraft {
  base: string;
  filename: string;
}

interface CaptureScreenProps {
  active?: boolean;
  embedded?: boolean;
}

type Selection = { start: number; end: number };
type ToolbarAction =
  | 'undo'
  | 'redo'
  | 'tag'
  | 'image'
  | 'file'
  | 'voice'
  | 'heading'
  | 'bold'
  | 'quote'
  | 'italic'
  | 'strikethrough'
  | 'highlight'
  | 'orderedList'
  | 'unorderedList'
  | 'checklist'
  | 'codeBlock';

const MARKDOWN_TOOLBAR_ACTIONS: ToolbarAction[] = [
  'undo',
  'redo',
  'tag',
  'image',
  'file',
  'voice',
  'heading',
  'bold',
  'quote',
  'italic',
  'strikethrough',
  'highlight',
  'orderedList',
  'unorderedList',
  'checklist',
  'codeBlock',
];

export function CaptureScreen({
  active = true,
  embedded = false,
}: CaptureScreenProps): React.ReactElement {
  const inputRef = useRef<TextInput>(null);
  const draft = useDraft();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const activeVoiceDraftRef = useRef<ActiveVoiceDraft | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const imageSeqRef = useRef(1);
  const fileSeqRef = useRef(1);
  const voiceSeqRef = useRef(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [historyCounts, setHistoryCounts] = useState({ redo: 0, undo: 0 });
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [liveTranscription, setLiveTranscription] = useState<LiveTranscriptionState | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingMarkdownImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingMarkdownFile[]>([]);
  const [pendingVoices, setPendingVoices] = useState<PendingMarkdownVoice[]>([]);
  const canSave =
    draft.content.trim().length > 0
    || pendingImages.length > 0
    || pendingFiles.length > 0
    || pendingVoices.length > 0;

  useEffect(() => {
    if (!active) {
      inputRef.current?.blur();
      setKeyboardInset(0);
      setToolbarVisible(false);
      return undefined;
    }
    const focusHandle = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(focusHandle);
  }, [active]);

  useEffect(() => {
    Clipboard.hasStringAsync()
      .then((hasString) => (hasString ? Clipboard.getStringAsync() : Promise.resolve('')))
      .then((value) => {
        const trimmed = value.trim();
        if (trimmed.length > 0) setClipboardText(trimmed.slice(0, 5000));
      })
      .catch((clipboardError: unknown) => {
        setError(errorMessage(clipboardError));
      });
  }, []);

  useEffect(() => {
    function updateKeyboardInset(event: KeyboardEvent): void {
      const overlap = Math.max(0, window.height - event.endCoordinates.screenY - insets.bottom);
      setKeyboardInset(overlap);
      setToolbarVisible(overlap > 0);
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, updateKeyboardInset);
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
      setToolbarVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, window.height]);

  function syncHistoryCounts(): void {
    setHistoryCounts({
      redo: redoStackRef.current.length,
      undo: undoStackRef.current.length,
    });
  }

  function pushUndo(value: string): void {
    if (undoStackRef.current.at(-1) === value) return;
    undoStackRef.current = [...undoStackRef.current, value].slice(-80);
  }

  function setDraftContent(value: string, track = true): void {
    if (value === draft.content) return;
    if (track) {
      pushUndo(draft.content);
      redoStackRef.current = [];
      syncHistoryCounts();
    }
    draft.setContent(value);
  }

  function undo(): void {
    const previous = undoStackRef.current.at(-1);
    if (previous === undefined) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, draft.content].slice(-80);
    draft.setContent(previous);
    syncHistoryCounts();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function redo(): void {
    const next = redoStackRef.current.at(-1);
    if (next === undefined) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    pushUndo(draft.content);
    draft.setContent(next);
    syncHistoryCounts();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

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
      const fileAttachments = fileCaptureAttachments(pendingFiles);
      const voiceAttachments = voiceCaptureAttachments(pendingVoices);
      await createCapture(
        {
          content:
            content ||
            fallbackContent({
              hasFiles: pendingFiles.length > 0,
              hasImages: pendingImages.length > 0,
              hasVoices: pendingVoices.length > 0,
            }),
          sessionId: draft.sessionId,
          attachments: [...voiceAttachments, ...imageAttachments, ...fileAttachments],
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await draft.clear();
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryCounts();
      setPendingImages([]);
      setPendingFiles([]);
      setPendingVoices([]);
      setLiveTranscription(null);
      activeVoiceDraftRef.current = null;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('已保存');
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function appendImages(images: PickedImage[]): void {
    if (images.length === 0) return;
    const nextImages = images.map((image) => {
      const filename = `photo-${imageSeqRef.current}.jpg`;
      imageSeqRef.current += 1;
      return {
        ...image,
        id: `${filename}-${Date.now()}`,
        filename,
        capturedAt: new Date().toISOString(),
        markdownBlock: `![${filename}](attachment://${filename})`,
      };
    });
    setPendingImages((current) => [...current, ...nextImages].slice(0, 10));
    insertMarkdownBlocks(nextImages.map((image) => image.markdownBlock));
    setMessage(images.length === 1 ? '图片已插入 Markdown' : `${images.length} 张图片已插入 Markdown`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function appendFiles(): Promise<void> {
    if (saving) return;
    setError(null);
    try {
      const files = await pickFiles();
      if (files.length === 0) return;
      const nextFiles = files.map((file) => {
        const filename = uniqueFilename(
          sanitizeAttachmentFilename(file.displayName, 'file.bin'),
          fileSeqRef.current,
        );
        fileSeqRef.current += 1;
        return {
          ...file,
          id: `${filename}-${Date.now()}`,
          filename,
          markdownBlock: `[${file.displayName}](attachment://${filename})`,
        };
      });
      setPendingFiles((current) => [...current, ...nextFiles].slice(0, 20));
      insertMarkdownBlocks(nextFiles.map((file) => file.markdownBlock));
      setMessage(files.length === 1 ? '文件已插入 Markdown' : `${files.length} 个文件已插入 Markdown`);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (fileError) {
      setError(errorMessage(fileError));
    }
  }

  function appendVoice(result: VoiceRecordingResult): void {
    const transcript = liveTranscription?.transcript.trim() ?? '';
    const activeVoiceDraft = activeVoiceDraftRef.current ?? {
      base: draft.content.trimEnd(),
      filename: voiceFilename(voiceSeqRef.current),
    };
    const filename = activeVoiceDraft.filename;
    voiceSeqRef.current += 1;
    const markdownBlock = voiceMarkdownBlock({
      durationLabel: formatDuration(result.durationMs),
      filename,
      live: false,
      transcript,
    });
    setPendingVoices((current) => [
      ...current,
      {
        id: `${filename}-${Date.now()}`,
        uri: result.uri,
        filename,
        durationMs: result.durationMs,
        recordedAt: new Date().toISOString(),
        transcription: transcript || undefined,
        transcriptionSource: transcript
          ? liveTranscription?.source === 'ios-speech'
            ? 'ios-speech'
            : 'manual'
          : undefined,
        markdownBlock,
      },
    ]);
    const nextContent = joinMarkdownBlock(activeVoiceDraft.base, markdownBlock);
    if (nextContent !== draft.content) {
      pushUndo(activeVoiceDraft.base);
      redoStackRef.current = [];
      draft.setContent(nextContent);
      syncHistoryCounts();
    }
    setLiveTranscription(null);
    activeVoiceDraftRef.current = null;
    setMessage('短录音已插入 Markdown');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function ensureActiveVoiceDraft(): ActiveVoiceDraft {
    if (activeVoiceDraftRef.current) {
      return activeVoiceDraftRef.current;
    }
    const next = {
      base: draft.content.trimEnd(),
      filename: voiceFilename(voiceSeqRef.current),
    };
    activeVoiceDraftRef.current = next;
    return next;
  }

  function insertMarkdownBlocks(blocks: string[]): void {
    if (blocks.length === 0) return;
    const current = draft.content;
    const start = Math.max(0, Math.min(selection.start, current.length));
    const end = Math.max(start, Math.min(selection.end, current.length));
    const before = current.slice(0, start);
    const after = current.slice(end);
    const insertion = blocks.join('\n');
    const prefix = before.trim().length === 0
      ? ''
      : before.endsWith('\n\n')
        ? ''
        : before.endsWith('\n')
          ? '\n'
          : '\n\n';
    const suffix = after.trim().length === 0
      ? ''
      : after.startsWith('\n\n')
        ? ''
        : after.startsWith('\n')
          ? '\n'
          : '\n\n';
    setDraftContent(`${before}${prefix}${insertion}${suffix}${after}`);
  }

  function removeBlock(block: string): void {
    const escaped = escapeRegExp(block);
    const next = draft.content
      .replace(new RegExp(`\\n{0,2}${escaped}\\n{0,2}`, 'g'), '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    setDraftContent(next);
  }

  function updateSelection(
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ): void {
    setSelection(event.nativeEvent.selection);
  }

  function applyToolbarAction(action: ToolbarAction): void {
    if (action === 'undo') {
      undo();
      return;
    }
    if (action === 'redo') {
      redo();
      return;
    }
    if (action === 'image' || action === 'voice') {
      return;
    }
    if (action === 'file') {
      void appendFiles();
      return;
    }
    if (action === 'tag') {
      insertMarkdownAtSelection('#标签');
      return;
    }
    if (action === 'heading') {
      chooseHeadingLevel();
      return;
    }
    if (action === 'bold') {
      wrapSelection('**', '**', '加粗文字');
      return;
    }
    if (action === 'quote') {
      prefixSelectedLines('> ', '引用');
      return;
    }
    if (action === 'italic') {
      wrapSelection('*', '*', '斜体文字');
      return;
    }
    if (action === 'strikethrough') {
      wrapSelection('~~', '~~', '删除文字');
      return;
    }
    if (action === 'highlight') {
      wrapSelection('==', '==', '高亮文字');
      return;
    }
    if (action === 'orderedList') {
      prefixSelectedLines((index) => `${index + 1}. `, '列表项');
      return;
    }
    if (action === 'unorderedList') {
      prefixSelectedLines('- ', '列表项');
      return;
    }
    if (action === 'checklist') {
      prefixSelectedLines('- [ ] ', '待办');
      return;
    }
    if (action === 'codeBlock') {
      wrapAsCodeBlock();
    }
  }

  function chooseHeadingLevel(): void {
    if (Platform.OS !== 'ios') {
      applyHeadingLevel(2);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: 6,
        options: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', '取消'],
        title: '标题级别',
      },
      (buttonIndex) => {
        if (buttonIndex >= 0 && buttonIndex < 6) {
          applyHeadingLevel(buttonIndex + 1);
        }
      },
    );
  }

  function applyHeadingLevel(level: number): void {
    prefixSelectedLines(`${'#'.repeat(level)} `, `H${level} 标题`);
  }

  function insertMarkdownAtSelection(markdown: string): void {
    const current = draft.content;
    const start = Math.max(0, Math.min(selection.start, current.length));
    const end = Math.max(start, Math.min(selection.end, current.length));
    setDraftContent(`${current.slice(0, start)}${markdown}${current.slice(end)}`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function wrapSelection(prefix: string, suffix: string, placeholder: string): void {
    const current = draft.content;
    const start = Math.max(0, Math.min(selection.start, current.length));
    const end = Math.max(start, Math.min(selection.end, current.length));
    const selected = current.slice(start, end) || placeholder;
    setDraftContent(`${current.slice(0, start)}${prefix}${selected}${suffix}${current.slice(end)}`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function prefixSelectedLines(
    prefix: string | ((index: number) => string),
    placeholder = '',
  ): void {
    const current = draft.content;
    const start = Math.max(0, Math.min(selection.start, current.length));
    const end = Math.max(start, Math.min(selection.end, current.length));
    const selected = current.slice(start, end) || placeholder;
    const lines = selected.length > 0 ? selected.split(/\r?\n/) : [''];
    const next = lines
      .map((line, index) => `${typeof prefix === 'function' ? prefix(index) : prefix}${line}`)
      .join('\n');
    setDraftContent(`${current.slice(0, start)}${next}${current.slice(end)}`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function wrapAsCodeBlock(): void {
    const current = draft.content;
    const start = Math.max(0, Math.min(selection.start, current.length));
    const end = Math.max(start, Math.min(selection.end, current.length));
    const selected = current.slice(start, end);
    const code = selected.trim().length > 0 ? selected : '代码';
    setDraftContent(`${current.slice(0, start)}\`\`\`\n${code}\n\`\`\`${current.slice(end)}`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function hideKeyboardToolbar(): void {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardInset(0);
    setToolbarVisible(false);
  }

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {!embedded ? (
        <View style={styles.topBar}>
          <View>
            <Text style={styles.modeLabel}>Markdown Capture</Text>
            <Text style={styles.status}>本地优先 · 附件随笔记保存</Text>
          </View>
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
      ) : null}

      {draft.restored ? <Text style={styles.restored}>已恢复上次未完成草稿</Text> : null}
      {clipboardText && draft.content.trim().length === 0 ? (
        <Pressable
          style={styles.clipboard}
          onPress={() => {
            setDraftContent(isUrl(clipboardText) ? `[${clipboardText}](${clipboardText})` : clipboardText);
            setClipboardText(null);
          }}
        >
          <Text style={styles.clipboardText}>
            {isUrl(clipboardText) ? '插入剪贴板链接' : '粘贴剪贴板内容'}
          </Text>
          {isUrl(clipboardText) ? (
            <Text numberOfLines={1} style={styles.clipboardUrl}>
              {clipboardText}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {message ? <Text style={styles.toast}>{message}</Text> : null}
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}

      <View style={[styles.editorShell, { marginBottom: toolbarVisible ? keyboardInset + insets.bottom : 0 }]}>
        <TextInput
          ref={inputRef}
          autoFocus
          blurOnSubmit={false}
          multiline
          onChangeText={setDraftContent}
          onFocus={() => setToolbarVisible(true)}
          onSelectionChange={updateSelection}
          placeholder={'# 标题\n\n写下想法，或插入图片、文件、短录音...'}
          placeholderTextColor="#94a3b8"
          scrollEnabled
          style={styles.input}
          textAlignVertical="top"
          value={draft.content}
        />

        {pendingImages.length > 0 || pendingFiles.length > 0 || pendingVoices.length > 0 ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.attachmentRail}
            contentContainerStyle={styles.attachmentRailContent}
          >
            {pendingImages.map((image) => (
              <View key={image.id} style={styles.imagePreview}>
                <Image source={{ uri: image.uri }} style={styles.imageThumb} />
                <Text numberOfLines={1} style={styles.attachmentCaption}>{image.filename}</Text>
                <RemoveButton
                  onPress={() => {
                    setPendingImages((current) => current.filter((item) => item.id !== image.id));
                    removeBlock(image.markdownBlock);
                  }}
                />
              </View>
            ))}
            {pendingFiles.map((file) => (
              <AttachmentPill
                key={file.id}
                icon="file"
                label={file.displayName}
                meta={formatBytes(file.byteSize)}
                onRemove={() => {
                  setPendingFiles((current) => current.filter((item) => item.id !== file.id));
                  removeBlock(file.markdownBlock);
                }}
              />
            ))}
            {pendingVoices.map((voice) => (
              <AttachmentPill
                key={voice.id}
                icon="mic"
                label="短录音"
                meta={formatDuration(voice.durationMs)}
                onRemove={() => {
                  setPendingVoices((current) => current.filter((item) => item.id !== voice.id));
                  removeBlock(voice.markdownBlock);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {toolbarVisible ? (
          <View style={styles.bottomBar}>
            <View style={styles.markdownToolbarGroup}>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.markdownToolbarContent}
              >
                {MARKDOWN_TOOLBAR_ACTIONS.map((action) => {
                  if (action === 'image') {
                    return (
                      <MediaPicker
                        key={action}
                        disabled={saving}
                        onPicked={appendImages}
                        onError={(imageError) => {
                          setError(errorMessage(imageError));
                        }}
                        variant="toolbar"
                      />
                    );
                  }
                  if (action === 'voice') {
                    return (
                      <VoiceButton
                        key={action}
                        disabled={saving}
                        onTranscript={(state) => {
                          setLiveTranscription(state);
                          const activeVoiceDraft = ensureActiveVoiceDraft();
                          setDraftContent(joinMarkdownBlock(
                            activeVoiceDraft.base,
                            voiceMarkdownBlock({
                              durationLabel: '录音中',
                              filename: activeVoiceDraft.filename,
                              live: true,
                              transcript: state.transcript,
                            }),
                          ), false);
                        }}
                        onRecorded={appendVoice}
                        onError={(voiceError) => {
                          activeVoiceDraftRef.current = null;
                          setError(errorMessage(voiceError));
                        }}
                        variant="toolbar"
                      />
                    );
                  }
                  const disabled = saving
                    || (action === 'undo' && historyCounts.undo === 0)
                    || (action === 'redo' && historyCounts.redo === 0);
                  return (
                    <MarkdownToolbarButton
                      key={action}
                      action={action}
                      disabled={disabled}
                      onPress={() => applyToolbarAction(action)}
                    />
                  );
                })}
              </ScrollView>
            </View>
            <Pressable
              accessibilityLabel="保存"
              accessibilityRole="button"
              disabled={saving || !canSave}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.sendDockButton,
                (saving || !canSave) && styles.sendDockButtonDisabled,
                pressed && canSave && !saving && styles.iconButtonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ComposerIcon name="send" color="#ffffff" size={23} />
              )}
            </Pressable>
            <Pressable
              accessibilityLabel="收起键盘"
              accessibilityRole="button"
              onPress={hideKeyboardToolbar}
              style={({ pressed }) => [styles.keyboardDismissButton, pressed && styles.iconButtonPressed]}
            >
              <ComposerIcon name="keyboardHide" color="#262626" size={25} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AttachmentPill({
  icon,
  label,
  meta,
  onRemove,
}: {
  icon: 'file' | 'mic';
  label: string;
  meta: string;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <View style={styles.attachmentPill}>
      <ComposerIcon name={icon} color="#334155" size={18} />
      <View style={styles.attachmentText}>
        <Text numberOfLines={1} style={styles.attachmentLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.attachmentMeta}>{meta}</Text>
      </View>
      <RemoveButton onPress={onRemove} compact />
    </View>
  );
}

function MarkdownToolbarButton({
  action,
  disabled,
  onPress,
}: {
  action: ToolbarAction;
  disabled?: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityLabel={toolbarLabel(action)}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolbarIconButton,
        disabled && styles.iconButtonDisabled,
        pressed && !disabled && styles.iconButtonPressed,
      ]}
    >
      <ComposerIcon name={toolbarIconName(action)} color="#262626" size={25} />
    </Pressable>
  );
}

function RemoveButton({
  compact,
  onPress,
}: {
  compact?: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityLabel="移除附件"
      accessibilityRole="button"
      onPress={onPress}
      style={[compact ? styles.removeButtonCompact : styles.removeButton]}
    >
      <ComposerIcon name="x" color={compact ? '#64748b' : '#ffffff'} size={compact ? 12 : 14} />
    </Pressable>
  );
}

function toolbarIconName(action: ToolbarAction): ComposerIconName {
  switch (action) {
    case 'bold':
      return 'bold';
    case 'checklist':
      return 'checklist';
    case 'codeBlock':
      return 'codeBlock';
    case 'file':
      return 'file';
    case 'heading':
      return 'heading';
    case 'highlight':
      return 'highlight';
    case 'image':
      return 'image';
    case 'italic':
      return 'italic';
    case 'orderedList':
      return 'orderedList';
    case 'quote':
      return 'quote';
    case 'redo':
      return 'redo';
    case 'strikethrough':
      return 'strikethrough';
    case 'tag':
      return 'tag';
    case 'undo':
      return 'undo';
    case 'unorderedList':
      return 'unorderedList';
    case 'voice':
      return 'mic';
  }
}

function toolbarLabel(action: ToolbarAction): string {
  switch (action) {
    case 'bold':
      return '加粗';
    case 'checklist':
      return '待办';
    case 'codeBlock':
      return '代码块';
    case 'file':
      return '添加文件';
    case 'heading':
      return '标题';
    case 'highlight':
      return '高亮';
    case 'image':
      return '添加图片';
    case 'italic':
      return '斜体';
    case 'orderedList':
      return '有序列表';
    case 'quote':
      return '引用';
    case 'redo':
      return '恢复';
    case 'strikethrough':
      return '删除';
    case 'tag':
      return '标签';
    case 'undo':
      return '撤销';
    case 'unorderedList':
      return '无序列表';
    case 'voice':
      return '短录音';
  }
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
  images: PendingMarkdownImage[],
  policy: ImageOriginalPolicy,
): CaptureAttachment[] {
  return images.flatMap((image, index) => {
    const compressed: CaptureAttachment = {
      type: 'image',
      filename: image.filename,
      localUri: image.uri,
      mime: image.mime,
      byte_size: image.byteSize,
      width: image.width,
      height: image.height,
      captured_at: image.capturedAt,
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
        captured_at: image.capturedAt,
        sync_hint: policy === 'wifi_original' ? 'wifi_only' : undefined,
      },
    ];
  });
}

function fileCaptureAttachments(files: PendingMarkdownFile[]): CaptureAttachment[] {
  return files.map((file) => ({
    type: 'file',
    filename: file.filename,
    localUri: file.uri,
    mime: file.mime,
    byte_size: file.byteSize,
  }));
}

function voiceCaptureAttachments(voices: PendingMarkdownVoice[]): CaptureAttachment[] {
  return voices.map((voice) => ({
    type: 'audio',
    filename: voice.filename,
    localUri: voice.uri,
    mime: 'audio/m4a',
    duration_ms: voice.durationMs ?? undefined,
    recorded_at: voice.recordedAt,
    transcription: voice.transcription,
    transcription_source: voice.transcriptionSource,
  }));
}

function fallbackContent({
  hasFiles,
  hasImages,
  hasVoices,
}: {
  hasFiles: boolean;
  hasImages: boolean;
  hasVoices: boolean;
}): string {
  const parts = [
    hasImages ? '图片' : null,
    hasFiles ? '文件' : null,
    hasVoices ? '语音' : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' / ')} Capture` : 'Markdown Capture';
}

function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs < 1000) return '0:01';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function voiceFilename(seq: number): string {
  return seq === 1 ? 'audio.m4a' : `audio-${seq}.m4a`;
}

function voiceMarkdownBlock({
  durationLabel,
  filename,
  live,
  transcript,
}: {
  durationLabel: string;
  filename: string;
  live: boolean;
  transcript: string;
}): string {
  const reference = `[短录音 ${durationLabel}](attachment://${filename})`;
  const cleanTranscript = transcript.trim();
  if (cleanTranscript.length === 0) return reference;
  return `${reference}\n\n> ${live ? '短录音转录（实时）' : '短录音转录'}\n${quoteMarkdown(cleanTranscript)}`;
}

function quoteMarkdown(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => (line.trim().length === 0 ? '>' : `> ${line}`))
    .join('\n');
}

function joinMarkdownBlock(base: string, block: string): string {
  return base.trim().length > 0 ? `${base}\n\n${block}` : block;
}

function formatBytes(byteSize: number | undefined): string {
  if (byteSize === undefined) return '本地附件';
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function originalImageFilename(filename: string, index: number): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const extension = safe.includes('.') ? safe.split('.').filter(Boolean).at(-1) : 'jpg';
  return `original-photo-${index + 1}.${extension ?? 'jpg'}`;
}

function uniqueFilename(filename: string, seq: number): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return `${filename}-${seq}`;
  return `${filename.slice(0, dot)}-${seq}${filename.slice(dot)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  containerEmbedded: {
    paddingTop: 0,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 42,
    justifyContent: 'space-between',
  },
  modeLabel: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  status: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  recentLink: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  topBarLinks: {
    flexDirection: 'row',
    gap: 14,
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
  editorShell: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ef',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  input: {
    color: '#0f172a',
    flex: 1,
    fontFamily: Platform.select({ ios: 'Menlo', default: undefined }),
    fontSize: 17,
    lineHeight: 25,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  attachmentRail: {
    flexGrow: 0,
    maxHeight: 104,
  },
  attachmentRailContent: {
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  imagePreview: {
    borderRadius: 8,
    height: 86,
    width: 86,
  },
  imageThumb: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    height: 64,
    width: 86,
  },
  attachmentCaption: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
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
  removeButtonCompact: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  attachmentPill: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#dbe3ef',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    maxWidth: 220,
    paddingLeft: 12,
    paddingRight: 6,
  },
  attachmentText: {
    minWidth: 86,
  },
  attachmentLabel: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 134,
  },
  attachmentMeta: {
    color: '#64748b',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  bottomBar: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  markdownToolbarGroup: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  markdownToolbarContent: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  toolbarIconButton: {
    alignItems: 'center',
    borderRadius: 19,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendDockButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 25,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  sendDockButtonDisabled: {
    opacity: 0.28,
  },
  keyboardDismissButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  iconButtonDisabled: {
    opacity: 0.28,
  },
  iconButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
});
