import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { pickAudioFiles, type PickedFile } from '../../../core/file/picker';
import {
  importX1UsbAudioFile,
  listImportedX1AudioFileNames,
  listImportedX1UsbAudioFiles,
  type X1UsbImportedAudioFile,
  x1ImportNameForPickedFile,
} from '../../../core/recorder-device/x1-usb-import';
import { openDb } from '../../../core/storage/db';
import type { SQLiteDatabaseLike } from '../../../core/storage/sqlite';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
import { returnTo } from '../../navigation/back';
import { colors, radius, spacing } from '../theme';
import { formatTimestamp } from '../format';
import { formatBytes } from '../x1-device';

export function X1UsbImportScreen(): React.ReactElement {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<PickedFile[]>([]);
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set());
  const [importedRows, setImportedRows] = useState<X1UsbImportedAudioFile[]>([]);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = picking || batchImporting || busyName !== null;
  const pendingFiles = useMemo(
    () => selectedFiles.filter((file) => !isImported(file, importedNames)),
    [importedNames, selectedFiles],
  );

  useEffect(() => {
    void refreshImportedState();
  }, []);

  async function refreshImportedState(sharedDb?: SQLiteDatabaseLike): Promise<void> {
    const db = sharedDb ?? (await openDb());
    setImportedNames(await listImportedX1AudioFileNames({ db }));
    setImportedRows(await listImportedX1UsbAudioFiles({ db }));
  }

  async function pickUsbFiles(): Promise<void> {
    setPicking(true);
    setError(null);
    try {
      const files = await pickAudioFiles({ multiple: true });
      if (files.length === 0) return;
      setSelectedFiles((prev) => mergePickedFiles(prev, files));
      await refreshImportedState();
    } catch (pickError) {
      setError(messageForError(pickError));
    } finally {
      setPicking(false);
    }
  }

  async function importFile(file: PickedFile, sharedDb?: SQLiteDatabaseLike): Promise<void> {
    if (isImported(file, importedNames)) return;
    const name = x1ImportNameForPickedFile(file);
    setBusyName(name);
    setError(null);
    try {
      const db = sharedDb ?? (await openDb());
      await importX1UsbAudioFile(file, {
        db,
        sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
      });
      setImportedNames((prev) => new Set([...prev, name]));
      await refreshImportedState(db);
      if (!sharedDb) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void writeWidgetSnapshot(db).catch(() => undefined);
        void runSyncTick({ db });
      }
    } catch (importError) {
      setError(messageForError(importError));
      throw importError;
    } finally {
      setBusyName(null);
    }
  }

  async function importAllPending(): Promise<void> {
    if (pendingFiles.length === 0) return;
    setBatchImporting(true);
    setError(null);
    try {
      const db = await openDb();
      for (const file of pendingFiles) {
        await importFile(file, db);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
    } catch {
      // importFile has already surfaced the concrete error for the row.
    } finally {
      setBatchImporting(false);
      setBusyName(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => returnTo(router, '/recording/x1')}
        >
          <Text style={styles.back}>← X1</Text>
        </Pressable>
        <Text style={styles.title}>U 盘导入</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.sourceCard}>
          <View style={styles.sourceTop}>
            <View style={styles.sourceTitleBlock}>
              <Text style={styles.sourceName}>X1 U 盘模式</Text>
              <Text style={styles.sourceMeta}>从系统文件选择器读取录音文件</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>本地导入</Text>
            </View>
          </View>
          <Text style={styles.sourceInfoLine}>
            连接录音卡后，在文件选择器里进入 X1 磁盘并选择 MP3/WAV/M4A；导入会先完整保存到本机，再进入转写和同步队列。
          </Text>
          <View style={styles.actions}>
            <Button
              label={picking ? '选择中' : selectedFiles.length > 0 ? '重新选择' : '选择录音'}
              disabled={busy}
              onPress={() => void pickUsbFiles()}
            />
            <Button
              label={batchImporting ? '导入中' : `全部导入${pendingFiles.length ? ` ${pendingFiles.length}` : ''}`}
              variant="secondary"
              disabled={busy || pendingFiles.length === 0}
              onPress={() => void importAllPending()}
            />
          </View>
        </View>

        {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        {busyName ? <Text style={styles.hint}>正在导入：{busyName}</Text> : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              U 盘录音{selectedFiles.length > 0 ? ` · ${selectedFiles.length} 条` : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void refreshImportedState()}
              style={({ pressed }) => [styles.inlineButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.inlineButtonText}>刷新状态</Text>
            </Pressable>
          </View>

          {selectedFiles.length > 0 ? selectedFiles.map((file) => {
            const name = x1ImportNameForPickedFile(file);
            const imported = isImported(file, importedNames);
            const importing = busyName === name;
            return (
              <View key={`${name}-${file.byteSize ?? 0}`} style={[styles.fileRow, busy && !importing && styles.disabled]}>
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{name}</Text>
                  <Text style={styles.rowMeta}>U 盘文件 · {formatBytes(file.byteSize)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || imported}
                  onPress={() => void importFile(file)}
                  style={({ pressed }) => [
                    styles.fileActionButton,
                    imported && styles.fileActionButtonDone,
                    (busy || imported) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.fileActionText, imported && styles.fileActionDoneText]}>
                    {imported ? '已导入' : importing ? '导入中' : '导入'}
                  </Text>
                </Pressable>
              </View>
            );
          }) : (
            <Text style={styles.hint}>尚未选择 U 盘录音文件。</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              导入历史{importedRows.length > 0 ? ` · ${importedRows.length} 条` : ''}
            </Text>
          </View>
          {importedRows.length > 0 ? importedRows.map((item) => (
            <View key={item.recordingId} style={styles.fileRow}>
              <View style={styles.rowMain}>
                <Text numberOfLines={1} style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  已导入 · {formatImportedAt(item.importedAt)}
                  {item.byteSize ? ` · ${formatBytes(item.byteSize)}` : ''}
                  {item.durationMs > 0 ? ` · ${formatTimestamp(item.durationMs)}` : ''}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/recording/${item.recordingId}`)}
                style={({ pressed }) => [
                  styles.fileActionButton,
                  styles.fileActionButtonDone,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.fileActionDoneText}>打开</Text>
              </Pressable>
            </View>
          )) : (
            <Text style={styles.hint}>暂无已导入的 X1 录音。</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Button({
  label,
  disabled,
  variant = 'primary',
  onPress,
}: {
  label: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

function mergePickedFiles(prev: PickedFile[], next: PickedFile[]): PickedFile[] {
  const merged = new Map<string, PickedFile>();
  for (const file of [...prev, ...next]) {
    const key = `${x1ImportNameForPickedFile(file)}:${file.byteSize ?? 0}`;
    merged.set(key, file);
  }
  return Array.from(merged.values()).sort((a, b) => (
    x1ImportNameForPickedFile(a) < x1ImportNameForPickedFile(b) ? 1 : -1
  ));
}

function isImported(file: PickedFile, importedNames: Set<string>): boolean {
  return importedNames.has(x1ImportNameForPickedFile(file)) || importedNames.has(file.filename);
}

function formatImportedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-Hans-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  back: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
  },
  headerSpacer: {
    width: 56,
  },
  scroll: {
    paddingBottom: 56,
  },
  sourceCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 10,
  },
  sourceTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  sourceTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  sourceName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  sourceMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  statusPill: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '900',
  },
  sourceInfoLine: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flexGrow: 1,
    minWidth: 104,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonSecondary: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '900',
  },
  buttonSecondaryText: {
    color: colors.textPrimary,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  inlineButton: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  fileRow: {
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 8,
    padding: 10,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 2,
  },
  fileActionButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  fileActionButtonDone: {
    backgroundColor: colors.bgRaised,
  },
  fileActionText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '900',
  },
  fileActionDoneText: {
    color: colors.textMuted,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
