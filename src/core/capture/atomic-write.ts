/**
 * atomic-write.ts — 原子写入协议（五阶段）
 *
 * 五阶段：staging → rename → fsync → SQLite 事务 → 返回用户
 * 用户看到"保存成功"前必须 Layer 2 原子落盘 + SQLite 事务提交。
 * 任何阶段失败：staging 目录清理，SQLite 不写入，用户看到明确错误。
 *
 * @see docs/ARCHITECTURE.md §5
 * @see docs/decisions/ADR-001-local-first-three-layer-storage.md
 *
 * TODO(M2): 五阶段实现 + 崩溃恢复分支
 */

export const __stub__ = true;
