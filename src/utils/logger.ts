/**
 * logger.ts — ndjson 日志（按天 rotate）
 *
 * 追加写 Documents/logs/sync-YYYY-MM-DD.ndjson。
 *
 * ⚠️ 已知缺陷：expo-file-system 当前无 append API，需读-拼-写
 * （O(n²)）。M3 前必须换实现（expo-file-system-next 或自写 native）。
 *
 * TODO(M3): 真正的 append 实现
 */

import * as FileSystem from 'expo-file-system/legacy';

import { ensureDir, requireDocumentsDir } from './fs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  data?: unknown;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
}

function logPath(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return `${requireDocumentsDir()}logs/sync-${day}.ndjson`;
}

async function write(level: LogLevel, event: string, data?: unknown): Promise<void> {
  const path = logPath();
  await ensureDir(`${requireDocumentsDir()}logs/`);
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    data,
  };
  const line = `${JSON.stringify(entry)}\n`;
  const info = await FileSystem.getInfoAsync(path);
  const current = info.exists ? await FileSystem.readAsStringAsync(path) : '';
  await FileSystem.writeAsStringAsync(path, current + line, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export const logger = {
  debug: (event: string, data?: unknown) => write('debug', event, data),
  info: (event: string, data?: unknown) => write('info', event, data),
  warn: (event: string, data?: unknown) => write('warn', event, data),
  error: (event: string, error: unknown, data?: Record<string, unknown>) =>
    write('error', event, {
      error: serializeError(error),
      ...data,
    }),
};
