/**
 * worker.ts — SyncWorker 主循环
 *
 * 后台 poll SQLite captures 表，扫 pending/failed 记录，驱动 iCloud Transport。
 * 退避策略见 backoff.ts；状态转换见 state-machine.ts。
 *
 * @see docs/SYNC-PROTOCOL.md
 * @see docs/ARCHITECTURE.md §6
 *
 * TODO(M3): start / stop / tick / processOne
 */

export const __stub__ = true;
