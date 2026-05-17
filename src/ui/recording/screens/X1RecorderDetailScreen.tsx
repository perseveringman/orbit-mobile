import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  addConnectionStateListener,
  addDeviceStatusListener,
  addErrorListener,
  addImportProgressListener,
  addScanResultListener,
  connect,
  deleteAudioFiles,
  getBattery,
  getDeviceIdentity,
  getState,
  getStorage,
  getVersion,
  requestAudioFileTotal,
  requestAudioList,
  sendCheckTime,
  startScan,
  stopScan,
  type X1AudioFile,
  type X1ConnectionStateEvent,
  type X1DeviceIdentity,
  type X1DeviceStatusEvent,
  type X1DiscoveredDevice,
  type X1ImportProgressEvent,
  type X1StorageInfo,
} from 'orbit-recorder-device';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  importX1AudioFile,
  listImportedX1AudioFileNames,
} from '../../../core/recorder-device/x1-import';
import { openDb } from '../../../core/storage/db';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
import { returnTo } from '../../navigation/back';
import { formatDurationLabel } from '../format';
import { colors, radius, spacing } from '../theme';
import {
  formatBattery,
  formatBytes,
  formatX1StorageUsage,
  isAutoConnectX1Device,
} from '../x1-device';

interface X1DeviceInfo {
  battery: number | null;
  identity: X1DeviceIdentity | null;
  storage: X1StorageInfo | null;
  version: string | null;
}

const EMPTY_DEVICE_INFO: X1DeviceInfo = {
  battery: null,
  identity: null,
  storage: null,
  version: null,
};

export function X1RecorderDetailScreen(): React.ReactElement {
  const router = useRouter();
  const busyRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const connectedRef = useRef(false);
  const [connection, setConnection] = useState<X1ConnectionStateEvent>({
    bluetoothState: 'unknown',
    connectionState: 'idle',
    isScanning: false,
  });
  const [devices, setDevices] = useState<X1DiscoveredDevice[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<X1DeviceInfo>(EMPTY_DEVICE_INFO);
  const [files, setFiles] = useState<X1AudioFile[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<X1ImportProgressEvent | null>(null);
  const connected = connection.connectionState === 'connected';
  const scanning = connection.isScanning || connection.connectionState === 'scanning';
  const sortedDevices = useMemo(
    () => [...devices].sort((a, b) => Number(b.isLikelyX1) - Number(a.isLikelyX1) || (b.rssi ?? -999) - (a.rssi ?? -999)),
    [devices],
  );
  const status = describeX1Connection(connection);
  const deviceName = connection.device?.name?.trim() || '纽曼智能录音笔 X1';

  useEffect(() => {
    if (process.env.EXPO_OS !== 'ios') {
      setError('X1 录音卡当前只支持 iOS Development Build。');
      return undefined;
    }

    let cancelled = false;
    const subscriptions = [
      addScanResultListener((device) => {
        setDevices((prev) => mergeDevice(prev, device));
        if (cancelled || connectedRef.current || connectingRef.current) return;
        if (!isAutoConnectX1Device(device)) return;
        void run('connect-x1', () => connectDevice(device));
      }),
      addConnectionStateListener((state) => {
        if (cancelled) return;
        connectedRef.current = state.connectionState === 'connected';
        setConnection(state);
        if (state.connectionState === 'connected') {
          void refreshDeviceStatus();
          void refreshFiles();
        } else {
          setDeviceInfo(EMPTY_DEVICE_INFO);
          setFiles([]);
          setTotal(null);
        }
      }),
      addDeviceStatusListener((event) => {
        if (!cancelled) applyDeviceStatus(event);
      }),
      addImportProgressListener((event) => {
        if (!cancelled) setProgress(event);
      }),
      addErrorListener((event) => {
        if (!cancelled) setError(event.message);
      }),
    ];

    void refreshImportedNames();
    void getState()
      .then((state) => {
        if (cancelled) return;
        connectedRef.current = state.connectionState === 'connected';
        setConnection(state);
        if (state.connectionState === 'connected') {
          void refreshDeviceStatus();
          void refreshFiles();
        } else if (state.bluetoothState === 'poweredOn' || state.bluetoothState === 'unknown') {
          void run('scan', scan);
        }
      })
      .catch((stateError: unknown) => {
        if (!cancelled) setError(messageForError(stateError));
      });

    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.remove());
      void stopScan().catch(() => undefined);
    };
  }, []);

  async function run(label: string, action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = label;
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(messageForError(actionError));
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }

  async function scan(): Promise<void> {
    setDevices([]);
    await startScan();
    setConnection(await getState());
  }

  async function connectDevice(device: X1DiscoveredDevice): Promise<void> {
    if (connectingRef.current) return;
    connectingRef.current = true;
    try {
      await stopScan().catch(() => undefined);
      await connect(device.id);
      await sendCheckTime().catch(() => undefined);
      const state = await getState();
      connectedRef.current = state.connectionState === 'connected';
      setConnection(state);
      await refreshDeviceStatus();
      await refreshFiles();
    } finally {
      connectingRef.current = false;
    }
  }

  async function refreshDeviceStatus(): Promise<void> {
    const [battery, version, storage, identity] = await Promise.all([
      getBattery().catch(() => null),
      getVersion().catch(() => null),
      getStorage().catch(() => null),
      getDeviceIdentity().catch(() => null),
    ]);
    setDeviceInfo((prev) => ({
      battery: battery ?? prev.battery,
      identity: identity ?? prev.identity,
      storage: storage ?? prev.storage,
      version: version ?? prev.version,
    }));
  }

  async function refreshFiles(): Promise<void> {
    const count = await requestAudioFileTotal();
    setTotal(count);
    if (count <= 0) {
      setFiles([]);
      await refreshImportedNames();
      return;
    }
    const nextFiles: X1AudioFile[] = [];
    for (let start = 0; start < count; start += 25) {
      nextFiles.push(...await requestAudioList(start, Math.min(25, count - start)));
    }
    setFiles(nextFiles);
    await refreshImportedNames();
  }

  async function refreshImportedNames(): Promise<void> {
    const db = await openDb();
    setImportedNames(await listImportedX1AudioFileNames({ db }));
  }

  async function importFile(file: X1AudioFile): Promise<void> {
    if (importedNames.has(file.name)) return;
    setProgress({
      phase: 'started',
      name: file.name,
      bytesReceived: 0,
      expectedSize: file.byteSize,
      durationMs: file.durationMs,
    });
    const db = await openDb();
    await importX1AudioFile(file, {
      db,
      sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
    });
    setImportedNames((prev) => new Set([...prev, file.name]));
    setProgress(null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void writeWidgetSnapshot(db).catch(() => undefined);
    void runSyncTick({ db });
  }

  async function deleteFile(file: X1AudioFile): Promise<void> {
    await deleteAudioFiles([file.name]);
    await refreshFiles();
  }

  function confirmDelete(file: X1AudioFile): void {
    Alert.alert(
      '删除设备录音？',
      `将从 X1 设备删除 ${file.name}。已导入到 Orbit 的本地录音不会被删除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => void run(`delete-${file.name}`, () => deleteFile(file)),
        },
      ],
    );
  }

  function applyDeviceStatus(event: X1DeviceStatusEvent): void {
    if (isBatteryStatus(event)) {
      setDeviceInfo((prev) => ({ ...prev, battery: event.battery }));
      return;
    }
    if (isVersionStatus(event)) {
      setDeviceInfo((prev) => ({ ...prev, version: event.version }));
      return;
    }
    if (isStorageStatus(event)) {
      setDeviceInfo((prev) => ({
        ...prev,
        storage: {
          freeBytes: typeof event.freeBytes === 'number' ? event.freeBytes : Math.max(0, event.totalBytes - event.usedBytes),
          totalBytes: event.totalBytes,
          usedBytes: event.usedBytes,
        },
      }));
      return;
    }
    if (isDeviceIdentity(event)) {
      setDeviceInfo((prev) => ({ ...prev, identity: event }));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => returnTo(router, '/recording')}
        >
          <Text style={styles.back}>← 录音</Text>
        </Pressable>
        <Text style={styles.title}>X1 录音卡</Text>
        <Text style={styles.headerState}>{status.badge}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.deviceCard}>
          <View style={styles.deviceTop}>
            <View style={styles.deviceTitleBlock}>
              <Text numberOfLines={1} style={styles.deviceName}>{connected ? deviceName : '纽曼智能录音笔 X1'}</Text>
              <Text style={styles.deviceMeta}>{connected ? '设备已连接' : status.hint}</Text>
            </View>
            <View style={[styles.statusPill, connected ? styles.statusPillReady : styles.statusPillPending]}>
              <Text style={[styles.statusPillText, connected ? styles.statusPillReadyText : styles.statusPillPendingText]}>
                {status.badge}
              </Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <InfoPill label="电量" value={formatBattery(deviceInfo.battery)} />
            <InfoPill label="容量" value={formatX1StorageUsage(deviceInfo.storage)} wide />
            <InfoPill label="固件" value={deviceInfo.version ?? '读取中'} />
            <InfoPill label="MAC" value={deviceInfo.identity?.mac ?? '读取中'} wide />
          </View>

          <View style={styles.actions}>
            <Button
              label={scanning ? '扫描中' : '扫描'}
              disabled={Boolean(busy) || scanning}
              onPress={() => void run('scan', scan)}
            />
            <Button
              label="刷新"
              variant="secondary"
              disabled={Boolean(busy) || !connected}
              onPress={() => void run('refresh-device', async () => {
                await refreshDeviceStatus();
                await refreshFiles();
              })}
            />
            <Button
              label="开始录音"
              variant="secondary"
              disabled={Boolean(busy)}
              onPress={() => router.push('/recording/x1-session')}
            />
            <Button
              label="通信测试"
              variant="secondary"
              disabled={Boolean(busy)}
              onPress={() => router.push('/recording/x1-debug')}
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <Text style={styles.hint}>处理中：{busy}</Text> : null}

        {!connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>发现的设备</Text>
            {sortedDevices.length > 0 ? sortedDevices.map((device) => (
              <Pressable
                key={device.id}
                accessibilityRole="button"
                disabled={Boolean(busy)}
                onPress={() => void run(`connect-${device.id}`, () => connectDevice(device))}
                style={({ pressed }) => [styles.deviceRow, pressed && styles.pressed, busy && styles.disabled]}
              >
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{device.name || '未命名设备'}</Text>
                  <Text style={styles.rowMeta}>{device.isLikelyX1 ? 'X1 设备' : 'BLE 设备'} · RSSI {device.rssi ?? '-'}</Text>
                </View>
                <Text style={styles.rowAction}>连接</Text>
              </Pressable>
            )) : (
              <Text style={styles.hint}>打开录音卡并靠近 iPhone。</Text>
            )}
          </View>
        ) : null}

        {progress ? (
          <View style={styles.progressBand}>
            <Text style={styles.progressTitle}>{progress.name ?? '正在导入'}</Text>
            <Text style={styles.progressMeta}>
              {formatBytes(progress.bytesReceived ?? 0)}
              {progress.expectedSize ? ` / ${formatBytes(progress.expectedSize)}` : ''}
            </Text>
          </View>
        ) : null}

        {connected ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>设备录音{total === null ? '' : ` · ${total} 条`}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(busy)}
                onPress={() => void run('refresh-files', refreshFiles)}
                style={({ pressed }) => [styles.inlineButton, pressed && styles.pressed, busy && styles.disabled]}
              >
                <Text style={styles.inlineButtonText}>刷新</Text>
              </Pressable>
            </View>
            {files.length > 0 ? files.map((file) => {
              const imported = importedNames.has(file.name);
              return (
                <View key={`${file.index}-${file.name}`} style={[styles.fileRow, busy && styles.disabled]}>
                  <View style={styles.fileTop}>
                    <View style={styles.rowMain}>
                      <Text numberOfLines={1} style={styles.rowTitle}>{file.name}</Text>
                      <Text style={styles.rowMeta}>
                        {formatDurationLabel(file.durationMs)} · {formatBytes(file.byteSize)}
                      </Text>
                    </View>
                    <View style={[styles.importPill, imported ? styles.importPillDone : styles.importPillTodo]}>
                      <Text style={[styles.importPillText, imported ? styles.importPillDoneText : styles.importPillTodoText]}>
                        {imported ? '已导入' : '未导入'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.fileActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(busy) || imported}
                      onPress={() => void run(`import-${file.name}`, () => importFile(file))}
                      style={({ pressed }) => [
                        styles.fileActionButton,
                        imported && styles.fileActionButtonDone,
                        (busy || imported) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.fileActionText, imported && styles.fileActionDoneText]}>
                        {imported ? '已导入' : '导入'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(busy)}
                      onPress={() => confirmDelete(file)}
                      style={({ pressed }) => [styles.fileActionButtonSecondary, busy && styles.disabled, pressed && styles.pressed]}
                    >
                      <Text style={styles.fileActionDangerText}>删除</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }) : (
              <Text style={styles.hint}>{total === 0 ? '设备里没有录音。' : '连接后可读取设备录音列表。'}</Text>
            )}
          </View>
        ) : null}
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

function InfoPill({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.infoPill, wide && styles.infoPillWide]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function describeX1Connection(state: X1ConnectionStateEvent): { badge: string; hint: string } {
  if (state.connectionState === 'connected') return { badge: '已连接', hint: state.device?.name || '录音卡已连接' };
  if (state.bluetoothState === 'poweredOff' || state.bluetoothState === 'unauthorized') return { badge: '未连接', hint: '蓝牙不可用' };
  if (state.isScanning || state.connectionState === 'scanning') return { badge: '扫描中', hint: '正在查找附近设备' };
  if (state.connectionState === 'connecting' || state.connectionState === 'discovering') return { badge: '连接中', hint: '正在连接录音卡' };
  return { badge: '未连接', hint: '打开录音卡并靠近 iPhone' };
}

function mergeDevice(devices: X1DiscoveredDevice[], device: X1DiscoveredDevice): X1DiscoveredDevice[] {
  const next = devices.filter((item) => item.id !== device.id);
  next.push(device);
  return next;
}

function isDeviceIdentity(event: X1DeviceStatusEvent): event is X1DeviceIdentity {
  return event.kind === 'deviceIdentity'
    && typeof event.mac === 'string'
    && typeof event.macHex === 'string'
    && typeof event.appKey === 'string'
    && typeof event.appKeyHex === 'string';
}

function isBatteryStatus(event: X1DeviceStatusEvent): event is { kind: 'battery'; battery: number } {
  return event.kind === 'battery' && typeof event.battery === 'number';
}

function isVersionStatus(event: X1DeviceStatusEvent): event is { kind: 'version'; version: string } {
  return event.kind === 'version' && typeof event.version === 'string';
}

function isStorageStatus(event: X1DeviceStatusEvent): event is {
  kind: 'storage';
  freeBytes: number;
  totalBytes: number;
  usedBytes: number;
} {
  return event.kind === 'storage'
    && typeof event.freeBytes === 'number'
    && typeof event.totalBytes === 'number'
    && typeof event.usedBytes === 'number';
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
    marginBottom: spacing.lg,
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
  headerState: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 56,
    textAlign: 'right',
  },
  scroll: {
    gap: spacing.lg,
    paddingBottom: 56,
  },
  deviceCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 14,
  },
  deviceTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  deviceTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  deviceMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillReady: {
    backgroundColor: colors.successSoft,
  },
  statusPillPending: {
    backgroundColor: colors.warningSoft,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  statusPillReadyText: {
    color: colors.success,
  },
  statusPillPendingText: {
    color: colors.warning,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoPill: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  infoPillWide: {
    flexBasis: '100%',
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flexGrow: 1,
    minWidth: 94,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonSecondary: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },
  buttonSecondaryText: {
    color: colors.textPrimary,
  },
  section: {
    marginTop: spacing.lg,
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
  deviceRow: {
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 14,
  },
  fileRow: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  fileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 4,
  },
  rowAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  importPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  importPillDone: {
    backgroundColor: colors.successSoft,
  },
  importPillTodo: {
    backgroundColor: colors.bgRaised,
  },
  importPillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  importPillDoneText: {
    color: colors.success,
  },
  importPillTodoText: {
    color: colors.textMuted,
  },
  fileActions: {
    flexDirection: 'row',
    gap: 10,
  },
  fileActionButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flex: 1,
    paddingVertical: 10,
  },
  fileActionButtonDone: {
    backgroundColor: colors.bgRaised,
  },
  fileActionButtonSecondary: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: 10,
  },
  fileActionText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },
  fileActionDoneText: {
    color: colors.textMuted,
  },
  fileActionDangerText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  progressBand: {
    backgroundColor: colors.accentSoft,
    borderColor: '#bfdbfe',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    padding: 14,
  },
  progressTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  progressMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    marginTop: 4,
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
