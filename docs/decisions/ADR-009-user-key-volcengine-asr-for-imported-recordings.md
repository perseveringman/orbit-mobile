# ADR-009: User-key Volcengine ASR for imported recordings

**Status**: accepted  
**Date**: 2026-05-17

## Context

Apple Speech only covers audio captured through the iPhone live recording path. Imported audio, Voice Memos shared into Orbit Mobile, and X1 device files imported from the recorder list may have raw audio but no local transcript. Those recordings still need a final transcript so AI notes, proofread suggestions, and Mac ingest receive useful text.

Orbit Mobile cannot introduce a backend, account system, or cloud storage proxy. Raw audio must still be written to local capture storage before any external request is attempted.

## Decision

Orbit Mobile will add a `recording_transcription` AI task backed by Volcengine Doubao Speech large-model recording-file recognition. The first implementation uses the flash endpoint:

`POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash`

The app sends `audio.data` as base64 from the already-persisted local audio file. Volcengine ASR credentials are stored in iOS Keychain through `expo-secure-store`; the current user-facing settings use the legacy-compatible `App ID + Secret/Access Token` pair, sent as `X-Api-App-Key` and `X-Api-Access-Key`. SQLite stores only non-sensitive settings such as `resource_id`, base URL, auto-transcribe toggle, and optional `boosting_table_id`.

Imported recordings start with `recordings.final_state = 'offline_queued'` and `manifest.recording.final_provider = 'pending-cloud-asr'`. ASR success atomically rewrites local `final-transcript.json`, `manifest.json`, `manifest.json.sha256`, audio `transcription`, and `captures` metadata, then enqueues text-only DeepSeek notes/proofread tasks. ASR failure never rolls back or deletes the original audio capture.

## Consequences

- Voice/import/X1 audio becomes searchable and usable by downstream AI without making cloud ASR a capture prerequisite.
- The device remains the source of truth; Volcengine is a user-configured processor, not a data store.
- Hotword optimization for ASR uses Volcengine's `boosting_table_id`/`boosting_table_name` mechanism rather than uploading Orbit's local hotword list directly.
- Flash ASR official limits apply. The current integration preserves unsupported files locally and surfaces ASR errors; local transcoding or a secondary standard/subtitle route can be added later for broader formats such as Voice Memos `.m4a` if needed.
