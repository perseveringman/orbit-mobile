# Orbit Mobile - Orbit Desktop Integration

> **Status**: implemented  
> **Last updated**: 2026-05-15  
> **Target**: Orbit desktop repo `/Users/ryanbzhou/Developer/new-orbit`

This document is the cross-repo contract between Orbit Mobile and desktop Orbit.

The current design is:

```text
Orbit Mobile local capture
  -> iCloud Drive transport queue: Documents/inbox/<capture_id>/
  -> desktop mobile_inbound verifies manifest + attachments
  -> desktop materializes thoughts/recordings/photos as Notes
  -> desktop materializes URL shares as Library items
  -> desktop publishes note.created or library.item.added
  -> Timeline shows the Layer 1 event
  -> desktop writes processed/<capture_id>/.acked
```

Important naming note: the iCloud folder is still named `inbox/` because it is a transport queue. It is **not** Orbit product Inbox, and mobile captures do **not** become Inbox Thoughts.

---

## 1. Module Boundary

Desktop Orbit owns:

```text
src/main/capture/mobile_inbound/
├── index.ts
├── watcher.ts
├── ingest.ts
├── attachments.ts
├── config.ts
├── ack.ts
└── types.ts
```

Responsibilities:

- Watch `~/Library/Mobile Documents/iCloud~com.zhouyanbo.orbit.capture/Documents/inbox/*/.complete`.
- Verify `manifest.json.sha256`.
- Verify every attachment relative path, `sha256`, and `byte_size`.
- Copy attachments into `<vault>/.orbit/capture/attachments/<capture_id>/`.
- Create or reuse a stable Note for non-link captures, currently `note-<capture_id>`.
- Create or reuse a stable Library item for URL shares, currently `lib-<capture_id>`.
- Publish `note.created` or `library.item.added` so Timeline displays the Layer 1 materialization.
- Move iCloud input to `processed/<capture_id>/` and write ACK v2.
- Move invalid input to `failed/<capture_id>/` and write `.failed.json`.

---

## 2. iCloud Transport Layout

```text
Documents/
├── inbox/<id>/
│   ├── manifest.json
│   ├── manifest.json.sha256
│   ├── .complete
│   └── attachments...
├── processed/<id>/
│   ├── manifest.json
│   ├── .acked
│   └── attachments...
└── failed/<id>/
    ├── manifest.json
    ├── .failed.json
    └── attachments...
```

Mobile always writes local SQLite + filesystem first. iCloud only receives complete capture directories after local persistence and, for recordings, after automatic AI generation reaches a terminal state.

---

## 3. Materialization Rules

Desktop maps mobile capture kinds to Layer 1 artifacts:

| Mobile kind | Desktop artifact |
|---|---|
| `thought` | Note `thought` |
| `voice` / `recording` | Note `voice_log` |
| `photo` / `mixed` | Note `capture` |
| `share` with URL | Library item `article` |
| `share` without URL | Note `capture` fallback |

The Note frontmatter uses:

```yaml
source:
  kind: mobile_capture
  ref: <capture_id>
```

URL share policy:

- The mobile manifest remains a local-first source handoff; iOS does not parse the remote page.
- Desktop creates a Library item with `source.kind = share`, `source.capture_id`, `source.url`, `source.canonical_url`, raw share text, origin app, parser hint, connector id/version, and parse status.
- Desktop parsing is handled by the shared Content Connector layer used by both Library and Feed. OpenCLI is the first external connector target; built-in best-effort parsing remains a fallback.
- Connector failure never fails mobile ingest or ACK. The Library item still contains the original URL/raw share text and a visible `content_status/content_error`.
- Successful parsing writes a source snapshot under `<vault>/.orbit/content/extracted/.../source.md`, referenced by `source_snapshot_ref`.

Note body policy:

- Include original user content.
- Include transcript excerpt only when a transcript artifact has usable text.
- Include links to human-facing source attachments such as compressed display images, audio, and regular files.
- Copy original image source files such as `original-photo-1.heic` for provenance, but do not expose them in the Note body by default.
- Copy technical transcript source files such as `partial-transcript.ndjson` and `final-transcript.json` for provenance, but do not expose them in the Note body by default.
- Do **not** write DeepSeek summary, decisions, risks, todos, or custom derivative content into the Note body by default.

AI derivative policy:

- Mobile may sync `summary.json`, `decisions.json`, `risks.json`, `todos.json`, `custom` derivatives, and transcript files as attachments.
- Desktop copies raw derivative JSON files for provenance.
- Desktop converts AI derivatives into a `summary.entity` Synthesis artifact scoped to the created Note.
- Note Workbench reads that artifact and shows summary / key points / suggestions.
- User acceptance happens in Note Workbench. Accepting a summary sets `synthesis_ref`; accepting tasks follows desktop approval rules.

This keeps the Note's ground truth body source-first while still making mobile DeepSeek output useful immediately.

---

## 4. ACK v2

Desktop success ACK for a Note:

```json
{
  "schema_version": 2,
  "acked_at": "2026-05-15T10:32:15.123Z",
  "artifact_kind": "note",
  "note_id": "note-mob_cap_xxx",
  "note_path": "notes/voice_logs/2026-05-15T10-32-product-meeting.md",
  "timeline_event_id": "mobile-capture-note:mob_cap_xxx",
  "vault_path": "/Users/ryanbzhou/.../MyVault",
  "mac_identity": "MacBook-Pro-Ryan",
  "orbit_version": "1.0.0"
}
```

Desktop success ACK for a Library item:

```json
{
  "schema_version": 2,
  "acked_at": "2026-05-17T10:32:15.123Z",
  "artifact_kind": "library_item",
  "library_item_id": "lib-mob_cap_xxx",
  "library_item_path": "library/articles/article-title.md",
  "timeline_event_id": "mobile-capture-library:mob_cap_xxx",
  "vault_path": "/Users/ryanbzhou/.../MyVault",
  "mac_identity": "MacBook-Pro-Ryan",
  "orbit_version": "1.0.0"
}
```

iOS behavior:

- Read ACK before reading failure state.
- Mark capture `acked`.
- Store `ack_vault_path` as `note_path` or `library_item_path` when present, falling back to legacy `vault_note_path` / `vault_path`.
- Treat ACK as terminal success. A stale `.failed.json` cannot override ACK.

Legacy compatibility:

- iOS still accepts schema v1 ACKs with `inbox_item_id`.
- Desktop still drops duplicate uploads when an existing v1 or v2 ACK is present.

---

## 5. Failure Contract

Desktop failure file remains schema v1:

```json
{
  "schema_version": 1,
  "failed_at": "2026-05-15T10:32:15.123Z",
  "error_code": "sha256_mismatch",
  "error_message": "attachment sha256 mismatch: audio.m4a",
  "retryable": true,
  "orbit_version": "1.0.0"
}
```

Retry semantics:

- `retryable: true`: iOS may reset to `pending` and upload the complete local capture again.
- `retryable: false`: iOS marks the capture `conflicted` for user-visible manual handling.
- Before retrying, iOS clears stale `failed/<id>` so an old failure cannot mask a later success.

---

## 6. Timeline Contract

For Notes, desktop publishes:

```ts
publishTraceableEvent({
  id: `mobile-capture-note:${captureId}`,
  at: manifest.created_at,
  source: 'activity',
  kind: 'note.created',
  payload: {
    note_id: note.frontmatter.id,
    path: note.path,
    type: note.frontmatter.type,
    title: note.frontmatter.title
  }
});
```

For URL shares, desktop publishes:

```ts
publishTraceableEvent({
  id: `mobile-capture-library:${captureId}`,
  at: manifest.created_at,
  source: 'activity',
  kind: 'library.item.added',
  payload: {
    item_id: libraryItem.frontmatter.id,
    path: libraryItem.path,
    title: libraryItem.frontmatter.title,
    url: libraryItem.frontmatter.url,
    status: libraryItem.frontmatter.status
  }
});
```

Timeline is a projection over `TraceableEvent`; it is not a truth store. The Note file is the Layer 1 truth.

---

## 7. End-to-End Acceptance

- iPhone saves text capture while offline: local data remains complete, sync waits.
- iPhone uploads `inbox/<id>/` after iCloud is available.
- Desktop verifies all hashes and materializes the capture as a Note or Library item.
- Desktop publishes `note.created` / `library.item.added`; Timeline shows the capture on its original `created_at` day.
- Desktop writes ACK v2; iOS shows `✓ 已到 Orbit`.
- Recording captures keep readable transcript excerpts and audio in Note body; photo captures show display images while original image files remain in attachments for provenance; technical transcript JSON remains in attachments for provenance; DeepSeek derivatives appear in Note Workbench, not as default Note body text.
