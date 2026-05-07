import { describe, expect, it } from 'vitest';

import { createTextCapture } from '@/core/capture/atomic-write';
import { runReconcile } from '@/core/reconcile/reconcile-job';
import * as capturesRepo from '@/core/storage/captures-repo';
import { setValue } from '@/core/storage/device-info';
import { joinPath } from '@/utils/fs';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';

describe('reconcile job', () => {
  it('backfills sqlite from a complete capture left after rename', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');

    await expect(
      createTextCapture(
        { content: 'recover me' },
        {
          db,
          fs,
          id: 'mob_cap_recover',
          txnId: 'txn_recover',
          now: new Date('2026-05-07T00:00:02.000Z'),
          fault: 'after_complete',
        },
      ),
    ).rejects.toThrow('fault.after_complete');

    await expect(capturesRepo.get(db, 'mob_cap_recover')).resolves.toBeNull();
    await expect(runReconcile({ db, fs })).resolves.toMatchObject({ walRecovered: 1 });
    await expect(capturesRepo.get(db, 'mob_cap_recover')).resolves.toMatchObject({
      id: 'mob_cap_recover',
      content_preview: 'recover me',
    });
  });

  it('moves incomplete capture directories to dead-letter', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    const captureDir = joinPath(fs.documentDirectory, 'captures', 'mob_cap_bad');
    await fs.ensureDir(captureDir);
    await fs.writeString(joinPath(captureDir, 'manifest.json'), '{}');

    await expect(runReconcile({ db, fs })).resolves.toMatchObject({ deadLettered: 1 });
    await expect(fs.getInfo(joinPath(fs.documentDirectory, 'dead-letter', 'mob_cap_bad'))).resolves.toMatchObject({
      exists: true,
    });
  });

  it('marks sqlite rows conflicted when their local capture directory is incomplete', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    const captureDir = joinPath(fs.documentDirectory, 'captures', 'mob_cap_missing_manifest');
    await fs.ensureDir(captureDir);
    await fs.writeString(joinPath(captureDir, '.complete'), '');
    await capturesRepo.insert(db, {
      id: 'mob_cap_missing_manifest',
      created_at: '2026-05-07T00:00:02.000Z',
      captured_at_local: '2026-05-07T08:00:02.000+08:00',
      kind: 'photo',
      content_preview: '',
      content_hash: 'missing',
      byte_size: 0,
      has_image: true,
      attachment_count: 1,
      local_path: captureDir,
      sync_state: 'uploaded',
    });

    await expect(runReconcile({ db, fs })).resolves.toMatchObject({ localConflicted: 1 });
    await expect(capturesRepo.get(db, 'mob_cap_missing_manifest')).resolves.toMatchObject({
      sync_state: 'conflicted',
      sync_last_error: 'local_capture_incomplete',
    });
  });
});
