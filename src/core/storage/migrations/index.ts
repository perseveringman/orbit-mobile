/**
 * migrations/index.ts — migration runner
 *
 * 规则：
 * - schema_version 存在 device_info KV 表
 * - 每个 migration 在单事务里
 * - MIGRATIONS 数组只追加不改写（老版本 app 仍在跑）
 *
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 4.4
 *
 */

import { CREATE_DEVICE_INFO, SCHEMA_VERSION } from '../schema';
import type { SQLiteDatabaseLike } from '../sqlite';
import * as initial from './001_initial';
import * as recordings from './002_recordings';
import * as recordingAnnotations from './003_recording_annotations';

export interface Migration {
  version: number;
  up(db: SQLiteDatabaseLike): Promise<void>;
}

const MIGRATIONS: readonly Migration[] = [initial, recordings, recordingAnnotations];

export async function runMigrations(
  db: SQLiteDatabaseLike,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
  await db.execAsync(CREATE_DEVICE_INFO);

  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM device_info WHERE key = 'schema_version'`,
  );
  const current = row ? Number.parseInt(row.value, 10) : 0;

  for (const migration of migrations) {
    if (migration.version <= current) {
      continue;
    }

    const runOne = async (txn: SQLiteDatabaseLike) => {
      await migration.up(txn);
      await txn.runAsync(
        `INSERT INTO device_info (key, value, updated_at)
         VALUES ('schema_version', ?, ?)
         ON CONFLICT(key) DO UPDATE
         SET value = excluded.value, updated_at = excluded.updated_at`,
        [String(migration.version), new Date().toISOString()],
      );
    };

    if (db.withExclusiveTransactionAsync) {
      await db.withExclusiveTransactionAsync(runOne);
    } else {
      await db.withTransactionAsync(async () => runOne(db));
    }
  }

  const latest = migrations.at(-1)?.version ?? SCHEMA_VERSION;
  if (latest !== SCHEMA_VERSION) {
    throw new Error(`storage.schema_version_mismatch:${latest}:${SCHEMA_VERSION}`);
  }
}
