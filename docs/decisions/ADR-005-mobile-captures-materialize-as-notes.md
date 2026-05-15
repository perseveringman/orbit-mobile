# ADR-005: Mobile captures materialize as Notes and Timeline events

**Status**: accepted  
**Date**: 2026-05-15

## Context

Orbit's desktop architecture has moved capture ground truth into Layer 1 Notes, with Timeline as a projection over `TraceableEvent`. The earlier Orbit Mobile integration targeted the old Inbox / Thoughts flow and rendered mobile AI derivatives into the Thought body.

That no longer matches the current model. Mobile and Mac captures should behave consistently: they should create Notes directly and appear on Timeline without passing through the product Inbox.

## Decision

Orbit Mobile will continue to use iCloud Drive `Documents/inbox/<capture_id>/` as a transport queue, but desktop Orbit will materialize each capture as a Note under `notes/*` and publish a `note.created` event. The ACK format is upgraded to schema v2 with `artifact_kind: "note"`, `note_id`, `note_path`, and `timeline_event_id`.

DeepSeek-generated mobile derivatives are not written into the Note body by default. Desktop Orbit converts them into `summary.entity` Synthesis artifacts scoped to the Note, so Note Workbench can show and accept them explicitly.

## Consequences

- The iCloud folder name `inbox/` is transport-only vocabulary, not product Inbox semantics.
- Notes remain source-first: original text, transcript excerpts, and attachment links are body content; AI summaries and todos are Workbench proposals.
- Timeline can show mobile captures through the same `note.created` projection as Mac Quick Capture.
- iOS must support ACK v2 and keep legacy ACK v1 compatibility for already processed captures.
- Both repositories must treat duplicate `processed/<id>/.acked` as an idempotency guard.
