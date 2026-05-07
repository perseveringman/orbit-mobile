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
 * TODO(M1): 实现 openDb / getDb / closeDb / transaction
 */

export const __stub__ = true;
