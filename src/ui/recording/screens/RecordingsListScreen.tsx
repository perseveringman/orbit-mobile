/**
 * RecordingsListScreen — 录音时间轴列表
 *
 * 与"最近 Capture"区分：长录音单独走时间轴。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §8
 */

import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  addConnectionStateListener,
  addDeviceStatusListener,
  addScanResultListener,
  connect,
  getBattery,
  getDeviceIdentity,
  getState,
  getStorage,
  getVersion,
  sendCheckTime,
  startScan,
  stopScan,
  type X1ConnectionStateEvent,
  type X1DeviceIdentity,
  type X1DeviceStatusEvent,
  type X1DiscoveredDevice,
  type X1StorageInfo,
} from 'orbit-recorder-device';

import type { RecordingMeta } from '../../../types/recording';
import {
  createRecordingCapture,
  listRecordingMetas,
} from '../../../core/recording/recording-service';
import { createImportedAudioRecording } from '../../../core/recording/audio-import';
import { pickAudioFiles } from '../../../core/file/picker';
import {
  discardRecoveredVoiceRecording,
  recoverInterruptedVoiceRecordings,
  type RecoveredVoiceRecording,
} from '../../../core/audio/recorder';
import { openDb } from '../../../core/storage/db';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
import { returnTo } from '../../navigation/back';
import { Waveform } from '../components/Waveform';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatClock,
  formatDateGroup,
  formatDurationLabel,
} from '../format';
import { colors, radius, spacing } from '../theme';
import {
  formatBattery,
  formatX1StorageUsage,
  isAutoConnectX1Device,
} from '../x1-device';

interface Group {
  key: string;
  label: string;
  items: RecordingMeta[];
}

interface RecordingsListScreenProps {
  embedded?: boolean;
}

interface X1DeviceSnapshot {
  battery: number | null;
  identity: X1DeviceIdentity | null;
  storage: X1StorageInfo | null;
  version: string | null;
}

const EMPTY_X1_DEVICE_INFO: X1DeviceSnapshot = {
  battery: null,
  identity: null,
  storage: null,
  version: null,
};

export function RecordingsListScreen({
  embedded = false,
}: RecordingsListScreenProps): React.ReactElement {
  const router = useRouter();
  const x1ConnectingRef = useRef(false);
  const x1ConnectedRef = useRef(false);
  const x1ScanRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [recoverable, setRecoverable] = useState<RecoveredVoiceRecording[]>([]);
  const [recoveringUri, setRecoveringUri] = useState<string | null>(null);
  const [importingAudio, setImportingAudio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [x1Connection, setX1Connection] = useState<X1ConnectionStateEvent>({
    bluetoothState: 'unknown',
    connectionState: 'idle',
    isScanning: false,
  });
  const [x1DeviceInfo, setX1DeviceInfo] = useState<X1DeviceSnapshot>(EMPTY_X1_DEVICE_INFO);
  const groups = useMemo(() => groupByDate(recordings), [recordings]);
  const x1Connected = x1Connection.connectionState === 'connected';
  const x1Status = describeX1Connection(x1Connection);
  const x1DeviceName = x1Connection.device?.name?.trim() || null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listRecordingMetas(),
      recoverInterruptedVoiceRecordings().catch(() => []),
    ])
      .then(([items, recovered]) => {
        if (!cancelled) setRecordings(items);
        if (!cancelled) setRecoverable(recovered);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyX1DeviceStatus = useCallback((event: X1DeviceStatusEvent): void => {
    if (isX1BatteryStatus(event)) {
      setX1DeviceInfo((prev) => ({ ...prev, battery: event.battery }));
      return;
    }
    if (isX1VersionStatus(event)) {
      setX1DeviceInfo((prev) => ({ ...prev, version: event.version }));
      return;
    }
    if (isX1StorageStatus(event)) {
      setX1DeviceInfo((prev) => ({
        ...prev,
        storage: {
          freeBytes: event.freeBytes,
          totalBytes: event.totalBytes,
          usedBytes: event.usedBytes,
        },
      }));
      return;
    }
    if (isX1DeviceIdentity(event)) {
      setX1DeviceInfo((prev) => ({ ...prev, identity: event }));
    }
  }, []);

  const refreshX1DeviceInfo = useCallback(async (): Promise<void> => {
    const [battery, version, storage, identity] = await Promise.all([
      getBattery().catch(() => null),
      getVersion().catch(() => null),
      getStorage().catch(() => null),
      getDeviceIdentity().catch(() => null),
    ]);
    setX1DeviceInfo((prev) => ({
      battery: battery !== null ? battery : prev.battery,
      identity: identity !== null ? identity : prev.identity,
      storage: storage !== null ? storage : prev.storage,
      version: version !== null ? version : prev.version,
    }));
  }, []);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'ios') return undefined;
    let cancelled = false;
    function clearScanRetry(): void {
      if (x1ScanRetryTimerRef.current !== null) {
        clearTimeout(x1ScanRetryTimerRef.current);
        x1ScanRetryTimerRef.current = null;
      }
    }

    function scheduleScan(delayMs = 0): void {
      clearScanRetry();
      x1ScanRetryTimerRef.current = setTimeout(() => {
        x1ScanRetryTimerRef.current = null;
        if (cancelled || x1ConnectingRef.current || x1ConnectedRef.current) return;
        void startScan()
          .then(getState)
          .then((state) => {
            if (!cancelled) setX1Connection(state);
          })
          .catch(() => {
            if (!cancelled) scheduleScan(5000);
          });
      }, delayMs);
    }

    async function connectX1Device(device: X1DiscoveredDevice): Promise<void> {
      if (cancelled || x1ConnectingRef.current || x1ConnectedRef.current) return;
      x1ConnectingRef.current = true;
      setX1Connection((prev) => ({
        ...prev,
        connectionState: 'connecting',
        device,
        isScanning: false,
      }));
      try {
        clearScanRetry();
        await stopScan().catch(() => undefined);
        await connect(device.id);
        if (cancelled) return;
        await sendCheckTime().catch(() => undefined);
        const state = await getState().catch(() => ({
          bluetoothState: 'poweredOn',
          connectionState: 'connected',
          device,
          isScanning: false,
        }));
        if (cancelled) return;
        x1ConnectedRef.current = state.connectionState === 'connected';
        setX1Connection(state);
        await refreshX1DeviceInfo().catch(() => undefined);
      } catch {
        if (!cancelled) {
          x1ConnectedRef.current = false;
          setX1DeviceInfo(EMPTY_X1_DEVICE_INFO);
          scheduleScan(2500);
        }
      } finally {
        x1ConnectingRef.current = false;
      }
    }

    const scanSub = addScanResultListener((device) => {
      if (!isAutoConnectX1Device(device)) return;
      void connectX1Device(device);
    });
    const connectionSub = addConnectionStateListener((state) => {
      if (cancelled) return;
      x1ConnectedRef.current = state.connectionState === 'connected';
      setX1Connection(state);
      if (state.connectionState === 'connected') {
        clearScanRetry();
        void stopScan().catch(() => undefined);
        void refreshX1DeviceInfo();
      } else {
        setX1DeviceInfo(EMPTY_X1_DEVICE_INFO);
        if (state.bluetoothState === 'poweredOn' || state.bluetoothState === 'unknown') {
          scheduleScan(1000);
        }
      }
    });
    const statusSub = addDeviceStatusListener((event) => {
      if (!cancelled) applyX1DeviceStatus(event);
    });

    getState()
      .then((state) => {
        if (cancelled) return;
        x1ConnectedRef.current = state.connectionState === 'connected';
        setX1Connection(state);
        if (state.connectionState === 'connected') {
          void refreshX1DeviceInfo();
        } else {
          scheduleScan(state.bluetoothState === 'poweredOn' || state.bluetoothState === 'unknown' ? 0 : 2500);
        }
      })
      .catch(() => undefined);

    const refreshTimer = setInterval(() => {
      if (cancelled) return;
      if (x1ConnectedRef.current) {
        void refreshX1DeviceInfo();
      } else {
        scheduleScan(0);
      }
    }, 15000);

    return () => {
      cancelled = true;
      clearScanRetry();
      clearInterval(refreshTimer);
      void stopScan().catch(() => undefined);
      scanSub.remove();
      connectionSub.remove();
      statusSub.remove();
    };
  }, [applyX1DeviceStatus, refreshX1DeviceInfo]);

  async function refreshList(): Promise<void> {
    const [items, recovered] = await Promise.all([
      listRecordingMetas(),
      recoverInterruptedVoiceRecordings().catch(() => []),
    ]);
    setRecordings(items);
    setRecoverable(recovered);
  }

  async function saveRecovered(item: RecoveredVoiceRecording): Promise<void> {
    setRecoveringUri(item.uri);
    setError(null);
    try {
      const db = await openDb();
      const detail = await createRecordingCapture(
        {
          title: '恢复的录音',
          audioUri: item.uri,
          durationMs: item.durationMs,
          startedAt: item.startedAt ?? new Date().toISOString(),
          languageHints: [],
          partialProvider: 'unavailable',
          transcriptText: '',
          waveformSamples: [],
          partials: [],
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await discardRecoveredVoiceRecording(item.uri).catch(() => undefined);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      await refreshList();
      router.push(`/recording/${detail.meta.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setRecoveringUri(null);
    }
  }

  async function discardRecovered(item: RecoveredVoiceRecording): Promise<void> {
    setRecoveringUri(item.uri);
    setError(null);
    try {
      await discardRecoveredVoiceRecording(item.uri);
      setRecoverable((prev) => prev.filter((candidate) => candidate.uri !== item.uri));
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : String(discardError));
    } finally {
      setRecoveringUri(null);
    }
  }

  function openX1Details(): void {
    router.push('/recording/x1');
  }

  async function importAudioFile(): Promise<void> {
    setImportingAudio(true);
    setError(null);
    try {
      const files = await pickAudioFiles();
      const file = files[0];
      if (!file) return;
      const db = await openDb();
      const detail = await createImportedAudioRecording(file, {
        db,
        sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      await refreshList();
      router.push(`/recording/${detail.meta.id}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImportingAudio(false);
    }
  }

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {!embedded ? (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => returnTo(router, '/')}
          >
            <Text style={styles.back}>← 记一条</Text>
          </Pressable>
          <Text style={styles.title}>录音</Text>
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.entryGrid}>
          <View style={[styles.entryCard, styles.iphoneCard]}>
            <View style={styles.entryTop}>
              <Text numberOfLines={1} style={styles.entrySourceLabel}>iPhone 麦克风</Text>
              <Text style={[styles.entryBadge, styles.entryBadgeSuccess]}>可用</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/recording/new')}
              style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}
            >
              <View style={styles.entryTextBlock}>
                <Text numberOfLines={1} style={styles.entryDetail}>本机录音 · 实时转写</Text>
              </View>
              <View style={styles.entryChipRow}>
                <EntryChip text="原始音频" />
                <EntryChip text="本机保存" />
                <EntryChip text="Apple Speech" wide />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/recording/new')}
              style={({ pressed }) => [styles.entryPrimary, pressed && styles.pressed]}
            >
              <Text style={styles.entryPrimaryText}>开始录音</Text>
            </Pressable>
          </View>

          <View style={[styles.entryCard, styles.x1Card]}>
            <View style={styles.entryTop}>
              <Text numberOfLines={1} style={styles.entrySourceLabel}>X1 录音卡</Text>
              <View style={styles.entryTopActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={openX1Details}
                  style={({ pressed }) => [styles.entryDetailButton, pressed && styles.pressed]}
                >
                  <Text style={styles.entryDetailButtonText}>详情</Text>
                </Pressable>
                <Text style={[styles.entryBadge, x1Connected ? styles.entryBadgeSuccess : styles.entryBadgeWarning]}>
                  {x1Status.badge}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={openX1Details}
              style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}
            >
              <View style={styles.entryTextBlock}>
                <Text numberOfLines={1} style={styles.entryDetail}>
                  {x1Connected
                    ? x1DeviceName ?? '录音卡已连接'
                    : x1Status.hint}
                </Text>
              </View>
              {x1Connected ? (
                <View style={styles.entryChipRow}>
                  <EntryChip text={`电量 ${formatBattery(x1DeviceInfo.battery)}`} />
                  <EntryChip text={`固件 ${x1DeviceInfo.version ?? '读取中'}`} />
                  <EntryChip text={`容量 ${formatX1StorageUsage(x1DeviceInfo.storage)}`} wide />
                </View>
              ) : (
                <View style={styles.entryChipRow}>
                  <EntryChip text={x1Status.badge === '扫描中' ? '自动搜索中' : x1Status.badge} />
                  <EntryChip text="开机即连接" />
                  <EntryChip text="靠近 iPhone" wide />
                </View>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/recording/x1-session')}
              style={({ pressed }) => [styles.entryPrimary, pressed && styles.pressed]}
            >
              <Text style={styles.entryPrimaryText}>开始录音</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={importingAudio}
          onPress={() => {
            void importAudioFile();
          }}
          style={({ pressed }) => [
            styles.importBar,
            importingAudio && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.importBarText}>
            <Text style={styles.importBarTitle}>导入录音文件</Text>
            <Text style={styles.importBarSub}>从文件或语音备忘录分享来的音频会先保存到本机，再排队用火山 ASR 识别。</Text>
          </View>
          <Text style={styles.importBarAction}>{importingAudio ? '导入中' : '选择文件'}</Text>
        </Pressable>
        {recoverable.map((item) => {
          const busy = recoveringUri === item.uri;
          return (
            <View key={item.uri} style={styles.recoveryCard}>
              <View style={styles.recoveryTop}>
                <Text style={styles.recoveryTitle}>发现未保存录音</Text>
                <Text style={styles.recoveryDuration}>
                  {formatDurationLabel(item.durationMs)}
                </Text>
              </View>
              <Text style={styles.recoveryBody}>
                上次录音被中断，原始音频仍在本机临时目录。保存后会进入本地 Capture，再按正常同步流程发送到 Mac。
              </Text>
              <View style={styles.recoveryActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void saveRecovered(item);
                  }}
                  style={({ pressed }) => [
                    styles.recoveryPrimary,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.recoveryPrimaryText}>
                    {busy ? '处理中' : '保存录音'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void discardRecovered(item);
                  }}
                  style={({ pressed }) => [
                    styles.recoverySecondary,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.recoverySecondaryText}>丢弃</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        {!loading && groups.length === 0 && recoverable.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>还没有录音</Text>
            <Text style={styles.emptyBody}>选择 iPhone 录音或 X1 录音卡，录音会先完整保存在本机。</Text>
          </View>
        ) : null}
        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            {group.items.map((item) => {
              const live = item.partial_state === 'live';
              return (
                <Link
                  key={item.id}
                  href={`/recording/${item.id}`}
                  asChild
                >
                  <Pressable
                    style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.cardClock}>{formatClock(item.started_at)}</Text>
                      <StatusBadge state={item.final_state} live={live} />
                    </View>
                    <Text numberOfLines={2} style={styles.cardTitle}>
                      {item.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.meta}>
                        {formatDurationLabel(item.duration_ms)}
                      </Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.meta}>
                        {item.speakers.length} 位说话人
                      </Text>
                      {item.language_hints.length > 0 ? (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={styles.meta}>
                            {item.language_hints.slice(0, 2).join(' / ')}
                          </Text>
                        </>
                      ) : null}
                    </View>
                    <View style={styles.waveWrap}>
                      <Waveform
                        samples={item.waveform_samples}
                        bars={48}
                        height={36}
                        variant="compact"
                        progress={live ? 0.85 : 0}
                        active={live}
                      />
                    </View>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        ))}
        <Text style={styles.hint}>
          所有录音都先保存在本机；网络好转后整体转写自动续跑。
        </Text>
      </ScrollView>
    </View>
  );
}

function groupByDate(items: RecordingMeta[]): Group[] {
  const map = new Map<string, RecordingMeta[]>();
  for (const item of items) {
    const key = item.started_at.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, list]) => ({
      key,
      label: list[0] ? formatDateGroup(list[0].started_at) : key,
      items: list.sort((a, b) => (a.started_at < b.started_at ? 1 : -1)),
    }));
}

function EntryChip({
  text,
  wide = false,
}: {
  text: string;
  wide?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.entryChip, wide && styles.entryChipWide]}>
      <Text numberOfLines={1} style={styles.entryChipText}>{text}</Text>
    </View>
  );
}

function describeX1Connection(state: X1ConnectionStateEvent): {
  badge: string;
  hint: string;
  instruction: string;
  title: string;
} {
  if (state.connectionState === 'connected') {
    return {
      badge: '已连接',
      hint: state.device?.name || '录音卡已连接',
      instruction: '',
      title: '连接参数',
    };
  }
  if (state.bluetoothState === 'poweredOff' || state.bluetoothState === 'unauthorized') {
    return {
      badge: '未连接',
      hint: '蓝牙打开后才能发现录音卡。',
      instruction: '请先打开 iPhone 蓝牙，再将录音卡开机。',
      title: '蓝牙不可用',
    };
  }
  if (state.isScanning || state.connectionState === 'scanning') {
    return {
      badge: '扫描中',
      hint: '正在查找附近设备。',
      instruction: '保持录音卡开机，并靠近 iPhone。',
      title: '正在扫描',
    };
  }
  if (state.connectionState === 'connecting' || state.connectionState === 'discovering') {
    return {
      badge: '连接中',
      hint: '正在建立 BLE 连接。',
      instruction: state.device?.name
        ? `保持 ${state.device.name} 靠近手机。`
        : '保持录音卡靠近手机，连接成功后会自动读取参数。',
      title: '连接中',
    };
  }
  return {
    badge: '未连接',
    hint: '打开录音卡并靠近 iPhone',
    instruction: '请将录音卡开机，并靠近 iPhone。',
    title: '纽曼智能录音笔',
  };
}

function isX1BatteryStatus(event: X1DeviceStatusEvent): event is { kind: 'battery'; battery: number } {
  return event.kind === 'battery' && typeof event.battery === 'number';
}

function isX1VersionStatus(event: X1DeviceStatusEvent): event is { kind: 'version'; version: string } {
  return event.kind === 'version' && typeof event.version === 'string';
}

function isX1StorageStatus(event: X1DeviceStatusEvent): event is {
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

function isX1DeviceIdentity(event: X1DeviceStatusEvent): event is X1DeviceIdentity {
  return event.kind === 'deviceIdentity'
    && typeof event.mac === 'string'
    && typeof event.macHex === 'string'
    && typeof event.appKey === 'string'
    && typeof event.appKeyHex === 'string';
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 16,
  },
  containerEmbedded: {
    backgroundColor: '#f8fafc',
    paddingTop: spacing.lg,
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
    fontWeight: '600',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 56,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
  scroll: {
    paddingBottom: 56,
  },
  entryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.lg,
  },
  importBar: {
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    padding: 14,
  },
  importBarText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  importBarTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  importBarSub: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  importBarAction: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    color: colors.bg,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  entryCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 12,
    minHeight: 184,
    padding: 12,
  },
  iphoneCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#fecaca',
  },
  x1Card: {
    backgroundColor: colors.accentSoft,
    borderColor: '#bfdbfe',
  },
  entryMain: {
    flex: 1,
    gap: 10,
  },
  entryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 30,
  },
  entrySourceLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 0,
  },
  entryTopActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  entryIcon: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  entryRecordDot: {
    backgroundColor: colors.recordRed,
    borderRadius: 8,
    height: 15,
    width: 15,
  },
  entryIconText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  entryBadge: {
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  entryDetailButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(148, 163, 184, 0.38)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  entryDetailButtonText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  entryBadgeSuccess: {
    backgroundColor: colors.successSoft,
    color: colors.success,
  },
  entryBadgeWarning: {
    backgroundColor: colors.warningSoft,
    color: colors.warning,
  },
  entryTopCenter: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 29,
    minWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  entryTopCenterText: {
    fontSize: 11,
    fontWeight: '900',
  },
  iphoneTopCenter: {
    borderColor: '#fecaca',
  },
  iphoneTopCenterText: {
    color: colors.recordRed,
  },
  x1TestButton: {
    borderColor: '#bfdbfe',
  },
  x1TestButtonText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  entryTextBlock: {
    gap: 6,
    minHeight: 24,
  },
  entryTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
    minHeight: 46,
  },
  entryMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },
  entryDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    minHeight: 17,
  },
  entryPrimary: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  entryPrimaryText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },
  entrySecondary: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingVertical: 9,
  },
  entrySecondaryText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  entryInfoArea: {
    minHeight: 94,
  },
  entryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 58,
  },
  entryChip: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(148, 163, 184, 0.42)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  entryChipWide: {
    flexBasis: '100%',
  },
  entryChipText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    textAlign: 'center',
  },
  iphoneInfoArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  x1ParamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  x1Param: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(148, 163, 184, 0.42)',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  x1ParamWide: {
    flexBasis: '100%',
  },
  x1ParamLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
  },
  x1ParamValue: {
    color: colors.textPrimary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  x1DisconnectedPanel: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: '#bfdbfe',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  x1DisconnectedTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  x1DisconnectedHint: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  recoveryCard: {
    backgroundColor: colors.warningSoft,
    borderColor: '#f59e0b',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    padding: 14,
  },
  recoveryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recoveryTitle: {
    color: '#92400e',
    fontSize: 15,
    fontWeight: '800',
  },
  recoveryDuration: {
    color: '#92400e',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  recoveryBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  recoveryActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  recoveryPrimary: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flex: 1,
    paddingVertical: 10,
  },
  recoveryPrimaryText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '800',
  },
  recoverySecondary: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  recoverySecondaryText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    padding: 14,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardClock: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 12,
  },
  waveWrap: {
    marginTop: 10,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
