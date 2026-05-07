import { describe, expect, it } from 'vitest';

import { createTextCapture } from '@/core/capture/atomic-write';
import * as capturesRepo from '@/core/storage/captures-repo';
import * as eventsRepo from '@/core/storage/events-repo';
import { setValue } from '@/core/storage/device-info';
import { joinPath } from '@/utils/fs';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';

describe('atomic write', () => {
  it('writes manifest, sha256, complete marker, sqlite row, and created event', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');

    const result = await createTextCapture(
      { content: 'hello orbit', inputStartedAt: '2026-05-07T00:00:00.000Z' },
      {
        db,
        fs,
        id: 'mob_cap_test',
        txnId: 'txn_1',
        now: new Date('2026-05-07T00:00:02.000Z'),
      },
    );

    const captureDir = joinPath(fs.documentDirectory, 'captures', 'mob_cap_test');
    await expect(fs.getInfo(joinPath(captureDir, 'manifest.json'))).resolves.toMatchObject({
      exists: true,
    });
    await expect(fs.getInfo(joinPath(captureDir, '.complete'))).resolves.toMatchObject({
      exists: true,
    });
    await expect(fs.getInfo(joinPath(fs.documentDirectory, 'wal', 'txn_1.ndjson'))).resolves.toMatchObject({
      exists: false,
    });
    await expect(capturesRepo.get(db, 'mob_cap_test')).resolves.toMatchObject({
      id: 'mob_cap_test',
      sync_state: 'pending',
      content_preview: 'hello orbit',
      content_hash: result.manifestSha256,
    });
    await expect(eventsRepo.listByCapture(db, 'mob_cap_test')).resolves.toHaveLength(1);
    expect(fs.fsynced).toContain(joinPath(fs.documentDirectory, 'wal', 'txn_1.ndjson'));
    expect(fs.fsynced).toContain(captureDir);
  });

  it('cleans staging and leaves no sqlite row when failing before rename', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');

    await expect(
      createTextCapture(
        { content: 'boom' },
        {
          db,
          fs,
          id: 'mob_cap_fail',
          txnId: 'txn_fail',
          now: new Date('2026-05-07T00:00:02.000Z'),
          fault: 'after_staging_manifest',
        },
      ),
    ).rejects.toThrow('fault.after_staging_manifest');

    await expect(fs.getInfo(joinPath(fs.documentDirectory, 'captures', '.staging', 'txn_fail'))).resolves.toMatchObject({
      exists: false,
    });
    await expect(capturesRepo.get(db, 'mob_cap_fail')).resolves.toBeNull();
  });
});
