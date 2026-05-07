/**
 * state-machine.ts — 同步状态机
 *
 * 状态：pending → syncing → uploaded → acked
 * 失败分支：syncing/uploaded → failed（可重试）/ conflicted（等用户介入）
 *
 * @see docs/SYNC-PROTOCOL.md §4
 * @see docs/DATA-MODEL.md §1.1 sync_state 字段
 *
 * TODO(M3): transitions 表 + canTransition / applyTransition
 */

export const __stub__ = true;
