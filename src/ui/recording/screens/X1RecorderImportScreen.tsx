import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
  addConnectionStateListener,
  addDeviceStatusListener,
  addErrorListener,
  addFrameListener,
  addImportProgressListener,
  addRealtimeProgressListener,
  addScanResultListener,
  cancelRealtimeImport,
  continueRealtimeRecord,
  connect,
  deleteAllAudioFiles,
  deleteAudioFiles,
  disconnect,
  getBattery,
  getDeviceIdentity,
  getSettings,
  getState,
  getStorage,
  getVersion,
  pauseImportTransfer,
  requestAudioFileTotal,
  requestAudioList,
  requestLegacyAudioListRaw,
  sendCheckTime,
  sendBindDevice,
  sendUnbindDevice,
  setSetting,
  startRealtimeImport,
  startRealtimeRecord,
  stopRealtimeImport,
  startScan,
  stopRealtimeRecord,
  stopScan,
  type X1AudioFile,
  type X1ConnectionStateEvent,
  type X1DeviceFlags,
  type X1DeviceIdentity,
  type X1DeviceSettings,
  type X1DeviceStatusEvent,
  type X1DiscoveredDevice,
  type X1FrameEvent,
  type X1ImportProgressEvent,
  type X1RealtimeProgressEvent,
  pauseRealtimeRecord,
} from 'orbit-recorder-device';
import {
  addTranscriptionErrorListener,
  addTranscriptionListener,
  start as startSpeechRecognition,
  stop as stopSpeechRecognition,
} from 'orbit-speech-recognition';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { importX1AudioFile, saveRealtimeX1Audio } from '../../../core/recorder-device/x1-import';
import type { LivePartialInput } from '../../../core/recording/recording-service';
import { openDb } from '../../../core/storage/db';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
import { formatDurationLabel, formatTimestamp } from '../format';
import { colors, radius, spacing } from '../theme';

const MAX_REALTIME_LOGS = 80;
const X1_SERVICE_UUID = '0000ae20-0000-1000-8000-00805f9b34fb';

type RealtimeLogKind = 'CMD' | 'ERR' | 'RX' | 'TX';

interface RealtimeLogEntry {
  id: number;
  at: string;
  kind: RealtimeLogKind;
  message: string;
  payloadHex?: string;
}

export function X1RecorderImportScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ autoRealtime?: string; autoRealtimeCapture?: string }>();
  const [devices, setDevices] = useState<X1DiscoveredDevice[]>([]);
  const [connection, setConnection] = useState<X1ConnectionStateEvent>({
    bluetoothState: 'unknown',
    connectionState: 'idle',
    isScanning: false,
  });
  const [files, setFiles] = useState<X1AudioFile[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [identity, setIdentity] = useState<X1DeviceIdentity | null>(null);
  const [settings, setSettings] = useState<X1DeviceSettings | null>(null);
  const [deviceFlags, setDeviceFlags] = useState<X1DeviceFlags | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<X1ImportProgressEvent | null>(null);
  const [realtimeProgress, setRealtimeProgress] = useState<X1RealtimeProgressEvent | null>(null);
  const [realtimeSaving, setRealtimeSaving] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [realtimeLogs, setRealtimeLogs] = useState<RealtimeLogEntry[]>([]);
  const autoRefreshDeviceId = useRef<string | null>(null);
  const autoScanStarted = useRef(false);
  const autoConnectAttempted = useRef(false);
  const autoRealtimeStarted = useRef(false);
  const autoRealtimeCaptureStarted = useRef(false);
  const realtimeLogSeq = useRef(0);
  const realtimeStartedAt = useRef<number | null>(null);
  const liveTranscriptRef = useRef('');
  const livePartialsRef = useRef<LivePartialInput[]>([]);
  const autoRealtime = params.autoRealtime === '1';
  const autoRealtimeCapture = params.autoRealtimeCapture === '1';
  const shouldAutoConnect = autoRealtime || autoRealtimeCapture;
  const sortedDevices = useMemo(
    () => [...devices].sort((a, b) => Number(b.isLikelyX1) - Number(a.isLikelyX1) || (b.rssi ?? -999) - (a.rssi ?? -999)),
    [devices],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setError('X1 蓝牙导入当前只实现了 iOS Development Build。');
      return;
    }

    const subscriptions = [
      addScanResultListener((device) => {
        debugX1('scan-result', device);
        setDevices((prev) => mergeDevice(prev, device));
        if (shouldAutoConnect && isAutoConnectX1Device(device) && !autoConnectAttempted.current) {
          autoConnectAttempted.current = true;
          void run('auto-connect-x1', async () => {
            await stopScan().catch(() => undefined);
            try {
              await connectDevice(device);
            } catch (connectError) {
              autoConnectAttempted.current = false;
              await startScan().catch(() => undefined);
              throw connectError;
            }
          });
        }
      }),
      addConnectionStateListener((state) => {
        debugX1('connection-state', state);
        setConnection(state);
      }),
      addImportProgressListener((event) => {
        debugX1('import-progress', event);
        setProgress(event);
      }),
      addRealtimeProgressListener((event) => {
        debugX1('realtime-progress', event);
        setRealtimeProgress(event);
      }),
      addFrameListener((frame) => {
        debugX1('frame', {
          command: frame.command,
          crcValid: frame.crcValid,
          direction: frame.direction,
          payloadBytes: Math.floor(frame.payloadHex.length / 2),
          payloadHex: compactHex(frame.payloadHex),
          type: frame.type,
        });
        appendRealtimeLog(frame.direction === 'rx' ? 'RX' : 'TX', summarizeFrame(frame), frame.payloadHex);
      }),
      addDeviceStatusListener((event) => {
        debugX1('device-status', event);
        applyDeviceStatus(event);
      }),
      addErrorListener((event) => {
        debugX1('error', event);
        appendRealtimeLog('ERR', event.message);
        setError(event.message);
      }),
      addTranscriptionListener((event) => {
        if (realtimeStartedAt.current === null) return;
        liveTranscriptRef.current = event.transcript;
        setLiveTranscript(event.transcript);
        livePartialsRef.current = [
          {
            elapsed_ms: Math.max(0, Date.now() - realtimeStartedAt.current),
            is_final: event.isFinal,
            speaker: 'S1',
            text: event.transcript,
          },
        ];
      }),
      addTranscriptionErrorListener((event) => {
        if (realtimeStartedAt.current === null) return;
        setTranscriptionError(event.message);
        appendRealtimeLog('ERR', `speech: ${event.message}`);
      }),
    ];

    void getState()
      .then((state) => {
        debugX1('initial-state', state);
        setConnection(state);
      })
      .catch((stateError: unknown) => {
        debugX1('initial-state-error', stateError);
        setError(messageForError(stateError));
      });

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      void stopScan().catch(() => undefined);
      void stopSpeechRecognition().catch(() => undefined);
      if (realtimeStartedAt.current !== null) {
        void cancelRealtimeImport().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoConnect || autoScanStarted.current || connection.connectionState === 'connected') return;
    if (connection.bluetoothState !== 'poweredOn') return;
    autoScanStarted.current = true;
    void run('auto-scan-x1', scan);
  }, [shouldAutoConnect, connection.bluetoothState, connection.connectionState]);

  useEffect(() => {
    if (connection.connectionState !== 'connected' || !connection.device?.id) return;
    if (busy) return;
    if (autoRefreshDeviceId.current === connection.device.id) return;
    autoRefreshDeviceId.current = connection.device.id;

    void run('auto-status-files', async () => {
      await refreshDeviceStatus();
      await refreshFiles();
    });
  }, [busy, connection.connectionState, connection.device?.id]);

  useEffect(() => {
    if (!autoRealtime || connection.connectionState !== 'connected' || !connection.device?.id) return;
    if (busy) return;
    if (autoRealtimeStarted.current) return;
    autoRealtimeStarted.current = true;

    void run('auto-realtime-probe', runRealtimeProbe);
  }, [autoRealtime, busy, connection.connectionState, connection.device?.id]);

  useEffect(() => {
    if (!autoRealtimeCapture || connection.connectionState !== 'connected' || !connection.device?.id) return;
    if (busy) return;
    if (autoRealtimeCaptureStarted.current) return;
    autoRealtimeCaptureStarted.current = true;

    void run('auto-realtime-capture', async () => {
      await startRealtimeCapture();
      await wait(5_000);
      await stopRealtimeCapture();
    });
  }, [autoRealtimeCapture, busy, connection.connectionState, connection.device?.id]);

  async function run(label: string, action: () => Promise<void>): Promise<void> {
    if (busy) return;
    debugX1('action-start', label);
    appendRealtimeLog('CMD', label);
    setBusy(label);
    setError(null);
    try {
      await action();
      debugX1('action-complete', label);
    } catch (actionError) {
      debugX1('action-error', { label, error: messageForError(actionError) });
      setError(messageForError(actionError));
    } finally {
      setBusy(null);
    }
  }

  function applyDeviceStatus(event: X1DeviceStatusEvent): void {
    if (event.kind === 'ack' && typeof event.sequence === 'number') {
      appendRealtimeLog('RX', `ACK seq=${event.sequence}`);
      return;
    }
    if (event.kind === 'battery' && typeof event.battery === 'number') {
      setBattery(event.battery);
      return;
    }
    if (event.kind === 'version' && typeof event.version === 'string') {
      setVersion(event.version);
      return;
    }
    if (event.kind === 'storage' && typeof event.freeBytes === 'number' && typeof event.totalBytes === 'number') {
      setStorage(`${formatBytes(event.freeBytes)} 可用 / ${formatBytes(event.totalBytes)}`);
      return;
    }
    if (isDeviceIdentity(event)) {
      setIdentity(event);
      return;
    }
    if (isDeviceSettings(event)) {
      setSettings(event);
      return;
    }
    if (isDeviceFlags(event)) {
      setDeviceFlags(event);
      return;
    }
    if (event.kind === 'deleteAudio') {
      const names = Array.isArray(event.names) ? (event.names as string[]) : [];
      appendRealtimeLog('RX', event.all === true ? '删除全部录音完成' : `删除录音完成 ${names.join(', ') || '未返回文件名'}`);
      return;
    }
    if (event.kind === 'unbound') {
      appendRealtimeLog('RX', '设备已解绑');
    }
  }

  async function scan(): Promise<void> {
    setDevices([]);
    await startScan();
    setConnection(await getState());
  }

  async function connectDevice(device: X1DiscoveredDevice): Promise<void> {
    await connect(device.id);
    await sendCheckTime().catch(() => undefined);
    setConnection(await getState());
  }

  async function refreshDeviceStatus(): Promise<void> {
    const [nextBattery, nextVersion, nextStorage, nextIdentity, nextSettings] = await Promise.all([
      getBattery().catch(() => null),
      getVersion().catch(() => null),
      getStorage().catch(() => null),
      getDeviceIdentity().catch(() => null),
      getSettings().catch(() => null),
    ]);
    debugX1('status', { battery: nextBattery, identity: nextIdentity, settings: nextSettings, storage: nextStorage, version: nextVersion });
    setBattery(nextBattery);
    setVersion(nextVersion);
    setStorage(nextStorage ? `${formatBytes(nextStorage.freeBytes)} 可用 / ${formatBytes(nextStorage.totalBytes)}` : null);
    setIdentity(nextIdentity);
    setSettings(nextSettings);
  }

  async function refreshFiles(): Promise<void> {
    const count = await requestAudioFileTotal();
    debugX1('file-total', count);
    setTotal(count);
    if (count === 0) {
      setFiles([]);
      return;
    }
    const nextFiles = await requestAudioList(0, Math.min(25, count));
    debugX1('file-list', nextFiles);
    setFiles(nextFiles);
  }

  async function importFile(file: X1AudioFile): Promise<void> {
    setProgress({ phase: 'started', name: file.name, bytesReceived: 0, expectedSize: file.byteSize, durationMs: file.durationMs });
    const db = await openDb();
    const detail = await importX1AudioFile(file, {
      db,
      sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void writeWidgetSnapshot(db).catch(() => undefined);
    void runSyncTick({ db });
    router.replace(`/recording/${detail.meta.id}`);
  }

  async function updateSetting(position: 7 | 8 | 9, enabled: boolean): Promise<void> {
    const nextSettings = await setSetting(position, enabled);
    setSettings(nextSettings);
  }

  async function deleteFile(file: X1AudioFile): Promise<void> {
    const result = await deleteAudioFiles([file.name]);
    appendRealtimeLog('RX', `delete status=${result.status}`);
    await refreshFiles();
  }

  async function deleteAllFiles(): Promise<void> {
    const result = await deleteAllAudioFiles();
    appendRealtimeLog('RX', `delete all status=${result.status}`);
    await refreshFiles();
  }

  async function requestLegacyAudioList(): Promise<void> {
    const result = await requestLegacyAudioListRaw();
    appendRealtimeLog('RX', `legacy list raw ${result.byteSize} B`, result.payloadHex);
  }

  async function startRealtimeCapture(): Promise<void> {
    setRealtimeSaving(true);
    setRealtimeProgress(null);
    setLiveTranscript('');
    setTranscriptionError(null);
    liveTranscriptRef.current = '';
    livePartialsRef.current = [];
    try {
      const name = realtimeFilename();
      const started = await startRealtimeImport(name);
      realtimeStartedAt.current = started.startedAt ? new Date(started.startedAt).getTime() : Date.now();
      setRealtimeProgress({
        phase: 'started',
        name: started.name,
        bytesReceived: started.byteSize,
        durationMs: started.durationMs,
        chunksReceived: started.chunksReceived,
      });
      await startSpeechRecognition('zh-CN').catch((speechError: unknown) => {
        const message = messageForError(speechError);
        setTranscriptionError(message);
        appendRealtimeLog('ERR', `speech start: ${message}`);
      });
    } catch (startError) {
      realtimeStartedAt.current = null;
      setRealtimeSaving(false);
      throw startError;
    }
  }

  async function stopRealtimeCapture(): Promise<void> {
    try {
      const result = await stopRealtimeImport();
      const db = await openDb();
      const detail = await saveRealtimeX1Audio(result, {
        db,
        sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        transcriptText: liveTranscriptRef.current,
        partials: livePartialsRef.current,
      });
      setRealtimeSaving(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      router.replace(`/recording/${detail.meta.id}`);
    } catch (stopError) {
      setRealtimeSaving(false);
      throw stopError;
    } finally {
      await stopSpeechRecognition().catch(() => undefined);
      realtimeStartedAt.current = null;
    }
  }

  async function cancelRealtimeCapture(): Promise<void> {
    await cancelRealtimeImport().catch(() => undefined);
    await stopSpeechRecognition().catch(() => undefined);
    realtimeStartedAt.current = null;
    liveTranscriptRef.current = '';
    livePartialsRef.current = [];
    setLiveTranscript('');
    setRealtimeProgress(null);
    setRealtimeSaving(false);
  }

  function appendRealtimeLog(kind: RealtimeLogKind, message: string, payloadHex?: string): void {
    const entry: RealtimeLogEntry = {
      id: realtimeLogSeq.current,
      at: shortTime(),
      kind,
      message,
      payloadHex: payloadHex ? compactHex(payloadHex) : undefined,
    };
    realtimeLogSeq.current += 1;
    setRealtimeLogs((prev) => [entry, ...prev].slice(0, MAX_REALTIME_LOGS));
  }

  async function stopRealtimeAndRefreshFiles(): Promise<void> {
    await stopRealtimeRecord();
    await wait(900);
    await refreshFiles().catch((refreshError: unknown) => {
      appendRealtimeLog('ERR', `refresh files failed: ${messageForError(refreshError)}`);
    });
  }

  async function runRealtimeProbe(): Promise<void> {
    appendRealtimeLog('CMD', 'probe start · 5s');
    await startRealtimeRecord();
    await wait(5_000);
    appendRealtimeLog('CMD', 'probe stop');
    await stopRealtimeAndRefreshFiles();
  }

  function confirmAndRun(label: string, title: string, message: string, action: () => Promise<void>): void {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        style: 'destructive',
        onPress: () => void run(label, action),
      },
    ]);
  }

  const connected = connection.connectionState === 'connected';
  const scanning = connection.isScanning || connection.connectionState === 'scanning';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link href="/recording" style={styles.back}>
          ← 录音
        </Link>
        <Text style={styles.title}>X1 导入</Text>
        <Text style={styles.state}>{connection.bluetoothState}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statusBand}>
          <Text style={styles.statusTitle}>
            {connected ? `已连接 ${connection.device?.name || 'X1'}` : '连接纽曼智能录音笔 X1'}
          </Text>
          <Text style={styles.statusMeta}>
            {connected
              ? [
                battery === null ? null : `电量 ${battery}%`,
                version ? `版本 ${version}` : null,
                storage,
                identity?.mac ? `MAC ${identity.mac}` : null,
              ].filter(Boolean).join(' · ') || '可以读取设备录音列表'
              : '打开录音笔蓝牙后扫描，连接成功后再读取设备内录音。'}
          </Text>
          <View style={styles.actions}>
            <Button
              label={scanning ? '扫描中' : '扫描'}
              disabled={Boolean(busy) || scanning}
              onPress={() => void run('scan', scan)}
            />
            <Button
              label="停止"
              variant="secondary"
              disabled={Boolean(busy) || !scanning}
              onPress={() => void run('stop-scan', async () => {
                await stopScan();
                setConnection(await getState());
              })}
            />
            <Button
              label="断开"
              variant="secondary"
              disabled={Boolean(busy) || !connected}
              onPress={() => void run('disconnect', async () => {
                await disconnect();
                setConnection(await getState());
              })}
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <Text style={styles.hint}>处理中：{busy}</Text> : null}

        {sortedDevices.length > 0 && !connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>发现的设备</Text>
            {sortedDevices.map((device) => (
              <Pressable
                key={device.id}
                accessibilityRole="button"
                disabled={Boolean(busy)}
                onPress={() => void run('connect', () => connectDevice(device))}
                style={({ pressed }) => [styles.row, pressed && styles.pressed, busy && styles.disabled]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{device.name || '未命名设备'}</Text>
                  <Text style={styles.rowMeta}>{device.isLikelyX1 ? '疑似 X1' : '未知 BLE 设备'} · RSSI {device.rssi ?? '-'}</Text>
                </View>
                <Text style={styles.rowAction}>连接</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>设备命令</Text>
            <View style={styles.actions}>
              <Button
                label="同步时间"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('sync-time', async () => {
                  await sendCheckTime();
                })}
              />
              <Button
                label="状态"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('status', refreshDeviceStatus)}
              />
              <Button
                label="身份"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('identity', async () => {
                  setIdentity(await getDeviceIdentity());
                })}
              />
              <Button
                label="设置"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('settings', async () => {
                  setSettings(await getSettings());
                })}
              />
              <Button
                label="读取列表"
                disabled={Boolean(busy)}
                onPress={() => void run('files', refreshFiles)}
              />
            </View>
          </View>
        ) : null}

        {connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>设备设置</Text>
            <View style={styles.settingsPanel}>
              {settings ? (
                <>
                  <SettingToggle
                    label="清除录音"
                    value={settings.clearRecord}
                    disabled={Boolean(busy)}
                    onValueChange={(value) => void run(`setting-clear-${value ? 'on' : 'off'}`, () => updateSetting(7, value))}
                  />
                  <SettingToggle
                    label="隐藏录音"
                    value={settings.hideRecord}
                    disabled={Boolean(busy)}
                    onValueChange={(value) => void run(`setting-hide-${value ? 'on' : 'off'}`, () => updateSetting(8, value))}
                  />
                  <SettingToggle
                    label="私密模式"
                    value={settings.privacy}
                    disabled={Boolean(busy)}
                    onValueChange={(value) => void run(`setting-privacy-${value ? 'on' : 'off'}`, () => updateSetting(9, value))}
                  />
                </>
              ) : (
                <Text style={styles.panelMuted}>还未读取设备设置。</Text>
              )}
              {deviceFlags ? (
                <Text style={styles.panelMeta}>状态位：{formatDeviceFlags(deviceFlags)}</Text>
              ) : null}
              {identity ? (
                <Text style={styles.panelMeta}>设备身份：{identity.mac}{identity.appKey ? ` · key ${identity.appKey}` : ''}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>协议维护</Text>
            <View style={styles.actions}>
              <Button
                label="绑定"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('bind-device', async () => {
                  const ack = await sendBindDevice();
                  appendRealtimeLog('RX', `bind ack seq=${ack.sequence}`);
                })}
              />
              <Button
                label="解绑"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => confirmAndRun(
                  'unbind-device',
                  '解绑录音笔？',
                  '这会向 X1 发送官方 app 的解绑命令，可能影响它和原 app 的绑定状态。',
                  async () => {
                    const ack = await sendUnbindDevice();
                    appendRealtimeLog('RX', `unbind ack seq=${ack.sequence}`);
                  },
                )}
              />
              <Button
                label="暂停导入"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('pause-import-transfer', async () => {
                  const ack = await pauseImportTransfer(true);
                  appendRealtimeLog('RX', `pause import ack seq=${ack.sequence}`);
                })}
              />
              <Button
                label="继续导入"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('continue-import-transfer', async () => {
                  const ack = await pauseImportTransfer(false);
                  appendRealtimeLog('RX', `continue import ack seq=${ack.sequence}`);
                })}
              />
              <Button
                label="旧列表"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('legacy-list', requestLegacyAudioList)}
              />
              <Button
                label="删除全部"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => confirmAndRun(
                  'delete-all-files',
                  '删除设备全部录音？',
                  '这个命令会删除 X1 设备内所有录音文件，不能从 Orbit 恢复。',
                  deleteAllFiles,
                )}
              />
            </View>
          </View>
        ) : null}

        {connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>X1 实时录制</Text>
            <View style={styles.realtimeCard}>
              <View style={styles.realtimeHeader}>
                <View>
                  <Text style={styles.realtimeTitle}>{realtimeSaving ? '正在录制' : '待开始'}</Text>
                  <Text style={styles.realtimeMeta}>
                    {realtimeProgress
                      ? `${formatTimestamp(realtimeProgress.durationMs ?? 0)} · ${formatBytes(realtimeProgress.bytesReceived ?? 0)} · ${realtimeProgress.chunksReceived ?? 0} 块`
                      : '停止后会保存为本机 Capture'}
                  </Text>
                </View>
                {realtimeSaving ? <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View> : null}
              </View>
              <View style={styles.actions}>
                <Button
                  label="开始录制"
                  disabled={Boolean(busy) || realtimeSaving}
                  onPress={() => void run('x1-realtime-start-save', startRealtimeCapture)}
                />
                <Button
                  label="停止并保存"
                  variant="secondary"
                  disabled={Boolean(busy) || !realtimeSaving}
                  onPress={() => void run('x1-realtime-stop-save', stopRealtimeCapture)}
                />
                <Button
                  label="取消"
                  variant="secondary"
                  disabled={Boolean(busy) || !realtimeSaving}
                  onPress={() => void run('x1-realtime-cancel', cancelRealtimeCapture)}
                />
              </View>
              {realtimeSaving || liveTranscript || transcriptionError ? (
                <View style={styles.transcriptPanel}>
                  <Text style={styles.transcriptLabel}>实时转写</Text>
                  {liveTranscript ? (
                    <Text style={styles.transcriptText}>{liveTranscript}</Text>
                  ) : (
                    <Text style={styles.transcriptMuted}>
                      {transcriptionError ? '转写不可用，录音仍会保存。' : '正在等待语音…'}
                    </Text>
                  )}
                  {transcriptionError ? <Text style={styles.transcriptError}>{transcriptionError}</Text> : null}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {connected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>实时录音协议测试</Text>
            <View style={styles.actions}>
              <Button
                label="开始实时"
                disabled={Boolean(busy)}
                onPress={() => void run('realtime-start', startRealtimeRecord)}
              />
              <Button
                label="暂停"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('realtime-pause', pauseRealtimeRecord)}
              />
              <Button
                label="继续"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('realtime-continue', continueRealtimeRecord)}
              />
              <Button
                label="停止实时"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => void run('realtime-stop', stopRealtimeAndRefreshFiles)}
              />
              <Button
                label="清空帧"
                variant="secondary"
                disabled={Boolean(busy) || realtimeLogs.length === 0}
                onPress={() => {
                  setRealtimeLogs([]);
                }}
              />
            </View>
            <View style={styles.logPanel}>
              {realtimeLogs.length === 0 ? (
                <Text style={styles.logEmpty}>暂无帧</Text>
              ) : (
                realtimeLogs.slice(0, 28).map((entry) => (
                  <View key={entry.id} style={styles.logRow}>
                    <Text style={[styles.logKind, entry.kind === 'RX' && styles.logKindRx, entry.kind === 'ERR' && styles.logKindError]}>
                      {entry.kind}
                    </Text>
                    <View style={styles.logBody}>
                      <Text style={styles.logMessage}>{entry.at} · {entry.message}</Text>
                      {entry.payloadHex ? <Text style={styles.logHex}>{entry.payloadHex}</Text> : null}
                    </View>
                  </View>
                ))
              )}
            </View>
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

        {files.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              设备录音{total === null ? '' : ` · ${total} 条`}
            </Text>
            {files.map((file) => (
              <View
                key={`${file.index}-${file.name}`}
                style={[styles.row, busy && styles.disabled]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{file.name}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDurationLabel(file.durationMs)} · {formatBytes(file.byteSize)}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    onPress={() => void run(`import-${file.name}`, () => importFile(file))}
                    style={({ pressed }) => [styles.rowActionButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.rowAction}>导入</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    onPress={() => confirmAndRun(
                      `delete-${file.name}`,
                      '删除设备录音？',
                      `将从 X1 设备删除 ${file.name}。已导入到 Orbit 的本地 Capture 不会被删除。`,
                      () => deleteFile(file),
                    )}
                    style={({ pressed }) => [styles.rowActionButton, pressed && styles.pressed]}
                  >
                    <Text style={[styles.rowAction, styles.rowDanger]}>删除</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : connected && total === 0 ? (
          <Text style={styles.hint}>设备里没有可导入录音。</Text>
        ) : null}

        <Text style={styles.footer}>
          导入完成前不会写入列表；成功后音频会先进入本机 Capture，再走正常 iCloud 同步。
        </Text>
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

function SettingToggle({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accentSoft }}
        thumbColor={value ? colors.accent : colors.textMuted}
      />
    </View>
  );
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

function isDeviceSettings(event: X1DeviceStatusEvent): event is X1DeviceSettings {
  return event.kind === 'settings'
    && typeof event.clearRecord === 'boolean'
    && typeof event.hideRecord === 'boolean'
    && typeof event.privacy === 'boolean';
}

function isDeviceFlags(event: X1DeviceStatusEvent): event is X1DeviceFlags {
  return event.kind === 'deviceFlags'
    && typeof event.flags === 'number'
    && typeof event.isPlaying === 'boolean'
    && typeof event.isRecording === 'boolean'
    && typeof event.isUsbMode === 'boolean'
    && typeof event.isRealtimeTranscribing === 'boolean'
    && typeof event.isImporting === 'boolean'
    && typeof event.isPlaybackPaused === 'boolean'
    && typeof event.isScanningBusy === 'boolean';
}

function isAutoConnectX1Device(device: X1DiscoveredDevice): boolean {
  const advertisedServices = device.advertisedServices.map((service) => service.toLowerCase());
  if (advertisedServices.includes(X1_SERVICE_UUID)) return true;
  const name = device.name.toLowerCase();
  return name.includes('录音笔') || name.includes('newman') || name.includes('niuman');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit] ?? 'B'}`;
}

function formatDeviceFlags(flags: X1DeviceFlags): string {
  const labels = [
    flags.isPlaying ? '播放中' : null,
    flags.isRecording ? '录音中' : null,
    flags.isUsbMode ? 'USB' : null,
    flags.isRealtimeTranscribing ? '实时转写' : null,
    flags.isImporting ? '导入中' : null,
    flags.isPlaybackPaused ? '播放暂停' : null,
    flags.isScanningBusy ? '扫描忙' : null,
  ].filter(Boolean);
  return labels.length > 0 ? `${labels.join(' · ')} (${flags.flags})` : `空闲 (${flags.flags})`;
}

function summarizeFrame(frame: X1FrameEvent): string {
  const payloadBytes = Math.floor(frame.payloadHex.length / 2);
  const semantic = describeFramePayload(frame.payloadHex);
  if (semantic) {
    return `${semantic} · ${payloadBytes} B`;
  }
  const type = typeof frame.type === 'number' ? frame.type : '?';
  const command = typeof frame.command === 'number' ? frame.command : '?';
  const crc = frame.crcValid === false ? ' · crc error' : '';
  return `type ${type} cmd ${command} · ${payloadBytes} B${crc}`;
}

function describeFramePayload(payloadHex: string): string | null {
  const payload = parseHexBytes(payloadHex);
  if (payload.length < 2) return null;
  const [type, command] = payload;

  if (type === 1 && command === 1) {
    return `实时音频块 ${Math.max(0, payload.length - 2)} B`;
  }

  if (type === 1 && command === 4) {
    const state = payload[2] ?? 0;
    if (state === 2) return '实时录音停止确认 state=2';
    if (state === 0) return '实时录音停止确认 state=0';
    return `实时录音停止状态 state=${state}`;
  }

  if (type === 0 && command === 4 && payload.length >= 3) {
    return `电量 ${payload[2]}%`;
  }

  if (type === 0 && command === 6 && payload.length >= 5) {
    return `设置 clear=${payload[2]} hide=${payload[3]} privacy=${payload[4]}`;
  }

  if (type === 0 && command === 13 && payload.length >= 8) {
    return '设备身份 MAC/AppKey';
  }

  if (type === 0 && command === 14 && payload.length >= 3) {
    return `设备状态 flags=${payload[2]}`;
  }

  if (type === 2 && command === 34) {
    return '删除录音完成';
  }

  if (type === 3) {
    return `设备 ACK seq=${command}`;
  }

  return null;
}

function compactHex(hex: string): string {
  const compact = hex.replace(/\s+/g, '').toUpperCase();
  return compact.length <= 96 ? compact : `${compact.slice(0, 96)}...`;
}

function parseHexBytes(hex: string): number[] {
  const compact = hex.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length % 2 !== 0) return [];
  const bytes: number[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    const value = Number.parseInt(compact.slice(i, i + 2), 16);
    if (!Number.isFinite(value)) return [];
    bytes.push(value);
  }
  return bytes;
}

function shortTime(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function realtimeFilename(): string {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ];
  return `${parts.join('')}.mp3`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function debugX1(label: string, payload?: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[x1] ${label}`, payload ?? '');
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
    fontWeight: '800',
  },
  state: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    paddingBottom: 56,
  },
  statusBand: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    padding: 14,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  statusMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    minWidth: 86,
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
    fontWeight: '800',
  },
  buttonSecondaryText: {
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  row: {
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
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  rowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  rowActionButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  rowAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  rowDanger: {
    color: colors.danger,
  },
  settingsPanel: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  settingRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  panelMuted: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  panelMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 10,
  },
  logPanel: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    padding: 10,
  },
  logEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  logRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
  },
  logKind: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    width: 30,
  },
  logKindRx: {
    color: colors.accent,
  },
  logKindError: {
    color: colors.danger,
  },
  logBody: {
    flex: 1,
    minWidth: 0,
  },
  logMessage: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  logHex: {
    color: colors.textMuted,
    fontFamily: Platform.select({ ios: 'Menlo', default: undefined }),
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  realtimeCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  realtimeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  realtimeTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  realtimeMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  liveBadge: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  liveBadgeText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: '900',
  },
  transcriptPanel: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    padding: 12,
  },
  transcriptLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 7,
  },
  transcriptText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  transcriptMuted: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  transcriptError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  progressBand: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    padding: 14,
  },
  progressTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  progressMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
    textAlign: 'center',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  footer: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
