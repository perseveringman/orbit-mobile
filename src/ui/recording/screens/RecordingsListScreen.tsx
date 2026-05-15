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
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RecordingMeta } from '../../../types/recording';
import {
  createRecordingCapture,
  listRecordingMetas,
} from '../../../core/recording/recording-service';
import {
  discardRecoveredVoiceRecording,
  recoverInterruptedVoiceRecordings,
  type RecoveredVoiceRecording,
} from '../../../core/audio/recorder';
import { openDb } from '../../../core/storage/db';
import { runSyncTick } from '../../../core/sync/worker';
import { writeWidgetSnapshot } from '../../../core/widget/snapshot';
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
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [recoverable, setRecoverable] = useState<RecoveredVoiceRecording[]>([]);
  const [recoveringUri, setRecoveringUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupByDate(recordings), [recordings]);

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
        {loading ? <Text style={styles.hint}>正在读取本机录音…</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
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
            <Text style={styles.emptyBody}>点右上角“开始录”，录音会先完整保存在本机。</Text>
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
  disabled: {
    opacity: 0.45,
  },
  scroll: {
    paddingBottom: 56,
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
