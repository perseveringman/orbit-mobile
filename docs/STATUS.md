# Orbit Mobile — Current Status

> **此文件必须随每次提交更新。**  
> 下一个接手的 AI 第一件事是读这里，知道"做到哪里了"。

**Last updated**: 2026-05-07（M3 同步引擎 + iCloud Bridge 实现）
**Last updater**: Copilot
**Current milestone**: **M3 — 同步引擎 + iCloud Bridge implemented**
**Next milestone**: M4 — Mac 端 ingest 接入（开工前需先对齐独立 PR 策略）

---

## 🔴 给下一个 AI 的最重要信息

**当前项目已经是可运行的 Expo SDK 54 TypeScript 项目，并完成 M3：文本 Capture 本地闭环 + iCloud Drive 同步引擎。**

下一步进入 **M4 Mac 端 ingest 接入** 前，必须先和用户确认 Orbit 主仓库的分支 / PR / commit 策略，然后再改 `/Users/ryanbzhou/Developer/vibe/new-orbit`。

M4 优先实现：

1. `src/main/capture/mobile_inbound/watcher.ts`
2. manifest ingest + sha256 校验
3. processed / failed 目录协议
4. iOS ACK / failed 回写识别
5. 端到端 demo：手机记 → Mac 自动收到

开始前必读（按顺序）：

1. `AGENTS.md`
2. `docs/VISION.md`
3. 本文件（你现在读的）
4. `docs/ORBIT-INTEGRATION.md`
5. `docs/SYNC-PROTOCOL.md` §8 ACK 机制
6. `docs/ARCHITECTURE.md`

**重要实现备注**：

- M2 已实现本地文本 Capture：manifest/hash、五阶段原子写入、reconcile、自愈、草稿和 Expo Router UI。
- `src/utils/fs.ts` 的 `fsync()` 不再是 noop；运行时依赖本地 Expo native module `orbit-durable-fs`。
- M3 已实现 native `orbit-icloud-bridge`、JS wrapper、SyncWorker、退避、状态机、iCloud transport 和全局同步 banner。
- `src/utils/logger.ts` 已改为通过 `orbit-durable-fs.appendText()` 追加写，避免读-拼-写退化。
- M2 已通过自动化验证；飞行模式、冷启动 <1s、真机杀进程恢复仍需人工在真机上执行。
- M3 已通过自动化验证；iCloud 登录、空间满、Finder 可见性和真机上传状态仍需人工验收。

---

## M0 进度：文档与项目骨架

### ✅ 已完成

- [x] 2026-05-06 项目目录结构创建
- [x] 2026-05-06 `AGENTS.md` 迭代守则
- [x] 2026-05-06 `docs/VISION.md` 产品愿景
- [x] 2026-05-06 `docs/ARCHITECTURE.md` 架构总览
- [x] 2026-05-06 `docs/ROADMAP.md` 里程碑规划
- [x] 2026-05-06 `docs/STATUS.md` 进度跟踪（本文件）
- [x] 2026-05-06 `docs/DATA-MODEL.md` 数据模型详述
- [x] 2026-05-06 `docs/SYNC-PROTOCOL.md` 同步协议详述
- [x] 2026-05-06 `docs/ORBIT-INTEGRATION.md` Mac 端接入契约
- [x] 2026-05-06 `docs/UX-PRINCIPLES.md` 交互设计原则
- [x] 2026-05-06 `docs/TESTING.md` 验收测试清单
- [x] 2026-05-06 `docs/DEVELOPMENT.md` 环境搭建指南
- [x] 2026-05-06 `docs/open-questions.md` 未定事项清单
- [x] 2026-05-06 源码目录骨架 + 占位文件
- [x] 2026-05-06 `README.md`
- [x] 2026-05-06 `.gitignore`
- [x] 2026-05-07 Expo 项目实际 bootstrap（SDK 55 blank TypeScript）
- [x] 2026-05-07 `package.json` + `app.json` + `tsconfig.json` + ESLint flat config + Prettier
- [x] 2026-05-07 首次 `npm install` 完成
- [x] 2026-05-07 iOS bundle identifier 占位：`com.orbit.capture`
- [x] 2026-05-06 Git 仓库初始化 + 首次 commit（`init`）

### 🎯 M0 完成标准

1. 所有文档齐全（已完成）
2. Expo 项目能 `npm start` 起来（已具备脚本与配置）
3. 能在模拟器看到"Hello Orbit"占位屏（`App.tsx` 已实现）

---

## M1 进度：本地存储层

### ✅ 已完成

- [x] `src/types/capture.ts`：`CaptureRow` / `DraftRow` / `SyncEventRow` / `DeviceInfoRow`
- [x] `src/core/storage/schema.ts`：四张表建表 SQL + 索引
- [x] `src/core/storage/migrations/001_initial.ts`
- [x] `src/core/storage/migrations/index.ts`：migration runner + rollback 测试入口
- [x] `src/core/storage/db.ts`：`openDb` / `getDb` / `closeDb` / `transaction`
- [x] `src/core/storage/device-info.ts`：KV helper + `device_id` init
- [x] `src/core/storage/captures-repo.ts`：captures CRUD + sync state patch + soft delete + count
- [x] `src/core/storage/drafts-repo.ts`：draft upsert/get/list/delete
- [x] `src/core/storage/events-repo.ts`：sync event append/list/gc
- [x] `src/utils/id.ts`：`expo-crypto` UUID wrapper
- [x] `src/utils/fs.ts`：Documents dir / ensureDir / fsync signature
- [x] `src/utils/logger.ts`：NDJSON logger
- [x] `src/utils/time.ts`：UTC/local ISO helpers
- [x] `tests/setup/in-memory-db.ts`：`better-sqlite3` async test adapter
- [x] Repo 层单元测试：captures / drafts / events
- [x] Migration 单元测试：0 → 1、幂等、事务回滚

### 🎯 M1 验收

- [x] SQLite 文件创建路径由 `expo-sqlite` 打开 `orbit.db`
- [x] 四张表存在，`schema_version` 写入 `device_info`
- [x] repo 层单元测试全通过
- [x] 事务回滚行为正确
- [x] migration 从 0 → 1 正确

---

## 后续里程碑

详见 [`ROADMAP.md`](./ROADMAP.md)。

| 里程碑 | 状态 | 依赖 |
|---|---|---|
| M0 文档与项目骨架 | completed | - |
| M1 本地存储层 | completed | M0 |
| M2 原子写入 + 文本 Capture MVP | implemented; manual device validation pending | M1 |
| M3 同步引擎 + iCloud Bridge | implemented; manual iCloud validation pending | M2 |
| M4 Mac 端 ingest 接入 | blocked on PR strategy confirmation | M3 |
| M5 语音 Capture | not started | M4 |
| M6 图片 Capture | not started | M4 |
| M7 Share Extension | not started | M6 |
| M8 便捷入口 | not started | M7 |

---

## 关键决策记录

- [ADR-001](./decisions/ADR-001-local-first-three-layer-storage.md) — 2026-05-06 · **accepted** · 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）
- [ADR-002](./decisions/ADR-002-native-durable-fsync.md) — 2026-05-07 · **accepted** · M2 原子写入必须通过 native durable fsync，不允许 JS noop
- [ADR-003](./decisions/ADR-003-native-icloud-drive-bridge.md) — 2026-05-07 · **accepted** · M3 使用本地 Expo native module 接入 iCloud Drive，不引入服务端

## 已有 Plans

- [2026-05-06 M1 本地存储层](./plans/2026-05-06-m1-local-storage-layer.md) — **completed**
- [2026-05-07 M2 原子写入 + 文本 Capture MVP](./plans/2026-05-07-m2-atomic-write-and-capture-ui.md) — **implemented**
- [2026-05-07 M3 同步引擎 + iCloud Bridge](./plans/2026-05-07-m3-sync-engine-icloud-bridge.md) — **implemented**

---

## 已知风险 / 待观察

| 风险 | 说明 | 缓解计划 |
|---|---|---|
| native `fsync()` 需要真机确认 | M2 已提供 iOS native module，但耐久性语义仍需真机杀进程/断电类验证 | TestFlight 前执行 `docs/TESTING.md` M2 真机清单 |
| iCloud 同步延迟不可控 | Apple 不承诺秒级 | UI 层透明展示状态，不让用户误以为卡住 |
| iCloud native module 需 capability 验证 | 本地 module 已实现，Apple Developer capability / EAS 配置需真机确认 | M3 手动验收时确认 iCloud Drive 可见 |
| `expo-speech-recognition` 稳定性 | 新 API，实机可能有坑 | M5 开工时先做 spike，不行就自写 native module |
| App Group 共享存储复杂度 | Share Extension 需要 | M7 时评估，若太复杂可先用简单 iCloud 中转 |
| iCloud Container 权限审核 | App Store 审核可能要求说明 | 隐私说明文档 + 明示数据流向 |

---

## 如何更新本文件

每次 commit 前自问：

1. 是否勾选了新完成的 checkbox？
2. 是否更新了 "Last updated" / "Last updater"？
3. 是否当前 milestone 需要推进？
4. 是否引入了新的风险要记录？
5. "给下一个 AI 的最重要信息"部分是否还准确？
