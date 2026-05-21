import { describe, expect, it } from 'vitest';

import { runMigrations, type Migration } from '@/core/storage/migrations';
import * as capturesRepo from '@/core/storage/captures-repo';
import { createTestDb } from '../setup/in-memory-db';
import { captureInput } from './test-helpers';

describe('storage migrations', () => {
  it('creates all M1 tables and writes schema_version', async () => {
    const db = createTestDb();
    await runMigrations(db);

    const schema = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    expect(schema.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'captures',
        'ai_tasks',
        'device_info',
        'drafts',
        'recording_annotations',
        'recordings',
        'sync_events',
      ]),
    );

    const version = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM device_info WHERE key = 'schema_version'`,
    );
    expect(version?.value).toBe('5');
  });

  it('is idempotent for an already migrated database', async () => {
    const db = createTestDb();
    await runMigrations(db);
    await runMigrations(db);

    const rows = await db.getAllAsync<{ value: string }>(
      `SELECT value FROM device_info WHERE key = 'schema_version'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('5');
  });

  it('normalizes legacy absolute capture local paths', async () => {
    const db = createTestDb();
    await runMigrations(db);
    await capturesRepo.insert(db, captureInput('mob_cap_legacy_path', {
      local_path: 'file:///var/mobile/Containers/Data/Application/OLD/Documents/captures/mob_cap_legacy_path',
    }));
    await db.runAsync(`UPDATE device_info SET value = '4' WHERE key = 'schema_version'`);

    await runMigrations(db);

    await expect(capturesRepo.get(db, 'mob_cap_legacy_path')).resolves.toMatchObject({
      local_path: 'captures/mob_cap_legacy_path',
    });
  });

  it('rolls back a failed migration without leaving dirty tables or schema_version', async () => {
    const db = createTestDb();
    const failingMigration: Migration = {
      version: 1,
      async up(txn) {
        await txn.execAsync(`CREATE TABLE dirty_table (id TEXT PRIMARY KEY);`);
        throw new Error('boom');
      },
    };

    await expect(runMigrations(db, [failingMigration])).rejects.toThrow('boom');

    const dirty = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dirty_table'`,
    );
    const version = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM device_info WHERE key = 'schema_version'`,
    );
    expect(dirty).toBeNull();
    expect(version).toBeNull();
  });
});
