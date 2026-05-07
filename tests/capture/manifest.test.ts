import { describe, expect, it } from 'vitest';

import { buildManifest, contentPreview, serializeManifest } from '@/core/capture/manifest';

describe('capture manifest', () => {
  it('builds a schema-1 mobile manifest', () => {
    const manifest = buildManifest({
      id: 'mob_cap_123',
      sourceVersion: '0.0.0',
      deviceId: 'device-1',
      createdAt: '2026-05-07T00:00:00.000Z',
      capturedAtLocal: '2026-05-07T08:00:00.000+08:00',
      kind: 'thought',
      content: 'hello',
      inputStartedAt: '2026-05-07T00:00:00.000Z',
      inputFinishedAt: '2026-05-07T00:00:02.000Z',
    });

    expect(manifest).toMatchObject({
      schema_version: 1,
      source: 'orbit-mobile-ios',
      id: 'mob_cap_123',
      content: 'hello',
      local_timestamps: { total_input_duration_ms: 2000 },
    });
    expect(serializeManifest(manifest)).toContain('"schema_version": 1');
  });

  it('normalizes previews to 200 chars', () => {
    expect(contentPreview(` hello\n\n${'x'.repeat(250)}`)).toHaveLength(200);
  });
});
