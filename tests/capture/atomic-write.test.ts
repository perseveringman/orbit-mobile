import { describe, expect, it } from 'vitest';

import { createCapture, createTextCapture } from '@/core/capture/atomic-write';
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
      local_path: 'captures/mob_cap_test',
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

  it('copies attachments into the final capture directory and records media metadata', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await fs.writeString('/tmp/audio.m4a', 'audio-bytes');

    const result = await createCapture(
      {
        kind: 'voice',
        content: 'voice transcript',
        attachments: [
          {
            type: 'audio',
            filename: 'audio.m4a',
            localUri: '/tmp/audio.m4a',
            mime: 'audio/m4a',
            byte_size: 11,
            sha256: 'audio-hash',
            transcription: 'voice transcript',
            transcription_source: 'ios-speech',
          },
        ],
      },
      {
        db,
        fs,
        id: 'mob_cap_voice',
        txnId: 'txn_voice',
        now: new Date('2026-05-07T00:00:02.000Z'),
      },
    );

    const captureDir = joinPath(fs.documentDirectory, 'captures', 'mob_cap_voice');
    await expect(fs.readString(joinPath(captureDir, 'audio.m4a'))).resolves.toBe('audio-bytes');
    await expect(capturesRepo.get(db, 'mob_cap_voice')).resolves.toMatchObject({
      kind: 'voice',
      has_audio: 1,
      attachment_count: 1,
    });
    expect(result.manifest.attachments[0]).toMatchObject({
      filename: 'audio.m4a',
      sha256: 'audio-hash',
      transcription_source: 'ios-speech',
    });
  });

  it('rewrites and validates final manifest after directory move for media captures', async () => {
    const db = await createMigratedTestDb();
    const fs = new DropManifestOnMoveFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await fs.writeString('/tmp/photo.jpg', 'image-bytes');

    await createCapture(
      {
        kind: 'photo',
        content: '',
        attachments: [
          {
            type: 'image',
            filename: 'photo.jpg',
            localUri: '/tmp/photo.jpg',
            mime: 'image/jpeg',
            byte_size: 11,
            sha256: 'image-hash',
          },
        ],
      },
      {
        db,
        fs,
        id: 'mob_cap_photo',
        txnId: 'txn_photo',
        now: new Date('2026-05-07T00:00:02.000Z'),
      },
    );

    const captureDir = joinPath(fs.documentDirectory, 'captures', 'mob_cap_photo');
    await expect(fs.getInfo(joinPath(captureDir, 'manifest.json'))).resolves.toMatchObject({
      exists: true,
    });
    await expect(fs.getInfo(joinPath(captureDir, '.complete'))).resolves.toMatchObject({
      exists: true,
    });
    await expect(capturesRepo.get(db, 'mob_cap_photo')).resolves.toMatchObject({
      id: 'mob_cap_photo',
      has_image: 1,
      attachment_count: 1,
    });
  });
});

class DropManifestOnMoveFileSystem extends MemoryFileSystem {
  override async move(from: string, to: string): Promise<void> {
    await super.move(from, to);
    await this.delete(joinPath(to, 'manifest.json'), { idempotent: true });
    await this.delete(joinPath(to, 'manifest.json.sha256'), { idempotent: true });
  }
}
