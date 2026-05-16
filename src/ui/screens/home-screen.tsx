import { Link } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { SegmentedTabs } from '../recording/components/SegmentedTabs';
import { RecordingsListScreen } from '../recording/screens/RecordingsListScreen';
import { colors, spacing } from '../recording/theme';
import { CaptureScreen } from './capture-screen';

type HomeTab = 'note' | 'recording';

const HOME_TABS = [
  { key: 'note', label: '笔记' },
  { key: 'recording', label: '录音' },
];

export function HomeScreen(): React.ReactElement {
  const [tab, setTab] = useState<HomeTab>('note');

  function selectTab(key: string): void {
    const next = key === 'recording' ? 'recording' : 'note';
    if (next === 'recording') {
      Keyboard.dismiss();
    }
    setTab(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Orbit Capture</Text>
          <View style={styles.headerLinks}>
            <Link href="/recent" style={styles.headerLink}>
              最近
            </Link>
            <Link href="/settings" style={styles.headerLink}>
              设置
            </Link>
          </View>
        </View>
        <SegmentedTabs
          activeKey={tab}
          items={HOME_TABS}
          onSelect={selectTab}
        />
      </View>

      <View style={styles.content}>
        <View
          pointerEvents={tab === 'note' ? 'auto' : 'none'}
          style={[styles.pane, tab !== 'note' && styles.hiddenPane]}
        >
          <CaptureScreen active={tab === 'note'} embedded />
        </View>
        {tab === 'recording' ? (
          <View style={styles.pane}>
            <RecordingsListScreen embedded />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  header: {
    backgroundColor: '#f8fafc',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  headerLinks: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  headerLink: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  pane: {
    flex: 1,
  },
  hiddenPane: {
    display: 'none',
  },
});
