export type MarkdownInlineKind = 'text' | 'bold' | 'italic' | 'strike' | 'highlight' | 'tag';

export interface MarkdownInlineToken {
  kind: MarkdownInlineKind;
  text: string;
}

export type MarkdownBlock =
  | { kind: 'spacer' }
  | { kind: 'code'; text: string }
  | { kind: 'image'; label: string; filename: string }
  | { kind: 'attachment'; label: string; filename: string }
  | { kind: 'heading'; level: number; children: MarkdownInlineToken[] }
  | { kind: 'quote'; lines: MarkdownInlineToken[][] }
  | { kind: 'checklist'; checked: boolean; children: MarkdownInlineToken[] }
  | { kind: 'ordered'; marker: string; children: MarkdownInlineToken[] }
  | { kind: 'unordered'; children: MarkdownInlineToken[] }
  | { kind: 'paragraph'; children: MarkdownInlineToken[] };

export interface MarkdownTruncateOptions {
  maxBlocks?: number;
  maxCharacters?: number;
}

export interface MarkdownTruncateResult {
  blocks: MarkdownBlock[];
  truncated: boolean;
}

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      blocks.push({ kind: 'spacer' });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: 'code', text: codeLines.join('\n') || '代码' });
      continue;
    }

    const imageAttachment = /^!\[([^\]]*)\]\(attachment:\/\/([^)]+)\)$/.exec(trimmed);
    if (imageAttachment) {
      blocks.push({
        kind: 'image',
        label: imageAttachment[1] || imageAttachment[2] || '图片',
        filename: imageAttachment[2] ?? '',
      });
      index += 1;
      continue;
    }

    const fileAttachment = /^\[([^\]]+)\]\(attachment:\/\/([^)]+)\)$/.exec(trimmed);
    if (fileAttachment) {
      blocks.push({
        kind: 'attachment',
        label: fileAttachment[1] ?? '附件',
        filename: fileAttachment[2] ?? '',
      });
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: Math.min(6, heading[1]?.length ?? 1),
        children: parseInlineMarkdown(heading[2] ?? ''),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: MarkdownInlineToken[][] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        quoteLines.push(parseInlineMarkdown((lines[index] ?? '').replace(/^\s*>\s?/, '')));
        index += 1;
      }
      blocks.push({ kind: 'quote', lines: quoteLines });
      continue;
    }

    const checklist = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(trimmed);
    if (checklist) {
      blocks.push({
        kind: 'checklist',
        checked: (checklist[1] ?? '').trim().length > 0,
        children: parseInlineMarkdown(checklist[2] ?? ''),
      });
      index += 1;
      continue;
    }

    const ordered = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      blocks.push({
        kind: 'ordered',
        marker: ordered[1] ?? '',
        children: parseInlineMarkdown(ordered[2] ?? ''),
      });
      index += 1;
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unordered) {
      blocks.push({ kind: 'unordered', children: parseInlineMarkdown(unordered[1] ?? '') });
      index += 1;
      continue;
    }

    blocks.push({ kind: 'paragraph', children: parseInlineMarkdown(line) });
    index += 1;
  }

  return blocks;
}

export function parseInlineMarkdown(text: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|==[^=\n]+==|\*[^*\n]+\*|#[^\s#]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('**')) {
      tokens.push({ kind: 'bold', text: raw.slice(2, -2) });
    } else if (raw.startsWith('~~')) {
      tokens.push({ kind: 'strike', text: raw.slice(2, -2) });
    } else if (raw.startsWith('==')) {
      tokens.push({ kind: 'highlight', text: raw.slice(2, -2) });
    } else if (raw.startsWith('*')) {
      tokens.push({ kind: 'italic', text: raw.slice(1, -1) });
    } else {
      tokens.push({ kind: 'tag', text: raw });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return tokens.length > 0 ? tokens : [{ kind: 'text', text }];
}

export function extractMarkdownAttachmentFilenames(content: string): Set<string> {
  const filenames = new Set<string>();
  const pattern = /!?\[[^\]]*\]\(attachment:\/\/([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) filenames.add(match[1]);
  }
  return filenames;
}

export function truncateMarkdownBlocks(
  blocks: MarkdownBlock[],
  options: MarkdownTruncateOptions = {},
): MarkdownTruncateResult {
  const maxBlocks = options.maxBlocks ?? Number.POSITIVE_INFINITY;
  const maxCharacters = options.maxCharacters ?? Number.POSITIVE_INFINITY;
  const nextBlocks: MarkdownBlock[] = [];
  let usedCharacters = 0;

  for (const block of blocks) {
    if (nextBlocks.length >= maxBlocks) {
      return { blocks: nextBlocks, truncated: true };
    }

    const length = blockTextLength(block);
    const remainingCharacters = maxCharacters - usedCharacters;
    if (remainingCharacters <= 0) {
      return { blocks: nextBlocks, truncated: true };
    }

    if (length <= remainingCharacters) {
      nextBlocks.push(block);
      usedCharacters += length;
      continue;
    }

    const truncatedBlock = truncateBlock(block, Math.max(0, remainingCharacters));
    if (truncatedBlock) {
      nextBlocks.push(truncatedBlock);
    }
    return { blocks: nextBlocks, truncated: true };
  }

  return { blocks: nextBlocks, truncated: false };
}

function blockTextLength(block: MarkdownBlock): number {
  switch (block.kind) {
    case 'spacer':
      return 1;
    case 'code':
      return block.text.length;
    case 'image':
    case 'attachment':
      return block.label.length + block.filename.length;
    case 'heading':
    case 'paragraph':
    case 'checklist':
    case 'ordered':
    case 'unordered':
      return inlineTextLength(block.children);
    case 'quote':
      return block.lines.reduce((sum, line) => sum + inlineTextLength(line), 0);
    default:
      return 0;
  }
}

function truncateBlock(block: MarkdownBlock, maxCharacters: number): MarkdownBlock | null {
  if (maxCharacters <= 0) return null;
  switch (block.kind) {
    case 'code':
      return { ...block, text: truncateText(block.text, maxCharacters) };
    case 'heading':
    case 'paragraph':
    case 'checklist':
    case 'ordered':
    case 'unordered':
      return { ...block, children: truncateInlineTokens(block.children, maxCharacters) };
    case 'quote': {
      const lines: MarkdownInlineToken[][] = [];
      let remaining = maxCharacters;
      for (const line of block.lines) {
        if (remaining <= 0) break;
        lines.push(truncateInlineTokens(line, remaining));
        remaining -= inlineTextLength(line);
      }
      return lines.length > 0 ? { ...block, lines } : null;
    }
    default:
      return block;
  }
}

function truncateInlineTokens(tokens: MarkdownInlineToken[], maxCharacters: number): MarkdownInlineToken[] {
  const nextTokens: MarkdownInlineToken[] = [];
  let remaining = maxCharacters;

  for (const token of tokens) {
    if (remaining <= 0) break;
    if (token.text.length <= remaining) {
      nextTokens.push(token);
      remaining -= token.text.length;
      continue;
    }
    nextTokens.push({ ...token, text: truncateText(token.text, remaining) });
    remaining = 0;
  }

  return nextTokens;
}

function inlineTextLength(tokens: MarkdownInlineToken[]): number {
  return tokens.reduce((sum, token) => sum + token.text.length, 0);
}

function truncateText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  if (maxCharacters <= 3) return '.'.repeat(maxCharacters);
  return `${text.slice(0, maxCharacters - 3).trimEnd()}...`;
}
