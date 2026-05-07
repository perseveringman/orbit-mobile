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

// TODO(M2): move device_id initialization after first paint once UI exists.
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
  await setValue(db, key, value);
  return value;
}
