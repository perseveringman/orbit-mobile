import * as deviceInfo from '../storage/device-info';
import type { SQLiteDatabaseLike } from '../storage/sqlite';

export interface AppSettings {
  keepImageOriginal: boolean;
}

const KEEP_IMAGE_ORIGINAL_KEY = 'user_setting_keep_image_original';

export async function loadAppSettings(db: SQLiteDatabaseLike): Promise<AppSettings> {
  const keepImageOriginal = await deviceInfo.getValue(db, KEEP_IMAGE_ORIGINAL_KEY);
  return {
    keepImageOriginal: keepImageOriginal === null ? true : keepImageOriginal === '1',
  };
}

export async function setKeepImageOriginal(
  db: SQLiteDatabaseLike,
  enabled: boolean,
): Promise<void> {
  await deviceInfo.setValue(db, KEEP_IMAGE_ORIGINAL_KEY, enabled ? '1' : '0');
}
