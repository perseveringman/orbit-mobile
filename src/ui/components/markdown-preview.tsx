import type React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import {
  parseMarkdownBlocks,
  truncateMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownInlineToken,
} from '../../core/markdown/render-model';
import { ComposerIcon } from './composer-icons';

export interface MarkdownPreviewAttachment {
  filename: string;
  type?: string;
  uri?: string;
  sizeLabel?: string;
  durationLabel?: string | null;
}

interface MarkdownPreviewProps {
  content: string;
  attachments?: MarkdownPreviewAttachment[];
  compact?: boolean;
  maxBlocks?: number;
  maxCharacters?: number;
  selectable?: boolean;
  showTruncationHint?: boolean;
  placeholder?: React.ReactNode;
}

export function MarkdownPreview({
  content,
  attachments = [],
  compact = false,
  maxBlocks,
  maxCharacters,
  selectable = false,
  showTruncationHint = false,
  placeholder = null,
}: MarkdownPreviewProps): React.ReactElement {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return <View style={styles.container}>{placeholder}</View>;
  }

  const attachmentByFilename = new Map(attachments.map((attachment) => [attachment.filename, attachment]));
  const parsed = parseMarkdownBlocks(content);
  const { blocks, truncated } = truncateMarkdownBlocks(parsed, { maxBlocks, maxCharacters });

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      {blocks.map((block, index) => (
        <MarkdownBlockView
          key={`md-${index}`}
          block={block}
          attachmentByFilename={attachmentByFilename}
          compact={compact}
          selectable={selectable}
        />
      ))}
      {truncated && showTruncationHint ? (
        <Text style={[styles.truncationHint, compact && styles.compactTruncationHint]}>
          阅读全文
        </Text>
      ) : null}
    </View>
  );
}

function MarkdownBlockView({
  block,
  attachmentByFilename,
  compact,
  selectable,
}: {
  block: MarkdownBlock;
  attachmentByFilename: Map<string, MarkdownPreviewAttachment>;
  compact: boolean;
  selectable: boolean;
}): React.ReactElement {
  switch (block.kind) {
    case 'spacer':
      return <View style={compact ? styles.compactSpacer : styles.spacer} />;
    case 'code':
      return (
        <View style={[styles.codeBlock, compact && styles.compactCodeBlock]}>
          <Text selectable={selectable} style={[styles.codeText, compact && styles.compactCodeText]}>
            {block.text}
          </Text>
        </View>
      );
    case 'image':
      return (
        <RenderedImageAttachment
          attachment={attachmentByFilename.get(block.filename)}
          compact={compact}
          filename={block.filename}
          label={block.label}
          selectable={selectable}
        />
      );
    case 'attachment':
      return (
        <RenderedAttachment
          attachment={attachmentByFilename.get(block.filename)}
          compact={compact}
          filename={block.filename}
          label={block.label}
          selectable={selectable}
        />
      );
    case 'heading':
      return (
        <Text selectable={selectable} style={[headingStyle(block.level), compact && compactHeadingStyle(block.level)]}>
          {renderInlineMarkdown(block.children, `h-${block.level}`)}
        </Text>
      );
    case 'quote':
      return (
        <View style={[styles.quoteBlock, compact && styles.compactQuoteBlock]}>
          {block.lines.map((line, index) => (
            <Text
              key={`quote-${index}`}
              selectable={selectable}
              style={[styles.quoteText, compact && styles.compactQuoteText]}
            >
              {renderInlineMarkdown(line, `q-${index}`)}
            </Text>
          ))}
        </View>
      );
    case 'checklist':
      return (
        <View style={[styles.listRow, compact && styles.compactListRow]}>
          <Text style={[styles.checkbox, compact && styles.compactCheckbox]}>{block.checked ? '☑' : '☐'}</Text>
          <Text selectable={selectable} style={[styles.listText, compact && styles.compactListText]}>
            {renderInlineMarkdown(block.children, 'todo')}
          </Text>
        </View>
      );
    case 'ordered':
      return (
        <View style={[styles.listRow, compact && styles.compactListRow]}>
          <Text style={[styles.listMarker, compact && styles.compactListMarker]}>{block.marker}.</Text>
          <Text selectable={selectable} style={[styles.listText, compact && styles.compactListText]}>
            {renderInlineMarkdown(block.children, 'ol')}
          </Text>
        </View>
      );
    case 'unordered':
      return (
        <View style={[styles.listRow, compact && styles.compactListRow]}>
          <Text style={[styles.listMarker, compact && styles.compactListMarker]}>•</Text>
          <Text selectable={selectable} style={[styles.listText, compact && styles.compactListText]}>
            {renderInlineMarkdown(block.children, 'ul')}
          </Text>
        </View>
      );
    case 'paragraph':
      return (
        <Text selectable={selectable} style={[styles.paragraph, compact && styles.compactParagraph]}>
          {renderInlineMarkdown(block.children, 'p')}
        </Text>
      );
    default:
      return <View />;
  }
}

function RenderedImageAttachment({
  attachment,
  compact,
  filename,
  label,
  selectable,
}: {
  attachment: MarkdownPreviewAttachment | undefined;
  compact: boolean;
  filename: string;
  label: string;
  selectable: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.imageBlock, compact && styles.compactImageBlock]}>
      {attachment?.uri ? (
        <Image
          source={{ uri: attachment.uri }}
          style={[styles.image, compact && styles.compactImage]}
        />
      ) : (
        <View style={[styles.imagePlaceholder, compact && styles.compactImagePlaceholder]}>
          <ComposerIcon name="image" color="#64748b" size={compact ? 18 : 22} />
        </View>
      )}
      <Text
        numberOfLines={1}
        selectable={selectable}
        style={[styles.attachmentLabel, compact && styles.compactAttachmentLabel]}
      >
        {label || filename}
      </Text>
    </View>
  );
}

function RenderedAttachment({
  attachment,
  compact,
  filename,
  label,
  selectable,
}: {
  attachment: MarkdownPreviewAttachment | undefined;
  compact: boolean;
  filename: string;
  label: string;
  selectable: boolean;
}): React.ReactElement {
  const type = attachment?.type;
  const icon = type === 'audio' || /\.(m4a|mp3|caf|wav)$/i.test(filename) ? 'mic' : 'file';
  const meta = [attachment?.durationLabel, attachment?.sizeLabel, filename].filter(Boolean).join(' · ');
  return (
    <View style={[styles.attachmentBlock, compact && styles.compactAttachmentBlock]}>
      <ComposerIcon name={icon} color="#2563eb" size={compact ? 16 : 18} />
      <View style={styles.attachmentText}>
        <Text
          numberOfLines={1}
          selectable={selectable}
          style={[styles.attachmentTitle, compact && styles.compactAttachmentTitle]}
        >
          {label}
        </Text>
        <Text
          numberOfLines={1}
          selectable={selectable}
          style={[styles.attachmentMeta, compact && styles.compactAttachmentMeta]}
        >
          {meta}
        </Text>
      </View>
    </View>
  );
}

function renderInlineMarkdown(tokens: MarkdownInlineToken[], keyPrefix: string): React.ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.kind) {
      case 'bold':
        return <Text key={key} style={styles.inlineBold}>{token.text}</Text>;
      case 'italic':
        return <Text key={key} style={styles.inlineItalic}>{token.text}</Text>;
      case 'strike':
        return <Text key={key} style={styles.inlineStrike}>{token.text}</Text>;
      case 'highlight':
        return <Text key={key} style={styles.inlineHighlight}>{token.text}</Text>;
      case 'tag':
        return <Text key={key} style={styles.inlineTag}>{token.text}</Text>;
      default:
        return token.text;
    }
  });
}

function headingStyle(level: number): object {
  switch (level) {
    case 1:
      return styles.heading1;
    case 2:
      return styles.heading2;
    case 3:
      return styles.heading3;
    case 4:
      return styles.heading4;
    case 5:
      return styles.heading5;
    default:
      return styles.heading6;
  }
}

function compactHeadingStyle(level: number): object {
  switch (level) {
    case 1:
      return styles.compactHeading1;
    case 2:
      return styles.compactHeading2;
    case 3:
      return styles.compactHeading3;
    default:
      return styles.compactHeading4;
  }
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  compactContainer: {
    marginTop: 2,
  },
  spacer: {
    height: 10,
  },
  compactSpacer: {
    height: 6,
  },
  paragraph: {
    color: '#0f172a',
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 6,
  },
  compactParagraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  heading1: {
    color: '#0f172a',
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 34,
    marginBottom: 10,
  },
  heading2: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
    marginBottom: 9,
  },
  heading3: {
    color: '#0f172a',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 8,
  },
  heading4: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 7,
  },
  heading5: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 6,
  },
  heading6: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 23,
    marginBottom: 6,
  },
  compactHeading1: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 6,
  },
  compactHeading2: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 5,
  },
  compactHeading3: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 4,
  },
  compactHeading4: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  quoteBlock: {
    borderLeftColor: '#f97316',
    borderLeftWidth: 3,
    marginBottom: 8,
    paddingLeft: 10,
  },
  compactQuoteBlock: {
    marginBottom: 6,
    paddingLeft: 9,
  },
  quoteText: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 3,
  },
  compactQuoteText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 2,
  },
  codeBlock: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 9,
    padding: 10,
  },
  compactCodeBlock: {
    marginBottom: 7,
    padding: 8,
  },
  codeText: {
    color: '#0f172a',
    fontFamily: Platform.select({ ios: 'Menlo', default: undefined }),
    fontSize: 14,
    lineHeight: 20,
  },
  compactCodeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  listRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 5,
  },
  compactListRow: {
    gap: 6,
    marginBottom: 4,
  },
  listMarker: {
    color: '#64748b',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    lineHeight: 24,
    minWidth: 24,
    textAlign: 'right',
  },
  compactListMarker: {
    fontSize: 14,
    lineHeight: 21,
    minWidth: 21,
  },
  checkbox: {
    color: '#2563eb',
    fontFamily: Platform.select({ ios: 'Menlo', default: undefined }),
    fontSize: 15,
    lineHeight: 24,
    minWidth: 30,
  },
  compactCheckbox: {
    fontSize: 13,
    lineHeight: 21,
    minWidth: 24,
  },
  listText: {
    color: '#0f172a',
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
  },
  compactListText: {
    fontSize: 15,
    lineHeight: 21,
  },
  attachmentBlock: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 9,
    maxWidth: '94%',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  compactAttachmentBlock: {
    gap: 7,
    marginBottom: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  attachmentText: {
    minWidth: 100,
  },
  attachmentTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  compactAttachmentTitle: {
    fontSize: 13,
  },
  attachmentMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  compactAttachmentMeta: {
    fontSize: 10,
  },
  attachmentLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  compactAttachmentLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  imageBlock: {
    alignSelf: 'stretch',
    marginBottom: 10,
    maxWidth: '100%',
  },
  compactImageBlock: {
    marginBottom: 8,
  },
  image: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    height: 220,
    width: '100%',
  },
  compactImage: {
    height: 132,
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 110,
    justifyContent: 'center',
    width: '100%',
  },
  compactImagePlaceholder: {
    height: 86,
  },
  truncationHint: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  compactTruncationHint: {
    fontSize: 12,
    marginTop: 2,
  },
  inlineBold: {
    fontWeight: '900',
  },
  inlineItalic: {
    fontStyle: 'italic',
  },
  inlineStrike: {
    textDecorationLine: 'line-through',
  },
  inlineHighlight: {
    backgroundColor: '#fef08a',
    borderRadius: 4,
  },
  inlineTag: {
    color: '#2563eb',
    fontWeight: '800',
  },
});
