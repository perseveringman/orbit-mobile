/**
 * use-draft.ts — 草稿每 2s 自动保存 hook
 *
 * 输入中的内容透明走 drafts 表，退出再进静默恢复（working_memory 定稿）。
 *
 * @see docs/UX-PRINCIPLES.md
 * @see docs/DATA-MODEL.md §1.3
 *
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import * as draftsRepo from '../../core/storage/drafts-repo';
import { openDb } from '../../core/storage/db';
import { generateSessionId } from '../../utils/id';
import { isoNow } from '../../utils/time';

export interface UseDraftResult {
  sessionId: string;
  content: string;
  setContent(value: string): void;
  loading: boolean;
  restored: boolean;
  clear(): Promise<void>;
}

export function useDraft(initialSessionId?: string): UseDraftResult {
  const generatedSessionId = useMemo(() => initialSessionId ?? generateSessionId(), [initialSessionId]);
  const [sessionId, setSessionId] = useState(generatedSessionId);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function restoreLatestDraft() {
      const db = await openDb();
      const [latest] = await draftsRepo.list(db, { limit: 1 });
      if (!cancelled && latest && latest.content.length > 0) {
        setSessionId(latest.session_id);
        setContent(latest.content);
        setRestored(true);
      }
      if (!cancelled) {
        setLoading(false);
      }
    }
    restoreLatestDraft().catch(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return undefined;
    }
    const handle = setTimeout(() => {
      openDb()
        .then((db) =>
          draftsRepo.upsert(db, {
            session_id: sessionId,
            content,
            kind_hint: 'thought',
            updated_at: isoNow(),
          }),
        )
        .catch(() => undefined);
    }, 2000);
    return () => clearTimeout(handle);
  }, [content, loading, sessionId]);

  const clear = useCallback(async () => {
    const db = await openDb();
    await draftsRepo.del(db, sessionId);
    setContent('');
    setRestored(false);
  }, [sessionId]);

  return { sessionId, content, setContent, loading, restored, clear };
}
