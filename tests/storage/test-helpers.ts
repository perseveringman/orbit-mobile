import type { InsertCaptureInput } from '@/core/storage/captures-repo';

export function captureInput(
  id: string,
  overrides: Partial<InsertCaptureInput> = {},
): InsertCaptureInput {
  return {
    id,
    created_at: '2026-05-06T00:00:00.000Z',
    captured_at_local: '2026-05-06T08:00:00.000+08:00',
    kind: 'thought',
    content_preview: `preview ${id}`,
    content_hash: `hash-${id}`,
    byte_size: 128,
    local_path: `captures/${id}/`,
    ...overrides,
  };
}
