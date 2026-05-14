import { describe, expect, it } from 'vitest';

import { runMigrations, type Migration } from '@/core/storage/migrations';
import { createTestDb } from '../setup/in-memory-db';

describe('storage migrations', () => {
  it('creates all M1 tables and writes schema_version', async () => {
    const db = createTestDb();
    await runMigrations(db);

    const schema = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    expect(schema.map((row) => row.name)).toEqual(
      expect.arrayContaining(['captures', 'device_info', 'drafts', 'recordings', 'sync_events']),
    );

    const version = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM device_info WHERE key = 'schema_version'`,
    );
    expect(version?.value).toBe('2');
  });

  it('is idempotent for an already migrated database', async () => {
    const db = createTestDb();
    await runMigrations(db);
    await runMigrations(db);

    const rows = await db.getAllAsync<{ value: string }>(
      `SELECT value FROM device_info WHERE key = 'schema_version'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('2');
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
