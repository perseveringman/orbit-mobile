export interface MarkdownSelection {
  start: number;
  end: number;
}

export interface MarkdownEditResult {
  content: string;
  selection: MarkdownSelection;
}

export type MarkdownTextToolbarAction =
  | 'tag'
  | 'heading'
  | 'bold'
  | 'quote'
  | 'italic'
  | 'strikethrough'
  | 'highlight'
  | 'orderedList'
  | 'unorderedList'
  | 'checklist'
  | 'codeBlock';

export function insertMarkdownAtSelection(
  content: string,
  selection: MarkdownSelection,
  markdown: string,
): MarkdownEditResult {
  const range = clampSelection(content, selection);
  const next = `${content.slice(0, range.start)}${markdown}${content.slice(range.end)}`;
  const cursor = range.start + markdown.length;
  return {
    content: next,
    selection: { start: cursor, end: cursor },
  };
}

export function insertMarkdownBlocksAtSelection(
  content: string,
  selection: MarkdownSelection,
  blocks: string[],
): MarkdownEditResult {
  if (blocks.length === 0) {
    return { content, selection: clampSelection(content, selection) };
  }
  const range = clampSelection(content, selection);
  const before = content.slice(0, range.start);
  const after = content.slice(range.end);
  const insertion = blocks.join('\n');
  const prefix = before.trim().length === 0
    ? ''
    : before.endsWith('\n\n')
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n';
  const suffix = after.trim().length === 0
    ? ''
    : after.startsWith('\n\n')
      ? ''
      : after.startsWith('\n')
        ? '\n'
        : '\n\n';
  const next = `${before}${prefix}${insertion}${suffix}${after}`;
  const cursor = before.length + prefix.length + insertion.length;
  return {
    content: next,
    selection: { start: cursor, end: cursor },
  };
}

export function wrapMarkdownSelection(
  content: string,
  selection: MarkdownSelection,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownEditResult {
  const range = clampSelection(content, selection);
  const selected = content.slice(range.start, range.end) || placeholder;
  const replacement = `${prefix}${selected}${suffix}`;
  const next = `${content.slice(0, range.start)}${replacement}${content.slice(range.end)}`;
  const innerStart = range.start + prefix.length;
  const innerEnd = innerStart + selected.length;
  return {
    content: next,
    selection: { start: innerStart, end: innerEnd },
  };
}

export function prefixMarkdownLines(
  content: string,
  selection: MarkdownSelection,
  prefix: string | ((index: number) => string),
  placeholder = '',
): MarkdownEditResult {
  const range = clampSelection(content, selection);
  const selected = content.slice(range.start, range.end) || placeholder;
  const lines = selected.length > 0 ? selected.split(/\r?\n/) : [''];
  const replacement = lines
    .map((line, index) => `${typeof prefix === 'function' ? prefix(index) : prefix}${line}`)
    .join('\n');
  const next = `${content.slice(0, range.start)}${replacement}${content.slice(range.end)}`;
  const cursor = range.start + replacement.length;
  return {
    content: next,
    selection: { start: cursor, end: cursor },
  };
}

export function applyMarkdownHeading(
  content: string,
  selection: MarkdownSelection,
  level: number,
): MarkdownEditResult {
  const boundedLevel = Math.max(1, Math.min(6, Math.floor(level)));
  return prefixMarkdownLines(content, selection, `${'#'.repeat(boundedLevel)} `, `H${boundedLevel} 标题`);
}

export function wrapAsMarkdownCodeBlock(
  content: string,
  selection: MarkdownSelection,
): MarkdownEditResult {
  const range = clampSelection(content, selection);
  const selected = content.slice(range.start, range.end);
  const code = selected.trim().length > 0 ? selected : '代码';
  const replacement = `\`\`\`\n${code}\n\`\`\``;
  const next = `${content.slice(0, range.start)}${replacement}${content.slice(range.end)}`;
  const codeStart = range.start + 4;
  const codeEnd = codeStart + code.length;
  return {
    content: next,
    selection: { start: codeStart, end: codeEnd },
  };
}

export function applyMarkdownTextToolbarAction(
  content: string,
  selection: MarkdownSelection,
  action: MarkdownTextToolbarAction,
  options: { headingLevel?: number } = {},
): MarkdownEditResult {
  switch (action) {
    case 'tag':
      return insertMarkdownAtSelection(content, selection, '#标签');
    case 'heading':
      return applyMarkdownHeading(content, selection, options.headingLevel ?? 2);
    case 'bold':
      return wrapMarkdownSelection(content, selection, '**', '**', '加粗文字');
    case 'quote':
      return prefixMarkdownLines(content, selection, '> ', '引用');
    case 'italic':
      return wrapMarkdownSelection(content, selection, '*', '*', '斜体文字');
    case 'strikethrough':
      return wrapMarkdownSelection(content, selection, '~~', '~~', '删除文字');
    case 'highlight':
      return wrapMarkdownSelection(content, selection, '==', '==', '高亮文字');
    case 'orderedList':
      return prefixMarkdownLines(content, selection, (index) => `${index + 1}. `, '列表项');
    case 'unorderedList':
      return prefixMarkdownLines(content, selection, '- ', '列表项');
    case 'checklist':
      return prefixMarkdownLines(content, selection, '- [ ] ', '待办');
    case 'codeBlock':
      return wrapAsMarkdownCodeBlock(content, selection);
  }
}

function clampSelection(content: string, selection: MarkdownSelection): MarkdownSelection {
  const start = Math.max(0, Math.min(selection.start, content.length));
  const end = Math.max(start, Math.min(selection.end, content.length));
  return { start, end };
}
