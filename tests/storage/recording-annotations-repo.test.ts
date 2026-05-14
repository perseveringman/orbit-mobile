import { describe, expect, it } from 'vitest';

import * as annotationsRepo from '@/core/storage/recording-annotations-repo';
import * as capturesRepo from '@/core/storage/captures-repo';
import * as recordingsRepo from '@/core/storage/recordings-repo';
import { createMigratedTestDb } from '../setup/in-memory-db';

describe('recording annotations repo', () => {
  it('upserts, lists, parses, and deletes persisted recording annotations', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(db, {
      id: 'mob_cap_recording',
      created_at: '2026-05-14T09:00:00.000Z',
      captured_at_local: '2026-05-14T17:00:00+08:00',
      kind: 'recording',
      content_preview: 'Recording',
      content_hash: 'hash-recording',
      byte_size: 10,
      local_path: '/documents/captures/mob_cap_recording',
    });
    await recordingsRepo.insert(db, {
      id: 'mob_cap_recording',
      title: 'Recording',
      duration_ms: 1000,
      language_hints: [],
      speaker_count: 1,
      partial_state: 'finished',
      final_state: 'done',
      partial_provider: 'ios-speech',
      final_provider: 'local-live-transcript',
      final_done_at: '2026-05-14T09:01:00.000Z',
      created_at: '2026-05-14T09:00:00.000Z',
    });

    await annotationsRepo.upsert(db, {
      recording_id: 'mob_cap_recording',
      kind: 'todo_state',
      target_id: 'todo-1',
      payload: { done: false },
      now: '2026-05-14T10:00:00.000Z',
    });
    await annotationsRepo.upsert(db, {
      recording_id: 'mob_cap_recording',
      kind: 'todo_state',
      target_id: 'todo-1',
      payload: { done: true },
      now: '2026-05-14T10:01:00.000Z',
    });

    const rows = await annotationsRepo.listByRecording(db, 'mob_cap_recording', 'todo_state');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recording_id: 'mob_cap_recording',
      kind: 'todo_state',
      target_id: 'todo-1',
      created_at: '2026-05-14T10:00:00.000Z',
      updated_at: '2026-05-14T10:01:00.000Z',
    });
    const payload = annotationsRepo.parsePayload<{ done: boolean }>(rows[0]!);
    expect(payload?.done).toBe(true);

    await annotationsRepo.del(db, 'mob_cap_recording', 'todo_state', 'todo-1');
    await expect(annotationsRepo.listByRecording(db, 'mob_cap_recording')).resolves.toHaveLength(0);
  });
});
