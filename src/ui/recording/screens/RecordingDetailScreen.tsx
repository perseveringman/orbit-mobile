/**
 * RecordingDetailScreen — 录音详情（已停止后的 Capture 阅读态）
 *
 * 与设计图 1 对齐：顶部 来源 / 转写 / 标记 三 Tab；
 *   - 来源：原音播放器 + 大纲（带时间戳）。
 *   - 转写：按说话人分块，可点跳转、可点赞反馈。
 *   - 标记：用户高亮 + AI 高亮（mock 占位）。
 * 顶部右侧"笔记"按钮跳到结构化笔记页（设计图 2/3）。
 * 顶部右侧"询问"按钮跳到 Ask 页（设计图 5）。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.3
 */

import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getMockRecording } from '../../../core/recording/mock-data';
import type {
  RecordingDetail,
  RecordingSpeaker,
  TranscriptSegment,
} from '../../../types/recording';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { SpeakerAvatar } from '../components/SpeakerAvatar';
import { StatusBadge } from '../components/StatusBadge';
import { Waveform } from '../components/Waveform';
import { formatTimestamp } from '../format';
import { colors, radius, spacing } from '../theme';

type DetailTab = 'source' | 'transcript' | 'mark';

interface Props {
  id: string;
}

export function RecordingDetailScreen({ id }: Props): React.ReactElement {
  const router = useRouter();
  const detail = getMockRecording(id);
  const [tab, setTab] = useState<DetailTab>('source');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down' | undefined>>({});

  const total = detail?.meta.duration_ms ?? 1;

  // 模拟播放进度走条
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setPosition((p) => {
        const next = p + 1000;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, total]);

  if (!detail) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.notFound}>找不到这条录音</Text>
        <Link href="/recording" style={styles.notFoundLink}>
          ← 返回录音列表
        </Link>
      </View>
    );
  }

  function jumpTo(ms: number): void {
    setPosition(Math.max(0, Math.min(total, ms)));
    setTab('source');
    setPlaying(true);
  }

  return (
    <View style={styles.container}>
      <Header detail={detail} onBack={() => router.back()} />
      <View style={styles.titleArea}>
        <Text style={styles.title}>{detail.meta.title}</Text>
        <View style={styles.metaRow}>
          <StatusBadge state={detail.meta.final_state} />
          <Text style={styles.metaText}>
            {detail.meta.language_hints.join(' / ')} · {detail.meta.speakers.length} 位说话人
          </Text>
        </View>
      </View>

      <View style={styles.tabsRow}>
        <SegmentedTabs
          activeKey={tab}
          onSelect={(key) => setTab(key as DetailTab)}
          items={[
            { key: 'source', label: '来源' },
            { key: 'transcript', label: '转写', badge: detail.transcript.segments.length },
            { key: 'mark', label: '标记' },
          ]}
        />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'source' ? (
          <SourceTab
            detail={detail}
            playing={playing}
            position={position}
            onTogglePlay={() => setPlaying((v) => !v)}
            onSeek={jumpTo}
          />
        ) : null}
        {tab === 'transcript' ? (
          <TranscriptTab
            detail={detail}
            position={position}
            feedback={feedback}
            onFeedback={(seg, kind) =>
              setFeedback((prev) => ({ ...prev, [seg.id]: prev[seg.id] === kind ? undefined : kind }))
            }
            onJump={jumpTo}
          />
        ) : null}
        {tab === 'mark' ? <MarkTab detail={detail} /> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/recording/${id}/notes`)}
          style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}
        >
          <Text style={styles.footerBtnText}>📝 笔记</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/recording/${id}/ask`)}
          style={({ pressed }) => [styles.footerBtnAlt, pressed && styles.pressed]}
        >
          <Text style={styles.footerBtnAltText}>询问 Orbit</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({
  onBack,
}: {
  detail: RecordingDetail;
  onBack: () => void;
}): React.ReactElement {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      >
        <Text style={styles.iconBtnText}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>录音</Text>
      <View style={styles.headerRight}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>↑</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>···</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SourceTab({
  detail,
  playing,
  position,
  onTogglePlay,
  onSeek,
}: {
  detail: RecordingDetail;
  playing: boolean;
  position: number;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
}): React.ReactElement {
  const total = detail.meta.duration_ms;
  const progress = total > 0 ? position / total : 0;
  return (
    <View>
      <View style={styles.playerCard}>
        <Waveform
          seed={detail.meta.id}
          height={92}
          bars={80}
          progress={progress}
        />
        <View style={styles.playerTimeRow}>
          <Text style={styles.timer}>{formatTimestamp(position)}</Text>
          <Text style={styles.timerMuted}>{formatTimestamp(total)}</Text>
        </View>
        <View style={styles.playerControls}>
          <PlayerBtn label="-15" onPress={() => onSeek(position - 15_000)} />
          <Pressable
            accessibilityRole="button"
            onPress={onTogglePlay}
            style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
          >
            <Text style={styles.playBtnText}>{playing ? '暂停' : '播放'}</Text>
          </Pressable>
          <PlayerBtn label="+15" onPress={() => onSeek(position + 15_000)} />
          <PlayerBtn label="1×" onPress={() => undefined} />
          <PlayerBtn label="✏︎" onPress={() => undefined} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>大纲</Text>
      <View style={styles.outlineList}>
        {detail.outline.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => onSeek(item.start_ms)}
            style={({ pressed }) => [styles.outlineRow, pressed && styles.pressed]}
          >
            <Text style={styles.outlineTs}>{formatTimestamp(item.start_ms)}</Text>
            <Text style={styles.outlineTitle}>{item.title}</Text>
            <View style={styles.thumbRow}>
              <Pressable hitSlop={8}>
                <Text style={styles.thumbIcon}>👍</Text>
              </Pressable>
              <Pressable hitSlop={8}>
                <Text style={styles.thumbIcon}>👎</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}
        {detail.outline.length === 0 ? (
          <Text style={styles.placeholder}>暂无大纲，转写完成后会自动生成。</Text>
        ) : null}
      </View>
    </View>
  );
}

function TranscriptTab({
  detail,
  position,
  feedback,
  onFeedback,
  onJump,
}: {
  detail: RecordingDetail;
  position: number;
  feedback: Record<number, 'up' | 'down' | undefined>;
  onFeedback: (seg: TranscriptSegment, kind: 'up' | 'down') => void;
  onJump: (ms: number) => void;
}): React.ReactElement {
  const speakerById = useMemo(() => {
    const map = new Map<string, RecordingSpeaker>();
    detail.transcript.speakers.forEach((s) => map.set(s.id, s));
    return map;
  }, [detail.transcript.speakers]);

  if (detail.transcript.segments.length === 0) {
    return (
      <Text style={styles.placeholder}>转写还在进行中…… 完成后这里会出现说话人分段。</Text>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>转写 · 按说话人分段</Text>
      {detail.transcript.segments.map((segment) => {
        const speaker = speakerById.get(segment.speaker) ?? {
          id: segment.speaker,
          label: segment.speaker,
          color: '#94a3b8',
        };
        const active = position >= segment.start_ms && position < segment.end_ms;
        const fb = feedback[segment.id];
        return (
          <Pressable
            key={segment.id}
            onPress={() => onJump(segment.start_ms)}
            style={({ pressed }) => [
              styles.segmentCard,
              active && styles.segmentCardActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.segmentHead}>
              <SpeakerAvatar speaker={speaker} size={28} />
              <View style={styles.segmentHeadText}>
                <Text style={[styles.segmentSpeaker, { color: speaker.color }]}>
                  {speaker.label}
                </Text>
                <Text style={styles.segmentTs}>
                  {formatTimestamp(segment.start_ms)} – {formatTimestamp(segment.end_ms)}
                </Text>
              </View>
              <View style={styles.thumbRow}>
                <Pressable hitSlop={8} onPress={() => onFeedback(segment, 'up')}>
                  <Text style={[styles.thumbIcon, fb === 'up' && styles.thumbActive]}>
                    👍
                  </Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => onFeedback(segment, 'down')}>
                  <Text style={[styles.thumbIcon, fb === 'down' && styles.thumbActive]}>
                    👎
                  </Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.segmentBody}>{segment.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MarkTab({ detail }: { detail: RecordingDetail }): React.ReactElement {
  // mock：拿前两段当书签 + 一条 AI 标记
  const samples = detail.transcript.segments.slice(0, 2);
  return (
    <View>
      <Text style={styles.sectionLabel}>书签</Text>
      {samples.length === 0 ? (
        <Text style={styles.placeholder}>还没有书签，听到关键句长按转写即可加。</Text>
      ) : null}
      {samples.map((seg, idx) => (
        <View key={seg.id} style={styles.markCard}>
          <View style={styles.markHead}>
            <Text style={styles.markLabel}>
              {idx === 0 ? '🌟 用户书签' : '✨ AI 标记'}
            </Text>
            <Text style={styles.segmentTs}>{formatTimestamp(seg.start_ms)}</Text>
          </View>
          <Text style={styles.markBody}>{seg.text}</Text>
        </View>
      ))}
    </View>
  );
}

function PlayerBtn({
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
      style={({ pressed }) => [styles.playerSmallBtn, pressed && styles.pressed]}
    >
      <Text style={styles.playerSmallBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 12,
  },
  notFoundLink: {
    color: colors.accent,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    minWidth: 36,
    paddingHorizontal: 8,
  },
  iconBtnText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  titleArea: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabsRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 120,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  playerCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  playerTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  timer: {
    color: colors.textPrimary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  timerMuted: {
    color: colors.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  playerControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 14,
  },
  playerSmallBtn: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  playerSmallBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  playBtn: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    minWidth: 96,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  playBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  outlineList: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  outlineRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  outlineTs: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    minWidth: 64,
  },
  outlineTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 14,
  },
  thumbIcon: {
    fontSize: 16,
    opacity: 0.55,
  },
  thumbActive: {
    opacity: 1,
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: 16,
    textAlign: 'center',
  },
  segmentCard: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    padding: 14,
  },
  segmentCardActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  segmentHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  segmentHeadText: {
    flex: 1,
  },
  segmentSpeaker: {
    fontSize: 13,
    fontWeight: '800',
  },
  segmentTs: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  segmentBody: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 23,
  },
  markCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    padding: 14,
  },
  markHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  markLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  markBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    position: 'absolute',
    width: '100%',
  },
  footerBtn: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flex: 1,
    paddingVertical: 14,
  },
  footerBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  footerBtnAlt: {
    alignItems: 'center',
    backgroundColor: colors.lavenderSoft,
    borderRadius: radius.pill,
    flex: 1,
    paddingVertical: 14,
  },
  footerBtnAltText: {
    color: colors.lavender,
    fontSize: 14,
    fontWeight: '800',
  },
});
