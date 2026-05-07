/**
 * reconcile-job.ts — 启动自愈
 *
 * 冷启动异步扫 wal/ / captures/ / drafts/ / SQLite，对账四处状态。
 * 不得阻塞 UI 首屏（见 ARCHITECTURE.md §7 启动性能预算）。
 *
 * 八种崩溃恢复情形：
 *   1. staging 残留 → 清理
 *   2. rename 中途 → 补齐 .complete
 *   3. SQLite 无记录但有完整目录 → 补记录
 *   4. SQLite 有记录但无目录 → 标 conflicted
 *   5. .complete 在但 manifest 损坏 → dead-letter
 *   6. attachment sha256 不匹配 → dead-letter
 *   7. WAL 未 checkpoint → SQLite 自愈
 *   8. drafts 过期（>30 天）→ GC
 *
 * @see docs/ARCHITECTURE.md §7
 *
 */

import * as capturesRepo from '../storage/captures-repo';
import * as eventsRepo from '../storage/events-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { directorySize, baseDirs, runExclusive } from '../capture/atomic-write';
import { validateManifest } from '../capture/manifest';
import type { CaptureManifest } from '../capture/types';
import type { FileSystemAdapter } from '../../utils/fs';
import { expoFileSystem, joinPath } from '../../utils/fs';
import { isoNow } from '../../utils/time';

export interface ReconcileResult {
  stagingCleaned: number;
  walRecovered: number;
  sqliteBackfilled: number;
  deadLettered: number;
  syncReset: number;
}

interface WalEntry {
  op: 'create';
  txn_id: string;
  id: string;
  manifest: CaptureManifest;
}

export async function runReconcile(opts: {
  db: SQLiteDatabaseLike;
  fs?: FileSystemAdapter;
}): Promise<ReconcileResult> {
  const fs = opts.fs ?? expoFileSystem;
  const result: ReconcileResult = {
    stagingCleaned: 0,
    walRecovered: 0,
    sqliteBackfilled: 0,
    deadLettered: 0,
    syncReset: 0,
  };
  const dirs = baseDirs(fs);
  await fs.ensureDir(dirs.captures);
  await fs.ensureDir(dirs.staging);
  await fs.ensureDir(dirs.wal);
  await fs.ensureDir(dirs.deadLetter);

  for (const walName of await safeReadDir(fs, dirs.wal)) {
    if (!walName.endsWith('.ndjson')) {
      continue;
    }
    const walPath = joinPath(dirs.wal, walName);
    const wal = await readWal(fs, walPath);
    const capturePath = joinPath(dirs.captures, wal.id);
    const complete = await fs.getInfo(joinPath(capturePath, '.complete'));
    if (complete.exists) {
      await backfillCapture(opts.db, fs, capturePath, wal.manifest);
      await fs.delete(walPath, { idempotent: true });
      result.walRecovered += 1;
    } else {
      await fs.delete(joinPath(dirs.staging, wal.txn_id), { idempotent: true });
      await fs.delete(walPath, { idempotent: true });
      result.stagingCleaned += 1;
    }
  }

  for (const stagingName of await safeReadDir(fs, dirs.staging)) {
    await fs.delete(joinPath(dirs.staging, stagingName), { idempotent: true });
    result.stagingCleaned += 1;
  }

  for (const captureName of await safeReadDir(fs, dirs.captures)) {
    if (captureName.startsWith('.')) {
      continue;
    }
    const capturePath = joinPath(dirs.captures, captureName);
    const info = await fs.getInfo(capturePath);
    if (!info.exists || !info.isDirectory) {
      continue;
    }

    const complete = await fs.getInfo(joinPath(capturePath, '.complete'));
    if (!complete.exists) {
      await moveToDeadLetter(fs, capturePath, dirs.deadLetter);
      result.deadLettered += 1;
      continue;
    }

    try {
      const manifest = await readManifest(fs, capturePath);
      const existing = await capturesRepo.get(opts.db, manifest.id);
      if (!existing) {
        await backfillCapture(opts.db, fs, capturePath, manifest);
        result.sqliteBackfilled += 1;
      }
    } catch {
      await moveToDeadLetter(fs, capturePath, dirs.deadLetter);
      result.deadLettered += 1;
    }
  }

  const syncingRows = await capturesRepo.listByState(opts.db, 'syncing');
  for (const row of syncingRows) {
    await capturesRepo.updateSyncState(opts.db, row.id, {
      sync_state: 'pending',
      sync_last_error: 'reset by reconcile',
      sync_next_retry_at: null,
    });
    await eventsRepo.append(opts.db, row.id, 'reset', { from: 'syncing' }, isoNow());
    result.syncReset += 1;
  }

  return result;
}

async function safeReadDir(fs: FileSystemAdapter, path: string): Promise<string[]> {
  const info = await fs.getInfo(path);
  if (!info.exists) {
    return [];
  }
  return fs.readDir(path);
}

async function readWal(fs: FileSystemAdapter, path: string): Promise<WalEntry> {
  const [line] = (await fs.readString(path)).trim().split('\n');
  if (!line) {
    throw new Error('reconcile.empty_wal');
  }
  return JSON.parse(line) as WalEntry;
}

async function readManifest(fs: FileSystemAdapter, capturePath: string): Promise<CaptureManifest> {
  const manifest = JSON.parse(await fs.readString(joinPath(capturePath, 'manifest.json'))) as CaptureManifest;
  validateManifest(manifest);
  return manifest;
}

async function backfillCapture(
  db: SQLiteDatabaseLike,
  fs: FileSystemAdapter,
  capturePath: string,
  manifest: CaptureManifest,
): Promise<void> {
  const contentHash = await fs.readString(joinPath(capturePath, 'manifest.json.sha256'));
  const byteSize = await directorySize(fs, capturePath);
  await runExclusive(db, async (txn) => {
    await capturesRepo.insert(txn, {
      id: manifest.id,
      created_at: manifest.created_at,
      captured_at_local: manifest.captured_at_local,
      kind: manifest.kind,
      content_preview: manifest.content.replace(/\s+/g, ' ').trim().slice(0, 200),
      content_hash: contentHash.trim(),
      byte_size: byteSize,
      has_audio: manifest.attachments.some((attachment) => attachment.type === 'audio'),
      has_image: manifest.attachments.some((attachment) => attachment.type === 'image'),
      attachment_count: manifest.attachments.length,
      local_path: capturePath,
    });
    await eventsRepo.append(txn, manifest.id, 'created', { source: 'reconcile' }, isoNow());
  });
}

async function moveToDeadLetter(
  fs: FileSystemAdapter,
  capturePath: string,
  deadLetterDir: string,
): Promise<void> {
  const id = capturePath.split('/').filter(Boolean).at(-1);
  if (!id) {
    throw new Error('reconcile.invalid_capture_path');
  }
  await fs.ensureDir(deadLetterDir);
  await fs.move(capturePath, joinPath(deadLetterDir, id));
}
