import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import * as iCloudBridge from '../../native/icloud-bridge';
import * as capturesRepo from '../../core/storage/captures-repo';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import type { SyncStatusCounts } from '../../types/sync';

export interface SyncStatusSnapshot {
  counts: SyncStatusCounts;
  iCloud: iCloudBridge.ICloudContainerStatus;
  error: string | null;
  loading: boolean;
  refresh(runWorker?: boolean): Promise<void>;
}

const EMPTY_COUNTS: SyncStatusCounts = {
  pending: 0,
  syncing: 0,
  uploaded: 0,
  acked: 0,
  failed: 0,
  conflicted: 0,
};

export function useSyncStatus(pollMs = 5000, runWorkerOnPoll = false): SyncStatusSnapshot {
  const [counts, setCounts] = useState<SyncStatusCounts>(EMPTY_COUNTS);
  const [iCloud, setICloud] = useState<iCloudBridge.ICloudContainerStatus>({
    available: false,
    reason: 'unknown',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (runWorker = false): Promise<void> => {
    try {
      const db = await openDb();
      if (runWorker) {
        await runSyncTick({ db });
      }
      const [nextCounts, nextICloud] = await Promise.all([
        capturesRepo.countByState(db),
        iCloudBridge.getContainerStatus(),
      ]);
      setCounts(nextCounts);
      setICloud(nextICloud);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(runWorkerOnPoll);
    const interval = setInterval(() => {
      void refresh(runWorkerOnPoll);
    }, pollMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh(runWorkerOnPoll);
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [pollMs, refresh, runWorkerOnPoll]);

  return { counts, iCloud, error, loading, refresh };
}
