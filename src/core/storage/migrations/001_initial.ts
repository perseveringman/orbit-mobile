import type { SQLiteDatabaseLike } from '../sqlite';
import {
  CREATE_CAPTURES,
  CREATE_CAPTURES_INDEXES,
  CREATE_DEVICE_INFO,
  CREATE_DRAFTS,
  CREATE_SYNC_EVENTS,
} from '../schema';

export const version = 1;

export async function up(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_CAPTURES);
  for (const sql of CREATE_CAPTURES_INDEXES) {
    await db.execAsync(sql);
  }
  await db.execAsync(CREATE_SYNC_EVENTS);
  await db.execAsync(CREATE_DRAFTS);
  await db.execAsync(CREATE_DEVICE_INFO);
}
