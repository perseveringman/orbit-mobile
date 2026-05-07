import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import * as iCloudBridge from '../../native/icloud-bridge';
import type { SyncState } from '../../types/capture';
import * as capturesRepo from '../../core/storage/captures-repo';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';

type SyncCounts = Record<SyncState, number>;

const EMPTY_COUNTS: SyncCounts = {
  pending: 0,
  syncing: 0,
  uploaded: 0,
  acked: 0,
  failed: 0,
  conflicted: 0,
};

export function GlobalStatusBar(): React.ReactElement | null {
  const [counts, setCounts] = useState<SyncCounts>(EMPTY_COUNTS);
  const [container, setContainer] = useState<iCloudBridge.ICloudContainerStatus>({
    available: false,
    reason: 'unknown',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh(runWorker: boolean): Promise<void> {
      try {
        const db = await openDb();
        if (runWorker) {
          await runSyncTick({ db });
        }
        const [nextCounts, nextContainer] = await Promise.all([
          capturesRepo.countByState(db),
          iCloudBridge.getContainerStatus(),
        ]);
        if (!cancelled) {
          setCounts(nextCounts);
          setContainer(nextContainer);
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
        }
      }
    }

    void refresh(true);
    const interval = setInterval(() => {
      void refresh(true);
    }, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh(true);
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  const unsettled = counts.pending + counts.syncing + counts.uploaded + counts.failed + counts.conflicted;
  if (unsettled === 0 && container.available && error === null) {
    return null;
  }

  const label = error ?? syncLabel(counts, container);
  const tone = error !== null || counts.failed > 0 || counts.conflicted > 0 ? styles.error : styles.info;
  return (
    <View style={[styles.container, tone]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

function syncLabel(counts: SyncCounts, container: iCloudBridge.ICloudContainerStatus): string {
  if (!container.available) {
    return `iCloud 不可用：${container.reason ?? 'unknown'}。Capture 已保存在本地。`;
  }
  if (counts.conflicted > 0) {
    return `${counts.conflicted} 条需要处理`;
  }
  if (counts.failed > 0) {
    return `${counts.failed} 条同步失败，会自动重试`;
  }
  if (counts.syncing > 0) {
    return `${counts.syncing} 条正在同步`;
  }
  if (counts.pending > 0) {
    return `${counts.pending} 条等待同步`;
  }
  if (counts.uploaded > 0) {
    return `${counts.uploaded} 条已上传，等待 Mac 接收`;
  }
  return '同步正常';
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  info: {
    backgroundColor: '#eef6ff',
  },
  error: {
    backgroundColor: '#fff2f0',
  },
  text: {
    color: '#233',
    fontSize: 12,
    fontWeight: '600',
  },
});
