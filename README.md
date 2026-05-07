# Orbit Mobile

> iOS Capture front-post for [Orbit](https://github.com/) — zero-friction, lossless, local-first capture of your fleeting thoughts, synced back to your desktop Second Brain via iCloud Drive.

**Status**: 🚧 Design phase / M0 — documentation & skeleton

---

## What this is

Orbit Mobile is the **Capture companion** for Orbit's desktop workbench. Phones are where the interesting thoughts happen — on the subway, in the shower, during meetings, late at night in bed. This app exists to let you get those thoughts out of your head in **under 3 seconds**, with zero setup, zero account, zero cloud lock-in.

**What it does**:
- Text / voice (with live transcription) / photo capture
- Data lives on your device first, syncs to iCloud Drive second
- Flows back into Orbit desktop's Inbox → Thoughts

**What it's not**:
- Not a note-taking app
- Not a mini version of Orbit desktop
- No editor, no project management, no agents, no chat

---

## The #1 rule: local-first

**Device storage is the single source of truth. iCloud is a transport, not a database.**

Airplane mode? Works.  
iCloud not signed in? Works.  
iCloud quota exhausted? Works.  
Network flapping? Works.  
App force-killed mid-save? No data loss.

If it breaks, we didn't build it right.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the three-layer storage design and atomic write protocol.

---

## Where to start

**If you're an AI agent picking up this project**, your reading order is:

1. [`AGENTS.md`](./AGENTS.md) — the iteration contract, read this first every single time
2. [`docs/VISION.md`](./docs/VISION.md) — why this exists
3. [`docs/STATUS.md`](./docs/STATUS.md) — where we are right now
4. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — what comes next
5. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how it's built

**If you're a human**, same order, but you can skim faster.

---

## Current status

Documentation-only. No runnable code yet.

Next milestone: M1 — local storage layer (SQLite schema + repos).

Full status: [`docs/STATUS.md`](./docs/STATUS.md)

---

## Tech stack (planned)

- Expo SDK 50+
- React Native + TypeScript
- expo-sqlite (local index)
- expo-file-system (durable local files)
- iCloud Drive (transport only, via self-written Swift native module)
- Zustand (state)

Intentionally minimal — no server, no account, no analytics, no third-party cloud.

---

## Relationship to Orbit desktop

Orbit Mobile is **not** a standalone product. It's the mobile capture entry point for the Orbit ecosystem. Data flows:

```
iPhone → iCloud Drive → Mac Orbit (mobile_inbound module) → Inbox → Thoughts
```

Mac-side work is tracked in [`docs/ORBIT-INTEGRATION.md`](./docs/ORBIT-INTEGRATION.md) and will require a small PR in the Orbit desktop repo.

---

## License

TBD (likely MIT, matching Orbit desktop).

---

## Contributing

See [`AGENTS.md`](./AGENTS.md) for the iteration workflow. Both humans and AIs follow the same rules.

**Non-negotiable**: local-first. Any change that weakens the local-first guarantees will be rejected.
