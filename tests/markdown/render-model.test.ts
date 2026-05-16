import { describe, expect, it } from 'vitest';

import {
  extractMarkdownAttachmentFilenames,
  parseMarkdownBlocks,
  truncateMarkdownBlocks,
} from '@/core/markdown/render-model';

describe('markdown render model', () => {
  it('parses capture markdown blocks for timeline reading', () => {
    const blocks = parseMarkdownBlocks([
      '# 标题 **加粗** #灵感',
      '> 引用一句话',
      '- [x] 已完成',
      '1. 第一项',
      '- 第二项',
      '![白板](attachment://photo-1.jpg)',
      '[录音](attachment://audio.m4a)',
      '```',
      'const x = 1;',
      '```',
    ].join('\n'));

    expect(blocks).toMatchObject([
      {
        kind: 'heading',
        level: 1,
        children: [
          { kind: 'text', text: '标题 ' },
          { kind: 'bold', text: '加粗' },
          { kind: 'text', text: ' ' },
          { kind: 'tag', text: '#灵感' },
        ],
      },
      { kind: 'quote' },
      { kind: 'checklist', checked: true },
      { kind: 'ordered', marker: '1' },
      { kind: 'unordered' },
      { kind: 'image', label: '白板', filename: 'photo-1.jpg' },
      { kind: 'attachment', label: '录音', filename: 'audio.m4a' },
      { kind: 'code', text: 'const x = 1;' },
    ]);
  });

  it('extracts attachment references and truncates very long notes', () => {
    const content = [
      '# 会议',
      '![图](attachment://photo.jpg)',
      '[资料](attachment://deck.pdf)',
      '这是一段很长的正文，需要在最近列表里截断。',
    ].join('\n');
    const references = extractMarkdownAttachmentFilenames(content);
    const result = truncateMarkdownBlocks(parseMarkdownBlocks(content), {
      maxBlocks: 4,
      maxCharacters: 34,
    });

    expect([...references]).toEqual(['photo.jpg', 'deck.pdf']);
    expect(result.truncated).toBe(true);
    expect(result.blocks.at(-1)).toMatchObject({
      kind: 'paragraph',
      children: [{ text: '这是一段很长的正文...' }],
    });
  });
});
