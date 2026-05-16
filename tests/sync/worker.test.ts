import { describe, expect, it } from 'vitest';

import * as capturesRepo from '@/core/storage/captures-repo';
import * as aiTasksRepo from '@/core/storage/ai-tasks-repo';
import * as eventsRepo from '@/core/storage/events-repo';
import type {
  AckInfo,
  ICloudTransport,
  RemoteFailureInfo,
  UploadResult,
} from '@/core/sync/icloud-transport';
import { runSyncTick } from '@/core/sync/worker';
import type { CaptureRow } from '@/types/capture';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { captureInput } from '../storage/test-helpers';

class FakeTransport implements ICloudTransport {
  available = true;
  uploads: string[] = [];
  clearedFailures: string[] = [];
  ack: AckInfo | null = null;
  failure: RemoteFailureInfo | null = null;

  getContainerStatus() {
    return this.available
      ? Promise.resolve({ available: true, rootPath: '/icloud' })
      : Promise.resolve({ available: false, reason: 'not_signed_in' as const });
  }

  uploadCapture(capture: CaptureRow): Promise<UploadResult> {
    this.uploads.push(capture.id);
    return Promise.resolve({ remotePath: `inbox/${capture.id}`, uploaded: true });
  }

  clearFailure(captureId: string): Promise<void> {
    this.clearedFailures.push(captureId);
    return Promise.resolve();
  }

  readAck() {
    return Promise.resolve(this.ack);
  }

  readFailure() {
    return Promise.resolve(this.failure);
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
    expect(transport.clearedFailures).toEqual(['mob_cap_sync']);
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

  it('defers recording upload while automatic AI notes are still pending', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    await capturesRepo.insert(db, captureInput('mob_cap_recording_ai', {
      kind: 'recording',
      local_path: '/local/recording',
    }));
    await aiTasksRepo.enqueue(db, {
      capture_id: 'mob_cap_recording_ai',
      kind: 'recording_notes',
      input_hash: 'hash',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    });

    const deferred = await runSyncTick({ db, transport, now: new Date('2026-05-15T00:00:00.000Z') });
    expect(deferred).toMatchObject({ processed: 0, uploaded: 0 });
    expect(transport.uploads).toEqual([]);

    const task = await aiTasksRepo.getByCapture(db, 'mob_cap_recording_ai');
    await aiTasksRepo.markFailed(db, task?.id ?? '', 'boom', {
      terminal: true,
      now: '2026-05-15T00:01:00.000Z',
    });

    const uploaded = await runSyncTick({ db, transport, now: new Date('2026-05-15T00:02:00.000Z') });
    expect(uploaded).toMatchObject({ processed: 1, uploaded: 1 });
    expect(transport.uploads).toEqual(['mob_cap_recording_ai']);
  });

  it('marks uploaded captures acked and lets ack win over stale remote failure', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    transport.ack = {
      schema_version: 2,
      acked_at: '2026-05-15T00:10:00.000Z',
      artifact_kind: 'note',
      note_id: 'note-mob_cap_ack',
      note_path: 'notes/thoughts/mobile-ack.md',
      timeline_event_id: 'mobile-capture-note:mob_cap_ack',
      vault_path: '/vault',
    };
    transport.failure = {
      error_code: 'sha256_mismatch',
      error_message: 'old failed state',
      retryable: true,
    };
    await capturesRepo.insert(db, captureInput('mob_cap_ack', {
      local_path: '/local/mob_cap_ack',
      sync_state: 'uploaded',
    }));

    const result = await runSyncTick({ db, transport, now: new Date('2026-05-15T00:11:00.000Z') });

    const row = await capturesRepo.get(db, 'mob_cap_ack');
    expect(result).toMatchObject({ processed: 1, acked: 1, failed: 0 });
    expect(row).toMatchObject({
      sync_state: 'acked',
      acked_at: '2026-05-15T00:10:00.000Z',
      ack_vault_path: 'notes/thoughts/mobile-ack.md',
      sync_last_error: null,
    });
  });

  it('stores Library item paths from Mac ACK v2', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    transport.ack = {
      schema_version: 2,
      acked_at: '2026-05-17T00:10:00.000Z',
      artifact_kind: 'library_item',
      library_item_id: 'lib-mob_cap_share',
      library_item_path: 'library/articles/mobile-share.md',
      timeline_event_id: 'mobile-capture-library:mob_cap_share',
      vault_path: '/vault',
    };
    await capturesRepo.insert(db, captureInput('mob_cap_share', {
      local_path: '/local/mob_cap_share',
      sync_state: 'uploaded',
    }));

    const result = await runSyncTick({ db, transport, now: new Date('2026-05-17T00:11:00.000Z') });

    const row = await capturesRepo.get(db, 'mob_cap_share');
    expect(result).toMatchObject({ processed: 1, acked: 1, failed: 0 });
    expect(row).toMatchObject({
      sync_state: 'acked',
      acked_at: '2026-05-17T00:10:00.000Z',
      ack_vault_path: 'library/articles/mobile-share.md',
    });
  });

  it('applies non-retryable Mac failures as conflicted', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    transport.failure = {
      error_code: 'unsupported_schema_version',
      error_message: 'upgrade desktop Orbit',
      retryable: false,
    };
    await capturesRepo.insert(db, captureInput('mob_cap_rejected', {
      local_path: '/local/rejected',
      sync_state: 'uploaded',
    }));

    const result = await runSyncTick({ db, transport, now: new Date('2026-05-15T00:12:00.000Z') });

    const row = await capturesRepo.get(db, 'mob_cap_rejected');
    expect(result).toMatchObject({ processed: 1, conflicted: 1 });
    expect(row).toMatchObject({
      sync_state: 'conflicted',
      sync_last_error: 'upgrade desktop Orbit',
      sync_next_retry_at: null,
    });
  });

  it('clears stale retryable Mac failure before re-uploading due failed captures', async () => {
    const db = await createMigratedTestDb();
    const transport = new FakeTransport();
    transport.failure = {
      error_code: 'sha256_mismatch',
      error_message: 'old failed copy',
      retryable: true,
    };
    await capturesRepo.insert(db, captureInput('mob_cap_retry', {
      local_path: '/local/retry',
      sync_state: 'failed',
      sync_next_retry_at: '2026-05-15T00:00:00.000Z',
    }));

    const result = await runSyncTick({ db, transport, now: new Date('2026-05-15T00:01:00.000Z') });

    const row = await capturesRepo.get(db, 'mob_cap_retry');
    expect(result).toMatchObject({ processed: 1, uploaded: 1, failed: 0 });
    expect(transport.clearedFailures).toEqual(['mob_cap_retry']);
    expect(transport.uploads).toEqual(['mob_cap_retry']);
    expect(row).toMatchObject({ sync_state: 'uploaded', sync_last_error: null });
  });
});
