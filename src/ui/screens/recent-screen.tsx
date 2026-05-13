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
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { SyncIndicator } from '../components/sync-indicator';
import { useCapturesRecent } from '../hooks/use-captures';
import { loadCaptureDisplay, type CaptureDisplayModel } from '../models/capture-display';

export function RecentScreen(): React.ReactElement {
  const capturesResult = useCapturesRecent();
  const [displayById, setDisplayById] = useState<Record<string, CaptureDisplayModel>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(capturesResult.captures.map((capture) => loadCaptureDisplay(capture))).then((models) => {
      if (cancelled) return;
      setDisplayById(Object.fromEntries(models.map((model) => [model.id, model])));
    });
    return () => {
      cancelled = true;
    };
  }, [capturesResult.captures]);

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
        <View style={styles.headerActions}>
          <Link href="/recording" style={styles.recordingLink}>
            录音
          </Link>
          <Pressable onPress={() => void capturesResult.refresh()}>
            <Text style={styles.refresh}>刷新</Text>
          </Pressable>
        </View>
      </View>
      {capturesResult.error ? <Text style={styles.error}>{capturesResult.error}</Text> : null}
      <FlatList
        data={capturesResult.captures}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>还没有 capture</Text>}
        renderItem={({ item }) => {
          const href = `/detail/${item.id}` as const;
          const display = displayById[item.id];
          return (
            <Link href={href} asChild>
              <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                <View style={styles.cardHeader}>
                  <View style={styles.kind}>
                    <Text style={styles.kindIcon}>{display?.icon ?? '✎'}</Text>
                    <Text style={styles.kindText}>{display?.kindLabel ?? kindFallback(item.kind)}</Text>
                  </View>
                  <SyncIndicator state={item.sync_state} />
                </View>
                <Text numberOfLines={2} style={styles.preview}>
                  {display?.title || item.content_preview || '空白 Capture'}
                </Text>
                {display?.images[0] ? (
                  <View style={styles.imageStrip}>
                    {display.images.slice(0, 3).map((image) => (
                      <Image key={image.filename} source={{ uri: image.uri }} style={styles.thumbnail} />
                    ))}
                    {display.images.length > 3 ? (
                      <View style={styles.moreImages}>
                        <Text style={styles.moreImagesText}>+{display.images.length - 3}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {display?.audio[0] ? (
                  <View style={styles.audioPill}>
                    <Text style={styles.audioPillText}>
                      语音 {display.audio[0].durationLabel ?? display.audio[0].sizeLabel}
                    </Text>
                  </View>
                ) : null}
                {display?.manifestMissing ? (
                  <Text style={styles.warning}>本地文件不完整</Text>
                ) : null}
                <Text style={styles.time}>{display?.capturedAtLabel ?? item.captured_at_local}</Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}

function kindFallback(kind: string): string {
  if (kind === 'voice') return '语音';
  if (kind === 'photo') return '图片';
  if (kind === 'share') return '分享';
  if (kind === 'mixed') return '混合';
  return '文字';
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
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  recordingLink: {
    color: '#dc2626',
    fontWeight: '700',
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
  card: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    padding: 14,
  },
  cardPressed: {
    backgroundColor: '#f1f5f9',
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  kind: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  kindIcon: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  kindText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  preview: {
    color: '#0f172a',
    fontSize: 16,
    lineHeight: 22,
  },
  imageStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  thumbnail: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    height: 72,
    width: 72,
  },
  moreImages: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  moreImagesText: {
    color: '#475569',
    fontWeight: '800',
  },
  audioPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  audioPillText: {
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '700',
  },
  warning: {
    color: '#b91c1c',
    fontSize: 12,
    marginTop: 10,
  },
  time: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 10,
  },
});
