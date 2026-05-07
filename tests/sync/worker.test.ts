import { describe, expect, it } from 'vitest';

import * as capturesRepo from '@/core/storage/captures-repo';
import * as eventsRepo from '@/core/storage/events-repo';
import type { ICloudTransport, UploadResult } from '@/core/sync/icloud-transport';
import { runSyncTick } from '@/core/sync/worker';
import type { CaptureRow } from '@/types/capture';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { captureInput } from '../storage/test-helpers';

class FakeTransport implements ICloudTransport {
  available = true;
  uploads: string[] = [];

  getContainerStatus() {
    return this.available
      ? Promise.resolve({ available: true, rootPath: '/icloud' })
      : Promise.resolve({ available: false, reason: 'not_signed_in' as const });
  }

  uploadCapture(capture: CaptureRow): Promise<UploadResult> {
    this.uploads.push(capture.id);
    return Promise.resolve({ remotePath: `inbox/${capture.id}`, uploaded: true });
  }

  readAck() {
    return Promise.resolve(null);
  }

  readFailure() {
    return Promise.resolve(null);
  }
}

describe('sync worker', () => {
  it('uploads pending captures and records sync events', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    await capturesRepo.insert(db, captureInput('mob_cap_sync', { local_path: '/local/mob_cap_sync' }));

    const result = await runSyncTick({
      db,
      transport,
      now: new Date('2026-05-07T00:00:00.000Z'),
    });

    const row = await capturesRepo.get(db, 'mob_cap_sync');
    const events = await eventsRepo.listByCapture(db, 'mob_cap_sync');
    expect(result).toMatchObject({ processed: 1, uploaded: 1, failed: 0 });
    expect(transport.uploads).toEqual(['mob_cap_sync']);
    expect(row).toMatchObject({
      sync_state: 'uploaded',
      sync_attempts: 1,
      sync_last_error: null,
    });
    expect(events.map((event) => event.event)).toEqual(['uploaded', 'started']);
  });

  it('keeps local data and retries when iCloud is unavailable', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    transport.available = false;
    await capturesRepo.insert(db, captureInput('mob_cap_offline', { local_path: '/local/offline' }));

    const result = await runSyncTick({
      db,
      transport,
      now: new Date('2026-05-07T00:00:00.000Z'),
    });

    const row = await capturesRepo.get(db, 'mob_cap_offline');
    expect(result).toMatchObject({ processed: 1, uploaded: 0, failed: 1 });
    expect(row).toMatchObject({
      sync_state: 'failed',
      sync_attempts: 1,
      sync_last_error: 'icloud_unavailable:not_signed_in',
      sync_next_retry_at: '2026-05-07T00:00:00.000Z',
    });
  });
});
