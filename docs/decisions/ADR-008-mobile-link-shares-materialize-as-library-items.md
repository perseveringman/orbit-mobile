# ADR-008 — Mobile Link Shares Materialize as Library Items

**Date**: 2026-05-17  
**Status**: accepted

## Context

ADR-005 made all mobile captures materialize as Notes on desktop Orbit. That is right for thoughts, recordings, photos, and mixed captures, but it is the wrong Layer 1 home for external URLs shared from WeChat, Xiaohongshu, X, Safari, and similar sources.

External links are source material. In Orbit's desktop layer model, source material belongs in Library, while Feed remains a Layer 0 signal stream until a user saves an item to Library.

## Decision

Mobile keeps the same local-first capture and iCloud transport protocol, but desktop materialization now branches:

- Non-link captures continue to become Notes.
- `kind='share'` captures with a URL become Library items.
- The ACK schema v2 now allows `artifact_kind='library_item'` with `library_item_id` and `library_item_path`.
- iOS stores `note_path` or `library_item_path` into the generic `ack_vault_path` field and shows `✓ 已到 Orbit`.
- Mobile continues to write only `context.share_context`; parsing remains a Mac-side responsibility.

## Consequences

- URL shares land in the reading/research surface instead of polluting Notes.
- Library and Feed can share the same parsing infrastructure on Mac.
- iOS does not need a schema bump because `context.share_context` stays optional and ACK parsing is backward-compatible.
- Existing Note ACK v2 and legacy ACK v1 remain supported.

## Follow-up

Desktop Orbit owns the Content Connector layer and the OpenCLI connector integration. Mobile only needs to keep share context rich enough for Mac-side connector selection and provenance.
