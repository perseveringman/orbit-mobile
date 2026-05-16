import { describe, expect, it } from 'vitest';

import {
  applyMarkdownHeading,
  applyMarkdownTextToolbarAction,
  insertMarkdownBlocksAtSelection,
  type MarkdownSelection,
} from '../../src/core/markdown/toolbar-actions';

const atEnd = (content: string): MarkdownSelection => ({
  end: content.length,
  start: content.length,
});

describe('markdown toolbar actions', () => {
  it('inserts a tag at the current cursor', () => {
    const result = applyMarkdownTextToolbarAction('hello ', atEnd('hello '), 'tag');

    expect(result.content).toBe('hello #标签');
    expect(result.selection).toEqual({ start: 9, end: 9 });
  });

  it('wraps selected text for bold, italic, strike, and highlight', () => {
    const selected = { start: 2, end: 4 };

    expect(applyMarkdownTextToolbarAction('abcdef', selected, 'bold')).toMatchObject({
      content: 'ab**cd**ef',
      selection: { start: 4, end: 6 },
    });
    expect(applyMarkdownTextToolbarAction('abcdef', selected, 'italic')).toMatchObject({
      content: 'ab*cd*ef',
      selection: { start: 3, end: 5 },
    });
    expect(applyMarkdownTextToolbarAction('abcdef', selected, 'strikethrough')).toMatchObject({
      content: 'ab~~cd~~ef',
      selection: { start: 4, end: 6 },
    });
    expect(applyMarkdownTextToolbarAction('abcdef', selected, 'highlight')).toMatchObject({
      content: 'ab==cd==ef',
      selection: { start: 4, end: 6 },
    });
  });

  it('uses editable placeholders when no text is selected', () => {
    const result = applyMarkdownTextToolbarAction('', { start: 0, end: 0 }, 'bold');

    expect(result.content).toBe('**加粗文字**');
    expect(result.selection).toEqual({ start: 2, end: 6 });
  });

  it('applies all heading levels from H1 to H6', () => {
    for (let level = 1; level <= 6; level += 1) {
      expect(applyMarkdownHeading('标题', { start: 0, end: 2 }, level).content).toBe(
        `${'#'.repeat(level)} 标题`,
      );
    }
  });

  it('prefixes selected lines for quotes and lists', () => {
    const content = 'alpha\nbeta';
    const selection = { start: 0, end: content.length };

    expect(applyMarkdownTextToolbarAction(content, selection, 'quote').content).toBe('> alpha\n> beta');
    expect(applyMarkdownTextToolbarAction(content, selection, 'orderedList').content).toBe(
      '1. alpha\n2. beta',
    );
    expect(applyMarkdownTextToolbarAction(content, selection, 'unorderedList').content).toBe(
      '- alpha\n- beta',
    );
    expect(applyMarkdownTextToolbarAction(content, selection, 'checklist').content).toBe(
      '- [ ] alpha\n- [ ] beta',
    );
  });

  it('wraps selection as a fenced code block', () => {
    const result = applyMarkdownTextToolbarAction('const x = 1;', { start: 0, end: 12 }, 'codeBlock');

    expect(result.content).toBe('```\nconst x = 1;\n```');
    expect(result.selection).toEqual({ start: 4, end: 16 });
  });

  it('inserts attachment blocks with proper blank line spacing', () => {
    const result = insertMarkdownBlocksAtSelection(
      'before\nafter',
      { start: 6, end: 6 },
      ['![photo-1.jpg](attachment://photo-1.jpg)', '[doc.pdf](attachment://doc.pdf)'],
    );

    expect(result.content).toBe(
      'before\n\n![photo-1.jpg](attachment://photo-1.jpg)\n[doc.pdf](attachment://doc.pdf)\n\nafter',
    );
  });
});
