import { describe, expect, it } from 'vitest';

import * as capturesRepo from '@/core/storage/captures-repo';
import * as eventsRepo from '@/core/storage/events-repo';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { captureInput } from './test-helpers';

describe('sync events repo', () => {
  it('appends and lists events for a capture in reverse time order', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(db, captureInput('mob_cap_events'));
    await eventsRepo.append(
      db,
      'mob_cap_events',
      'created',
      { local: true },
      '2026-05-07T00:00:00.000Z',
    );
    await eventsRepo.append(
      db,
      'mob_cap_events',
      'uploaded',
      undefined,
      '2026-05-07T00:00:02.000Z',
    );

    const events = await eventsRepo.listByCapture(db, 'mob_cap_events');
    expect(events.map((event) => event.event)).toEqual(['uploaded', 'created']);
    expect(events[1]?.details_json).toBe(JSON.stringify({ local: true }));
  });

  it('lists recent events with a limit', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(db, captureInput('mob_cap_recent'));
    for (let index = 0; index < 10; index += 1) {
      await eventsRepo.append(
        db,
        'mob_cap_recent',
        'failed',
        { index },
        `2026-05-07T00:00:0${index}.000Z`,
      );
    }

    const recent = await eventsRepo.listRecent(db, { limit: 5 });
    expect(recent).toHaveLength(5);
    expect(recent[0]?.details_json).toBe(JSON.stringify({ index: 9 }));
  });

  it('garbage collects events older than the configured age', async () => {
    const db = await createMigratedTestDb();
    await capturesRepo.insert(db, captureInput('mob_cap_gc'));
    const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await eventsRepo.append(db, 'mob_cap_gc', 'failed', undefined, oldTimestamp);
    await eventsRepo.append(db, 'mob_cap_gc', 'retried', undefined, new Date().toISOString());

    const result = await eventsRepo.gc(db, { olderThanDays: 30 });
    const remaining = await eventsRepo.listByCapture(db, 'mob_cap_gc');

    expect(result.deleted).toBe(1);
    expect(remaining.map((event) => event.event)).toEqual(['retried']);
  });

  it('keeps keepPerCapture unimplemented until M3', async () => {
    const db = await createMigratedTestDb();
    await expect(eventsRepo.gc(db, { keepPerCapture: 20 })).rejects.toThrow(
      'keep_per_capture_not_implemented',
    );
  });
});
