import type { SQLiteDatabaseLike } from '../sqlite';
import { CREATE_RECORDINGS, CREATE_RECORDINGS_INDEXES } from '../schema';

export const version = 2;

export async function up(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_RECORDINGS);
  for (const sql of CREATE_RECORDINGS_INDEXES) {
    await db.execAsync(sql);
  }
}
