import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { runReconcile } from '../../core/reconcile/reconcile-job';
import { loadAppSettings, setKeepImageOriginal, type AppSettings } from '../../core/settings/app-settings';
import * as capturesRepo from '../../core/storage/captures-repo';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import * as iCloudBridge from '../../native/icloud-bridge';
import type { SyncStatusCounts } from '../../types/sync';

export function SettingsScreen(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [counts, setCounts] = useState<SyncStatusCounts | null>(null);
  const [iCloud, setICloud] = useState<iCloudBridge.ICloudContainerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const db = await openDb();
    const [nextSettings, nextCounts, nextCloud] = await Promise.all([
      loadAppSettings(db),
      capturesRepo.countByState(db),
      iCloudBridge.getContainerStatus(),
    ]);
    setSettings(nextSettings);
    setCounts(nextCounts);
    setICloud(nextCloud);
  }, []);

  useEffect(() => {
    refresh().catch((loadError: unknown) => setError(errorMessage(loadError)));
  }, [refresh]);

  async function runAction(action: 'sync' | 'reconcile'): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const db = await openDb();
      if (action === 'reconcile') {
        const result = await runReconcile({ db });
        setMessage(`自愈完成：${result.sqliteBackfilled} 条补齐，${result.deadLettered} 条隔离`);
      } else {
        const result = await runSyncTick({ db, batchSize: 10 });
        setMessage(`同步完成：处理 ${result.processed} 条`);
      }
      await refresh();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleKeepOriginal(value: boolean): Promise<void> {
    if (!settings) return;
    setSettings({ ...settings, keepImageOriginal: value });
    try {
      await setKeepImageOriginal(await openDb(), value);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSettings(settings);
    }
  }

  if (!settings || !counts || !iCloud) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Link href="/" style={styles.back}>
        返回
      </Link>
      <Text style={styles.title}>设置</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>图片</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>保留原图</Text>
            <Text style={styles.rowSub}>压缩图用于预览和同步，原图作为附件保留。</Text>
          </View>
          <Switch
            value={settings.keepImageOriginal}
            onValueChange={(value) => {
              void toggleKeepOriginal(value);
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>同步</Text>
        <Text style={styles.statusLine}>
          iCloud：{iCloud.available ? '可用' : iCloud.reason ?? '不可用'}
        </Text>
        <Text style={styles.statusLine}>
          本地 {counts.pending} · 同步中 {counts.syncing} · 已上传 {counts.uploaded} · 已接收 {counts.acked} · 失败 {counts.failed} · 冲突 {counts.conflicted}
        </Text>
        <View style={styles.buttonRow}>
          <ActionButton
            disabled={busy}
            label="立即同步"
            onPress={() => {
              void runAction('sync');
            }}
          />
          <ActionButton
            disabled={busy}
            label="运行自愈"
            onPress={() => {
              void runAction('reconcile');
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    padding: 20,
    paddingTop: 56,
  },
  back: {
    color: '#2563eb',
    fontWeight: '700',
    marginBottom: 24,
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 18,
  },
  message: {
    color: '#166534',
    marginBottom: 12,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 12,
  },
  section: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18,
  },
  sectionTitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  rowSub: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  statusLine: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
