import { describe, expect, it } from 'vitest';

import { writeWidgetSnapshot } from '@/core/widget/snapshot';
import * as capturesRepo from '@/core/storage/captures-repo';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';

describe('widget snapshot', () => {
  it('writes the latest three captures to the App Group snapshot', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();

    for (let index = 1; index <= 4; index += 1) {
      await capturesRepo.insert(db, {
        id: `mob_cap_${index}`,
        created_at: `2026-05-14T10:0${index}:00.000Z`,
        captured_at_local: `2026-05-14T18:0${index}:00+08:00`,
        kind: index === 4 ? 'voice' : 'thought',
        content_preview: index === 3 ? '' : `Capture ${index}`,
        content_hash: `hash-${index}`,
        byte_size: 10,
        local_path: `/documents/captures/mob_cap_${index}`,
      });
    }

    await writeWidgetSnapshot(db, { fs, sharedRoot: '/app-group' });

    const snapshot = JSON.parse(await fs.readString('/app-group/widget/recent.json')) as {
      items: Array<{ id: string; title: string }>;
    };
    expect(snapshot.items.map((item) => ({ id: item.id, title: item.title }))).toEqual([
      { id: 'mob_cap_4', title: 'Capture 4' },
      { id: 'mob_cap_3', title: '文字记录' },
      { id: 'mob_cap_2', title: 'Capture 2' },
    ]);
  });
});
