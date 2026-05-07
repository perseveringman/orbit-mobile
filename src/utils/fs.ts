/**
 * fs.ts — 文件系统封装
 *
 * DOCUMENTS_DIR / ensureDir / fsync
 *
 * ⚠️ fsync 是原子写入协议的硬依赖。expo-file-system 当前版本
 * 不直接暴露 fsync；M2 起通过 OrbitDurableFS Development Build 原生模块提供。
 *
 * @see docs/ARCHITECTURE.md §5
 *
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
  appendText(path: string, text: string): Promise<void>;
  appGroupContainerPath(groupId: string): Promise<string>;
}

let durableFs: DurableFsNativeModule | null | undefined;

function getDurableFs(): DurableFsNativeModule {
  if (durableFs !== undefined) {
    if (durableFs === null) {
      throw new Error('filesystem.native_module_unavailable:use_development_build');
    }
    return durableFs;
  }

  try {
    durableFs = requireNativeModule<DurableFsNativeModule>('OrbitDurableFS');
    return durableFs;
  } catch {
    durableFs = null;
    throw new Error('filesystem.native_module_unavailable:use_development_build');
  }
}

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
  await getDurableFs().fsync(path);
}

export async function appendText(path: string, text: string): Promise<void> {
  await getDurableFs().appendText(path, text);
}

export async function appGroupContainerPath(groupId: string): Promise<string> {
  return getDurableFs().appGroupContainerPath(groupId);
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
