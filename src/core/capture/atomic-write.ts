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
import { getOrInit } from '../storage/device-info';
import * as eventsRepo from '../storage/events-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import type { CaptureKind } from '../../types/capture';
import { buildManifest, contentPreview, serializeManifest } from './manifest';
import { sha256File, sha256String } from './hash';
import type {
  CaptureAttachment,
  CaptureManifest,
  CreateCaptureInput,
  CreateTextCaptureInput,
  ManifestAttachment,
} from './types';
import { generateCaptureId, generateDeviceId, generateSessionId } from '../../utils/id';
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
  afterCaptureInsert?: (context: {
    db: SQLiteDatabaseLike;
    id: string;
    manifest: CaptureManifest;
    localPath: string;
    byteSize: number;
    createdAt: string;
  }) => Promise<void>;
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
  return createCapture({ ...input, kind: 'thought' }, opts);
}

export async function createCapture(
  input: CreateCaptureInput,
  opts: CreateCaptureOptions,
): Promise<AtomicWriteResult> {
  const fs = opts.fs ?? expoFileSystem;
  const content = input.content.trim();
  const rawAttachments = input.attachments ?? [];
  if (content.length === 0 && rawAttachments.length === 0) {
    throw new Error('capture.empty_content');
  }

  await ensureLocalStoreDirs(fs);

  const id = opts.id ?? generateCaptureId();
  const txnId = opts.txnId ?? generateSessionId();
  const now = opts.now ?? new Date();
  const createdAt = isoNow(now);
  const capturedAtLocal = isoLocal(now);
  const inputFinishedAt = createdAt;
  const deviceId = await getOrInit(opts.db, 'device_id', generateDeviceId);

  const attachments = await prepareAttachments(fs, rawAttachments);
    const manifest = buildManifest({
    id,
    sourceVersion: opts.sourceVersion ?? '0.0.0',
    deviceId,
    createdAt,
    capturedAtLocal,
    kind: input.kind ?? inferKind(content, attachments),
    content,
    tags: input.tags,
    attachments,
    recording: input.recording,
    derivatives: input.derivatives,
    clipboardHint: input.clipboardHint,
    shareContext: input.shareContext,
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
    expected_attachments: attachments.map((attachment) => attachment.filename),
    manifest,
  };

  try {
    await fs.writeString(walPath, `${JSON.stringify(walEntry)}\n`);
    await fs.fsync(walPath);
    maybeFault(opts.fault, 'after_wal');

    await fs.ensureDir(stagingPath);
    for (const attachment of rawAttachments) {
      const targetPath = joinPath(stagingPath, attachment.filename);
      await fs.copy(attachment.localUri, targetPath);
      await fs.fsync(targetPath);
    }
    await fs.writeString(joinPath(stagingPath, 'manifest.json'), manifestJson);
    await fs.writeString(joinPath(stagingPath, 'manifest.json.sha256'), manifestSha256);
    await fs.fsync(stagingPath);
    maybeFault(opts.fault, 'after_staging_manifest');

    await fs.move(stagingPath, capturePath);
    maybeFault(opts.fault, 'after_rename');

    await fs.writeString(joinPath(capturePath, 'manifest.json'), manifestJson);
    await fs.writeString(joinPath(capturePath, 'manifest.json.sha256'), manifestSha256);
    await validateFinalCaptureDir(fs, capturePath, manifest, manifestSha256);

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
        kind: manifest.kind,
        content_preview: preview,
        content_hash: manifestSha256,
        byte_size: byteSize,
        has_audio: manifest.attachments.some((attachment) => attachment.type === 'audio'),
        has_image: manifest.attachments.some((attachment) => attachment.type === 'image'),
        attachment_count: manifest.attachments.length,
        local_path: capturePath,
      });
      await eventsRepo.append(txn, id, 'created', { source: 'atomic-write' }, createdAt);
      await opts.afterCaptureInsert?.({
        db: txn,
        id,
        manifest,
        localPath: capturePath,
        byteSize,
        createdAt,
      });
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

async function prepareAttachments(
  fs: FileSystemAdapter,
  attachments: CaptureAttachment[],
): Promise<ManifestAttachment[]> {
  const prepared: ManifestAttachment[] = [];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    validateAttachmentFilename(attachment.filename);
    if (seen.has(attachment.filename)) {
      throw new Error(`capture.duplicate_attachment:${attachment.filename}`);
    }
    seen.add(attachment.filename);
    const info = await fs.getInfo(attachment.localUri);
    if (!info.exists || info.isDirectory) {
      throw new Error(`capture.attachment_missing:${attachment.filename}`);
    }
    prepared.push({
      type: attachment.type,
      filename: attachment.filename,
      sha256: attachment.sha256 ?? (await sha256File(attachment.localUri)),
      byte_size: attachment.byte_size ?? info.size ?? 0,
      mime: attachment.mime,
      duration_ms: attachment.duration_ms,
      transcription: attachment.transcription,
      transcription_source: attachment.transcription_source,
      transcription_confidence: attachment.transcription_confidence,
      recorded_at: attachment.recorded_at,
      width: attachment.width,
      height: attachment.height,
      captured_at: attachment.captured_at,
      original_exif: attachment.original_exif,
      sync_hint: attachment.sync_hint,
      schema: attachment.schema,
      derivative_kind: attachment.derivative_kind,
      template_id: attachment.template_id,
    });
  }
  return prepared;
}

async function validateFinalCaptureDir(
  fs: FileSystemAdapter,
  capturePath: string,
  manifest: CaptureManifest,
  expectedManifestSha256: string,
): Promise<void> {
  const manifestPath = joinPath(capturePath, 'manifest.json');
  const manifestJson = await fs.readString(manifestPath);
  const actualManifestSha256 = await sha256String(manifestJson);
  if (actualManifestSha256 !== expectedManifestSha256) {
    throw new Error(`capture.final_manifest_hash_mismatch:${manifest.id}`);
  }

  const storedManifestSha256 = (await fs.readString(joinPath(capturePath, 'manifest.json.sha256'))).trim();
  if (storedManifestSha256 !== expectedManifestSha256) {
    throw new Error(`capture.final_manifest_sha_file_mismatch:${manifest.id}`);
  }

  for (const attachment of manifest.attachments) {
    const attachmentPath = joinPath(capturePath, attachment.filename);
    const info = await fs.getInfo(attachmentPath);
    if (!info.exists || info.isDirectory) {
      throw new Error(`capture.final_attachment_missing:${attachment.filename}`);
    }
    if ((info.size ?? 0) !== attachment.byte_size) {
      throw new Error(`capture.final_attachment_size_mismatch:${attachment.filename}`);
    }
  }
}

function validateAttachmentFilename(filename: string): void {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error(`capture.invalid_attachment_filename:${filename}`);
  }
}

function inferKind(content: string, attachments: ManifestAttachment[]): CaptureKind {
  if (attachments.length === 0) return 'thought';
  const hasAudio = attachments.some((attachment) => attachment.type === 'audio');
  const hasImage = attachments.some((attachment) => attachment.type === 'image');
  if (hasAudio && !hasImage) return 'voice';
  if (hasImage && !hasAudio && content.trim().length === 0) return 'photo';
  return 'mixed';
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
