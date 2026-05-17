import { createCapture } from '../capture/atomic-write';
import type { CaptureAttachment } from '../capture/types';
import { createRecordingCapture } from '../recording/recording-service';
import { buildShareContext, type ShareContext } from './platform';
import * as capturesRepo from '../storage/captures-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { appGroupContainerPath, expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';
import { isoNow } from '../../utils/time';

export const APP_GROUP_ID = 'group.com.zhouyanbo.orbit.capture';

interface ShareInboxPayload {
  schema_version: 1;
  id: string;
  content: string;
  url: string | null;
  title?: string | null;
  share_context?: ShareContext | null;
  attachments: Array<{
    type: 'image' | 'file' | 'audio';
    filename: string;
    mime: string;
  }>;
}

export interface ImportShareInboxOptions {
  db: SQLiteDatabaseLike;
  fs?: FileSystemAdapter;
  sharedRoot?: string;
  appGroupId?: string;
  sourceVersion?: string;
}

export async function importShareInbox(options: ImportShareInboxOptions): Promise<number> {
  const fs = options.fs ?? expoFileSystem;
  const sharedRoot =
    options.sharedRoot ?? (await appGroupContainerPath(options.appGroupId ?? APP_GROUP_ID));
  const inboxRoot = joinPath(sharedRoot, 'share-inbox');
  const inboxInfo = await fs.getInfo(inboxRoot);
  if (!inboxInfo.exists) return 0;

  let imported = 0;
  for (const entry of await fs.readDir(inboxRoot)) {
    const shareDir = joinPath(inboxRoot, entry);
    const complete = await fs.getInfo(joinPath(shareDir, '.complete'));
    if (!complete.exists) continue;

    try {
      const payload = JSON.parse(await fs.readString(joinPath(shareDir, 'payload.json'))) as ShareInboxPayload;
      validatePayload(payload);
      const existing = await capturesRepo.get(options.db, payload.id);
      if (existing) {
        await fs.delete(shareDir, { idempotent: true });
        continue;
      }
      const content = [payload.content.trim(), payload.url].filter(Boolean).join('\n\n');
      const shareContext =
        payload.share_context ??
        buildShareContext({
          captureMethod: 'share_extension',
          url: payload.url,
          text: payload.content,
          title: payload.title ?? null,
        });
      const attachments = payload.attachments.map<CaptureAttachment>((attachment) => ({
        type: attachment.type === 'image'
          ? 'image'
          : attachment.type === 'audio'
            ? 'audio'
            : 'file',
        filename: attachment.filename,
        localUri: joinPath(shareDir, 'attachments', attachment.filename),
        mime: attachment.mime,
      }));
      const audio = attachments.find((attachment) => attachment.type === 'audio');
      if (audio) {
        const now = isoNow();
        await createRecordingCapture(
          {
            title: payload.title?.trim() || payload.content.trim() || titleFromFilename(audio.filename),
            audioUri: audio.localUri,
            audioFilename: audio.filename,
            audioMime: audio.mime,
            durationMs: 0,
            startedAt: now,
            recordedAt: now,
            languageHints: [],
            partials: [],
            transcriptText: '',
            partialProvider: 'share-audio-import',
            waveformSamples: [],
            sessionAttachments: attachments.filter((attachment) => attachment.type !== 'audio'),
            source: {
              kind: 'share_audio',
              file_name: audio.filename,
              imported_at: now,
            },
            shareContext,
          },
          {
            db: options.db,
            fs,
            id: payload.id,
            txnId: `${payload.id}_share_import`,
            sourceVersion: options.sourceVersion ?? '0.0.0',
          },
        );
      } else {
        await createCapture(
          {
            kind: attachments.length > 0 && content.length > 0 ? 'mixed' : 'share',
            content,
            attachments,
            shareContext,
          },
          {
            db: options.db,
            fs,
            id: payload.id,
            txnId: `${payload.id}_share_import`,
            sourceVersion: options.sourceVersion ?? '0.0.0',
          },
        );
      }
      await fs.delete(shareDir, { idempotent: true });
      imported += 1;
    } catch (error) {
      await quarantineShareDir(fs, sharedRoot, shareDir, error);
    }
  }
  return imported;
}

function titleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  return stem || '导入录音';
}

function validatePayload(payload: ShareInboxPayload): void {
  if (payload.schema_version !== 1 || !payload.id.startsWith('mob_cap_')) {
    throw new Error('share_inbox.invalid_payload');
  }
}

async function quarantineShareDir(
  fs: FileSystemAdapter,
  sharedRoot: string,
  shareDir: string,
  error: unknown,
): Promise<void> {
  const failedRoot = joinPath(sharedRoot, 'share-inbox-failed');
  await fs.ensureDir(failedRoot);
  const name = shareDir.split('/').filter(Boolean).at(-1) ?? `failed-${Date.now()}`;
  const target = joinPath(failedRoot, name);
  await fs.delete(target, { idempotent: true });
  await fs.writeString(
    joinPath(shareDir, '.failed.json'),
    `${JSON.stringify(
      {
        failed_at: isoNow(),
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  await fs.move(shareDir, target);
}
