/**
 * logger.ts — ndjson 日志（按天 rotate）
 *
 * 追加写 Documents/logs/sync-YYYY-MM-DD.ndjson。
 *
 * ⚠️ 已知缺陷：expo-file-system 当前无 append API，需读-拼-写
 * （O(n²)）。M3 前必须换实现（expo-file-system-next 或自写 native）。
 *
 * TODO(M1): logger.{debug,info,warn,error}
 * TODO(M3): 真正的 append 实现
 */

export const __stub__ = true;
