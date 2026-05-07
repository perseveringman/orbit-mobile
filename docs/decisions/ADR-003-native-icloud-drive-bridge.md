# ADR-003: Native iCloud Drive bridge for Layer 3 transport

**Status**: accepted  
**Date**: 2026-05-07

## Context

M3 needs to move local capture directories from Layer 2 into iCloud Drive without introducing a server, account system, or proprietary cloud. JavaScript-only file APIs do not expose the iCloud container and upload status needed by the sync protocol.

## Decision

Orbit Mobile will use a local Expo native module, `orbit-icloud-bridge`, as the Layer 3 transport boundary. The module exposes container probing, directory copy into `Documents/inbox/<id>/`, upload status, and small text reads for M4 ACK/failure sentinels.

The JS wrapper must treat missing iCloud capability, missing Apple ID, or missing native module as explicit unavailable states. Capture remains fully local and successful even when the transport is unavailable.

## Consequences

- The app keeps the no-server and local-first constraints while gaining a debuggable iCloud Drive path.
- SyncWorker can update SQLite metadata and UI status without coupling Capture success to iCloud.
- Real iCloud behavior still requires device-level validation because simulators and unit tests cannot prove Apple ID, quota, or Finder visibility behavior.
- M4 can reuse `readTextFile()` to consume `processed/<id>/.acked` and `failed/<id>/.failed.json` after the Mac ingest PR exists.
