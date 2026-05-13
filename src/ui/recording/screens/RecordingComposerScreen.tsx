/**
 * RecordingComposerScreen — 长录音 / 录音中页面
 *
 * 实时转写体验：partial 流式追加 + 自动滚屏 + 大纲 placeholder。
 * Mock 阶段：用 MOCK_LIVE_PARTIALS 模拟 ASR 推流，UI 与真实接入一致。
 *
 * 录音停止后跳转 detail 页（mock 中固定跳到 recording 001 这条已完成的）。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.2
 */

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
  MOCK_LANGUAGES,
  MOCK_LIVE_PARTIALS,
  getMockRecording,
} from '../../../core/recording/mock-data';
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

const FALLBACK_SPEAKER: RecordingSpeaker = {
  id: 'S?',
  label: '说话人',
  color: '#94a3b8',
};

export function RecordingComposerScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ComposerTab>('transcript');
  const [recording, setRecording] = useState(true);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [partials, setPartials] = useState<PartialLine[]>([]);
  const [language, setLanguage] = useState('auto');
  const [diarization, setDiarization] = useState(true);
  const [title, setTitle] = useState('新会议 · 现在');
  const scrollRef = useRef<ScrollView>(null);

  const speakerById = useMemo(() => {
    const tableSource = getMockRecording('mob_cap_rec_001');
    const map = new Map<string, RecordingSpeaker>();
    tableSource?.meta.speakers.forEach((s) => map.set(s.id, s));
    return map;
  }, []);

  // tick：1) 时长走表 2) 每 700ms 推一条 partial
  useEffect(() => {
    if (!recording || paused) return;
    const start = Date.now() - elapsedMs;
    const t = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 250);
    return () => clearInterval(t);
  }, [recording, paused, elapsedMs]);

  useEffect(() => {
    if (!recording || paused) return;
    let i = 0;
    const t = setInterval(() => {
      const next = MOCK_LIVE_PARTIALS[i % MOCK_LIVE_PARTIALS.length];
      if (next) {
        const speaker = speakerById.get(next.speaker) ?? FALLBACK_SPEAKER;
        setPartials((prev) => [
          ...prev,
          {
            ts: Date.now(),
            speaker,
            text: next.text,
            isFinal: i % 3 === 2,
          },
        ]);
      }
      i += 1;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }, 950);
    return () => clearInterval(t);
  }, [recording, paused, speakerById]);

  function stopAndOpenDetail(): void {
    setRecording(false);
    // mock：跳转到已完成的录音详情，演示完整闭环
    router.replace('/recording/mob_cap_rec_001');
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>✕</Text>
        </Pressable>
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
        <Pressable
          accessibilityRole="button"
          onPress={stopAndOpenDetail}
          style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
        >
          <Text style={styles.doneText}>完成</Text>
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
              {paused ? '已暂停 · 录音保存中' : '正在录音 · 实时转写中'}
            </Text>
          </View>
        </View>
        <Waveform
          seed="composer"
          height={88}
          bars={72}
          progress={1}
          active={!paused}
        />
        <View style={styles.controlBar}>
          <ControlButton
            label="-15"
            onPress={() => setElapsedMs((v) => Math.max(0, v - 15_000))}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setPaused((v) => !v)}
            style={({ pressed }) => [
              styles.bigBtn,
              paused && styles.bigBtnResume,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.bigBtnText}>{paused ? '继续' : '暂停'}</Text>
          </Pressable>
          <ControlButton label="+15" onPress={() => setElapsedMs((v) => v + 15_000)} />
          <ControlButton label="1×" onPress={() => undefined} />
          <ControlButton label="✏︎" onPress={() => undefined} />
        </View>
        <View style={styles.optionRow}>
          <View style={styles.optionPills}>
            {MOCK_LANGUAGES.slice(0, 4).map((lang) => {
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
            onPress={() => setDiarization((v) => !v)}
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
          <Text style={styles.sectionLabel}>大纲 · 实时占位</Text>
          <View style={styles.outlineCard}>
            <Text style={styles.outlineItem}>0:00:00 · 欢迎与议程</Text>
            <Text style={styles.outlineItemMuted}>—— 录音继续后将自动补全 ——</Text>
          </View>
          <Text style={styles.sectionLabel}>转写</Text>
          {partials.length === 0 ? (
            <Text style={styles.placeholder}>实时转写正在准备……</Text>
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
                    {formatTimestamp(idx * 950)}
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
          <Text style={styles.tailHint}>整体转写将在停止后自动开始（180+ 语言）</Text>
        </ScrollView>
      ) : null}

      {tab === 'source' ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>来源</Text>
          <Text style={styles.placeholderBody}>
            录音中暂不展示来源时间轴；停止后可在详情页边听边看。
          </Text>
        </View>
      ) : null}
      {tab === 'mark' ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>标记</Text>
          <Text style={styles.placeholderBody}>
            录音中长按某段转写可一键加书签（mock 占位）。
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ControlButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
    >
      <Text style={styles.smallBtnText}>{label}</Text>
    </Pressable>
  );
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
    paddingHorizontal: 16,
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
});
