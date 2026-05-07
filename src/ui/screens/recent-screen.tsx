/**
 * recent-screen.tsx — 最近记录列表
 *
 * 按 created_at DESC 列最近 N 条；每条附同步状态徽章。
 * 列表首屏 < 300ms（见 ARCHITECTURE.md §10）。
 *
 * @see docs/UX-PRINCIPLES.md
 *
 */

import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { SyncIndicator } from '../components/sync-indicator';
import { useCapturesRecent } from '../hooks/use-captures';

export function RecentScreen(): React.ReactElement {
  const capturesResult = useCapturesRecent();

  if (capturesResult.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link href="/" style={styles.back}>
          记一条
        </Link>
        <Text style={styles.title}>最近</Text>
        <Pressable onPress={() => void capturesResult.refresh()}>
          <Text style={styles.refresh}>刷新</Text>
        </Pressable>
      </View>
      {capturesResult.error ? <Text style={styles.error}>{capturesResult.error}</Text> : null}
      <FlatList
        data={capturesResult.captures}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>还没有 capture</Text>}
        renderItem={({ item }) => {
          const href = `/detail/${item.id}` as const;
          return (
            <Link href={href} asChild>
              <Pressable style={styles.row}>
                <View style={styles.rowText}>
                  <Text numberOfLines={2} style={styles.preview}>
                    {item.content_preview || '（空内容）'}
                  </Text>
                  <Text style={styles.time}>{item.captured_at_local}</Text>
                </View>
                <SyncIndicator state={item.sync_state} />
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  back: {
    color: '#2563eb',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  refresh: {
    color: '#2563eb',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 12,
  },
  empty: {
    color: '#64748b',
    marginTop: 40,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
  },
  preview: {
    color: '#0f172a',
    fontSize: 16,
    lineHeight: 22,
  },
  time: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
});
