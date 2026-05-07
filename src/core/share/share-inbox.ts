import { createCapture } from '../capture/atomic-write';
import type { CaptureAttachment } from '../capture/types';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { appGroupContainerPath, expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';

export const APP_GROUP_ID = 'group.com.zhouyanbo.orbit.capture';

interface ShareInboxPayload {
  schema_version: 1;
  id: string;
  content: string;
  url: string | null;
  attachments: Array<{
    type: 'image' | 'file';
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

    const payload = JSON.parse(await fs.readString(joinPath(shareDir, 'payload.json'))) as ShareInboxPayload;
    validatePayload(payload);
    const content = [payload.content.trim(), payload.url].filter(Boolean).join('\n\n');
    const attachments = payload.attachments.map<CaptureAttachment>((attachment) => ({
      type: attachment.type === 'image' ? 'image' : 'file',
      filename: attachment.filename,
      localUri: joinPath(shareDir, 'attachments', attachment.filename),
      mime: attachment.mime,
    }));
    await createCapture(
      {
        kind: attachments.length > 0 && content.length > 0 ? 'mixed' : 'share',
        content,
        attachments,
      },
      {
        db: options.db,
        fs,
        id: payload.id,
        txnId: `${payload.id}_share_import`,
        sourceVersion: options.sourceVersion ?? '0.0.0',
      },
    );
    await fs.delete(shareDir, { idempotent: true });
    imported += 1;
  }
  return imported;
}

function validatePayload(payload: ShareInboxPayload): void {
  if (payload.schema_version !== 1 || !payload.id.startsWith('mob_cap_')) {
    throw new Error('share_inbox.invalid_payload');
  }
}
