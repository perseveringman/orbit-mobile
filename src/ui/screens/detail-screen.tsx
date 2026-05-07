/**
 * detail-screen.tsx — 单条详情 + 同步状态
 *
 * 展示 manifest 全量 + 附件预览 + 同步事件时间线（sync_events）。
 * 可手动重试 / 删除（软删）。
 *
 * @see docs/UX-PRINCIPLES.md
 *
 */

import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as capturesRepo from '../../core/storage/captures-repo';
import * as eventsRepo from '../../core/storage/events-repo';
import { openDb } from '../../core/storage/db';
import type { CaptureRow, SyncEventRow } from '../../types/capture';
import { expoFileSystem, joinPath } from '../../utils/fs';
import { SyncIndicator } from '../components/sync-indicator';

export function DetailScreen({ id }: { id: string }): React.ReactElement {
  const [capture, setCapture] = useState<CaptureRow | null>(null);
  const [events, setEvents] = useState<SyncEventRow[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const db = await openDb();
      const row = await capturesRepo.get(db, id);
      setCapture(row);
      if (row) {
        try {
          const manifestJson = await expoFileSystem.readString(joinPath(row.local_path, 'manifest.json'));
          const manifest = JSON.parse(manifestJson) as { content?: string };
          setContent(manifest.content ?? row.content_preview ?? '');
        } catch {
          setContent(row.content_preview ?? '');
          setError('本地 capture 文件不完整：manifest.json 缺失或不可读。请重新保存这条语音/图片。');
        }
        setEvents(await eventsRepo.listByCapture(db, id, { limit: 5 }));
      }
      setLoading(false);
    }
    load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Link href="/recent" style={styles.back}>
        返回最近
      </Link>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {capture ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Capture</Text>
            <SyncIndicator state={capture.sync_state} />
          </View>
          <Text style={styles.content}>{content}</Text>
          <Text style={styles.meta}>{capture.captured_at_local}</Text>
          <Text style={styles.sectionTitle}>同步历史</Text>
          {events.map((event) => (
            <Text key={event.id} style={styles.event}>
              {event.timestamp} · {event.event}
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.empty}>未找到这条 capture</Text>
      )}
    </ScrollView>
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
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  back: {
    color: '#2563eb',
    fontWeight: '600',
    marginBottom: 24,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  content: {
    color: '#0f172a',
    fontSize: 20,
    lineHeight: 30,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 32,
  },
  event: {
    color: '#475569',
    fontSize: 13,
    marginTop: 10,
  },
  error: {
    color: '#b91c1c',
  },
  empty: {
    color: '#64748b',
  },
});
