/**
 * events-repo.ts — sync_events 表 CRUD
 *
 * 同步生命周期事件日志。M1 仅实现 append / listByCapture / listRecent；
 * gc 的 keepPerCapture（窗口函数）留给 M3，先实现 olderThanDays 一刀。
 *
 * @see docs/DATA-MODEL.md §1.2, §5.2
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 8
 *
 * TODO(M1): append / listByCapture / listRecent / gc(olderThanDays)
 * TODO(M3): gc(keepPerCapture) 窗口函数实现
 */

export const __stub__ = true;
