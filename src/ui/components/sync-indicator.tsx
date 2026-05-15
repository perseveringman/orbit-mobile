/**
 * sync-indicator.tsx — 单条同步状态徽章
 *
 * 对应 sync_state：pending(⏳) / syncing(↑) / uploaded(↑✓) / acked(✓) /
 * failed(⚠️ 可点重试) / conflicted(❗)
 *
 * @see docs/UX-PRINCIPLES.md
 *
 */

import { Text, StyleSheet } from 'react-native';

import type { SyncState } from '../../types/capture';

const LABELS: Record<SyncState, string> = {
  pending: '○ 本地',
  syncing: '↑ 同步中',
  uploaded: '↑✓ 已上传',
  acked: '✓ 已到 Notes',
  failed: '⚠ 失败',
  conflicted: '⛔ 冲突',
};

export function SyncIndicator({ state }: { state: SyncState }): React.ReactElement {
  return <Text style={[styles.badge, styles[state]]}>{LABELS[state]}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pending: {
    backgroundColor: '#eef2ff',
    color: '#3730a3',
  },
  syncing: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  uploaded: {
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
  },
  acked: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  failed: {
    backgroundColor: '#ffedd5',
    color: '#c2410c',
  },
  conflicted: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
});
