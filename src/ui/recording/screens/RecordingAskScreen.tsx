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
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getMockRecording } from '../../../core/recording/mock-data';
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
  const detail = getMockRecording(id);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  let messageId = messages.length;

  function send(question: string): void {
    if (!question.trim()) return;
    messageId += 1;
    const user: ChatMessage = { id: messageId, role: 'user', text: question.trim() };
    messageId += 1;
    const reply: ChatMessage = {
      id: messageId,
      role: 'assistant',
      text: mockReply(question),
    };
    setMessages((prev) => [...prev, user, reply]);
    setDraft('');
  }

  function runAction(actionId: string): void {
    const phrase =
      actionId === 'insight'
        ? '基于这次录音给我三条最值得关注的洞察。'
        : actionId === 'todo'
          ? '把这次会议中提到的所有待办抽出来，附带 Owner 和时间。'
          : '帮我给参会人员写一封英文跟进邮件，列清楚决策与下一步。';
    send(phrase);
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
                onPress={() => send(s)}
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
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => send(draft)}
          style={({ pressed }) => [styles.mic, pressed && styles.pressed]}
        >
          <Text style={styles.micText}>🎙</Text>
        </Pressable>
      </View>
    </View>
  );
}

function mockReply(question: string): string {
  if (question.includes('待办')) {
    return [
      '从这次录音里提取出 3 条待办：',
      '1. Carlin · 48h 内整理决策与风险并确认 Owner',
      '2. Patrick · 同步监控告警阈值文档',
      '3. Peter · 完成数据回填 dry-run',
    ].join('\n');
  }
  if (question.includes('邮件') || question.toLowerCase().includes('email')) {
    return [
      'Subject: Q1 Delivery Sync — Decisions & Next Steps',
      '',
      'Hi team,',
      '',
      'A quick recap of today\'s 30-min sync:',
      '- Q1 scope locked: onboarding redesign + analytics dashboard.',
      '- Automation deferred to Q2.',
      '- Voice cloning beta slipped to May.',
      '',
      'Owners will be confirmed within 48h. Please flag conflicts by Friday.',
      '',
      'Thanks,',
      'Carlin',
    ].join('\n');
  }
  return [
    '基于本次录音，我看到的关键信号是：',
    '• 团队主动在 Q1 内做"减法"，把质量列为首要目标。',
    '• 风险集中在仪表盘的数据回填，建议尽早 dry-run。',
    '• AI 路线图保留摘要升级、延后语音克隆。',
    '需要我把这些洞察转成对 Mac 端 Inbox 的待办吗？',
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
