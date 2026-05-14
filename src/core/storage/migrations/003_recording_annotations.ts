import type { SQLiteDatabaseLike } from '../sqlite';
import {
  CREATE_RECORDING_ANNOTATIONS,
  CREATE_RECORDING_ANNOTATIONS_INDEXES,
} from '../schema';

export const version = 3;

export async function up(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_RECORDING_ANNOTATIONS);
  for (const sql of CREATE_RECORDING_ANNOTATIONS_INDEXES) {
    await db.execAsync(sql);
  }
}
