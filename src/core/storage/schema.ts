/**
 * schema.ts — 建表 SQL 字符串常量
 *
 * DATA-MODEL.md §1 是数据契约的唯一来源，本文件把那份 SQL 原文搬进代码。
 * 所有 CREATE TABLE / CREATE INDEX 都加 IF NOT EXISTS（幂等）。
 *
 * @see docs/DATA-MODEL.md §1.1–1.4
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 4
 *
 * TODO(M1): 从 DATA-MODEL.md §1 填入完整 SQL 常量
 */

export const SCHEMA_VERSION = 1;

// TODO(M1): 搬 DATA-MODEL.md §1.1 的 captures 建表 SQL
export const CREATE_CAPTURES = '';

// TODO(M1): 对应 DATA-MODEL.md §1.1 的索引定义
export const CREATE_CAPTURES_INDEXES: readonly string[] = [];

// TODO(M1): 搬 DATA-MODEL.md §1.2 的 sync_events 建表 SQL
export const CREATE_SYNC_EVENTS = '';

// TODO(M1): 搬 DATA-MODEL.md §1.3 的 drafts 建表 SQL
export const CREATE_DRAFTS = '';

// TODO(M1): 搬 DATA-MODEL.md §1.4 的 device_info 建表 SQL
export const CREATE_DEVICE_INFO = '';
