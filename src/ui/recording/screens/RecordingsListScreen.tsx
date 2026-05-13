/**
 * RecordingsListScreen — 录音时间轴列表
 *
 * 与"最近 Capture"区分：长录音单独走时间轴。
 * Mock 阶段：直接读 listMockRecordings()。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §8
 */

import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RecordingMeta } from '../../../types/recording';
import { listMockRecordings } from '../../../core/recording/mock-data';
import { Waveform } from '../components/Waveform';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatClock,
  formatDateGroup,
  formatDurationLabel,
} from '../format';
import { colors, radius, spacing } from '../theme';

interface Group {
  key: string;
  label: string;
  items: RecordingMeta[];
}

export function RecordingsListScreen(): React.ReactElement {
  const router = useRouter();
  const groups = useMemo(() => groupByDate(listMockRecordings()), []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link href="/" style={styles.back}>
          ← 记一条
        </Link>
        <Text style={styles.title}>录音</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/recording/new')}
          style={({ pressed }) => [styles.recordEntry, pressed && styles.pressed]}
        >
          <View style={styles.recordDot} />
          <Text style={styles.recordEntryText}>开始录</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
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
                        seed={item.id}
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
    fontWeight: '600',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  recordEntry: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recordDot: {
    backgroundColor: colors.recordRed,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  recordEntryText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  scroll: {
    paddingBottom: 56,
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
});
