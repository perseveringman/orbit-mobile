import type { SQLiteDatabaseLike } from '../sqlite';
import { CREATE_AI_TASKS, CREATE_AI_TASKS_INDEXES } from '../schema';

export const version = 4;

export async function up(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_AI_TASKS);
  for (const sql of CREATE_AI_TASKS_INDEXES) {
    await db.execAsync(sql);
  }
}
