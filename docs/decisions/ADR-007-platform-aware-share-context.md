# ADR-007 — Platform-Aware Share Context for Mac-Side Source Enrichment

**Date**: 2026-05-16  
**Status**: accepted; amended by ADR-008 for Library materialization

## Context

Orbit Mobile needs to receive WeChat articles, Xiaohongshu notes, and X/Twitter posts from iOS sharing surfaces, then sync them to Mac Orbit for platform-specific parsing. These sources are brittle on mobile:

- WeChat and Xiaohongshu often require platform-specific HTML handling and may fail or degrade without browser context.
- X/Twitter public post extraction can depend on oEmbed or page markup that changes over time.
- Mobile save must remain local-first and must not depend on network parsing.

## Decision

Orbit Mobile will treat these shares as durable source handoff captures:

1. Share Extension writes the raw share payload into App Group `share-inbox/`.
2. Main app imports that payload through the existing `createCapture()` five-phase atomic write path.
3. The mobile manifest stores a structured `context.share_context` with:
   - `source_platform`: `wechat_article` / `xiaohongshu` / `x` / `web` / `unknown`
   - `parser_hint`
   - `source_url` and `canonical_url`
   - raw share text and optional LinkPresentation title
   - `enrichment_state: "pending"`
4. Mac Orbit reads `context.share_context`, creates a Library item for URL shares, and runs best-effort parsing through desktop Content Connectors after manifest/hash/attachment verification.
5. Mac-side parsing failure never fails ingest or ACK. The original mobile capture remains the transport/provenance source, and the Library item keeps the URL/raw share text.

## Consequences

- Mobile remains fast, offline-capable, and data-safe.
- Platform parsers can evolve independently on Mac without changing the mobile atomic write protocol.
- Xiaohongshu and other dynamic sources can still be useful via URL + raw share text + screenshot/image attachments, even when parsing fails.
- The manifest schema stays at v1 because `context.share_context` is optional and backward-compatible.
