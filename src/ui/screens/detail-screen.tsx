/**
 * detail-screen.tsx — 单条详情 + 同步状态
 *
 * 展示 manifest 全量 + 附件预览 + 同步事件时间线（sync_events）。
 * 可手动重试 / 删除（软删）。
 *
 * @see docs/UX-PRINCIPLES.md
 *
 */

import { Audio } from 'expo-av';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AVPlaybackStatusSuccess } from 'expo-av';

import * as capturesRepo from '../../core/storage/captures-repo';
import * as eventsRepo from '../../core/storage/events-repo';
import { openDb } from '../../core/storage/db';
import type { CaptureRow, SyncEventRow } from '../../types/capture';
import { SyncIndicator } from '../components/sync-indicator';
import {
  loadCaptureDisplay,
  type CaptureDisplayAttachment,
  type CaptureDisplayModel,
} from '../models/capture-display';

export function DetailScreen({ id }: { id: string }): React.ReactElement {
  const [capture, setCapture] = useState<CaptureRow | null>(null);
  const [display, setDisplay] = useState<CaptureDisplayModel | null>(null);
  const [events, setEvents] = useState<SyncEventRow[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const db = await openDb();
      const row = await capturesRepo.get(db, id);
      setCapture(row);
      if (row) {
        const nextDisplay = await loadCaptureDisplay(row);
        setDisplay(nextDisplay);
        if (nextDisplay.manifestMissing) {
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
            <View>
              <Text style={styles.kind}>{display?.icon} {display?.kindLabel ?? 'Capture'}</Text>
              <Text style={styles.title}>{display?.title ?? 'Capture'}</Text>
            </View>
            <SyncIndicator state={capture.sync_state} />
          </View>
          {display?.body ? <Text style={styles.content}>{display.body}</Text> : null}
          {display?.images.length ? (
            <View style={styles.imageGrid}>
              {display.images.map((image) => (
                <Image key={image.filename} source={{ uri: image.uri }} style={styles.image} />
              ))}
            </View>
          ) : null}
          {display?.audio.length ? (
            <View style={styles.audioList}>
              {display.audio.map((audio) => (
                <AudioAttachmentCard key={audio.filename} attachment={audio} />
              ))}
            </View>
          ) : null}
          {display?.attachments.filter((attachment) => attachment.type === 'file').length ? (
            <View style={styles.fileList}>
              {display.attachments
                .filter((attachment) => attachment.type === 'file')
                .map((attachment) => (
                  <Text key={attachment.filename} style={styles.fileItem}>
                    附件：{attachment.filename} · {attachment.sizeLabel}
                  </Text>
                ))}
            </View>
          ) : null}
          <Text style={styles.meta}>{display?.capturedAtLabel ?? capture.captured_at_local}</Text>
          <View style={styles.syncSummary}>
            <Text style={styles.syncSummaryText}>同步状态对用户可见，但默认不展开技术日志。</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowEvents((value) => !value)}
              style={styles.eventsButton}
            >
              <Text style={styles.eventsButtonText}>{showEvents ? '隐藏同步记录' : '查看同步记录'}</Text>
            </Pressable>
          </View>
          {showEvents ? (
            <>
              <Text style={styles.sectionTitle}>同步记录</Text>
              {events.map((event) => (
                <Text key={event.id} style={styles.event}>
                  {event.timestamp} · {event.event}
                </Text>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>未找到这条 capture</Text>
      )}
    </ScrollView>
  );
}

function AudioAttachmentCard({ attachment }: { attachment: CaptureDisplayAttachment }): React.ReactElement {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (sound) {
        void sound.unloadAsync();
      }
    };
  }, [sound]);

  async function toggle(): Promise<void> {
    if (sound && playing) {
      await sound.pauseAsync();
      setPlaying(false);
      return;
    }
    if (sound) {
      await sound.playAsync();
      setPlaying(true);
      return;
    }
    const created = await Audio.Sound.createAsync(
      { uri: attachment.uri },
      { shouldPlay: true },
      (status) => {
        if (isPlaybackSuccess(status) && status.didJustFinish) {
          setPlaying(false);
        }
      },
    );
    setSound(created.sound);
    setPlaying(true);
  }

  return (
    <View style={styles.audioCard}>
      <Pressable accessibilityRole="button" onPress={() => void toggle()} style={styles.playButton}>
        <Text style={styles.playButtonText}>{playing ? '暂停' : '播放'}</Text>
      </Pressable>
      <View style={styles.audioMeta}>
        <Text style={styles.audioTitle}>语音记录</Text>
        <Text style={styles.audioSubtitle}>
          {[attachment.durationLabel, attachment.sizeLabel].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function isPlaybackSuccess(status: unknown): status is AVPlaybackStatusSuccess {
  return typeof status === 'object' && status !== null && 'isLoaded' in status && status.isLoaded === true;
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
  kind: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  content: {
    color: '#0f172a',
    fontSize: 20,
    lineHeight: 30,
  },
  imageGrid: {
    gap: 12,
    marginTop: 20,
  },
  image: {
    backgroundColor: '#e2e8f0',
    borderRadius: 18,
    height: 260,
    width: '100%',
  },
  audioList: {
    gap: 12,
    marginTop: 20,
  },
  audioCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  audioMeta: {
    flex: 1,
  },
  audioTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  audioSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  fileList: {
    gap: 8,
    marginTop: 20,
  },
  fileItem: {
    color: '#475569',
    fontSize: 13,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 18,
  },
  syncSummary: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    marginTop: 28,
    padding: 12,
  },
  syncSummaryText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
  eventsButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  eventsButtonText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '700',
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
