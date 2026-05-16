import type { CaptureManifest } from '../capture/types';
import { sha256String } from '../capture/hash';
import { contentPreview } from '../capture/manifest';
import * as capturesRepo from '../storage/captures-repo';
import * as recordingsRepo from '../storage/recordings-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';
import { generateSessionId } from '../../utils/id';
import type { AiRecordingNotes } from './recording-notes';

const DERIVATIVE_FILES = {
  outline: 'outline.json',
  summary: 'summary.json',
  decisions: 'decisions.json',
  risks: 'risks.json',
  todos: 'todos.json',
} as const;

export async function writeAiRecordingNotes(
  db: SQLiteDatabaseLike,
  captureId: string,
  notes: AiRecordingNotes,
  fs: FileSystemAdapter = expoFileSystem,
): Promise<void> {
  const capture = await capturesRepo.get(db, captureId);
  if (!capture) {
    throw new Error(`ai.capture_missing:${captureId}`);
  }
  const manifestPath = joinPath(capture.local_path, 'manifest.json');
  const manifest = JSON.parse(await fs.readString(manifestPath)) as CaptureManifest;
  const files = new Map<string, string>([
    [DERIVATIVE_FILES.outline, `${JSON.stringify(notes.outline, null, 2)}\n`],
    [DERIVATIVE_FILES.summary, `${JSON.stringify(notes.derivatives.summary, null, 2)}\n`],
    [DERIVATIVE_FILES.decisions, `${JSON.stringify(notes.derivatives.decisions, null, 2)}\n`],
    [DERIVATIVE_FILES.risks, `${JSON.stringify(notes.derivatives.risks, null, 2)}\n`],
    [DERIVATIVE_FILES.todos, `${JSON.stringify(notes.derivatives.todos, null, 2)}\n`],
  ]);

  for (const [filename, contents] of files) {
    await atomicWriteString(fs, joinPath(capture.local_path, filename), contents);
    const attachment = manifest.attachments.find((item) => item.filename === filename);
    if (attachment) {
      attachment.sha256 = await sha256String(contents);
      attachment.byte_size = utf8ByteLength(contents);
    }
  }

  if (notes.semanticTitle) {
    manifest.content = replaceRecordingContentTitle(manifest.content, notes.semanticTitle);
  }

  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = await sha256String(manifestContents);
  await atomicWriteString(fs, manifestPath, manifestContents);
  await atomicWriteString(
    fs,
    joinPath(capture.local_path, 'manifest.json.sha256'),
    manifestSha256,
  );
  await capturesRepo.updateLocalMetadata(db, captureId, {
    byte_size: await directorySize(fs, capture.local_path),
    content_hash: manifestSha256,
    content_preview: contentPreview(manifest.content),
  });
  if (notes.semanticTitle) {
    await recordingsRepo.updateTitle(db, captureId, notes.semanticTitle);
  }
}

async function atomicWriteString(
  fs: FileSystemAdapter,
  path: string,
  contents: string,
): Promise<void> {
  const tmp = `${path}.tmp-${generateSessionId()}`;
  await fs.writeString(tmp, contents);
  await fs.fsync(tmp);
  await fs.move(tmp, path);
  await fs.fsync(path);
}

function utf8ByteLength(value: string): number {
  return unescape(encodeURIComponent(value)).length;
}

function replaceRecordingContentTitle(content: string, title: string): string {
  const trimmed = content.trim();
  if (!trimmed) return title;
  const parts = trimmed.split(/\n{2,}/);
  return [title, ...parts.slice(1)].filter(Boolean).join('\n\n');
}

async function directorySize(fs: FileSystemAdapter, path: string): Promise<number> {
  const info = await fs.getInfo(path);
  if (!info.exists) return 0;
  if (!info.isDirectory) return info.size ?? 0;
  const children = await fs.readDir(path);
  let total = 0;
  for (const child of children) {
    total += await directorySize(fs, joinPath(path, child));
  }
  return total;
}
