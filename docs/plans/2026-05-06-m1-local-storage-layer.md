---
status: completed
milestone: M1
related_adr: ADR-001
created: 2026-05-06
---

# M1 Plan: 本地存储层

> **阅读对象**：下一个接手 M1 的 AI / 开发者
> **前置知识**：本 plan 假设你已按 `AGENTS.md` §4 的顺序读过 `VISION.md` / `STATUS.md` / `ARCHITECTURE.md` / `ROADMAP.md`。
> 如果没读，**先停下去读**。本文不重复这些文档已说清的内容，只告诉你"怎么落地"。

## 目标

M1 结束时，项目处于以下状态：

1. 一个可以 `npm start` 起来的 Expo TypeScript 项目
2. 冷启动时会在 `<sandbox>/Documents/orbit.db` 创建 / 打开 SQLite 数据库
3. `captures` / `sync_events` / `drafts` / `device_info` 四张表按 `DATA-MODEL.md §1` 的 schema 存在
4. Migration 框架能从 `schema_version=0` 升到 `schema_version=1`（即 `001_initial`）
5. 三个 repo（`captures-repo` / `drafts-repo` / `events-repo`）提供**纯异步**的 CRUD API，`core/` 和 `ui/` 都通过它们访问数据
6. `utils/id.ts` / `utils/fs.ts` / `utils/logger.ts` 可用
7. **单元测试全绿**：每个 repo 的 happy path + 边界 + 事务回滚
8. `docs/TESTING.md` 的 M1 验收清单全部勾选
9. `docs/STATUS.md` 推进到 "M1 completed"

**明确不做**（防止过度工程）：

- 原子写入协议（Phase 1–5）→ M2
- `captures/<id>/` 目录的真正写入（manifest / sha256 / 附件复制）→ M2
- `SyncWorker` / 退避 / iCloud → M3
- 任何 UI 屏幕（`capture-screen.tsx` 等）→ M2
- Reconcile Job 的实体 → M2/M3（M1 只留 stub 接口）

## 前置条件

- **M0 文档齐全** ✅（见 `STATUS.md` §M0 已完成清单）
- **M0 骨架部分**：`STATUS.md` §M0 剩余里列的 "Expo 项目实际 bootstrap / package.json / tsconfig / .eslintrc / git init" **本 plan 的 Step 1–2 就是做这些**，不要跳过
- **开发环境**：按 `DEVELOPMENT.md §1` 确认 Node 20+ / Xcode 15+ / Watchman / CocoaPods / iOS Simulator 17+
- **源码目录**：`src/core/{storage,capture,sync,audio,media,reconcile}` / `src/ui/{screens,components,hooks}` / `src/native` / `src/utils` / `src/types` / `tests` 已由 M0 创建（验证：`ls src/core/storage` 应返回空目录而非报错）

## 实施步骤

### Step 1: Expo 项目 bootstrap

**关键**：仓库根目录非空（已有 `docs/`、`src/`、`AGENTS.md` 等），**不能**直接 `npx create-expo-app .`。严格按 `DEVELOPMENT.md §2.1` 的"临时目录 + 拷回"流程：

```bash
# 1. 在临时目录生成
cd /tmp
npx create-expo-app orbit-mobile-temp --template blank-typescript

# 2. 先看 temp 里生成了什么
ls -la /tmp/orbit-mobile-temp

# 3. 选择性拷贝——仅拷 Expo 产物，不拷 .git，不覆盖已有文件
cd /tmp/orbit-mobile-temp
cp -Rn . /Users/ryanbzhou/Developer/vibe/orbit-mobile/

# 4. 确认已有文档 / src 骨架没被动过
cd /Users/ryanbzhou/Developer/vibe/orbit-mobile
git status
ls docs/
ls src/core/storage/

# 5. 清理 temp
rm -rf /tmp/orbit-mobile-temp
```

**关于冲突**：

- `.gitignore` 可能 Expo 的更全——**手动 diff 后合并**到已有的，不要盲目覆盖
- `README.md` 项目根已有——**不要覆盖**；Expo 的 README 用不上
- 如果 `cp -Rn` 报了任何 "File exists"，停下来人工看一下是哪个文件冲突

**是否 commit 中间态**：Bootstrap 完成后（且 Step 2 还没开始时）**必须 commit 一次**：

```
chore(m0): bootstrap Expo TypeScript project
```

理由：一旦 Step 2–4 出问题，可以干净回滚到"只有 Expo 脚手架"的状态。若发现 git 仓库尚未初始化（`git status` 报错），先 `git init && git add <具体文件>`，再 commit。**禁止 `git add -A`**（见 `AGENTS.md §6`）。

### Step 2: 依赖与配置

**2.1 M1 仅安装必要依赖**（不要一次装完 `DEVELOPMENT.md §2.2` 所有包——节省时间、减少风险面）：

```bash
cd /Users/ryanbzhou/Developer/vibe/orbit-mobile

# 运行时（M1 只需要这两个）
npx expo install expo-sqlite expo-file-system expo-crypto

# 开发依赖
npm install -D \
  typescript@~5.3 \
  @types/react \
  @types/node \
  eslint \
  eslint-config-universe \
  prettier \
  vitest \
  @vitest/coverage-v8
```

`expo-crypto` 提供 `randomUUID()`，比引 `nanoid` 少一个依赖（见 `DATA-MODEL.md §8`）。

**M2/M3 会用到的依赖**（现在**不装**）：`expo-av` / `expo-image-picker` / `expo-camera` / `expo-image-manipulator` / `expo-speech-recognition` / `expo-clipboard` / `expo-haptics` / `expo-router` / `expo-task-manager` / `expo-background-fetch` / `zustand` / `@react-native-community/netinfo`。

**2.2 `tsconfig.json`**：

```jsonc
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "App.tsx", "index.ts"]
}
```

Expo SDK 50+ 默认支持 `tsconfig.paths`。运行一次 `npx expo start --clear` 验证 `@/` 能解析。

**2.3 `.eslintrc.js`**：

```js
module.exports = {
  extends: ['universe/native', 'universe/shared/typescript-analysis'],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parserOptions: { project: './tsconfig.json' },
    },
  ],
  rules: {
    'import/order': ['warn', { 'newlines-between': 'always' }],
  },
};
```

**2.4 `.prettierrc`**：

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

**2.5 `package.json` scripts 补齐**：

```json
{
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "lint": "eslint 'src/**/*.{ts,tsx}' 'tests/**/*.{ts,tsx}'",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**2.6 `vitest.config.ts`**：

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

**2.7 `app.json`** `expo.ios.bundleIdentifier` 改为 `"com.zhouyanbo.orbit.capture"`（M3 加 iCloud entitlements，本 M1 不加）。

**2.8 commit**：`chore(m1): setup typescript/eslint/prettier/vitest tooling`

### Step 3: 目录与 stub 确认

`ARCHITECTURE.md §8` 的目录骨架已由 M0 创建。确认：

```bash
find src -type d | sort
```

**本 M1 要产出的文件清单**：

```
src/
├── core/storage/
│   ├── db.ts                       # Step 5
│   ├── schema.ts                   # Step 4
│   ├── captures-repo.ts            # Step 6
│   ├── drafts-repo.ts              # Step 7
│   ├── events-repo.ts              # Step 8
│   ├── device-info.ts              # Step 9
│   └── migrations/
│       ├── index.ts
│       └── 001_initial.ts
├── utils/
│   ├── id.ts                       # Step 10
│   ├── fs.ts                       # Step 10
│   └── logger.ts                   # Step 10
└── types/
    └── capture.ts                  # Step 4

tests/
├── storage/
│   ├── captures-repo.test.ts
│   ├── drafts-repo.test.ts
│   ├── events-repo.test.ts
│   └── migrations.test.ts
└── setup/
    └── in-memory-db.ts
```

### Step 4: SQLite schema 与 migration 框架

**4.1 `src/types/capture.ts`** — 领域类型（SQL 行与 TS 类型一一对应）：

```ts
export type SyncState =
  | 'pending' | 'syncing' | 'uploaded' | 'acked' | 'failed' | 'conflicted';

export type CaptureKind = 'thought' | 'voice' | 'photo' | 'share' | 'mixed';

export interface CaptureRow {
  id: string;
  created_at: string;            // ISO8601 UTC
  captured_at_local: string;     // ISO8601 with tz
  kind: CaptureKind;
  content_preview: string | null;
  content_hash: string;
  byte_size: number;
  has_audio: 0 | 1;
  has_image: 0 | 1;
  attachment_count: number;
  sync_state: SyncState;
  sync_attempts: number;
  sync_last_error: string | null;
  sync_last_try_at: string | null;
  sync_next_retry_at: string | null;
  uploaded_at: string | null;
  acked_at: string | null;
  ack_vault_path: string | null;
  local_path: string;
  deleted_locally: 0 | 1;
  metadata_json: string | null;
  schema_version: number;
}
```

同文件下再定义 `DraftRow` / `SyncEventRow` / `DeviceInfoRow`，字段严格对齐 `DATA-MODEL.md §1.2–1.4`。

**4.2 `src/core/storage/schema.ts`** — 建表 SQL 字符串常量：严格复制 `DATA-MODEL.md §1.1–1.4`，唯一调整：

- 所有 `CREATE TABLE` / `CREATE INDEX` 加 `IF NOT EXISTS`（幂等）
- `sync_attempts` 等字段加 `NOT NULL`（文档里写 `DEFAULT 0` 但没写 NOT NULL，这里收紧）

```ts
export const SCHEMA_VERSION = 1;

export const CREATE_CAPTURES = `
CREATE TABLE IF NOT EXISTS captures (
  id                 TEXT PRIMARY KEY,
  ...
);`;

export const CREATE_CAPTURES_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_captures_sync_state
     ON captures(sync_state, sync_next_retry_at);`,
  `CREATE INDEX IF NOT EXISTS idx_captures_created
     ON captures(created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_captures_kind
     ON captures(kind);`,
];

export const CREATE_SYNC_EVENTS = `...`;
export const CREATE_DRAFTS = `...`;
export const CREATE_DEVICE_INFO = `...`;
```

**4.3 `src/core/storage/migrations/001_initial.ts`**：

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CREATE_CAPTURES, CREATE_CAPTURES_INDEXES,
  CREATE_SYNC_EVENTS, CREATE_DRAFTS, CREATE_DEVICE_INFO,
} from '../schema';

export const version = 1;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_CAPTURES);
  for (const sql of CREATE_CAPTURES_INDEXES) await db.execAsync(sql);
  await db.execAsync(CREATE_SYNC_EVENTS);
  await db.execAsync(CREATE_DRAFTS);
  await db.execAsync(CREATE_DEVICE_INFO);
}
```

**4.4 `src/core/storage/migrations/index.ts`** — migration runner：

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import * as m001 from './001_initial';

const MIGRATIONS = [m001];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // 自举 device_info 表
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS device_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM device_info WHERE key = 'schema_version'`,
  );
  const current = row ? parseInt(row.value, 10) : 0;

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await m.up(db);
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO device_info (key, value, updated_at)
         VALUES ('schema_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [String(m.version), now],
      );
    });
  }
}
```

**要点**：每个 migration 在一个事务里；`schema_version` 存在 `device_info`；Migration 数组**只追加不改写**。

### Step 5: DB 打开与封装

**`src/core/storage/db.ts`**：

```ts
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';

const DB_NAME = 'orbit.db';
let _db: SQLiteDatabase | null = null;

export async function openDb(): Promise<SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`PRAGMA journal_mode = WAL;`);
  await db.execAsync(`PRAGMA foreign_keys = ON;`);
  await runMigrations(db);
  _db = db;
  return db;
}

export function getDb(): SQLiteDatabase {
  if (!_db) throw new Error('DB not opened. Call openDb() first.');
  return _db;
}

export async function closeDb(): Promise<void> {
  if (!_db) return;
  await _db.closeAsync();
  _db = null;
}

export async function transaction<T>(
  fn: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = getDb();
  let result!: T;
  await db.withTransactionAsync(async () => {
    result = await fn(db);
  });
  return result;
}
```

**API 版本提醒**：Expo SDK 51+ 用 `openDatabaseAsync` / `execAsync` / `runAsync` / `getFirstAsync` / `getAllAsync` / `withTransactionAsync`。**动手前打开 https://docs.expo.dev/versions/latest/sdk/sqlite/ 对照你装的版本**，若不匹配升级 `expo-sqlite` 而不要降级封装。

**repo 设计约束**：repo 层**不直接调 `getDb()`**，而是接收 `SQLiteDatabase` 参数，便于测试注入 in-memory 库。

### Step 6: captures-repo 实现

所有函数第一个参数是 `db: SQLiteDatabase`。必要方法：

```ts
export async function insert(db, input: InsertCaptureInput): Promise<void>;
export async function get(db, id: string): Promise<CaptureRow | null>;
export async function list(db, opts?: { limit?; offset?; includeDeleted? }): Promise<CaptureRow[]>;
export async function listByState(db, state: SyncState, opts?: { limit?; dueBefore? }): Promise<CaptureRow[]>;
export async function updateSyncState(db, id: string, patch: Partial<...>): Promise<void>;
export async function markDeleted(db, id: string): Promise<void>;  // 软删
export async function countByState(db): Promise<Record<SyncState, number>>;
```

**`updateSyncState` 的动态 SQL 必须用列名白名单**：

```ts
const ALLOWED_COLS = new Set([
  'sync_state', 'sync_attempts', 'sync_last_error',
  'sync_last_try_at', 'sync_next_retry_at',
  'uploaded_at', 'acked_at', 'ack_vault_path',
]);
```

**约定**：

- boolean 在输入层接收 `boolean`，内部转 0/1 存 `INTEGER`
- 时间戳**不由 repo 生成**——调用方传入
- 所有 SQL 占位符用 `?`（与测试环境 `better-sqlite3` 兼容）

### Step 7: drafts-repo 实现

```ts
export async function upsert(db, input: DraftInput): Promise<void>;
  // INSERT ... ON CONFLICT(session_id) DO UPDATE SET content=?, ..., updated_at=?
  // 新记录 created_at = updated_at = now；更新时 created_at 保持不变
export async function get(db, sessionId: string): Promise<DraftRow | null>;
export async function list(db, opts?: { limit? }): Promise<DraftRow[]>;  // ORDER BY updated_at DESC
export async function del(db, sessionId: string): Promise<void>;  // 避开 JS 保留字
```

草稿表**不**包含软删除字段——要么在要么不在。

### Step 8: events-repo 实现

```ts
export type SyncEventName =
  | 'created' | 'enqueued' | 'started' | 'uploaded'
  | 'ack' | 'failed' | 'retried' | 'manual_retry' | 'reset';

export async function append(db, captureId: string, event: SyncEventName, details?: Record<string, unknown>): Promise<void>;
export async function listByCapture(db, captureId: string, opts?: { limit? }): Promise<SyncEventRow[]>;
export async function listRecent(db, opts?: { limit? }): Promise<SyncEventRow[]>;
export async function gc(db, opts: { olderThanDays?: number; keepPerCapture?: number }): Promise<{ deleted: number }>;
```

**M1 `gc` 仅实现 `olderThanDays` 这一刀**；`keepPerCapture` 的窗口函数实现写 `throw new Error('not implemented')` + TODO(M3) 占位。

### Step 9: device_info 工具

**`src/core/storage/device-info.ts`** — 薄薄一层 KV：

```ts
export async function getValue(db, key: string): Promise<string | null>;
export async function setValue(db, key: string, value: string): Promise<void>;  // UPSERT ON CONFLICT(key)
export async function getOrInit(db, key: string, init: () => string | Promise<string>): Promise<string>;
```

**初始化调用点**：`openDb()` 完成 migration 后，调用 `getOrInit(db, 'device_id', generateDeviceId)`。

**TODO(M2)**：冷启动 < 1s 的目标要求 device_id 初始化挪到 after-first-paint，M1 无 UI 先 await 即可。在 `device-info.ts` 顶部加大字注释。

### Step 10: utils 实现

**10.1 `src/utils/id.ts`**：

```ts
import * as Crypto from 'expo-crypto';

export function generateCaptureId(): string {
  return `mob_cap_${Crypto.randomUUID()}`;
}
export function generateSessionId(): string { return Crypto.randomUUID(); }
export function generateDeviceId(): string { return Crypto.randomUUID(); }
```

**10.2 `src/utils/fs.ts`** — M1 只需薄薄一层：

```ts
import * as FileSystem from 'expo-file-system';

export const DOCUMENTS_DIR = FileSystem.documentDirectory!;

export async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

/**
 * ⚠️ TODO(M2): 实现真正的 fsync
 * expo-file-system 当前版本不直接暴露 fsync——M2 原子写入协议需要时再补 native module。
 * 本 M1 暂用 noop 但保留签名让调用点稳定。
 */
export async function fsync(_path: string): Promise<void> { return; }
```

`fsync` 是 M2 原子写入协议的硬依赖。M1 末尾若有余力可调研 `expo-file-system-next`。

**10.3 `src/utils/logger.ts`**：ndjson 追加写到 `Documents/logs/sync-YYYY-MM-DD.ndjson`。

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export const logger = {
  debug: (event: string, data?: unknown) => write('debug', event, data),
  info:  (event: string, data?: unknown) => write('info',  event, data),
  warn:  (event: string, data?: unknown) => write('warn',  event, data),
  error: (event: string, err: unknown, data?: unknown) =>
    write('error', event, { err: err instanceof Error ? err.message : err, ...(data as object) }),
};
```

**已知缺陷**：读-拼-写的实现性能随日志膨胀 O(n²)。**M3 之前必须换成真正的 append**（`expo-file-system-next` 或自写 native），在文件顶部标 `TODO(M3)`。

### Step 11: 单元测试

**11.1 测试环境策略**：`expo-sqlite` 在 Node 跑不起来。在测试里用 `better-sqlite3` 伪装出相同的 async API 形状：

```ts
// tests/setup/in-memory-db.ts
import Database from 'better-sqlite3';

export function createTestDb() {
  const db = new Database(':memory:');
  return {
    async execAsync(sql: string) { db.exec(sql); },
    async runAsync(sql: string, params: unknown[] = []) {
      return db.prepare(sql).run(params as any);
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (db.prepare(sql).get(params as any) as T) ?? null;
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(params as any) as T[];
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      db.exec('BEGIN');
      try { await fn(); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async closeAsync() { db.close(); },
  };
}
```

安装：`npm install -D better-sqlite3 @types/better-sqlite3`。

**11.2 必须覆盖的用例**：

**`captures-repo.test.ts`**：
- `insert` → `get` 回读字段一一匹配
- `list()` 默认按 created_at DESC + 过滤软删
- `listByState('pending')` / `listByState('failed', { dueBefore })`
- `updateSyncState` 多字段原子更新；非法列名抛错（防注入）
- `markDeleted` 后 `get` 仍在但 `list` 默认看不到
- `countByState` 分组计数

**`drafts-repo.test.ts`**：
- `upsert` 新建 → `created_at === updated_at`
- 再次 `upsert` 同 session_id → `updated_at` 刷新，`created_at` 不变
- `list()` 按 updated_at DESC
- `del()` 后 `get()` 返回 null

**`events-repo.test.ts`**：
- `append` → `listByCapture` 倒序
- `listRecent({ limit: 5 })` 返回最新 5 条
- `gc({ olderThanDays: 30 })` 清理 31 天前

**`migrations.test.ts`**：
- 全新 DB → 跑完后 schema_version='1'，四张表都在
- 已 v1 → 再跑幂等
- 事务回滚：mock 一个抛错的 migration → schema_version 保持，且不留脏表

**11.3 跑测**：`npm test` 全绿；覆盖率不硬指标，但每个导出函数至少 1 条 happy path。

### Step 12: M1 验收

对照 `TESTING.md §二 M1 验收` 逐项：

- [ ] SQLite 文件正确创建在沙盒
- [ ] 四张表存在，schema_version 写入 device_info
- [ ] repo 层单元测试全通过
- [ ] 事务回滚行为正确
- [ ] migration 从 0 → 1 正确

再加一条真机烟囱测（临时 App.tsx）：

```tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { openDb } from '@/core/storage/db';
import * as captures from '@/core/storage/captures-repo';
import { generateCaptureId } from '@/utils/id';

export default function App() {
  const [msg, setMsg] = useState('starting...');
  useEffect(() => {
    (async () => {
      const db = await openDb();
      const id = generateCaptureId();
      await captures.insert(db, {
        id, created_at: new Date().toISOString(),
        captured_at_local: new Date().toISOString(),
        kind: 'thought', content_preview: 'hello m1',
        content_hash: 'deadbeef', byte_size: 8,
        local_path: `${id}/`,
      });
      const row = await captures.get(db, id);
      setMsg(row ? `OK: ${row.id}` : 'FAIL');
    })().catch(e => setMsg(`ERR: ${(e as Error).message}`));
  }, []);
  return <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
    <Text>{msg}</Text>
  </View>;
}
```

**这个 App.tsx 是临时烟囱，M2 会被 capture-screen 取代，不要过度打磨**。

验收全过后：

1. 更新 `docs/STATUS.md`：勾 M1 完成项，更新 "Last updated" / "Current milestone"
2. 更新 `docs/ROADMAP.md §M1` checkbox
3. 把本 plan 顶部 `status: draft` 改为 `status: completed`
4. commit：`feat(m1): local storage layer with sqlite + repos`
5. 新建 M2 plan draft

## 风险与注意

1. **expo-sqlite API 版本漂移** — SDK 50→51→52 经历过重构（旧 `transaction` callback → 新 `withTransactionAsync`）。动手前对照官方文档。若不匹配**升级 `expo-sqlite`，不要降级封装**——老 API 在 M3/M4 可能被移除。

2. **事务 API 特殊性** — `withTransactionAsync` 不传 `tx` 对象，靠"该 db 实例在事务期间的调用都算事务"。**事务内部不要 await 外部数据库连接**。

3. **并发写入** — M1 没有 Share Extension（M7 才有），但**必须开 WAL**（`PRAGMA journal_mode = WAL`）为 M7 铺路。

4. **日志追加 O(n²) 坑** — 见 Step 10.3。M1 几十条可忍，M3 前必须换。

5. **测试环境 `better-sqlite3` vs `expo-sqlite` 语义差异** — 方言都是 SQLite 3.x，但 `better-sqlite3` 的 `prepare().run(params)` 接收**数组**。**全 repo 用 `?` 占位符**，避免两端语法差异。

6. **device_id 初始化时序** — 见 Step 9。M2 有 UI 后必须挪到 after-first-paint。

7. **Expo 入口** — `App.tsx` 是默认入口。想改 expo-router 留给 M2，本 M1 **不改**。

## 完成标准

- [x] 所有新文件创建且 `npm run typecheck` 通过
- [x] `npm run lint` 无错误
- [x] `npm run test` 全绿（至少覆盖 Step 11.2 列的所有用例）
- [x] `TESTING.md §二 M1 验收` 五项清单全覆盖在 repo 单元测试中
- [x] Expo smoke screen 已接入 `App.tsx`，启动后显示 `Hello Orbit` 和本地存储状态
- [x] `STATUS.md` 更新到 M1 completed
- [x] `ROADMAP.md §M1` checkbox 全勾
- [x] 本 plan 顶部 `status: completed`
- [x] 新建 M2 plan draft（路径：`docs/plans/2026-05-07-m2-atomic-write-and-capture-ui.md`）
- [x] schema 未调整，无需 ADR-002

## 预估工作量

- Step 1–2（bootstrap + 工具链）：半个工作日
- Step 4–9（schema + repo + device_info）：一个工作日
- Step 10（utils）：半个工作日
- Step 11（测试）：一个工作日
- Step 12（验收 + 文档回写）：半个工作日

合计约 **3.5 工作日**（一个熟练 AI 或开发者，不含调试 expo-sqlite API 漂移的意外时间）。

## 产出后续动作

- 推进到 **M2**：原子写入协议（五阶段） + `capture/` 领域类型 + 最小 Capture UI
- 若 M1 期间发现 `DATA-MODEL.md` schema 需调整 → 正式写 **ADR-002**（不要直接改 DATA-MODEL.md）
- 调研 `expo-file-system-next` 的 `openAsync({ append: true })` 是否适合替代 `logger.ts` 的读-拼-写（结果记到 `open-questions.md`）
- 若 `expo-sqlite` API 与本 plan 不匹配 → 更新 DEVELOPMENT.md 的依赖版本说明
