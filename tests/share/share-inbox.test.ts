import { describe, expect, it } from 'vitest';

import { importShareInbox } from '@/core/share/share-inbox';
import * as capturesRepo from '@/core/storage/captures-repo';
import { setValue } from '@/core/storage/device-info';
import { joinPath } from '@/utils/fs';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';

describe('share inbox import', () => {
  it('imports complete App Group share payloads through atomic capture write', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    const shareDir = '/app-group/share-inbox/mob_cap_share';
    await fs.ensureDir(joinPath(shareDir, 'attachments'));
    await fs.writeString(joinPath(shareDir, 'attachments', 'photo-1.jpg'), 'image-bytes');
    await fs.writeString(
      joinPath(shareDir, 'payload.json'),
      JSON.stringify({
        schema_version: 1,
        id: 'mob_cap_share',
        content: 'Shared note',
        url: 'https://example.com',
        attachments: [{ type: 'image', filename: 'photo-1.jpg', mime: 'image/jpeg' }],
      }),
    );
    await fs.writeString(joinPath(shareDir, '.complete'), '');

    await expect(importShareInbox({ db, fs, sharedRoot: '/app-group' })).resolves.toBe(1);
    await expect(capturesRepo.get(db, 'mob_cap_share')).resolves.toMatchObject({
      id: 'mob_cap_share',
      kind: 'mixed',
      has_image: 1,
      attachment_count: 1,
      content_preview: 'Shared note https://example.com',
    });
    await expect(fs.getInfo(shareDir)).resolves.toMatchObject({ exists: false });
  });

  it('continues importing other shares when one completed payload is invalid', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');

    const badDir = '/app-group/share-inbox/bad_payload';
    await fs.ensureDir(badDir);
    await fs.writeString(joinPath(badDir, 'payload.json'), '{bad json');
    await fs.writeString(joinPath(badDir, '.complete'), '');

    const goodDir = '/app-group/share-inbox/mob_cap_good_share';
    await fs.ensureDir(joinPath(goodDir, 'attachments'));
    await fs.writeString(
      joinPath(goodDir, 'payload.json'),
      JSON.stringify({
        schema_version: 1,
        id: 'mob_cap_good_share',
        content: 'Still import me',
        url: null,
        attachments: [],
      }),
    );
    await fs.writeString(joinPath(goodDir, '.complete'), '');

    await expect(importShareInbox({ db, fs, sharedRoot: '/app-group' })).resolves.toBe(1);
    await expect(capturesRepo.get(db, 'mob_cap_good_share')).resolves.toMatchObject({
      id: 'mob_cap_good_share',
      content_preview: 'Still import me',
    });
    await expect(fs.getInfo(badDir)).resolves.toMatchObject({ exists: false });
    await expect(fs.getInfo('/app-group/share-inbox-failed/bad_payload/.failed.json')).resolves.toMatchObject({
      exists: true,
    });
  });
});
