/**
 * atomic-write.ts — 原子写入协议（五阶段）
 *
 * 五阶段：staging → rename → fsync → SQLite 事务 → 返回用户
 * 用户看到"保存成功"前必须 Layer 2 原子落盘 + SQLite 事务提交。
 * 任何阶段失败：staging 目录清理，SQLite 不写入，用户看到明确错误。
 *
 * @see docs/ARCHITECTURE.md §5
 * @see docs/decisions/ADR-001-local-first-three-layer-storage.md
 *
 */

import * as capturesRepo from '../storage/captures-repo';
import { getValue } from '../storage/device-info';
import * as eventsRepo from '../storage/events-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { buildManifest, contentPreview, serializeManifest } from './manifest';
import { sha256String } from './hash';
import type { CaptureManifest, CreateTextCaptureInput } from './types';
import { generateCaptureId, generateSessionId } from '../../utils/id';
import type { FileSystemAdapter } from '../../utils/fs';
import { expoFileSystem, joinPath } from '../../utils/fs';
import { isoLocal, isoNow } from '../../utils/time';

export type AtomicWriteFault =
  | 'after_wal'
  | 'after_staging_manifest'
  | 'after_rename'
  | 'after_complete'
  | 'after_sqlite';

export interface CreateCaptureOptions {
  db: SQLiteDatabaseLike;
  fs?: FileSystemAdapter;
  sourceVersion?: string;
  now?: Date;
  id?: string;
  txnId?: string;
  fault?: AtomicWriteFault;
}

export interface AtomicWriteResult {
  id: string;
  localPath: string;
  manifest: CaptureManifest;
  manifestSha256: string;
}

interface WalEntry {
  op: 'create';
  txn_id: string;
  id: string;
  created_at: string;
  captured_at_local: string;
  content_hash: string;
  content_preview: string;
  byte_size: number;
  local_path: string;
  expected_attachments: string[];
  manifest: CaptureManifest;
}

export function baseDirs(fs: FileSystemAdapter): {
  captures: string;
  staging: string;
  wal: string;
  deadLetter: string;
  tmp: string;
} {
  const root = fs.documentDirectory;
  const captures = joinPath(root, 'captures');
  return {
    captures,
    staging: joinPath(captures, '.staging'),
    wal: joinPath(root, 'wal'),
    deadLetter: joinPath(root, 'dead-letter'),
    tmp: joinPath(root, 'tmp'),
  };
}

export async function ensureLocalStoreDirs(fs: FileSystemAdapter): Promise<void> {
  const dirs = baseDirs(fs);
  await fs.ensureDir(dirs.captures);
  await fs.ensureDir(dirs.staging);
  await fs.ensureDir(dirs.wal);
  await fs.ensureDir(dirs.deadLetter);
  await fs.ensureDir(dirs.tmp);
}

export async function createTextCapture(
  input: CreateTextCaptureInput,
  opts: CreateCaptureOptions,
): Promise<AtomicWriteResult> {
  const fs = opts.fs ?? expoFileSystem;
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error('capture.empty_content');
  }

  await ensureLocalStoreDirs(fs);

  const id = opts.id ?? generateCaptureId();
  const txnId = opts.txnId ?? generateSessionId();
  const now = opts.now ?? new Date();
  const createdAt = isoNow(now);
  const capturedAtLocal = isoLocal(now);
  const inputFinishedAt = createdAt;
  const deviceId = await getValue(opts.db, 'device_id');
  if (!deviceId) {
    throw new Error('capture.device_id_missing');
  }

  const manifest = buildManifest({
    id,
    sourceVersion: opts.sourceVersion ?? '0.0.0',
    deviceId,
    createdAt,
    capturedAtLocal,
    kind: 'thought',
    content,
    tags: input.tags,
    inputStartedAt: input.inputStartedAt ?? null,
    inputFinishedAt,
  });
  const manifestJson = serializeManifest(manifest);
  const manifestSha256 = await sha256String(manifestJson);
  const preview = contentPreview(content);

  const dirs = baseDirs(fs);
  const walPath = joinPath(dirs.wal, `${txnId}.ndjson`);
  const stagingPath = joinPath(dirs.staging, txnId);
  const capturePath = joinPath(dirs.captures, id);

  const walEntry: WalEntry = {
    op: 'create',
    txn_id: txnId,
    id,
    created_at: createdAt,
    captured_at_local: capturedAtLocal,
    content_hash: manifestSha256,
    content_preview: preview,
    byte_size: 0,
    local_path: capturePath,
    expected_attachments: [],
    manifest,
  };

  try {
    await fs.writeString(walPath, `${JSON.stringify(walEntry)}\n`);
    await fs.fsync(walPath);
    maybeFault(opts.fault, 'after_wal');

    await fs.ensureDir(stagingPath);
    await fs.writeString(joinPath(stagingPath, 'manifest.json'), manifestJson);
    await fs.writeString(joinPath(stagingPath, 'manifest.json.sha256'), manifestSha256);
    await fs.fsync(stagingPath);
    maybeFault(opts.fault, 'after_staging_manifest');

    await fs.move(stagingPath, capturePath);
    maybeFault(opts.fault, 'after_rename');

    await fs.writeString(joinPath(capturePath, '.complete'), createdAt);
    await fs.fsync(capturePath);
    await fs.fsync(dirs.captures);
    maybeFault(opts.fault, 'after_complete');

    const byteSize = await directorySize(fs, capturePath);
    await runExclusive(opts.db, async (txn) => {
      await capturesRepo.insert(txn, {
        id,
        created_at: createdAt,
        captured_at_local: capturedAtLocal,
        kind: 'thought',
        content_preview: preview,
        content_hash: manifestSha256,
        byte_size: byteSize,
        local_path: capturePath,
      });
      await eventsRepo.append(txn, id, 'created', { source: 'atomic-write' }, createdAt);
      if (input.sessionId) {
        const { del } = await import('../storage/drafts-repo');
        await del(txn, input.sessionId);
      }
    });
    maybeFault(opts.fault, 'after_sqlite');

    await fs.delete(walPath, { idempotent: true });
    return { id, localPath: capturePath, manifest, manifestSha256 };
  } catch (error) {
    await fs.delete(stagingPath, { idempotent: true });
    throw error;
  }
}

export async function directorySize(fs: FileSystemAdapter, path: string): Promise<number> {
  const info = await fs.getInfo(path);
  if (!info.exists) {
    return 0;
  }
  if (!info.isDirectory) {
    return info.size ?? 0;
  }

  const children = await fs.readDir(path);
  let total = 0;
  for (const child of children) {
    total += await directorySize(fs, joinPath(path, child));
  }
  return total;
}

export async function runExclusive<T>(
  db: SQLiteDatabaseLike,
  fn: (txn: SQLiteDatabaseLike) => Promise<T>,
): Promise<T> {
  let didRun = false;
  let result!: T;
  if (db.withExclusiveTransactionAsync) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      result = await fn(txn);
      didRun = true;
    });
  } else {
    await db.withTransactionAsync(async () => {
      result = await fn(db);
      didRun = true;
    });
  }
  if (!didRun) {
    throw new Error('storage.transaction_not_executed');
  }
  return result;
}

function maybeFault(actual: AtomicWriteFault | undefined, expected: AtomicWriteFault): void {
  if (actual === expected) {
    throw new Error(`fault.${expected}`);
  }
}
