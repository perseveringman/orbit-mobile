import type { SQLiteDatabaseLike } from './sqlite';

export async function getValue(db: SQLiteDatabaseLike, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM device_info WHERE key = ?`,
    [key],
  );
  return row?.value ?? null;
}

export async function setValue(db: SQLiteDatabaseLike, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO device_info (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE
     SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()],
  );
}

export async function getOrInit(
  db: SQLiteDatabaseLike,
  key: string,
  init: () => string | Promise<string>,
): Promise<string> {
  const existing = await getValue(db, key);
  if (existing) {
    return existing;
  }

  const value = await init();
  await db.runAsync(
    `INSERT OR IGNORE INTO device_info (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, value, new Date().toISOString()],
  );
  const stored = await getValue(db, key);
  if (!stored) {
    throw new Error(`device_info.init_failed:${key}`);
  }
  return stored;
}
