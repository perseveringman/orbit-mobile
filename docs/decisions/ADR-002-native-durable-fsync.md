# ADR-002: Native durable fsync for atomic capture writes

**Status**: accepted  
**Date**: 2026-05-07

## Context

M2 introduces the first user-visible write path: text Capture must be saved locally before any sync work begins. The architecture requires an atomic protocol where WAL, staging data, final capture directories, and SQLite rows cannot leave a half-written success state after crashes.

The M1 `fsync()` helper was intentionally a placeholder. Keeping it as a noop would make the code appear atomic while relying on OS writeback timing, which violates the local-first contract.

## Decision

Orbit Mobile will use a local Expo native module, `orbit-durable-fs`, for durable fsync on iOS. JavaScript write paths call `src/utils/fs.ts#fsync()`, which delegates to the native `OrbitDurableFS` module. The Swift implementation opens the file or directory path, attempts `F_FULLFSYNC` on iOS, and falls back to POSIX `fsync`.

If the native module is unavailable, writes must fail loudly instead of silently downgrading to a noop.

## Consequences

- Atomic Capture writes can explicitly request persistence for WAL files, staged manifest files, final capture directories, and the parent captures directory.
- The app now requires a native build/prebuild for iOS; Expo Go cannot exercise this durability path.
- TestFlight readiness must include real-device crash recovery validation because unit tests can only cover protocol ordering and reconcile behavior, not hardware persistence guarantees.
- Future attachment-heavy milestones may need a streaming/native hash path, but the durability boundary remains this native fsync helper.
