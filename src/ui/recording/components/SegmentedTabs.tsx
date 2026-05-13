import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

export interface TabItem {
  key: string;
  label: string;
  badge?: string | number;
}

interface Props {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  trailing?: React.ReactNode;
  compact?: boolean;
  scrollable?: boolean;
}

export function SegmentedTabs({
  items,
  activeKey,
  onSelect,
  trailing,
  compact = false,
  scrollable = false,
}: Props): React.ReactElement {
  const content = (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.tab,
              compact ? styles.tabCompact : null,
              active && styles.tabActive,
              pressed && styles.tabPressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {item.label}
              {item.badge !== undefined ? (
                <Text style={styles.badge}> · {item.badge}</Text>
              ) : null}
            </Text>
          </Pressable>
        );
      })}
      {trailing}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {content}
      </ScrollView>
    );
  }
  return <View style={styles.wrap}>{content}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  scrollContent: {
    paddingRight: 16,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  rowCompact: {
    backgroundColor: 'transparent',
    padding: 0,
  },
  tab: {
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
  },
  tabPressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.accent,
  },
  badge: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
