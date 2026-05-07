/**
 * migrations/index.ts — migration runner
 *
 * 规则：
 * - schema_version 存在 device_info KV 表
 * - 每个 migration 在单事务里
 * - MIGRATIONS 数组只追加不改写（老版本 app 仍在跑）
 *
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 4.4
 *
 * TODO(M1): runMigrations(db) 实现
 */

export const __stub__ = true;
