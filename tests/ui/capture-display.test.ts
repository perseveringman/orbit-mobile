import { describe, expect, it } from 'vitest';

import { buildCaptureDisplay } from '@/ui/models/capture-display';
import type { CaptureManifest } from '@/core/capture/types';
import type { CaptureRow } from '@/types/capture';

describe('capture display model', () => {
  it('builds friendly media summaries and attachment display uris', () => {
    const display = buildCaptureDisplay(row(), {
      schema_version: 1,
      id: 'mob_cap_photo',
      source: 'orbit-mobile-ios',
      source_version: '0.0.0',
      device_id: 'device-1',
      created_at: '2026-05-07T00:00:00.000Z',
      captured_at_local: '2026-05-07T08:00:00.000+08:00',
      kind: 'mixed',
      content: '照片备注\n第二行',
      tags: [],
      attachments: [
        {
          type: 'image',
          filename: 'photo.jpg',
          sha256: 'hash',
          byte_size: 2048,
          mime: 'image/jpeg',
          width: 100,
          height: 100,
        },
        {
          type: 'audio',
          filename: 'audio.m4a',
          sha256: 'audio-hash',
          byte_size: 4096,
          mime: 'audio/m4a',
          duration_ms: 65000,
        },
      ],
      context: {
        clipboard_hint: null,
        share_context: null,
        location: null,
        network: null,
        battery: null,
      },
      local_timestamps: {
        input_started_at: null,
        input_finished_at: '2026-05-07T00:00:00.000Z',
        total_input_duration_ms: null,
      },
    } satisfies CaptureManifest);

    expect(display.kindLabel).toBe('混合');
    expect(display.title).toBe('照片备注');
    expect(display.images[0]?.uri).toBe('file:///documents/captures/mob_cap_photo/photo.jpg');
    expect(display.audio[0]?.durationLabel).toBe('1:05');
  });
});

function row(): CaptureRow {
  return {
    id: 'mob_cap_photo',
    created_at: '2026-05-07T00:00:00.000Z',
    captured_at_local: '2026-05-07T08:00:00.000+08:00',
    kind: 'mixed',
    content_preview: '照片备注',
    content_hash: 'hash',
    byte_size: 100,
    has_audio: 1,
    has_image: 1,
    attachment_count: 2,
    sync_state: 'pending',
    sync_attempts: 0,
    sync_last_error: null,
    sync_last_try_at: null,
    sync_next_retry_at: null,
    uploaded_at: null,
    acked_at: null,
    ack_vault_path: null,
    local_path: '/documents/captures/mob_cap_photo',
    deleted_locally: 0,
    metadata_json: null,
    schema_version: 1,
  };
}
