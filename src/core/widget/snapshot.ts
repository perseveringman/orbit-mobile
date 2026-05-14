import * as capturesRepo from '../storage/captures-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { APP_GROUP_ID } from '../share/share-inbox';
import { appGroupContainerPath, expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';
import { isoNow } from '../../utils/time';

interface WidgetCaptureItem {
  id: string;
  kind: string;
  title: string;
  captured_at: string;
}

interface WidgetSnapshot {
  schema_version: 1;
  updated_at: string;
  items: WidgetCaptureItem[];
}

export async function writeWidgetSnapshot(
  db: SQLiteDatabaseLike,
  options: { fs?: FileSystemAdapter; appGroupId?: string; sharedRoot?: string } = {},
): Promise<void> {
  const fs = options.fs ?? expoFileSystem;
  const sharedRoot = options.sharedRoot
    ?? (await appGroupContainerPath(options.appGroupId ?? APP_GROUP_ID));
  const dir = joinPath(sharedRoot, 'widget');
  await fs.ensureDir(dir);
  const rows = await capturesRepo.list(db, { limit: 3 });
  const snapshot: WidgetSnapshot = {
    schema_version: 1,
    updated_at: isoNow(),
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.content_preview?.trim() || labelForKind(row.kind),
      captured_at: row.captured_at_local,
    })),
  };
  await fs.writeString(joinPath(dir, 'recent.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
}

function labelForKind(kind: string): string {
  if (kind === 'voice') return '语音记录';
  if (kind === 'photo') return '图片记录';
  if (kind === 'share') return '分享记录';
  if (kind === 'recording') return '持续录音';
  if (kind === 'mixed') return '混合记录';
  return '文字记录';
}
