import type { SQLiteDatabaseLike } from '../sqlite';

export const version = 5;

export async function up(db: SQLiteDatabaseLike): Promise<void> {
  await db.runAsync(
    `UPDATE captures
     SET local_path = 'captures/' || id
     WHERE local_path <> 'captures/' || id`,
  );
}
