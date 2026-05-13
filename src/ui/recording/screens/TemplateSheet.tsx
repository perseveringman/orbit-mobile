/**
 * TemplateSheet — 选择自定义模板（设计图 4）
 *
 * Modal sheet：推荐模板网格 + 更多模板入口 + 立即生成按钮。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md §4.5
 */

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MOCK_TEMPLATES } from '../../../core/recording/mock-data';
import type { RecordingTemplate } from '../../../types/recording';
import { colors, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply: (template: RecordingTemplate) => void;
}

export function TemplateSheet({ visible, onClose, onApply }: Props): React.ReactElement {
  const [selected, setSelected] = useState<string>(MOCK_TEMPLATES[0]?.id ?? '');
  const featured = MOCK_TEMPLATES.slice(0, 2);
  const others = MOCK_TEMPLATES.slice(2);

  return (
    <Modal
      animationType="slide"
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>新笔记</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Text style={styles.iconBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.section}>此文件的推荐模板：</Text>
            <View style={styles.grid}>
              {featured.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  active={selected === tpl.id}
                  onPress={() => setSelected(tpl.id)}
                  highlight
                />
              ))}
            </View>

            <View style={styles.moreEntry}>
              <Text style={styles.moreIcon}>🧩</Text>
              <Text style={styles.moreText}>更多模板</Text>
              <Text style={styles.moreChevron}>›</Text>
            </View>

            {others.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                active={selected === tpl.id}
                onPress={() => setSelected(tpl.id)}
                horizontal
              />
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.glow} />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const tpl = MOCK_TEMPLATES.find((t) => t.id === selected);
                if (tpl) onApply(tpl);
              }}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              <Text style={styles.ctaText}>立即生成</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface CardProps {
  tpl: RecordingTemplate;
  active: boolean;
  highlight?: boolean;
  horizontal?: boolean;
  onPress: () => void;
}

function TemplateCard({ tpl, active, highlight, horizontal, onPress }: CardProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        horizontal ? styles.cardHorizontal : styles.cardSquare,
        active && styles.cardActive,
        pressed && styles.pressed,
        highlight && { borderColor: tpl.accent + '88' },
      ]}
    >
      <View
        style={[
          styles.cardIcon,
          { backgroundColor: tpl.accent + '22', borderColor: tpl.accent + '55' },
        ]}
      >
        <Text style={[styles.cardIconText, { color: tpl.accent }]}>
          {tpl.name.slice(0, 1)}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{tpl.name}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {tpl.description}
        </Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardAuthor}>{tpl.author}</Text>
          <Text style={styles.cardMetaDot}>·</Text>
          <Text style={styles.cardUses}>
            {tpl.uses >= 1000 ? `${Math.round(tpl.uses / 1000)}k` : tpl.uses}
          </Text>
        </View>
      </View>
      {active ? <View style={styles.cardCheck}><Text style={styles.cardCheckText}>✓</Text></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15,23,42,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 8,
    paddingTop: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  iconBtn: {
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  iconBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    paddingBottom: 24,
    paddingHorizontal: spacing.xl,
  },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 14,
  },
  cardSquare: {
    flex: 1,
  },
  cardHorizontal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cardActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  cardIcon: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginBottom: 10,
    width: 36,
  },
  cardIconText: {
    fontSize: 16,
    fontWeight: '900',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  cardMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  cardAuthor: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  cardMetaDot: {
    color: colors.textMuted,
    fontSize: 11,
  },
  cardUses: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  cardCheck: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 24,
  },
  cardCheckText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '900',
  },
  moreEntry: {
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  moreIcon: {
    fontSize: 16,
  },
  moreText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  moreChevron: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 16,
    paddingHorizontal: spacing.xl,
    paddingTop: 8,
  },
  glow: {
    backgroundColor: colors.lavenderSoft,
    borderRadius: 999,
    height: 26,
    marginBottom: -12,
    opacity: 0.55,
    width: 200,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 32,
    paddingVertical: 16,
    width: '100%',
  },
  ctaText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '800',
  },
});
