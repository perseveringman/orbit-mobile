import * as deviceInfo from '../storage/device-info';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import type { AiSettings } from '../../types/ai';

export type ImageOriginalPolicy = 'compressed_only' | 'wifi_original' | 'always_original';

export interface AppSettings {
  keepImageOriginal: boolean;
  imageOriginalPolicy: ImageOriginalPolicy;
  ai: AiSettings;
}

const KEEP_IMAGE_ORIGINAL_KEY = 'user_setting_keep_image_original';
const IMAGE_ORIGINAL_POLICY_KEY = 'user_setting_image_original_policy';
const AI_ENABLED_KEY = 'user_setting_ai_enabled';
const AI_AUTO_GENERATE_KEY = 'user_setting_ai_auto_generate';
const AI_MODEL_KEY = 'user_setting_ai_model';
const AI_BASE_URL_KEY = 'user_setting_ai_base_url';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  autoGenerate: true,
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com',
};

export async function loadAppSettings(db: SQLiteDatabaseLike): Promise<AppSettings> {
  const [
    keepImageOriginal,
    imageOriginalPolicy,
    aiEnabled,
    aiAutoGenerate,
    aiModel,
    aiBaseUrl,
  ] = await Promise.all([
    deviceInfo.getValue(db, KEEP_IMAGE_ORIGINAL_KEY),
    deviceInfo.getValue(db, IMAGE_ORIGINAL_POLICY_KEY),
    deviceInfo.getValue(db, AI_ENABLED_KEY),
    deviceInfo.getValue(db, AI_AUTO_GENERATE_KEY),
    deviceInfo.getValue(db, AI_MODEL_KEY),
    deviceInfo.getValue(db, AI_BASE_URL_KEY),
  ]);
  const policy = normalizeImagePolicy(
    imageOriginalPolicy,
    keepImageOriginal === null ? undefined : keepImageOriginal === '1',
  );
  return {
    keepImageOriginal: policy !== 'compressed_only',
    imageOriginalPolicy: policy,
    ai: {
      enabled: aiEnabled === null ? DEFAULT_AI_SETTINGS.enabled : aiEnabled === '1',
      autoGenerate: aiAutoGenerate === null
        ? DEFAULT_AI_SETTINGS.autoGenerate
        : aiAutoGenerate === '1',
      provider: 'deepseek',
      model: aiModel ?? DEFAULT_AI_SETTINGS.model,
      baseUrl: aiBaseUrl ?? DEFAULT_AI_SETTINGS.baseUrl,
    },
  };
}

export async function setKeepImageOriginal(
  db: SQLiteDatabaseLike,
  enabled: boolean,
): Promise<void> {
  await deviceInfo.setValue(db, KEEP_IMAGE_ORIGINAL_KEY, enabled ? '1' : '0');
  await deviceInfo.setValue(
    db,
    IMAGE_ORIGINAL_POLICY_KEY,
    enabled ? 'always_original' : 'compressed_only',
  );
}

export async function setImageOriginalPolicy(
  db: SQLiteDatabaseLike,
  policy: ImageOriginalPolicy,
): Promise<void> {
  const normalized = normalizeImagePolicy(policy);
  await deviceInfo.setValue(db, IMAGE_ORIGINAL_POLICY_KEY, normalized);
  await deviceInfo.setValue(db, KEEP_IMAGE_ORIGINAL_KEY, normalized === 'compressed_only' ? '0' : '1');
}

export async function setAiEnabled(
  db: SQLiteDatabaseLike,
  enabled: boolean,
): Promise<void> {
  await deviceInfo.setValue(db, AI_ENABLED_KEY, enabled ? '1' : '0');
}

export async function setAiAutoGenerate(
  db: SQLiteDatabaseLike,
  enabled: boolean,
): Promise<void> {
  await deviceInfo.setValue(db, AI_AUTO_GENERATE_KEY, enabled ? '1' : '0');
}

export async function setAiModel(
  db: SQLiteDatabaseLike,
  model: string,
): Promise<void> {
  await deviceInfo.setValue(db, AI_MODEL_KEY, model.trim() || DEFAULT_AI_SETTINGS.model);
}

export async function setAiBaseUrl(
  db: SQLiteDatabaseLike,
  baseUrl: string,
): Promise<void> {
  const normalized = baseUrl.trim().replace(/\/+$/g, '') || DEFAULT_AI_SETTINGS.baseUrl;
  await deviceInfo.setValue(db, AI_BASE_URL_KEY, normalized);
}

function normalizeImagePolicy(
  value: string | null,
  legacyKeepOriginal = true,
): ImageOriginalPolicy {
  if (value === 'compressed_only' || value === 'wifi_original' || value === 'always_original') {
    return value;
  }
  return legacyKeepOriginal ? 'always_original' : 'compressed_only';
}
