/**
 * RecordingNotesScreen — 笔记多结构页（设计图 2 / 3）
 *
 * Tabs：总结 / 决策 / 风险 / 待办事项 / + (custom)
 * 顶 bar 与笔记 app 风格一致：返回 / 标题"笔记" / 分享 / 更多。
 *
 * 自定义 Tab 点 "+" 唤起 TemplateSheet（设计图 4）。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.4 §4.5
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

import { generateLocalDerivative } from '../../../core/recording/templates';
import { loadRecordingDetail } from '../../../core/recording/recording-service';
import { openDb } from '../../../core/storage/db';
import * as annotationsRepo from '../../../core/storage/recording-annotations-repo';
import type {
  DerivativePayload,
  RecordingDetail,
  RecordingTemplate,
} from '../../../types/recording';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { formatLongDateTime, formatTimestamp } from '../format';
import { TemplateSheet } from './TemplateSheet';
import { colors, radius, spacing } from '../theme';

interface Props {
  id: string;
}

type ActiveTab = string;

export function RecordingNotesScreen({ id }: Props): React.ReactElement {
  const router = useRouter();
  const [detail, setDetail] = useState<RecordingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>('summary');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customs, setCustoms] = useState<DerivativePayload[]>([]);
  const [todoState, setTodoState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRecordingDetail(id)
      .then(async (loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        const rows = loaded
          ? await annotationsRepo.listByRecording(await openDb(), loaded.meta.id)
          : [];
        if (cancelled) return;
        const customAnnotations = rows
          .filter((row) => row.kind === 'custom_derivative')
          .map((row) => annotationsRepo.parsePayload<DerivativePayload>(row))
          .filter((payload): payload is DerivativePayload => payload !== null);
        setCustoms([...(loaded?.derivatives.custom ?? []), ...customAnnotations]);
        const items = loaded?.derivatives.todos?.items ?? [];
        const nextTodoState = Object.fromEntries(items.map((item) => [item.id, item.done ?? false]));
        for (const row of rows.filter((item) => item.kind === 'todo_state')) {
          if (row.target_id === null) continue;
          const payload = annotationsRepo.parsePayload<{ done?: boolean }>(row);
          nextTodoState[row.target_id] = payload?.done === true;
        }
        setTodoState(nextTodoState);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const items = useMemo(() => {
    if (!detail) return [];
    const builtin = [
      { key: 'summary' as const, label: '总结' },
      { key: 'decisions' as const, label: '决策' },
      { key: 'risks' as const, label: '风险' },
      { key: 'todos' as const, label: '待办事项' },
    ];
    const customTabs = customs.map((c) => ({
      key: `custom:${c.template_id ?? c.title}`,
      label: c.title ?? '自定义',
    }));
    return [...builtin, ...customTabs, { key: 'plus', label: '＋' }];
  }, [customs, detail]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.notFound}>正在读取本机录音…</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.notFound}>{loadError ?? '找不到这条录音'}</Text>
      </View>
    );
  }

  function handleSelect(key: string): void {
    if (key === 'plus') {
      setSheetOpen(true);
      return;
    }
    setTab(key);
  }

  function applyTemplate(template: RecordingTemplate): void {
    if (!detail) return;
    const generated = generateLocalDerivative(template, detail);
    setCustoms((prev) => [...prev.filter((c) => c.template_id !== template.id), generated]);
    setTab(`custom:${template.id}`);
    setSheetOpen(false);
    void openDb()
      .then((db) =>
        annotationsRepo.upsert(db, {
          recording_id: detail.meta.id,
          kind: 'custom_derivative',
          target_id: template.id,
          payload: generated as unknown as Record<string, unknown>,
        }),
      )
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }

  function toggleTodo(itemId: string): void {
    if (!detail) return;
    const next = !todoState[itemId];
    setTodoState((prev) => ({ ...prev, [itemId]: next }));
    void openDb()
      .then((db) =>
        annotationsRepo.upsert(db, {
          recording_id: detail.meta.id,
          kind: 'todo_state',
          target_id: itemId,
          payload: { done: next },
        }),
      )
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>笔记</Text>
        <View style={styles.headerRight}>
          <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Text style={styles.iconBtnText}>↑</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Text style={styles.iconBtnText}>···</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsRow}>
        <SegmentedTabs
          activeKey={tab}
          onSelect={handleSelect}
          items={items}
          scrollable
        />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{detail.meta.title}</Text>
        <View style={styles.metaCard}>
          <MetaRow label="日期&时间" value={formatLongDateTime(detail.meta.started_at)} />
          {detail.meta.location ? (
            <MetaRow label="地点" value={detail.meta.location} />
          ) : null}
          {detail.meta.participants?.length ? (
            <MetaRow
              label="参会人员"
              value={detail.meta.participants.join(', ')}
            />
          ) : null}
          <MetaRow
            label="语言"
            value={detail.meta.language_hints.join(' / ')}
          />
        </View>

        {tab === 'summary' ? <SummaryView detail={detail} /> : null}
        {tab === 'decisions' ? <ItemListView title="决策" payload={detail.derivatives.decisions} /> : null}
        {tab === 'risks' ? <ItemListView title="风险" payload={detail.derivatives.risks} /> : null}
        {tab === 'todos' ? (
          <TodoView
            payload={detail.derivatives.todos}
            state={todoState}
            onToggle={toggleTodo}
          />
        ) : null}
        {tab.startsWith('custom:') ? (
          <CustomView
            payload={
              customs.find((c) => `custom:${c.template_id ?? c.title}` === tab) ?? null
            }
          />
        ) : null}

        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>
             笔记由 {detail.derivatives.summary?.provider ?? 'local'} 生成 ·
            可在录音详情页对照原音校对
          </Text>
          <Link
            href={`/recording/${id}`}
            style={styles.footerNoteLink}
          >
            ← 返回录音详情
          </Link>
        </View>
      </ScrollView>

      <TemplateSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onApply={applyTemplate}
      />
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function SummaryView({ detail }: { detail: RecordingDetail }): React.ReactElement {
  const summary = detail.derivatives.summary;
  if (!summary) {
    return <Text style={styles.placeholder}>总结尚未生成。</Text>;
  }
  const blocks = parseMarkdown(summary.body ?? '');
  return (
    <View style={styles.contentBlock}>
      {blocks.map((block, idx) => {
        if (block.kind === 'h2') {
          return (
            <Text key={idx} style={styles.h2}>
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'li') {
          return (
            <View key={idx} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{block.text}</Text>
            </View>
          );
        }
        return (
          <Text key={idx} style={styles.paragraph}>
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

function ItemListView({
  title,
  payload,
}: {
  title: string;
  payload: DerivativePayload | undefined;
}): React.ReactElement {
  if (!payload || !payload.items?.length) {
    return <Text style={styles.placeholder}>暂无{title}。</Text>;
  }
  return (
    <View style={styles.itemList}>
      {payload.items.map((item) => (
        <View key={item.id} style={styles.itemCard}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemBody}>{item.body}</Text>
          {item.anchors?.length ? (
            <View style={styles.anchorRow}>
              {item.anchors.map((anchor, idx) => (
                <View key={idx} style={styles.anchorPill}>
                  <Text style={styles.anchorText}>
                    🎙 {formatTimestamp(anchor.start_ms)} – {formatTimestamp(anchor.end_ms)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function TodoView({
  payload,
  state,
  onToggle,
}: {
  payload: DerivativePayload | undefined;
  state: Record<string, boolean>;
  onToggle: (id: string) => void;
}): React.ReactElement {
  if (!payload || !payload.items?.length) {
    return <Text style={styles.placeholder}>暂无待办。</Text>;
  }
  return (
    <View style={styles.itemList}>
      {payload.items.map((item) => {
        const done = !!state[item.id];
        return (
          <Pressable
            key={item.id}
            onPress={() => onToggle(item.id)}
            style={({ pressed }) => [
              styles.todoCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.checkbox, done && styles.checkboxOn]}>
              {done ? <Text style={styles.checkboxText}>✓</Text> : null}
            </View>
            <View style={styles.todoBody}>
              <Text
                style={[styles.itemTitle, done && styles.todoTextDone]}
              >
                {item.title}
              </Text>
              <Text
                style={[styles.itemBody, done && styles.todoTextDone]}
              >
                {item.body}
              </Text>
              <View style={styles.todoMetaRow}>
                {item.owner ? (
                  <Text style={styles.todoOwner}>👤 {item.owner}</Text>
                ) : null}
                {item.anchors?.[0] ? (
                  <Text style={styles.todoAnchor}>
                    🎙 {formatTimestamp(item.anchors[0].start_ms)}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function CustomView({ payload }: { payload: DerivativePayload | null }): React.ReactElement {
  if (!payload) {
    return <Text style={styles.placeholder}>请选择模板生成自定义笔记。</Text>;
  }
  return (
    <View>
      <View style={styles.contentBlock}>
        {payload.body
          ? parseMarkdown(payload.body).map((block, idx) => {
              if (block.kind === 'h2') {
                return (
                  <Text key={idx} style={styles.h2}>
                    {block.text}
                  </Text>
                );
              }
              if (block.kind === 'li') {
                return (
                  <View key={idx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{block.text}</Text>
                  </View>
                );
              }
              if (block.kind === 'quote') {
                return (
                  <Text key={idx} style={styles.quote}>
                    {block.text}
                  </Text>
                );
              }
              return (
                <Text key={idx} style={styles.paragraph}>
                  {block.text}
                </Text>
              );
            })
          : null}
      </View>
      {payload.items?.length ? (
        <View style={styles.itemList}>
          {payload.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBody}>{item.body}</Text>
              {item.anchors?.[0] ? (
                <View style={styles.anchorRow}>
                  <View style={styles.anchorPill}>
                    <Text style={styles.anchorText}>
                      🎙 {formatTimestamp(item.anchors[0].start_ms)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface MdBlock {
  kind: 'h2' | 'p' | 'li' | 'quote';
  text: string;
}

function parseMarkdown(md: string): MdBlock[] {
  const lines = md.split('\n');
  const blocks: MdBlock[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: line.slice(3) });
    } else if (line.startsWith('- ')) {
      blocks.push({ kind: 'li', text: line.slice(2) });
    } else if (line.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: line.slice(2) });
    } else {
      blocks.push({ kind: 'p', text: line.replace(/\*\*/g, '') });
    }
  }
  return blocks;
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
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
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
  pressed: {
    opacity: 0.78,
  },
  tabsRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 56,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
    marginBottom: spacing.md,
  },
  metaCard: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 76,
  },
  metaValue: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 32,
    textAlign: 'center',
  },
  contentBlock: {
    gap: 8,
  },
  h2: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 14,
  },
  paragraph: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  bulletDot: {
    backgroundColor: colors.textPrimary,
    borderRadius: 3,
    height: 6,
    marginTop: 9,
    width: 6,
  },
  bulletText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  quote: {
    backgroundColor: colors.bgSoft,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    color: colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  itemList: {
    gap: 12,
    marginTop: 4,
  },
  itemCard: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  itemBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  anchorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  anchorPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  anchorText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  todoCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.borderStrong,
    borderRadius: 7,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    width: 24,
  },
  checkboxOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkboxText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },
  todoBody: {
    flex: 1,
  },
  todoTextDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  todoMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  todoOwner: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  todoAnchor: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  footerNote: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  footerNoteText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  footerNoteLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
});
