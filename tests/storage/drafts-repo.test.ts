import { describe, expect, it } from 'vitest';

import * as draftsRepo from '@/core/storage/drafts-repo';
import { createMigratedTestDb } from '../setup/in-memory-db';

describe('drafts repo', () => {
  it('upserts a new draft with matching created_at and updated_at', async () => {
    const db = await createMigratedTestDb();

    await draftsRepo.upsert(db, {
      session_id: 'session-a',
      content: 'first',
      attachments_json: '[]',
      updated_at: '2026-05-07T00:00:00.000Z',
    });

    await expect(draftsRepo.get(db, 'session-a')).resolves.toMatchObject({
      session_id: 'session-a',
      content: 'first',
      attachments_json: '[]',
      created_at: '2026-05-07T00:00:00.000Z',
      updated_at: '2026-05-07T00:00:00.000Z',
    });
  });

  it('updates content and updated_at while preserving created_at', async () => {
    const db = await createMigratedTestDb();
    await draftsRepo.upsert(db, {
      session_id: 'session-a',
      content: 'first',
      updated_at: '2026-05-07T00:00:00.000Z',
    });
    await draftsRepo.upsert(db, {
      session_id: 'session-a',
      content: 'second',
      updated_at: '2026-05-07T00:00:02.000Z',
    });

    await expect(draftsRepo.get(db, 'session-a')).resolves.toMatchObject({
      content: 'second',
      created_at: '2026-05-07T00:00:00.000Z',
      updated_at: '2026-05-07T00:00:02.000Z',
    });
  });

  it('lists drafts by updated_at descending', async () => {
    const db = await createMigratedTestDb();
    await draftsRepo.upsert(db, {
      session_id: 'old',
      content: 'old',
      updated_at: '2026-05-07T00:00:00.000Z',
    });
    await draftsRepo.upsert(db, {
      session_id: 'new',
      content: 'new',
      updated_at: '2026-05-07T00:00:02.000Z',
    });

    const drafts = await draftsRepo.list(db);
    expect(drafts.map((draft) => draft.session_id)).toEqual(['new', 'old']);
  });

  it('deletes drafts', async () => {
    const db = await createMigratedTestDb();
    await draftsRepo.upsert(db, {
      session_id: 'session-a',
      content: 'first',
      updated_at: '2026-05-07T00:00:00.000Z',
    });

    await draftsRepo.del(db, 'session-a');

    await expect(draftsRepo.get(db, 'session-a')).resolves.toBeNull();
  });
});
