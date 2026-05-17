/**
 * RecordingComposerScreen — 长录音 / 录音中页面
 *
 * 录音模式的核心不是编辑文本，而是精确捕捉录音过程中的时间点。
 * 用户先标记此刻，再补笔记 / 图片 / 文件；所有素材随同一条 recording capture 原子落盘。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.2
 */

import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { KeyboardEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addConnectionStateListener,
  addDeviceStatusListener,
  addErrorListener,
  addRealtimeProgressListener,
  addScanResultListener,
  cancelRealtimeImport,
  connect,
  continueRealtimeRecord,
  getBattery,
  getDeviceIdentity,
  getState,
  getStorage,
  getVersion,
  pauseRealtimeRecord,
  sendCheckTime,
  startRealtimeImport,
  startScan,
  stopRealtimeImport,
  stopScan,
  type X1ConnectionStateEvent,
  type X1DeviceIdentity,
  type X1DeviceStatusEvent,
  type X1DiscoveredDevice,
  type X1RealtimeImportResult,
  type X1RealtimeProgressEvent,
  type X1StorageInfo,
} from 'orbit-recorder-device';
import {
  addTranscriptionErrorListener,
  addTranscriptionListener,
  start as startSpeechRecognition,
  stop as stopSpeechRecognition,
  type TranscriptionSegment,
} from 'orbit-speech-recognition';

import {
  addVoiceRecordingLevelListener,
  cancelVoiceRecording,
  pauseVoiceRecording,
  resumeVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
} from '../../../core/audio/recorder';
import {
  startLiveTranscription,
  type LiveTranscriptionSession,
} from '../../../core/audio/transcription';
import type { CaptureAttachment } from '../../../core/capture/types';
import { pickFiles, sanitizeAttachmentFilename } from '../../../core/file/picker';
import { pickImages, takePhoto, type PickedImage } from '../../../core/image/picker';
import {
  createLiveTranscriptSegmentationState,
  type LiveTranscriptSpeechSegment,
  updateLiveTranscriptSegments,
} from '../../../core/recording/live-transcript-segmenter';
import { createRecordingCapture, type LivePartialInput } from '../../../core/recording/recording-service';
import { recordingTimestampTitle } from '../../../core/recording/title';
import { openDb } from '../../../core/storage/db';
import * as annotationsRepo from '../../../core/storage/recording-annotations-repo';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
import type { RecordingSpeaker } from '../../../types/recording';
import { expoFileSystem } from '../../../utils/fs';
import { backOrReplace } from '../../navigation/back';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { SpeakerAvatar } from '../components/SpeakerAvatar';
import { Waveform } from '../components/Waveform';
import { formatTimestamp } from '../format';
import { colors, radius, spacing } from '../theme';
import { formatX1StorageUsage } from '../x1-device';

type ComposerTab = 'mark' | 'transcript' | 'source';
type RecordingSource = 'iphone' | 'x1';
type SessionEventKind = 'marker' | 'note' | 'photo' | 'image' | 'file';

interface PartialLine {
  ts: number;
  speaker: RecordingSpeaker;
  text: string;
  isFinal: boolean;
}

interface SessionEventAttachment {
  type: 'image' | 'file';
  filename: string;
  displayName: string;
  uri: string;
  mime: string;
  byteSize?: number;
  width?: number;
  height?: number;
}

interface SessionEvent {
  id: string;
  ts: number;
  kind: SessionEventKind;
  label: string;
  body?: string;
  createdAt: string;
  attachment?: SessionEventAttachment;
}

interface X1DeviceSnapshot {
  battery: number | null;
  version: string | null;
  storage: X1StorageInfo | null;
  identity: X1DeviceIdentity | null;
}

const FALLBACK_SPEAKER: RecordingSpeaker = {
  id: 'S1',
  label: '说话人',
  color: '#2563eb',
};

const LANGUAGES = [
  { code: 'auto', label: '自动检测' },
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' },
];

interface RecordingComposerScreenProps {
  source?: RecordingSource;
  autoSaveAfterMs?: number;
}

const X1_SERVICE_UUID = '0000ae20-0000-1000-8000-00805f9b34fb';

export function RecordingComposerScreen({
  source = 'iphone',
  autoSaveAfterMs,
}: RecordingComposerScreenProps): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const noteInputRef = useRef<TextInput>(null);
  const pageScrollRef = useRef<ScrollView>(null);
  const pageScrollYRef = useRef(0);
  const noteFocusedRef = useRef(false);
  const tabRef = useRef<ComposerTab>('mark');
  const initialStartedAt = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<ComposerTab>('mark');
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waveformSamples, setWaveformSamples] = useState<number[]>([]);
  const [partials, setPartials] = useState<PartialLine[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [x1Connection, setX1Connection] = useState<X1ConnectionStateEvent>({
    bluetoothState: 'unknown',
    connectionState: 'idle',
    isScanning: false,
  });
  const [x1DeviceInfo, setX1DeviceInfo] = useState<X1DeviceSnapshot>({
    battery: null,
    identity: null,
    storage: null,
    version: null,
  });
  const [x1RealtimeProgress, setX1RealtimeProgress] = useState<X1RealtimeProgressEvent | null>(null);
  const [language, setLanguage] = useState('auto');
  const [diarization] = useState(false);
  const [title, setTitle] = useState(() => recordingTimestampTitle(initialStartedAt, source));
  const [error, setError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const keyboardInsetRef = useRef(0);
  const startedAtRef = useRef(initialStartedAt.toISOString());
  const startedMsRef = useRef(initialStartedAt.getTime());
  const eventSeqRef = useRef(1);
  const attachmentSeqRef = useRef(1);
  const cleanupRef = useRef<(() => void) | null>(null);
  const x1AutoConnectAttemptedRef = useRef(false);
  const x1RealtimeStartedRef = useRef(false);
  const autoSaveStartedRef = useRef(false);
  const transcriptionRef = useRef<LiveTranscriptionSession | null>(null);
  const transcriptTextRef = useRef('');
  const partialsRef = useRef<LivePartialInput[]>([]);
  const partialProviderRef = useRef<string>('unavailable');
  const transcriptSegmentationRef = useRef(createLiveTranscriptSegmentationState());
  const waveformRef = useRef<number[]>([]);
  const x1ProgressRef = useRef<X1RealtimeProgressEvent | null>(null);
  const levelSubscriptionRef = useRef<{ remove(): void } | null>(null);
  const activeEvent = events.find((event) => event.id === activeEventId) ?? null;
  const liveOutline = useMemo(() => buildLiveOutline(partials), [partials]);
  const sourceLabel = source === 'x1' ? 'X1 录音卡' : 'iPhone 麦克风';
  const scrollFocusedNoteIntoView = useCallback((inset = keyboardInsetRef.current) => {
    if (!noteFocusedRef.current) return;
    requestAnimationFrame(() => {
      noteInputRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => {
        const visibleBottom = window.height - inset - insets.bottom - 20;
        const overflow = pageY + height - visibleBottom;
        if (overflow <= 0) return;
        pageScrollRef.current?.scrollTo({
          y: pageScrollYRef.current + overflow + 16,
          animated: true,
        });
      });
    });
  }, [insets.bottom, window.height]);

  useEffect(() => {
    let cancelled = false;

    async function beginIphone(): Promise<void> {
      try {
        const startedAt = new Date();
        startedAtRef.current = startedAt.toISOString();
        startedMsRef.current = startedAt.getTime();
        setTitle(recordingTimestampTitle(startedAt, 'iphone'));
        waveformRef.current = [];
        setWaveformSamples([]);
        transcriptSegmentationRef.current = createLiveTranscriptSegmentationState();
        transcriptTextRef.current = '';
        partialsRef.current = [];
        setPartials([]);
        partialProviderRef.current = 'unavailable';
        await startVoiceRecording();
        if (!cancelled) setRecording(true);
        levelSubscriptionRef.current = addVoiceRecordingLevelListener((level) => {
          const sample = Math.max(level.rms, level.peak * 0.75);
          waveformRef.current = [...waveformRef.current, Math.max(0, Math.min(1, sample))];
          setWaveformSamples(waveformRef.current.slice(-240));
        });
        const session = await startLiveTranscription((state) => {
          partialProviderRef.current = state.source;
          applyLiveTranscriptUpdate({
            transcript: state.transcript,
            elapsedMs: Math.max(0, Date.now() - startedMsRef.current),
            isFinal: state.isFinal === true,
            speechSegments: toLiveSpeechSegments(state.segments),
          });
        });
        transcriptionRef.current = session;
        partialProviderRef.current = session.source;
      } catch (startError) {
        if (!cancelled) {
          setError(startError instanceof Error ? startError.message : String(startError));
        }
        await transcriptionRef.current?.stop();
        transcriptionRef.current = null;
      }
    }

    async function beginX1(): Promise<void> {
      if (Platform.OS !== 'ios') {
        setError('X1 录音当前只支持 iOS Development Build。');
        return;
      }

      partialProviderRef.current = 'x1-realtime';
      waveformRef.current = [];
      x1ProgressRef.current = null;
      setWaveformSamples([]);
      transcriptSegmentationRef.current = createLiveTranscriptSegmentationState();
      transcriptTextRef.current = '';
      partialsRef.current = [];
      setPartials([]);
      const subscriptions = [
        addScanResultListener((device) => {
          if (!isAutoConnectX1Device(device) || x1AutoConnectAttemptedRef.current) return;
          x1AutoConnectAttemptedRef.current = true;
          setError(null);
          void stopScan().catch(() => undefined);
          void connect(device.id)
            .then(async () => {
              await sendCheckTime().catch(() => undefined);
              await refreshX1DeviceInfo().catch(() => undefined);
              await startX1RealtimeIfNeeded();
            })
            .catch((connectError: unknown) => {
              x1AutoConnectAttemptedRef.current = false;
              if (!cancelled) setError(errorMessage(connectError));
              void startScan().catch(() => undefined);
            });
        }),
        addConnectionStateListener((state) => {
          setX1Connection(state);
          if (state.connectionState === 'connected') {
            void refreshX1DeviceInfo();
            void startX1RealtimeIfNeeded();
          }
        }),
        addDeviceStatusListener((event) => {
          applyX1DeviceStatus(event);
        }),
        addRealtimeProgressListener((event) => {
          setX1RealtimeProgress(event);
          if (typeof event.durationMs === 'number') {
            setElapsedMs(Math.max(0, event.durationMs));
          }
          appendX1ActivitySample(event);
        }),
        addErrorListener((event) => {
          setError(event.message);
        }),
        addTranscriptionListener((event) => {
          partialProviderRef.current = 'x1-realtime-ios-speech';
          if (event.transcript.trim().length === 0) return;
          applyLiveTranscriptUpdate({
            transcript: event.transcript,
            elapsedMs: Math.max(0, Date.now() - startedMsRef.current),
            isFinal: event.isFinal,
            speechSegments: toLiveSpeechSegments(event.segments),
          });
        }),
        addTranscriptionErrorListener((event) => {
          partialProviderRef.current = 'x1-realtime';
          setError(`X1 实时转写不可用，原始录音仍会保存：${event.message}`);
        }),
      ];
      cleanupRef.current = () => {
        subscriptions.forEach((subscription) => subscription.remove());
      };

      try {
        const state = await getState();
        if (cancelled) return;
        setX1Connection(state);
        if (state.connectionState === 'connected') {
          await refreshX1DeviceInfo();
          await startX1RealtimeIfNeeded();
        } else {
          await startScan();
          setX1Connection(await getState());
        }
      } catch (startError) {
        if (!cancelled) setError(errorMessage(startError));
      }
    }

    void (source === 'x1' ? beginX1() : beginIphone());
    return () => {
      cancelled = true;
      void transcriptionRef.current?.stop();
      transcriptionRef.current = null;
      levelSubscriptionRef.current?.remove();
      levelSubscriptionRef.current = null;
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (source === 'x1') {
        void stopSpeechRecognition().catch(() => undefined);
        void stopScan().catch(() => undefined);
        if (x1RealtimeStartedRef.current) {
          void cancelRealtimeImport().catch(() => undefined);
        }
      } else {
        void cancelVoiceRecording().catch(() => undefined);
      }
    };
  }, [source]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    function updateKeyboardInset(event: KeyboardEvent): void {
      const overlap = Math.max(0, window.height - event.endCoordinates.screenY - insets.bottom);
      keyboardInsetRef.current = overlap;
      setKeyboardInset(overlap);
      setTimeout(() => scrollFocusedNoteIntoView(overlap), 80);
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, updateKeyboardInset);
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardInsetRef.current = 0;
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, scrollFocusedNoteIntoView, window.height]);

  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => {
      setElapsedMs(currentElapsedMs(startedMsRef.current));
    }, 250);
    return () => clearInterval(t);
  }, [recording, paused]);

  useEffect(() => {
    if (!autoSaveAfterMs || !recording || saving || autoSaveStartedRef.current) return undefined;
    autoSaveStartedRef.current = true;
    const timer = setTimeout(() => {
      void stopAndOpenDetail();
    }, autoSaveAfterMs);
    return () => clearTimeout(timer);
  }, [autoSaveAfterMs, recording, saving]);

  function applyLiveTranscriptUpdate({
    transcript,
    elapsedMs,
    isFinal,
    speechSegments,
  }: {
    transcript: string;
    elapsedMs: number;
    isFinal?: boolean;
    speechSegments?: LiveTranscriptSpeechSegment[];
  }): void {
    const segments = updateLiveTranscriptSegments(transcriptSegmentationRef.current, {
      transcript,
      elapsedMs,
      isFinal,
      speechSegments,
    });
    if (segments.length === 0) return;
    transcriptTextRef.current = segments.map((segment) => segment.text).join(' ');
    partialsRef.current = segments.map((segment) => ({
      elapsed_ms: segment.start_ms,
      end_ms: segment.end_ms,
      speaker: FALLBACK_SPEAKER.id,
      text: segment.text,
      is_final: segment.is_final,
      words: segment.words,
    }));
    setPartials(segments.map((segment) => ({
      ts: segment.start_ms,
      speaker: FALLBACK_SPEAKER,
      text: segment.text,
      isFinal: segment.is_final,
    })));
    requestAnimationFrame(() => {
      if (tabRef.current === 'transcript') {
        pageScrollRef.current?.scrollToEnd({ animated: true });
      }
    });
  }

  function appendX1ActivitySample(event: X1RealtimeProgressEvent): void {
    const previous = x1ProgressRef.current;
    x1ProgressRef.current = event;
    if (event.phase !== 'receiving') return;
    const bytesReceived = event.bytesReceived ?? 0;
    const previousBytes = previous?.bytesReceived ?? 0;
    const deltaBytes = Math.max(0, bytesReceived - previousBytes);
    if (deltaBytes <= 0) return;
    const sample = x1ActivitySample(deltaBytes, event.chunksReceived ?? 0);
    waveformRef.current = [...waveformRef.current, sample];
    setWaveformSamples(waveformRef.current.slice(-240));
  }

  function applyX1DeviceStatus(event: X1DeviceStatusEvent): void {
    if (event.kind === 'battery') {
      const battery = event.battery;
      if (typeof battery === 'number') {
        setX1DeviceInfo((prev) => ({ ...prev, battery }));
        return;
      }
    }
    if (event.kind === 'version') {
      const version = event.version;
      if (typeof version === 'string') {
        setX1DeviceInfo((prev) => ({ ...prev, version }));
        return;
      }
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
  }

  async function refreshX1DeviceInfo(): Promise<void> {
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
  }

  async function startX1RealtimeIfNeeded(): Promise<void> {
    if (source !== 'x1' || x1RealtimeStartedRef.current || saving) return;
    x1RealtimeStartedRef.current = true;
    setError(null);
    try {
      const started = await startRealtimeImport(realtimeFilename());
      const startedAt = normalizeIsoDate(started.startedAt) ?? new Date().toISOString();
      startedAtRef.current = startedAt;
      const startedDate = new Date(startedAt);
      startedMsRef.current = startedDate.getTime();
      setTitle(recordingTimestampTitle(startedDate, 'x1'));
      transcriptTextRef.current = '';
      partialsRef.current = [];
      partialProviderRef.current = 'x1-realtime';
      transcriptSegmentationRef.current = createLiveTranscriptSegmentationState();
      x1ProgressRef.current = null;
      setPartials([]);
      setX1RealtimeProgress({
        phase: 'started',
        name: started.name,
        bytesReceived: started.byteSize,
        durationMs: started.durationMs,
        chunksReceived: started.chunksReceived,
      });
      setElapsedMs(Math.max(0, started.durationMs ?? 0));
      setRecording(true);
      setPaused(false);
      await startSpeechRecognition(language === 'auto' ? 'zh-CN' : language).catch((speechError: unknown) => {
        partialProviderRef.current = 'x1-realtime';
        setError(`X1 实时转写不可用，原始录音仍会保存：${errorMessage(speechError)}`);
      });
    } catch (startError) {
      x1RealtimeStartedRef.current = false;
      setRecording(false);
      setError(errorMessage(startError));
    }
  }

  async function stopAndOpenDetail(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await transcriptionRef.current?.stop();
      transcriptionRef.current = null;
      levelSubscriptionRef.current?.remove();
      levelSubscriptionRef.current = null;
      const x1Audio = source === 'x1' ? await stopX1RealtimeAudio() : null;
      const audio = source === 'x1' ? null : await stopVoiceRecording();
      setRecording(false);
      const db = await openDb();
      const detail = await createRecordingCapture({
        title,
        audioUri: x1Audio?.uri ?? audio?.uri ?? '',
        audioFilename: x1Audio ? audioAttachmentFilename(x1Audio.name) : undefined,
        audioMime: x1Audio?.mime,
        recordedAt: source === 'x1' ? startedAtRef.current : undefined,
        durationMs: x1Audio?.durationMs ?? audio?.durationMs ?? elapsedMs,
        startedAt: startedAtRef.current,
        languageHints: language === 'auto' ? [] : [language],
        partials: partialsRef.current,
        transcriptText: transcriptTextRef.current,
        partialProvider: partialProviderRef.current,
        waveformSamples: waveformRef.current,
        sessionAttachments: events.flatMap(eventToAttachment),
      }, {
        db,
        sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
      });
      if (x1Audio) {
        await expoFileSystem.delete(x1Audio.uri, { idempotent: true }).catch(() => undefined);
      }
      for (const event of events) {
        await annotationsRepo.upsert(db, {
          recording_id: detail.meta.id,
          kind: 'session_event',
          target_id: event.id,
          payload: eventPayload(event),
        });
        await annotationsRepo.upsert(db, {
          recording_id: detail.meta.id,
          kind: 'bookmark',
          target_id: event.id,
          payload: {
            segmentId: event.ts,
            start_ms: event.ts,
            end_ms: event.ts,
            text: eventSummary(event),
            label: event.label,
          },
        });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      router.replace({
        pathname: '/recording/[id]',
        params: { id: detail.meta.id, fromSession: '1' },
      });
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : String(stopError));
      setSaving(false);
    }
  }

  function requestStopAndSave(): void {
    if (!recording || saving) return;
    Alert.alert(
      '结束并保存录音？',
      '这会停止当前录音，并把原始音频、转写、时间点和附件写入本机。',
      [
        { text: '继续录音', style: 'cancel' },
        {
          text: '结束并保存',
          style: 'destructive',
          onPress: () => {
            void stopAndOpenDetail();
          },
        },
      ],
    );
  }

  async function togglePause(): Promise<void> {
    try {
      if (source === 'x1') {
        if (paused) {
          await continueRealtimeRecord();
          startedMsRef.current = Date.now() - elapsedMs;
          setPaused(false);
        } else {
          await pauseRealtimeRecord();
          setElapsedMs(currentElapsedMs(startedMsRef.current));
          setPaused(true);
        }
        return;
      }
      if (paused) {
        await resumeVoiceRecording();
        startedMsRef.current = Date.now() - elapsedMs;
        setPaused(false);
      } else {
        await pauseVoiceRecording();
        setElapsedMs(currentElapsedMs(startedMsRef.current));
        setPaused(true);
      }
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : String(pauseError));
    }
  }

  async function cancelAndBack(): Promise<void> {
    await transcriptionRef.current?.stop();
    transcriptionRef.current = null;
    levelSubscriptionRef.current?.remove();
    levelSubscriptionRef.current = null;
    if (source === 'x1') {
      await stopSpeechRecognition().catch(() => undefined);
      await cancelRealtimeImport().catch(() => undefined);
      x1RealtimeStartedRef.current = false;
    } else {
      await cancelVoiceRecording().catch(() => undefined);
    }
    backOrReplace(router, '/');
  }

  function markNow(): void {
    createSessionEvent('marker');
    setTab('mark');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  async function stopX1RealtimeAudio(): Promise<X1RealtimeImportResult> {
    await stopSpeechRecognition().catch(() => undefined);
    const result = await stopRealtimeImport();
    const success = result.success || (result.status === 2 && result.byteSize > 0);
    if (!success) {
      throw new Error(`x1.realtime_failed_status:${result.status}`);
    }
    x1RealtimeStartedRef.current = false;
    return result;
  }

  function createSessionEvent(
    kind: SessionEventKind,
    input: Partial<Omit<SessionEvent, 'id' | 'ts' | 'kind' | 'createdAt'>> = {},
    anchoredTs?: number,
  ): SessionEvent {
    const seq = eventSeqRef.current;
    const ts = anchoredTs ?? currentElapsedMs(startedMsRef.current);
    eventSeqRef.current += 1;
    const event: SessionEvent = {
      id: `event-${ts}-${seq}`,
      ts,
      kind,
      label: input.label ?? eventKindLabel(kind, seq),
      body: input.body,
      createdAt: new Date().toISOString(),
      attachment: input.attachment,
    };
    setEvents((prev) => [...prev, event].sort((a, b) => a.ts - b.ts));
    setActiveEventId(event.id);
    return event;
  }

  function ensureActiveEvent(): SessionEvent {
    const existing = events.find((event) => event.id === activeEventId);
    if (existing) return existing;
    return createSessionEvent('marker');
  }

  function updateEvent(id: string, patch: Partial<SessionEvent>): void {
    setEvents((prev) => prev.map((event) => (
      event.id === id
        ? {
            ...event,
            ...patch,
            label: patch.label ?? event.label,
          }
        : event
    )));
  }

  function nextAttachmentFilename(filename: string): string {
    const next = uniqueAttachmentFilename(filename, attachmentSeqRef.current);
    attachmentSeqRef.current += 1;
    return next;
  }

  function startNote(): void {
    const event = ensureActiveEvent();
    updateEvent(event.id, {
      kind: event.kind === 'marker' ? 'note' : event.kind,
      label: event.kind === 'marker' ? '笔记' : event.label,
    });
    setActiveEventId(event.id);
    setTab('mark');
    setTimeout(() => {
      noteInputRef.current?.focus();
      setTimeout(() => scrollFocusedNoteIntoView(), 80);
    }, 80);
  }

  async function attachPhoto(): Promise<void> {
    setError(null);
    try {
      const image = await takePhoto();
      if (!image) return;
      attachPickedImages([image], 'photo');
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : String(photoError));
    }
  }

  async function attachImages(): Promise<void> {
    setError(null);
    try {
      const images = await pickImages();
      attachPickedImages(images, 'image');
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : String(imageError));
    }
  }

  async function attachFiles(): Promise<void> {
    setError(null);
    try {
      const files = await pickFiles();
      if (files.length === 0) return;
      const anchor = ensureActiveEvent();
      files.forEach((file, index) => {
        const filename = nextAttachmentFilename(
          sanitizeAttachmentFilename(file.displayName, 'event-file.bin'),
        );
        const attachment: SessionEventAttachment = {
          type: 'file',
          filename,
          displayName: file.displayName,
          uri: file.uri,
          mime: file.mime,
          byteSize: file.byteSize,
        };
        placeAttachmentEvent(anchor, 'file', attachment, index);
      });
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : String(fileError));
    }
  }

  function attachPickedImages(images: PickedImage[], kind: Extract<SessionEventKind, 'photo' | 'image'>): void {
    if (images.length === 0) return;
    const anchor = ensureActiveEvent();
    images.forEach((image, index) => {
      const filename = nextAttachmentFilename(kind === 'photo' ? 'event-photo.jpg' : image.filename);
      const attachment: SessionEventAttachment = {
        type: 'image',
        filename,
        displayName: filename,
        uri: image.uri,
        mime: image.mime,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
      };
      placeAttachmentEvent(anchor, kind, attachment, index);
    });
  }

  function placeAttachmentEvent(
    anchor: SessionEvent,
    kind: Extract<SessionEventKind, 'photo' | 'image' | 'file'>,
    attachment: SessionEventAttachment,
    index: number,
  ): void {
    const label = kind === 'file'
      ? '文件'
      : kind === 'photo'
        ? '拍照'
        : '图片';
    const activeCanAccept = anchor.kind === 'marker' && !anchor.body && !anchor.attachment && index === 0;
    if (activeCanAccept) {
      updateEvent(anchor.id, {
        kind,
        label,
        attachment,
      });
      setActiveEventId(anchor.id);
      return;
    }
    createSessionEvent(kind, { label, attachment }, anchor.ts);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void cancelAndBack();
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>✕</Text>
        </Pressable>
        <View style={styles.topTabs}>
          <SegmentedTabs
            activeKey={tab}
            onSelect={(key) => setTab(key as ComposerTab)}
            items={[
              { key: 'mark', label: '时间点' },
              { key: 'transcript', label: '转写' },
              { key: 'source', label: '来源' },
            ]}
            compact
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!recording || saving}
          onPress={requestStopAndSave}
          style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
        >
          <Text style={styles.doneText}>{saving ? '保存中' : '完成'}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={pageScrollRef}
        automaticallyAdjustKeyboardInsets={false}
        contentContainerStyle={[
          styles.pageContent,
          { paddingBottom: keyboardInset + insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          pageScrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.pageScroll}
      >
        <View style={styles.titleRow}>
          <View style={styles.liveDot} />
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="给这次会议起个标题"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.controlsCard}>
          <View style={styles.timerRow}>
            <Text style={styles.timer}>{formatTimestamp(elapsedMs)}</Text>
            <View style={styles.recordingPill}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                {recording
                  ? paused
                    ? '已暂停'
                    : source === 'x1'
                      ? x1RealtimeProgress?.bytesReceived
                        ? `X1 录音卡 · ${formatBytes(x1RealtimeProgress.bytesReceived)}`
                        : 'X1 录音卡'
                      : partialProviderRef.current === 'ios-speech'
                        ? 'iPhone 录音 · 转写中'
                        : 'iPhone 录音'
                  : source === 'x1'
                    ? x1Connection.isScanning
                      ? '正在寻找 X1'
                      : x1Connection.connectionState === 'connected'
                        ? '正在启动 X1'
                        : '等待 X1'
                    : '正在启动'}
              </Text>
            </View>
          </View>
          <Waveform
            samples={waveformSamples}
            height={74}
            bars={72}
            progress={1}
            active={!paused}
          />
          <View style={styles.controlBar}>
            <Pressable
              accessibilityRole="button"
              disabled={!recording || saving}
              onPress={() => {
                void togglePause();
              }}
              style={({ pressed }) => [
                styles.pauseBtn,
                paused && styles.pauseBtnResume,
                (!recording || saving) && styles.disabled,
                pressed && recording && !saving && styles.pressed,
              ]}
            >
              <Text style={styles.pauseBtnText}>{paused ? '继续' : '暂停'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!recording || saving}
              onPress={markNow}
              style={({ pressed }) => [
                styles.markNowBtn,
                (!recording || saving) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.markNowText}>标记此刻</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!recording || saving}
            onPress={requestStopAndSave}
            style={({ pressed }) => [
              styles.stopBtn,
              (!recording || saving) && styles.stopBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.stopBtnText}>{saving ? '正在保存...' : '结束并保存录音'}</Text>
          </Pressable>
        </View>

        {tab === 'mark' ? (
        <View style={styles.timelineArea}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {activeEvent ? (
            <View style={styles.activeEditor}>
              <View style={styles.activeEditorTop}>
                <View>
                  <Text style={styles.activeContextLabel}>正在编辑</Text>
                  <View style={styles.activeTitleRow}>
                    <Text style={styles.activeTs}>{formatTimestamp(activeEvent.ts)}</Text>
                    <Text style={styles.activeKind}>{activeEvent.label}</Text>
                  </View>
                </View>
                <Text style={styles.activeBadge}>当前标记</Text>
              </View>
              <Text style={styles.activeHint}>
                下方操作都会附加到这个时间点；点时间线里的其他标记可切换。
              </Text>
              <View style={styles.activeActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={startNote}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.actionText}>写笔记</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void attachPhoto();
                  }}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.actionText}>拍照</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void attachImages();
                  }}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.actionText}>图片</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void attachFiles();
                  }}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.actionText}>文件</Text>
                </Pressable>
              </View>
              {activeEvent.attachment ? (
                <Text numberOfLines={1} style={styles.attachmentLine}>
                  {activeEvent.attachment.displayName}
                </Text>
              ) : null}
              <TextInput
                ref={noteInputRef}
                multiline
                onBlur={() => {
                  noteFocusedRef.current = false;
                }}
                onChangeText={(value) => {
                  updateEvent(activeEvent.id, {
                    body: value,
                    kind: activeEvent.kind === 'marker' ? 'note' : activeEvent.kind,
                    label: activeEvent.kind === 'marker' ? '笔记' : activeEvent.label,
                  });
                }}
                onFocus={() => {
                  noteFocusedRef.current = true;
                  setTimeout(() => scrollFocusedNoteIntoView(), 80);
                }}
                placeholder="补一句这个时间点发生了什么"
                placeholderTextColor={colors.textMuted}
                style={styles.noteInput}
                textAlignVertical="top"
                value={activeEvent.body ?? ''}
              />
            </View>
          ) : (
            <View style={styles.activeEmpty}>
              <Text style={styles.activeEmptyTitle}>
                {source === 'x1' && !recording ? '正在连接 X1' : '先标记一个时间点'}
              </Text>
              <Text style={styles.placeholderBody}>
                {source === 'x1' && !recording
                  ? '保持录音卡开机并靠近手机；连接成功后会进入和 iPhone 录音一致的时间点页面。'
                  : '点上方“标记此刻”会立即锁定当前录音时间；笔记、照片、图片和文件都会添加到选中的标记。'}
              </Text>
              {source === 'x1' && !recording ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    x1AutoConnectAttemptedRef.current = false;
                    setError(null);
                    void stopScan()
                      .catch(() => undefined)
                      .then(startScan)
                      .then(getState)
                      .then(setX1Connection)
                      .catch((scanError: unknown) => setError(errorMessage(scanError)));
                  }}
                  style={({ pressed }) => [styles.scanAgainBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.scanAgainText}>重新扫描</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <View style={styles.timelineHeader}>
            <Text style={styles.sectionLabel}>时间点</Text>
            <Text style={styles.timelineCount}>{events.length} 条</Text>
          </View>
          {events.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Text style={styles.placeholderBody}>还没有时间点。</Text>
            </View>
          ) : null}
          {events.map((event) => {
            const active = event.id === activeEventId;
            return (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                onPress={() => setActiveEventId(event.id)}
                style={({ pressed }) => [
                  styles.eventRow,
                  active && styles.eventRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.eventTs}>{formatTimestamp(event.ts)}</Text>
                <View style={styles.eventBody}>
                  <View style={styles.eventMetaRow}>
                    <Text style={styles.eventLabel}>{event.label}</Text>
                    {active ? (
                      <Text style={styles.eventActivePill}>正在编辑</Text>
                    ) : null}
                  </View>
                  {event.body ? (
                    <Text numberOfLines={2} style={styles.eventText}>{event.body}</Text>
                  ) : null}
                  {event.attachment ? (
                    <Text numberOfLines={1} style={styles.eventAttachment}>
                      {event.attachment.displayName}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        ) : null}

        {tab === 'transcript' ? (
        <View style={styles.transcriptArea}>
          <Text style={styles.sectionLabel}>大纲 · 实时生成</Text>
          <View style={styles.outlineCard}>
            {liveOutline.length === 0 ? (
              <Text style={styles.outlineItemMuted}>转写出现后会自动生成片段大纲。</Text>
            ) : null}
            {liveOutline.map((item) => (
              <Text key={`${item.ts}-${item.title}`} style={styles.outlineItem}>
                {formatTimestamp(item.ts)} · {item.title}
              </Text>
            ))}
          </View>
          <Text style={styles.sectionLabel}>转写</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {partials.length === 0 ? (
            <Text style={styles.placeholder}>
              {partialProviderRef.current === 'unavailable'
                ? '实时转写不可用时仍会保存原始录音。'
                : '实时转写正在准备...'}
            </Text>
          ) : null}
          {partials.map((line, idx) => (
            <View key={idx} style={styles.partialRow}>
              <SpeakerAvatar speaker={line.speaker} size={28} />
              <View style={styles.partialBody}>
                <View style={styles.partialMetaRow}>
                  <Text style={[styles.partialSpeaker, { color: line.speaker.color }]}>
                    {line.speaker.label}
                  </Text>
                  <Text style={styles.partialTs}>
                    {formatTimestamp(line.ts)}
                  </Text>
                  {!line.isFinal ? (
                    <Text style={styles.partialPending}>partial</Text>
                  ) : null}
                </View>
                <Text style={[styles.partialText, !line.isFinal && styles.partialTextLive]}>
                  {line.text}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.tailHint}>停止后会基于实时转写生成本地 final transcript，原始录音始终保留。</Text>
        </View>
        ) : null}

        {tab === 'source' ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>录音源</Text>
          <SourceRow label="当前来源" value={sourceLabel} />
          <SourceRow label="状态" value={recording ? (paused ? '已暂停' : '录音中') : '启动中'} />
          {source === 'x1' ? (
            <>
              <SourceRow label="蓝牙" value={x1Connection.bluetoothState} />
              <SourceRow label="连接" value={x1Connection.device?.name || x1Connection.connectionState} />
              <SourceRow label="电量" value={formatBattery(x1DeviceInfo.battery)} />
              <SourceRow label="固件" value={x1DeviceInfo.version || '连接后读取'} />
              <SourceRow label="容量" value={formatX1Storage(x1DeviceInfo.storage)} />
              <SourceRow label="MAC" value={x1DeviceInfo.identity?.mac || '连接后读取'} />
              <SourceRow label="接收" value={x1RealtimeProgress ? `${formatBytes(x1RealtimeProgress.bytesReceived ?? 0)} · ${x1RealtimeProgress.chunksReceived ?? 0} 块` : '等待音频帧'} />
            </>
          ) : null}
          <SourceRow label="开始时间" value={new Date(startedAtRef.current).toLocaleString('zh-Hans-CN')} />
          <SourceRow label="语言" value={LANGUAGES.find((item) => item.code === language)?.label ?? language} />
          <SourceRow label="实时转写" value={partialProviderRef.current === 'ios-speech' || partialProviderRef.current === 'x1-realtime-ios-speech' ? 'Apple Speech' : '不可用，仍保存原音'} />
          <SourceRow label="说话人" value="单说话人本地结构" />
          <View style={styles.optionPills}>
            {LANGUAGES.map((lang) => {
              const active = lang.code === language;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => setLanguage(lang.code)}
                  style={({ pressed }) => [
                    styles.langPill,
                    active && styles.langPillActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.langPillText, active && styles.langPillTextActive]}
                  >
                    {lang.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => setError('说话人分离 provider 尚未配置；本次会按单说话人结构保存。')}
            style={({ pressed }) => [
              styles.toggle,
              diarization && styles.toggleOn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.toggleText, diarization && styles.toggleTextOn]}>
              {diarization ? '区分说话人 · 开' : '区分说话人 · 关'}
            </Text>
          </Pressable>
        </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SourceRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.sourceRow}>
      <Text style={styles.sourceLabel}>{label}</Text>
      <Text style={styles.sourceValue}>{value}</Text>
    </View>
  );
}

function buildLiveOutline(partials: PartialLine[]): Array<{ ts: number; title: string }> {
  return partials
    .filter((partial) => partial.text.trim().length > 0)
    .slice(-5)
    .map((partial, index) => {
      const title = partial.text.trim();
      return {
        ts: partial.ts,
        title: title.length > 34 ? `${title.slice(0, 34)}...` : title || `片段 ${index + 1}`,
      };
    });
}

function currentElapsedMs(startedMs: number): number {
  return Math.max(0, Date.now() - startedMs);
}

function toLiveSpeechSegments(
  segments: TranscriptionSegment[] | undefined,
): LiveTranscriptSpeechSegment[] | undefined {
  const mapped = (segments ?? [])
    .map((segment): LiveTranscriptSpeechSegment | null => {
      const startMs = finiteNumber(segment.startMs);
      const endMs = finiteNumber(segment.endMs);
      const text = segment.text.trim();
      if (!text || startMs === null || endMs === null) return null;
      const mappedSegment: LiveTranscriptSpeechSegment = {
        text,
        start_ms: startMs,
        end_ms: Math.max(startMs, endMs),
      };
      if (typeof segment.confidence === 'number') {
        mappedSegment.confidence = segment.confidence;
      }
      return mappedSegment;
    })
    .filter((segment): segment is LiveTranscriptSpeechSegment => segment !== null);
  return mapped.length > 0 ? mapped : undefined;
}

function finiteNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uniqueAttachmentFilename(filename: string, seq: number): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) return `${safe}-${seq}`;
  return `${safe.slice(0, dot)}-${seq}${safe.slice(dot)}`;
}

function isAutoConnectX1Device(device: X1DiscoveredDevice): boolean {
  const advertisedServices = device.advertisedServices.map((service) => service.toLowerCase());
  if (advertisedServices.includes(X1_SERVICE_UUID)) return true;
  const name = device.name.toLowerCase();
  return name.includes('录音笔') || name.includes('newman') || name.includes('niuman');
}

function realtimeFilename(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('').concat('.mp3');
}

function normalizeIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function audioAttachmentFilename(filename: string): string {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? 'mp3';
  return `audio.${extension}`;
}

function formatBattery(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '连接后读取';
  return `${Math.round(value)}%`;
}

function formatX1Storage(storage: X1StorageInfo | null): string {
  return storage ? formatX1StorageUsage(storage) : '连接后读取';
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit] ?? 'B'}`;
}

function x1ActivitySample(deltaBytes: number, chunksReceived: number): number {
  const packetSizeLevel = Math.max(0.14, Math.min(0.9, deltaBytes / 900));
  const cadenceLevel = 0.86 + ((chunksReceived % 5) * 0.035);
  return Math.max(0.08, Math.min(1, packetSizeLevel * cadenceLevel));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function eventKindLabel(kind: SessionEventKind, seq: number): string {
  if (kind === 'note') return '笔记';
  if (kind === 'photo') return '拍照';
  if (kind === 'image') return '图片';
  if (kind === 'file') return '文件';
  return `标记 ${seq}`;
}

function eventSummary(event: SessionEvent): string {
  return event.body?.trim()
    || event.attachment?.displayName
    || event.label;
}

function eventPayload(event: SessionEvent): Record<string, unknown> {
  return {
    schema: 'orbit.recording-session-event@1',
    id: event.id,
    kind: event.kind,
    start_ms: event.ts,
    end_ms: event.ts,
    label: event.label,
    text: event.body ?? null,
    attachment: event.attachment
      ? {
          type: event.attachment.type,
          filename: event.attachment.filename,
          displayName: event.attachment.displayName,
          mime: event.attachment.mime,
          byteSize: event.attachment.byteSize ?? null,
          width: event.attachment.width ?? null,
          height: event.attachment.height ?? null,
        }
      : null,
    created_at: event.createdAt,
  };
}

function eventToAttachment(event: SessionEvent): CaptureAttachment[] {
  if (!event.attachment) return [];
  return [
    {
      type: event.attachment.type,
      filename: event.attachment.filename,
      localUri: event.attachment.uri,
      mime: event.attachment.mime,
      byte_size: event.attachment.byteSize,
      width: event.attachment.width,
      height: event.attachment.height,
      captured_at: event.createdAt,
    },
  ];
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    paddingBottom: 32,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  topTabs: {
    flex: 1,
  },
  iconBtn: {
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  doneText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  liveDot: {
    backgroundColor: colors.recordRed,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  titleInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    paddingVertical: 4,
  },
  controlsCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    padding: 14,
  },
  timerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timer: {
    color: colors.textPrimary,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  recordingPill: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recordingDot: {
    backgroundColor: colors.recordRed,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  recordingText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  controlBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 14,
  },
  pauseBtn: {
    alignItems: 'center',
    backgroundColor: colors.recordRed,
    borderRadius: radius.pill,
    minWidth: 84,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pauseBtnResume: {
    backgroundColor: colors.success,
  },
  pauseBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  markNowBtn: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  markNowText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '900',
  },
  stopBtn: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingVertical: 12,
  },
  stopBtnDisabled: {
    opacity: 0.45,
  },
  stopBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  timelineArea: {
    marginTop: 16,
  },
  actionBtn: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  activeEditor: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  activeEditorTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  activeContextLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  activeTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  activeTs: {
    color: colors.accent,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  activeKind: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  activeBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    color: colors.bg,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  activeHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  activeActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  activeEmpty: {
    alignItems: 'flex-start',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    padding: 14,
  },
  activeEmptyTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6,
  },
  scanAgainBtn: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  scanAgainText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },
  attachmentLine: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  noteInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 78,
    padding: 12,
  },
  timelineHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timelineCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  emptyTimeline: {
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 80,
    justifyContent: 'center',
  },
  eventRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 12,
  },
  eventRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  eventTs: {
    color: colors.accent,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    width: 68,
  },
  eventBody: {
    flex: 1,
  },
  eventMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  eventLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  eventActivePill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    color: colors.bg,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  eventText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  eventAttachment: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  transcriptArea: {
    marginTop: 16,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  outlineCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
    padding: 12,
  },
  outlineItem: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  outlineItemMuted: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: 24,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    textAlign: 'center',
  },
  partialRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  partialBody: {
    flex: 1,
  },
  partialMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  partialSpeaker: {
    fontSize: 13,
    fontWeight: '800',
  },
  partialTs: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  partialPending: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    color: '#92400e',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  partialText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  partialTextLive: {
    color: colors.textSecondary,
  },
  tailHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  placeholderCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    padding: 18,
  },
  placeholderTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  placeholderBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  sourceRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  sourceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  sourceValue: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  optionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
  },
  langPill: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  langPillActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  langPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  langPillTextActive: {
    color: colors.accent,
  },
  toggle: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleOn: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleTextOn: {
    color: '#15803d',
  },
});
