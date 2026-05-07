/**
 * fs.ts — 文件系统封装
 *
 * DOCUMENTS_DIR / ensureDir / fsync
 *
 * ⚠️ fsync 是 M2 原子写入协议的硬依赖。expo-file-system 当前版本
 * 不直接暴露 fsync——M1 留 noop 占位；M2 必须补 native 实现
 * （候选：expo-file-system-next 的 openAsync({append:true}) / 自写 module）
 *
 * @see docs/ARCHITECTURE.md §5
 *
 * TODO(M2): 真正的 fsync 实现
 */

import * as FileSystem from 'expo-file-system/legacy';

export const DOCUMENTS_DIR = FileSystem.documentDirectory;

export function requireDocumentsDir(): string {
  if (!DOCUMENTS_DIR) {
    throw new Error('filesystem.document_directory_unavailable');
  }
  return DOCUMENTS_DIR;
}

export async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

export function fsync(path: string): Promise<void> {
  void path;
  return Promise.resolve();
}
