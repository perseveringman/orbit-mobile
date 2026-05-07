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
import { requireNativeModule } from 'expo-modules-core';

export const DOCUMENTS_DIR = FileSystem.documentDirectory;

export interface FileInfo {
  exists: boolean;
  isDirectory?: boolean;
  size?: number;
}

export interface FileSystemAdapter {
  documentDirectory: string;
  getInfo(path: string): Promise<FileInfo>;
  ensureDir(path: string): Promise<void>;
  writeString(path: string, contents: string): Promise<void>;
  readString(path: string): Promise<string>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  delete(path: string, opts?: { idempotent?: boolean }): Promise<void>;
  readDir(path: string): Promise<string[]>;
  fsync(path: string): Promise<void>;
}

interface DurableFsNativeModule {
  fsync(path: string): Promise<void>;
}

const durableFs = requireNativeModule<DurableFsNativeModule>('OrbitDurableFS');

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

export async function writeString(path: string, contents: string): Promise<void> {
  await FileSystem.writeAsStringAsync(path, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function readString(path: string): Promise<string> {
  return FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function fsync(path: string): Promise<void> {
  await durableFs.fsync(path);
}

export const expoFileSystem: FileSystemAdapter = {
  documentDirectory: requireDocumentsDir(),
  getInfo: (path) => FileSystem.getInfoAsync(path),
  ensureDir,
  writeString,
  readString,
  copy: (from, to) => FileSystem.copyAsync({ from, to }),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
  delete: (path, opts) => FileSystem.deleteAsync(path, { idempotent: opts?.idempotent ?? false }),
  readDir: (path) => FileSystem.readDirectoryAsync(path),
  fsync,
};

export function joinPath(base: string, ...parts: string[]): string {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedParts = parts
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));
  return `${normalizedBase}/${normalizedParts.join('/')}`;
}
