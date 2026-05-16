export type ShareSourcePlatform = 'wechat_article' | 'xiaohongshu' | 'x' | 'web' | 'unknown';

export type ShareParserHint = 'wechat_article' | 'xiaohongshu_note' | 'x_post' | 'generic_url';

export interface ShareContext {
  capture_method: 'share_extension' | 'clipboard' | 'manual_url';
  source_platform: ShareSourcePlatform;
  parser_hint: ShareParserHint;
  source_url: string | null;
  canonical_url: string | null;
  raw_share_text: string | null;
  source_title: string | null;
  origin_app: string | null;
  enrichment_state: 'pending';
}

export interface BuildShareContextInput {
  captureMethod: ShareContext['capture_method'];
  url?: string | null;
  text?: string | null;
  title?: string | null;
  originApp?: string | null;
}

export function buildShareContext(input: BuildShareContextInput): ShareContext {
  const url = normalizeUrl(input.url ?? extractFirstUrl(input.text ?? ''));
  const platform = detectSharePlatform(url, input.text ?? '');
  return {
    capture_method: input.captureMethod,
    source_platform: platform,
    parser_hint: parserHintForPlatform(platform),
    source_url: url,
    canonical_url: canonicalizeShareUrl(url, platform),
    raw_share_text: nullableTrim(input.text),
    source_title: nullableTrim(input.title),
    origin_app: nullableTrim(input.originApp),
    enrichment_state: 'pending',
  };
}

export function detectSharePlatform(url?: string | null, text = ''): ShareSourcePlatform {
  const normalized = normalizeUrl(url ?? extractFirstUrl(text));
  if (!normalized) return 'unknown';
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (host === 'mp.weixin.qq.com') return 'wechat_article';
    if (host.endsWith('xiaohongshu.com') || host === 'xhslink.com') return 'xiaohongshu';
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
      return 'x';
    }
    return 'web';
  } catch {
    return 'unknown';
  }
}

export function canonicalizeShareUrl(url: string | null, platform?: ShareSourcePlatform): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (platform === 'x') {
      const statusMatch = parsed.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/i);
      if (statusMatch) return `https://x.com/${statusMatch[1]}/status/${statusMatch[2]}`;
      parsed.hostname = 'x.com';
    }
    if (platform === 'wechat_article') {
      parsed.hash = '';
      return parsed.toString();
    }
    if (platform === 'xiaohongshu') {
      parsed.hash = '';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return url.trim() || null;
  }
}

function parserHintForPlatform(platform: ShareSourcePlatform): ShareParserHint {
  if (platform === 'wechat_article') return 'wechat_article';
  if (platform === 'xiaohongshu') return 'xiaohongshu_note';
  if (platform === 'x') return 'x_post';
  return 'generic_url';
}

function extractFirstUrl(value: string): string | null {
  return value.match(/https?:\/\/[^\s)）]+/i)?.[0] ?? null;
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
