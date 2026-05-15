import { StyleSheet, Text, View } from 'react-native';

import type * as iCloudBridge from '../../native/icloud-bridge';
import type { SyncStatusCounts } from '../../types/sync';
import { useSyncStatus } from '../hooks/use-sync-status';

export function GlobalStatusBar(): React.ReactElement | null {
  const { counts, iCloud: container, error } = useSyncStatus();

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

function syncLabel(counts: SyncStatusCounts, container: iCloudBridge.ICloudContainerStatus): string {
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
    return `${counts.uploaded} 条已上传，等待 Mac 写入 Notes`;
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
