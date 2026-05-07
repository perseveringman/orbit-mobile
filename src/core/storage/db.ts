/**
 * db.ts — SQLite 开库 + migration 框架入口
 *
 * Layer 2 持久层的总入口：openDb / getDb / closeDb / transaction。
 * 所有 repo 不直接调 getDb，而是接收 SQLiteDatabase 参数（便于测试注入）。
 *
 * @see docs/ARCHITECTURE.md §8
 * @see docs/DATA-MODEL.md §1
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 5
 *
 */

import * as SQLite from 'expo-sqlite';
import type { SQLiteBindParams } from 'expo-sqlite';

import { generateDeviceId } from '../../utils/id';
import { getOrInit } from './device-info';
import { runMigrations } from './migrations';
import type { SQLiteDatabaseLike, SQLiteValue } from './sqlite';

export const DB_NAME = 'orbit.db';

let dbInstance: SQLiteDatabaseLike | null = null;
let dbOpenPromise: Promise<SQLiteDatabaseLike> | null = null;

function bindParams(params: SQLiteValue[]): SQLiteBindParams {
  return params;
}

function toDatabaseLike(db: SQLite.SQLiteDatabase): SQLiteDatabaseLike {
  const executor: SQLiteDatabaseLike = {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params = []) => db.runAsync(source, bindParams(params)),
    getFirstAsync: <T>(source: string, params: SQLiteValue[] = []) =>
      db.getFirstAsync<T>(source, bindParams(params)),
    getAllAsync: <T>(source: string, params: SQLiteValue[] = []) =>
      db.getAllAsync<T>(source, bindParams(params)),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
    closeAsync: () => db.closeAsync(),
  };

  executor.withExclusiveTransactionAsync = async (task) => {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await task(toDatabaseLike(txn));
    });
  };

  return executor;
}

export async function openDb(): Promise<SQLiteDatabaseLike> {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = (async () => {
    const sqliteDb = await SQLite.openDatabaseAsync(DB_NAME);
    const db = toDatabaseLike(sqliteDb);
    await db.execAsync(`PRAGMA journal_mode = WAL;`);
    await db.execAsync(`PRAGMA foreign_keys = ON;`);
    await runMigrations(db);
    await getOrInit(db, 'device_id', generateDeviceId);
    dbInstance = db;
    return db;
  })();

  try {
    return await dbOpenPromise;
  } catch (error) {
    dbOpenPromise = null;
    throw error;
  }
}

export function getDb(): SQLiteDatabaseLike {
  if (!dbInstance) {
    throw new Error('storage.db_not_opened');
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (!dbInstance) {
    dbOpenPromise = null;
    return;
  }

  await dbInstance.closeAsync?.();
  dbInstance = null;
  dbOpenPromise = null;
}

export async function transaction<T>(
  fn: (db: SQLiteDatabaseLike) => Promise<T>,
): Promise<T> {
  const db = getDb();
  let didRun = false;
  let result!: T;

  if (db.withExclusiveTransactionAsync) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      result = await fn(txn);
      didRun = true;
    });
  } else {
    await db.withTransactionAsync(async () => {
      result = await fn(db);
      didRun = true;
    });
  }

  if (!didRun) {
    throw new Error('storage.transaction_not_executed');
  }
  return result;
}
