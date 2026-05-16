/**
 * RecordingAskScreen — Ask Orbit（设计图 5）
 *
 * 给定当前录音上下文的 mini chat。
 * 顶部：trash / "Ask Orbit" 标题 / 关闭。
 * 主体：3 个建议问题（可点）。
 * 底部：3 个动作按钮（获取洞察 / 生成待办 / 写邮件）。
 * 输入框：「对此笔记提问」+ 麦克风。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.6
 */

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getDeepSeekApiKey } from '../../../core/ai/api-key';
import { DeepSeekClient } from '../../../core/ai/deepseek-client';
import { askRecordingQuestion } from '../../../core/ai/recording-notes';
import { loadRecordingDetail } from '../../../core/recording/recording-service';
import { loadAppSettings } from '../../../core/settings/app-settings';
import { openDb } from '../../../core/storage/db';
import type { RecordingDetail } from '../../../types/recording';
import { MISSING_RECORDING_MESSAGE, recordingErrorMessage } from '../errors';
import { colors, radius, spacing } from '../theme';

interface Props {
  id: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = [
  '如何优化产品新功能的上线项目的执行策略，实现曝光、转化与口碑的多赢？',
  '产品新功能上线后，各部门的待办事项以及时间线是怎么样的？',
  '生成时间线的示意图并根据重要性划分优先级',
];

const ACTIONS = [
  { id: 'insight', label: '获取洞察' },
  { id: 'todo', label: '生成待办' },
  { id: 'email', label: '写邮件' },
];

export function RecordingAskScreen({ id }: Props): React.ReactElement {
  const router = useRouter();
  const [detail, setDetail] = useState<RecordingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const nextMessageId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadRecordingDetail(id)
      .then((loaded) => {
        if (!cancelled) {
          setDetail(loaded);
          setLoadError(loaded ? null : MISSING_RECORDING_MESSAGE);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(recordingErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function send(question: string): Promise<void> {
    if (!question.trim()) return;
    const user: ChatMessage = {
      id: nextMessageId.current += 1,
      role: 'user',
      text: question.trim(),
    };
    setMessages((prev) => [...prev, user]);
    setDraft('');
    setSending(true);
    let answer: string;
    try {
      const db = await openDb();
      const [settings, key] = await Promise.all([loadAppSettings(db), getDeepSeekApiKey()]);
      if (detail && key && settings.ai.enabled) {
        answer = await askRecordingQuestion(new DeepSeekClient(settings.ai, key), detail, question.trim());
      } else {
        answer = [
          key ? '' : '尚未配置 DeepSeek API Key，以下是本地兜底回答。',
          buildLocalReply(question, detail),
        ].filter(Boolean).join('\n\n');
      }
    } catch (error) {
      answer = [
        `DeepSeek 请求失败：${error instanceof Error ? error.message : String(error)}`,
        '',
        buildLocalReply(question, detail),
      ].join('\n');
    }
    const reply: ChatMessage = {
      id: nextMessageId.current += 1,
      role: 'assistant',
      text: answer,
    };
    setMessages((prev) => [...prev, reply]);
    setSending(false);
  }

  function runAction(actionId: string): void {
    const phrase =
      actionId === 'insight'
        ? '基于这次录音给我三条最值得关注的洞察。'
        : actionId === 'todo'
          ? '把这次会议中提到的所有待办抽出来，附带 Owner 和时间。'
          : '帮我给参会人员写一封英文跟进邮件，列清楚决策与下一步。';
    void send(phrase);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setMessages([])}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityLabel="清空对话"
        >
          <Text style={styles.iconBtnText}>🗑</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ask Orbit</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>✕</Text>
        </Pressable>
      </View>

      {detail ? (
        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>当前上下文</Text>
          <Text style={styles.contextTitle}>{detail.meta.title}</Text>
          <Text style={styles.contextMeta}>
            {detail.meta.duration_ms / 60000 | 0} 分钟 · {detail.meta.speakers.length} 位说话人
          </Text>
        </View>
      ) : loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : null}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <>
            <Text style={styles.section}>试试问</Text>
            {SUGGESTIONS.map((s, idx) => (
              <Pressable
                key={idx}
                onPress={() => {
                  void send(s);
                }}
                style={({ pressed }) => [
                  styles.suggestion,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[styles.message, m.role === 'user' ? styles.user : styles.assistant]}
            >
              <Text
                style={[
                  styles.messageText,
                  m.role === 'user' ? styles.messageTextUser : styles.messageTextAssistant,
                ]}
              >
                {m.text}
              </Text>
            </View>
          ))
        )}
        {sending ? (
          <View style={[styles.message, styles.assistant]}>
            <Text style={styles.messageTextAssistant}>DeepSeek 正在思考…</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actionRow}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => runAction(a.id)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="对此笔记提问"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => {
            void send(draft);
          }}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => {
            void send(draft);
          }}
          style={({ pressed }) => [styles.mic, pressed && styles.pressed]}
        >
          <Text style={styles.micText}>🎙</Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildLocalReply(question: string, detail: RecordingDetail | null): string {
  if (!detail) {
    return '这条录音还没有加载完成。数据只会从本机读取，请稍后再试。';
  }
  const transcript = detail.transcript.segments.map((segment) => segment.text).join('\n');
  const todos = detail.derivatives.todos?.items ?? [];
  const decisions = detail.derivatives.decisions?.items ?? [];
  const risks = detail.derivatives.risks?.items ?? [];
  if (question.includes('待办')) {
    if (todos.length === 0) return '本地派生器没有从转写中识别到明确待办。你可以在 Mac 端用完整模型重新生成。';
    return ['从这次录音里提取到的待办：', ...todos.map((item, index) => `${index + 1}. ${item.title} — ${item.body}`)].join('\n');
  }
  if (question.includes('邮件') || question.toLowerCase().includes('email')) {
    return [
      `Subject: ${detail.meta.title} — Follow-up`,
      '',
      'Hi team,',
      '',
      'A quick recap from the recording:',
      ...(decisions.length > 0
        ? decisions.map((item) => `- ${item.body}`)
        : [`- ${transcript.slice(0, 180) || 'The original audio has been saved locally.'}`]),
      '',
      'Please review and add any missing context before sending.',
      '',
      'Thanks,',
    ].join('\n');
  }
  if (question.includes('风险')) {
    if (risks.length === 0) return '本地派生器没有识别到明确风险；原始转写仍可在详情页逐段校对。';
    return ['识别到的风险：', ...risks.map((item, index) => `${index + 1}. ${item.body}`)].join('\n');
  }
  return [
    '基于本机转写，我看到的关键信号是：',
    detail.derivatives.summary?.body ?? (transcript.slice(0, 500) || '暂无可用转写；原始录音已完整保存。'),
    '',
    '如果需要更强的语义分析，可在 Mac 端接入完整模型后重新生成派生笔记。',
  ].join('\n');
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  contextCard: {
    backgroundColor: colors.lavenderSoft,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    padding: 14,
  },
  contextLabel: {
    color: colors.lavender,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  contextTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  contextMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    marginTop: spacing.lg,
  },
  bodyContent: {
    paddingBottom: 12,
  },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  suggestion: {
    backgroundColor: colors.bg,
    borderColor: colors.successSoft,
    borderRadius: radius.lg,
    borderWidth: 2,
    marginBottom: 10,
    padding: 14,
  },
  suggestionText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
  },
  message: {
    borderRadius: radius.lg,
    marginBottom: 10,
    maxWidth: '90%',
    padding: 12,
  },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  messageTextUser: {
    color: colors.bg,
  },
  messageTextAssistant: {
    color: colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 12,
  },
  action: {
    alignItems: 'center',
    borderColor: colors.successSoft,
    borderRadius: radius.pill,
    borderWidth: 2,
    flex: 1,
    paddingVertical: 12,
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.successSoft,
    borderRadius: radius.pill,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  mic: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  micText: {
    fontSize: 16,
  },
});
