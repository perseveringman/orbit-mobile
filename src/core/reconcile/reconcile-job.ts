/**
 * reconcile-job.ts — 启动自愈
 *
 * 冷启动异步扫 wal/ / captures/ / drafts/ / SQLite，对账四处状态。
 * 不得阻塞 UI 首屏（见 ARCHITECTURE.md §7 启动性能预算）。
 *
 * 八种崩溃恢复情形：
 *   1. staging 残留 → 清理
 *   2. rename 中途 → 补齐 .complete
 *   3. SQLite 无记录但有完整目录 → 补记录
 *   4. SQLite 有记录但无目录 → 标 conflicted
 *   5. .complete 在但 manifest 损坏 → dead-letter
 *   6. attachment sha256 不匹配 → dead-letter
 *   7. WAL 未 checkpoint → SQLite 自愈
 *   8. drafts 过期（>30 天）→ GC
 *
 * @see docs/ARCHITECTURE.md §7
 *
 * TODO(M2/M3): runReconcile(opts) 实现
 */

export const __stub__ = true;
