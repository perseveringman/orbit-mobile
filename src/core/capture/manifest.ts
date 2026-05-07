/**
 * manifest.ts — manifest.json 构造 + 校验
 *
 * 产出格式严格对齐 ORBIT-INTEGRATION 与 DATA-MODEL §2。
 * 同时产出 manifest.json.sha256 供 Mac 端校验。
 *
 * @see docs/DATA-MODEL.md §2
 * @see docs/ORBIT-INTEGRATION.md
 *
 */

import type { CaptureKind } from '../../types/capture';
import type { BuildManifestInput, CaptureManifest } from './types';

export const MANIFEST_SCHEMA_VERSION = 1;
export const MOBILE_SOURCE = 'orbit-mobile-ios';

export function buildManifest(input: BuildManifestInput): CaptureManifest {
  const duration =
    input.inputStartedAt === null || input.inputStartedAt === undefined
      ? null
      : Math.max(
          0,
          new Date(input.inputFinishedAt).getTime() - new Date(input.inputStartedAt).getTime(),
        );

  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    id: input.id,
    source: MOBILE_SOURCE,
    source_version: input.sourceVersion,
    device_id: input.deviceId,
    created_at: input.createdAt,
    captured_at_local: input.capturedAtLocal,
    kind: input.kind,
    content: input.content,
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    context: {
      clipboard_hint: input.clipboardHint ?? null,
      share_context: input.shareContext ?? null,
      location: null,
      network: null,
      battery: null,
    },
    local_timestamps: {
      input_started_at: input.inputStartedAt ?? null,
      input_finished_at: input.inputFinishedAt,
      total_input_duration_ms: duration,
    },
  };
}

export function validateManifest(manifest: CaptureManifest): void {
  const schemaVersion = (manifest as { schema_version: number }).schema_version;
  const source = (manifest as { source: string }).source;
  const kind = (manifest as { kind: string }).kind;
  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`manifest.unsupported_schema:${schemaVersion}`);
  }
  if (!manifest.id.startsWith('mob_cap_')) {
    throw new Error(`manifest.invalid_id:${manifest.id}`);
  }
  if (source !== MOBILE_SOURCE) {
    throw new Error(`manifest.invalid_source:${source}`);
  }
  if (!isCaptureKind(kind)) {
    throw new Error(`manifest.invalid_kind:${kind}`);
  }
  if (typeof manifest.content !== 'string') {
    throw new Error('manifest.invalid_content');
  }
  for (const attachment of manifest.attachments) {
    if (!attachment.filename || attachment.filename.includes('/') || attachment.filename.includes(' ')) {
      throw new Error(`manifest.invalid_attachment_filename:${attachment.filename}`);
    }
  }
}

function isCaptureKind(value: string): value is CaptureKind {
  return ['thought', 'voice', 'photo', 'share', 'mixed'].includes(value);
}

export function serializeManifest(manifest: CaptureManifest): string {
  validateManifest(manifest);
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function contentPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 200);
}
