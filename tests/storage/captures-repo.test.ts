import { describe, expect, it } from 'vitest';

import * as capturesRepo from '@/core/storage/captures-repo';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { captureInput } from './test-helpers';

describe('captures repo', () => {
  it('inserts and reads a capture with default sync metadata', async () => {
    const db = await createMigratedTestDb();

    await capturesRepo.insert(db, captureInput('mob_cap_a', { has_audio: true }));
    const row = await capturesRepo.get(db, 'mob_cap_a');

    expect(row).toMatchObject({
      id: 'mob_cap_a',
      kind: 'thought',
      content_hash: 'hash-mob_cap_a',
      has_audio: 1,
      has_image: 0,
      sync_state: 'pending',
      sync_attempts: 0,
      deleted_locally: 0,
    });
  });

  it('lists captures by created_at descending and hides soft-deleted rows by default', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(
      db,
      captureInput('mob_cap_old', { created_at: '2026-05-06T00:00:00.000Z' }),
    );
    await capturesRepo.insert(
      db,
      captureInput('mob_cap_new', { created_at: '2026-05-07T00:00:00.000Z' }),
    );
    await capturesRepo.markDeleted(db, 'mob_cap_new');

    await expect(capturesRepo.list(db)).resolves.toEqual([
      expect.objectContaining({ id: 'mob_cap_old' }),
    ]);
    await expect(capturesRepo.list(db, { includeDeleted: true })).resolves.toEqual([
      expect.objectContaining({ id: 'mob_cap_new' }),
      expect.objectContaining({ id: 'mob_cap_old' }),
    ]);
  });

  it('lists captures by sync state and retry due time', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(
      db,
      captureInput('mob_cap_due', {
        sync_state: 'failed',
        sync_next_retry_at: '2026-05-07T00:00:00.000Z',
      }),
    );
    await capturesRepo.insert(
      db,
      captureInput('mob_cap_later', {
        sync_state: 'failed',
        sync_next_retry_at: '2026-05-09T00:00:00.000Z',
      }),
    );
    await capturesRepo.insert(db, captureInput('mob_cap_pending'));

    const failed = await capturesRepo.listByState(db, 'failed', {
      dueBefore: '2026-05-08T00:00:00.000Z',
    });
    const pending = await capturesRepo.listByState(db, 'pending');

    expect(failed.map((row) => row.id)).toEqual(['mob_cap_due']);
    expect(pending.map((row) => row.id)).toEqual(['mob_cap_pending']);
  });

  it('updates sync state with whitelisted columns only', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(db, captureInput('mob_cap_patch'));

    await capturesRepo.updateSyncState(db, 'mob_cap_patch', {
      sync_state: 'uploaded',
      sync_attempts: 1,
      uploaded_at: '2026-05-07T00:00:00.000Z',
    });
    await expect(capturesRepo.get(db, 'mob_cap_patch')).resolves.toMatchObject({
      sync_state: 'uploaded',
      sync_attempts: 1,
      uploaded_at: '2026-05-07T00:00:00.000Z',
    });

    await expect(
      capturesRepo.updateSyncState(db, 'mob_cap_patch', {
        local_path: 'bad',
      } as unknown as capturesRepo.SyncStatePatch),
    ).rejects.toThrow('invalid_column');
  });

  it('counts non-deleted captures by sync state', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(db, captureInput('mob_cap_pending'));
    await capturesRepo.insert(db, captureInput('mob_cap_failed', { sync_state: 'failed' }));
    await capturesRepo.insert(db, captureInput('mob_cap_deleted', { sync_state: 'failed' }));
    await capturesRepo.markDeleted(db, 'mob_cap_deleted');

    await expect(capturesRepo.countByState(db)).resolves.toMatchObject({
      pending: 1,
      failed: 1,
      uploaded: 0,
    });
  });
});
