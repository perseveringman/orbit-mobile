/**
 * RecordingComposerScreen — 长录音 / 录音中页面
 *
 * 实时转写体验：真实录音 + Apple Speech 可用时流式更新；停止后走本地原子 capture。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.2
 */

import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { createRecordingCapture, type LivePartialInput } from '../../../core/recording/recording-service';
import { openDb } from '../../../core/storage/db';
import * as annotationsRepo from '../../../core/storage/recording-annotations-repo';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
import type { RecordingSpeaker } from '../../../types/recording';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { SpeakerAvatar } from '../components/SpeakerAvatar';
import { Waveform } from '../components/Waveform';
import { formatTimestamp } from '../format';
import { colors, radius, spacing } from '../theme';

type ComposerTab = 'source' | 'transcript' | 'mark';

interface PartialLine {
  ts: number;
  speaker: RecordingSpeaker;
  text: string;
  isFinal: boolean;
}

interface LiveMark {
  id: string;
  ts: number;
  label: string;
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

export function RecordingComposerScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ComposerTab>('transcript');
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waveformSamples, setWaveformSamples] = useState<number[]>([]);
  const [partials, setPartials] = useState<PartialLine[]>([]);
  const [marks, setMarks] = useState<LiveMark[]>([]);
  const [language, setLanguage] = useState('auto');
  const [diarization] = useState(false);
  const [title, setTitle] = useState('新会议 · 现在');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const startedAtRef = useRef(new Date().toISOString());
  const startedMsRef = useRef(Date.now());
  const transcriptionRef = useRef<LiveTranscriptionSession | null>(null);
  const transcriptTextRef = useRef('');
  const partialsRef = useRef<LivePartialInput[]>([]);
  const partialProviderRef = useRef<'ios-speech' | 'unavailable'>('unavailable');
  const waveformRef = useRef<number[]>([]);
  const levelSubscriptionRef = useRef<{ remove(): void } | null>(null);
  const liveOutline = useMemo(() => buildLiveOutline(partials), [partials]);

  useEffect(() => {
    let cancelled = false;
    async function begin(): Promise<void> {
      try {
        startedAtRef.current = new Date().toISOString();
        startedMsRef.current = Date.now();
        waveformRef.current = [];
        setWaveformSamples([]);
        await startVoiceRecording();
        if (!cancelled) setRecording(true);
        levelSubscriptionRef.current = addVoiceRecordingLevelListener((level) => {
          const sample = Math.max(level.rms, level.peak * 0.75);
          waveformRef.current = [...waveformRef.current, Math.max(0, Math.min(1, sample))];
          setWaveformSamples(waveformRef.current.slice(-240));
        });
        const session = await startLiveTranscription((state) => {
          partialProviderRef.current = state.source;
          transcriptTextRef.current = state.transcript;
          if (state.transcript.trim().length === 0) return;
          const partial: LivePartialInput = {
            elapsed_ms: Math.max(0, Date.now() - startedMsRef.current),
            speaker: FALLBACK_SPEAKER.id,
            text: state.transcript,
            is_final: false,
          };
          partialsRef.current = [partial];
          setPartials([
            {
              ts: partial.elapsed_ms,
              speaker: FALLBACK_SPEAKER,
              text: partial.text,
              isFinal: false,
            },
          ]);
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
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
    void begin();
    return () => {
      cancelled = true;
      void transcriptionRef.current?.stop();
      transcriptionRef.current = null;
      levelSubscriptionRef.current?.remove();
      levelSubscriptionRef.current = null;
      void cancelVoiceRecording().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedMsRef.current));
    }, 250);
    return () => clearInterval(t);
  }, [recording, paused]);

  async function stopAndOpenDetail(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await transcriptionRef.current?.stop();
      transcriptionRef.current = null;
      levelSubscriptionRef.current?.remove();
      levelSubscriptionRef.current = null;
      const audio = await stopVoiceRecording();
      setRecording(false);
      const db = await openDb();
      const detail = await createRecordingCapture({
        title,
        audioUri: audio.uri,
        durationMs: audio.durationMs ?? elapsedMs,
        startedAt: startedAtRef.current,
        languageHints: language === 'auto' ? [] : [language],
        partials: partialsRef.current,
        transcriptText: transcriptTextRef.current,
        partialProvider: partialProviderRef.current,
        waveformSamples: waveformRef.current,
      }, {
        db,
        sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
      });
      for (const mark of marks) {
        await annotationsRepo.upsert(db, {
          recording_id: detail.meta.id,
          kind: 'bookmark',
          target_id: mark.id,
          payload: {
            segmentId: mark.ts,
            start_ms: mark.ts,
            end_ms: mark.ts,
            text: mark.label,
            label: '用户书签',
          },
        });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void writeWidgetSnapshot(db).catch(() => undefined);
      void runSyncTick({ db });
      router.replace(`/recording/${detail.meta.id}`);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : String(stopError));
      setSaving(false);
    }
  }

  async function togglePause(): Promise<void> {
    try {
      if (paused) {
        await resumeVoiceRecording();
        setPaused(false);
      } else {
        await pauseVoiceRecording();
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
    await cancelVoiceRecording().catch(() => undefined);
    router.back();
  }

  function addMark(): void {
    const ts = Math.max(0, Date.now() - startedMsRef.current);
    setMarks((prev) => [
      ...prev,
      {
        id: `mark-${ts}`,
        ts,
        label: `标记 ${prev.length + 1}`,
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 12 }]}>
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
              { key: 'source', label: '来源' },
              { key: 'transcript', label: '转写' },
              { key: 'mark', label: '标记' },
            ]}
            compact
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!recording || saving}
          onPress={() => {
            void stopAndOpenDetail();
          }}
          style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
        >
          <Text style={styles.doneText}>{saving ? '保存中' : '完成'}</Text>
        </Pressable>
      </View>

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
                   : partialProviderRef.current === 'ios-speech'
                     ? '正在录音 · 实时转写中'
                     : '正在录音 · 转写不可用'
                 : '正在启动录音'}
            </Text>
          </View>
        </View>
        <Waveform
          samples={waveformSamples}
          height={88}
          bars={72}
          progress={1}
          active={!paused}
        />
        <View style={styles.controlBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void togglePause();
            }}
            style={({ pressed }) => [
              styles.bigBtn,
              paused && styles.bigBtnResume,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.bigBtnText}>{paused ? '继续' : '暂停'}</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!recording || saving}
          onPress={() => {
            void stopAndOpenDetail();
          }}
          style={({ pressed }) => [
            styles.stopBtn,
            (!recording || saving) && styles.stopBtnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stopBtnText}>{saving ? '正在保存…' : '结束并保存录音'}</Text>
        </Pressable>
        <View style={styles.optionRow}>
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
      </View>

      {tab === 'transcript' ? (
        <ScrollView
          ref={scrollRef}
          style={styles.transcriptArea}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
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
                 : '实时转写正在准备……'}
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
        </ScrollView>
      ) : null}

      {tab === 'source' ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>录音源</Text>
          <SourceRow label="状态" value={recording ? (paused ? '已暂停' : '录音中') : '启动中'} />
          <SourceRow label="开始时间" value={new Date(startedAtRef.current).toLocaleString('zh-Hans-CN')} />
          <SourceRow label="语言" value={LANGUAGES.find((item) => item.code === language)?.label ?? language} />
          <SourceRow label="实时转写" value={partialProviderRef.current === 'ios-speech' ? 'Apple Speech' : '不可用，仍保存原音'} />
          <SourceRow label="说话人" value="单说话人本地结构" />
        </View>
      ) : null}
      {tab === 'mark' ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>标记</Text>
          <Pressable
            accessibilityRole="button"
            onPress={addMark}
            style={({ pressed }) => [styles.markButton, pressed && styles.pressed]}
          >
            <Text style={styles.markButtonText}>添加当前时间标记</Text>
          </Pressable>
          {marks.length === 0 ? (
            <Text style={styles.placeholderBody}>还没有标记。</Text>
          ) : null}
          {marks.map((mark) => (
            <View key={mark.id} style={styles.markRow}>
              <Text style={styles.markTs}>{formatTimestamp(mark.ts)}</Text>
              <Text style={styles.markLabel}>{mark.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  const latest = partials.at(-1)?.text.trim();
  if (!latest) return [];
  const sentences = latest.match(/[^。！？.!?\n]+[。！？.!?]?/g) ?? [latest];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(-5)
    .map((sentence, index) => ({
      ts: partials.at(-1)?.ts ?? 0,
      title: sentence.length > 34 ? `${sentence.slice(0, 34)}…` : sentence || `片段 ${index + 1}`,
    }));
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
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
  smallBtn: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  bigBtn: {
    alignItems: 'center',
    backgroundColor: colors.recordRed,
    borderRadius: radius.pill,
    minWidth: 84,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  bigBtnResume: {
    backgroundColor: colors.success,
  },
  bigBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 14,
  },
  stopBtn: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    marginTop: 14,
    paddingVertical: 13,
  },
  stopBtnDisabled: {
    opacity: 0.45,
  },
  stopBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  optionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
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
  transcriptArea: {
    flex: 1,
    marginTop: 16,
  },
  transcriptContent: {
    paddingBottom: 32,
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
    flex: 1,
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
  markButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  markButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  markRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  markTs: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    width: 72,
  },
  markLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
});
