/**
 * use-captures.ts — 最近列表的 Zustand hook
 *
 * 以内存快照驱动渲染（Layer 1 Hot Cache），SQLite 订阅变更增量刷新。
 *
 * @see docs/ARCHITECTURE.md §2 Layer 1
 *
 */

import { useCallback, useEffect, useState } from 'react';

import * as capturesRepo from '../../core/storage/captures-repo';
import { openDb } from '../../core/storage/db';
import type { CaptureRow } from '../../types/capture';

export interface UseCapturesResult {
  captures: CaptureRow[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useCapturesRecent(limit = 50): UseCapturesResult {
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const db = await openDb();
    const rows = await capturesRepo.list(db, { limit });
    setCaptures(rows);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setLoading(false);
    });
  }, [refresh]);

  return { captures, loading, error, refresh };
}
