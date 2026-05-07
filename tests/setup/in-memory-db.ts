import Database from 'better-sqlite3';

import { runMigrations } from '@/core/storage/migrations';
import type {
  SQLiteDatabaseLike,
  SQLiteRunResultLike,
  SQLiteValue,
} from '@/core/storage/sqlite';

type BetterSqliteDatabase = ReturnType<typeof Database>;

export interface TestDb extends SQLiteDatabaseLike {
  readonly raw: BetterSqliteDatabase;
}

export function createTestDb(): TestDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');

  return {
    raw,
    execAsync(sql: string) {
      raw.exec(sql);
      return Promise.resolve();
    },
    runAsync(sql: string, params: SQLiteValue[] = []): Promise<SQLiteRunResultLike> {
      const result = raw.prepare(sql).run(...params);
      return Promise.resolve({
        changes: result.changes,
        lastInsertRowId: Number(result.lastInsertRowid),
      });
    },
    getFirstAsync<T>(sql: string, params: SQLiteValue[] = []): Promise<T | null> {
      return Promise.resolve((raw.prepare(sql).get(...params) as T | undefined) ?? null);
    },
    getAllAsync<T>(sql: string, params: SQLiteValue[] = []): Promise<T[]> {
      return Promise.resolve(raw.prepare(sql).all(...params) as T[]);
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (error) {
        if (raw.inTransaction) {
          raw.exec('ROLLBACK');
        }
        throw error;
      }
    },
    closeAsync() {
      raw.close();
      return Promise.resolve();
    },
  };
}

export async function createMigratedTestDb(): Promise<TestDb> {
  const db = createTestDb();
  await runMigrations(db);
  return db;
}
