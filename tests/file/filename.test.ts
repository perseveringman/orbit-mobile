import { describe, expect, it } from 'vitest';

import { sanitizeAttachmentFilename } from '@/core/file/filename';

describe('sanitizeAttachmentFilename', () => {
  it('keeps the extension when the visible filename is non-ascii', () => {
    expect(sanitizeAttachmentFilename('时代峻峰垃圾分类.pptx', 'file.bin')).toBe('file.pptx');
  });

  it('does not produce hidden dotfiles from extension-only sanitized names', () => {
    expect(sanitizeAttachmentFilename('中文.pdf', 'event-file.bin')).toBe('event-file.pdf');
  });

  it('keeps safe ascii names unchanged', () => {
    expect(sanitizeAttachmentFilename('meeting-notes.md', 'file.bin')).toBe('meeting-notes.md');
  });
});
