import * as deviceInfo from '../storage/device-info';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import type { AiSettings, VolcengineAsrSettings } from '../../types/ai';

export type ImageOriginalPolicy = 'compressed_only' | 'wifi_original' | 'always_original';

export interface AppSettings {
  keepImageOriginal: boolean;
  imageOriginalPolicy: ImageOriginalPolicy;
  ai: AiSettings;
  aiHotwords: string[];
  volcengineAsr: VolcengineAsrSettings;
}

const KEEP_IMAGE_ORIGINAL_KEY = 'user_setting_keep_image_original';
const IMAGE_ORIGINAL_POLICY_KEY = 'user_setting_image_original_policy';
const AI_ENABLED_KEY = 'user_setting_ai_enabled';
const AI_AUTO_GENERATE_KEY = 'user_setting_ai_auto_generate';
const AI_MODEL_KEY = 'user_setting_ai_model';
const AI_BASE_URL_KEY = 'user_setting_ai_base_url';
const AI_HOTWORDS_KEY = 'user_setting_ai_hotwords';
const ASR_ENABLED_KEY = 'user_setting_asr_enabled';
const ASR_AUTO_IMPORTED_KEY = 'user_setting_asr_auto_imported';
const ASR_RESOURCE_ID_KEY = 'user_setting_asr_resource_id';
const ASR_BASE_URL_KEY = 'user_setting_asr_base_url';
const ASR_UID_KEY = 'user_setting_asr_uid';
const ASR_BOOSTING_TABLE_ID_KEY = 'user_setting_asr_boosting_table_id';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  autoGenerate: true,
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com',
};

export const DEFAULT_VOLCENGINE_ASR_SETTINGS: VolcengineAsrSettings = {
  enabled: true,
  autoTranscribeImported: true,
  provider: 'volcengine',
  mode: 'flash',
  resourceId: 'volc.bigasr.auc_turbo',
  baseUrl: 'https://openspeech.bytedance.com',
  uid: 'orbit-mobile',
  boostingTableId: '',
};

export async function loadAppSettings(db: SQLiteDatabaseLike): Promise<AppSettings> {
  const [
    keepImageOriginal,
    imageOriginalPolicy,
    aiEnabled,
    aiAutoGenerate,
    aiModel,
    aiBaseUrl,
    aiHotwords,
    asrEnabled,
    asrAutoImported,
    asrResourceId,
    asrBaseUrl,
    asrUid,
    asrBoostingTableId,
  ] = await Promise.all([
    deviceInfo.getValue(db, KEEP_IMAGE_ORIGINAL_KEY),
    deviceInfo.getValue(db, IMAGE_ORIGINAL_POLICY_KEY),
    deviceInfo.getValue(db, AI_ENABLED_KEY),
    deviceInfo.getValue(db, AI_AUTO_GENERATE_KEY),
    deviceInfo.getValue(db, AI_MODEL_KEY),
    deviceInfo.getValue(db, AI_BASE_URL_KEY),
    deviceInfo.getValue(db, AI_HOTWORDS_KEY),
    deviceInfo.getValue(db, ASR_ENABLED_KEY),
    deviceInfo.getValue(db, ASR_AUTO_IMPORTED_KEY),
    deviceInfo.getValue(db, ASR_RESOURCE_ID_KEY),
    deviceInfo.getValue(db, ASR_BASE_URL_KEY),
    deviceInfo.getValue(db, ASR_UID_KEY),
    deviceInfo.getValue(db, ASR_BOOSTING_TABLE_ID_KEY),
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
    aiHotwords: parseHotwords(aiHotwords),
    volcengineAsr: {
      enabled: asrEnabled === null ? DEFAULT_VOLCENGINE_ASR_SETTINGS.enabled : asrEnabled === '1',
      autoTranscribeImported: asrAutoImported === null
        ? DEFAULT_VOLCENGINE_ASR_SETTINGS.autoTranscribeImported
        : asrAutoImported === '1',
      provider: 'volcengine',
      mode: 'flash',
      resourceId: normalizePlainSetting(asrResourceId, DEFAULT_VOLCENGINE_ASR_SETTINGS.resourceId),
      baseUrl: normalizeBaseUrl(asrBaseUrl, DEFAULT_VOLCENGINE_ASR_SETTINGS.baseUrl),
      uid: normalizePlainSetting(asrUid, DEFAULT_VOLCENGINE_ASR_SETTINGS.uid),
      boostingTableId: normalizePlainSetting(asrBoostingTableId, ''),
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

export async function setAiHotwords(
  db: SQLiteDatabaseLike,
  hotwords: readonly string[],
): Promise<void> {
  await deviceInfo.setValue(db, AI_HOTWORDS_KEY, JSON.stringify(normalizeHotwords(hotwords)));
}

export async function setVolcengineAsrEnabled(
  db: SQLiteDatabaseLike,
  enabled: boolean,
): Promise<void> {
  await deviceInfo.setValue(db, ASR_ENABLED_KEY, enabled ? '1' : '0');
}

export async function setVolcengineAsrAutoImported(
  db: SQLiteDatabaseLike,
  enabled: boolean,
): Promise<void> {
  await deviceInfo.setValue(db, ASR_AUTO_IMPORTED_KEY, enabled ? '1' : '0');
}

export async function setVolcengineAsrResourceId(
  db: SQLiteDatabaseLike,
  resourceId: string,
): Promise<void> {
  await deviceInfo.setValue(
    db,
    ASR_RESOURCE_ID_KEY,
    normalizePlainSetting(resourceId, DEFAULT_VOLCENGINE_ASR_SETTINGS.resourceId),
  );
}

export async function setVolcengineAsrBaseUrl(
  db: SQLiteDatabaseLike,
  baseUrl: string,
): Promise<void> {
  await deviceInfo.setValue(
    db,
    ASR_BASE_URL_KEY,
    normalizeBaseUrl(baseUrl, DEFAULT_VOLCENGINE_ASR_SETTINGS.baseUrl),
  );
}

export async function setVolcengineAsrUid(
  db: SQLiteDatabaseLike,
  uid: string,
): Promise<void> {
  await deviceInfo.setValue(
    db,
    ASR_UID_KEY,
    normalizePlainSetting(uid, DEFAULT_VOLCENGINE_ASR_SETTINGS.uid),
  );
}

export async function setVolcengineAsrBoostingTableId(
  db: SQLiteDatabaseLike,
  boostingTableId: string,
): Promise<void> {
  await deviceInfo.setValue(db, ASR_BOOSTING_TABLE_ID_KEY, normalizePlainSetting(boostingTableId, ''));
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

function parseHotwords(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? normalizeHotwords(parsed.filter((item): item is string => typeof item === 'string'))
      : [];
  } catch {
    return normalizeHotwords(value.split(/\r?\n|,/g));
  }
}

function normalizeHotwords(hotwords: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of hotwords) {
    const word = item.trim().replace(/\s+/g, ' ');
    const key = word.toLocaleLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    normalized.push(word.slice(0, 80));
    if (normalized.length >= 200) break;
  }
  return normalized;
}

function normalizePlainSetting(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

function normalizeBaseUrl(value: string | null, fallback: string): string {
  return (value?.trim().replace(/\/+$/g, '') || fallback).replace(/\/+$/g, '');
}
