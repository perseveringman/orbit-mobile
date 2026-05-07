# Orbit Mobile — Current Status

> **此文件必须随每次提交更新。**  
> 下一个接手的 AI 第一件事是读这里，知道"做到哪里了"。

**Last updated**: 2026-05-07（M7/M8 native entrypoints implemented）
**Last updater**: Copilot
**Current milestone**: **M7/M8 — implemented; device validation pending**
**Next milestone**: TestFlight 前真机验收 + 实时转写/媒体设置补齐

---

## 🔴 给下一个 AI 的最重要信息

**当前项目已经是可运行的 Expo SDK 54 TypeScript + iOS Development Build 项目，并完成 M2-M8 MVP 主链路：本地原子 Capture、iCloud Drive 同步、Mac inbound、语音/图片附件、Share Extension、Widget 入口。**

M7/M8 已接入原生入口：Share Extension 只写 App Group `share-inbox/` 交换目录，主 app 启动后通过 `createCapture()` 导入，继续走同一套五阶段本地原子写入协议；WidgetKit 只 deep link 到主 Capture。Extension/Widget 都不直接写 iCloud。

TestFlight 前优先验收：

1. Development Build 真机：打开 app → 输入 → 保存 → 杀进程 → 重启 → 数据完整
2. iCloud Drive 真机：保存后 Finder 可见 `inbox/<id>/`，Mac inbound 自动 ingest 并写 ACK
3. Share Extension 真机：Safari/text/image → Orbit → 保存后主 app 列表可见
4. Widget 真机：主屏/锁屏 Widget deep link 到 Capture，锁屏到输入 <2 秒
5. iCloud 异常：飞行模式、未登录、空间满时本地 Capture 完整，失败状态可见

开始前必读（按顺序）：

1. `AGENTS.md`
2. `docs/VISION.md`
3. 本文件（你现在读的）
4. `docs/ARCHITECTURE.md`
5. `docs/DATA-MODEL.md` §2 attachments
6. `docs/ROADMAP.md` M7/M8

**重要实现备注**：

- M2 已实现本地文本 Capture：manifest/hash、五阶段原子写入、reconcile、自愈、草稿和 Expo Router UI。
- `src/utils/fs.ts` 的 `fsync()` 不再是 noop；运行时依赖本地 Expo native module `orbit-durable-fs`。
- 从 M2 起不能使用 Expo Go；必须使用 Development Build。`Cannot find native module 'OrbitDurableFS'` 表示尚未 `npx expo prebuild --platform ios && npx expo run:ios`。
- 已生成 `ios/` 工程，并为 `orbit-durable-fs` / `orbit-icloud-bridge` 补齐 podspec；`expo-modules-autolinking resolve --platform ios` 能识别两个本地模块。
- 当前本机已升级到 Xcode 26.4.1；`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 通过。
- M3 已实现 native `orbit-icloud-bridge`、JS wrapper、SyncWorker、退避、状态机、iCloud transport 和全局同步 banner。
- `src/utils/logger.ts` 已改为通过 `orbit-durable-fs.appendText()` 追加写，避免读-拼-写退化。
- M4 已在 `/Users/ryanbzhou/Developer/new-orbit` 独立分支 `feat/mobile-inbound-ingest` 提交 `9486799 feat(mobile): 接入手机捕获入站`。
- M5/M6 已把附件纳入同一五阶段原子协议：语音 `.m4a` 和图片都会进入 `captures/<id>/` manifest attachments。
- M5/M6 媒体保存现在会在写 SQLite 前复写并验证最终 capture 目录的 `manifest.json`、sha256 和附件；不完整时不会显示保存成功，既有坏记录会在启动 reconcile 中标为 `conflicted`。
- Capture 主输入页的底部工具条现在会跟随键盘上移，并在键盘打开时显示“收起”按钮，避免被键盘遮挡且无法 dismiss。
- 当前语音实时转写未接第三方 `expo-speech-recognition`，只保留 wrapper + 手动转写文本；若继续要求实时转写，需要引入/验证该依赖或自写 native Speech module。
- M7 已新增 `OrbitShareExtension` target，支持 text/url/image 分享写入 App Group `share-inbox/`，主 app 启动后导入到本地原子 Capture。
- M8 已新增 `OrbitWidgets` target，支持主屏 small/medium 和 iOS 16+ lock screen accessory widget，deep link 到 `orbit-mobile://`。
- M2 已通过自动化验证；飞行模式、冷启动 <1s、真机杀进程恢复仍需人工在真机上执行。
- M3 已通过自动化验证；iCloud 登录、空间满、Finder 可见性和真机上传状态仍需人工验收。
- M4 Mac 全量测试有 1 个既有非相关失败：`tests/conversation_store.test.ts` 排序期望；M4 focused test 通过。

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
- [x] 2026-05-07 iOS bundle identifier：`com.zhouyanbo.orbit.capture`
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
| M4 Mac 端 ingest 接入 | implemented; Mac branch committed | M3 |
| M5 语音 Capture | implemented; realtime transcription pending | M4 |
| M6 图片 Capture | implemented; thumbnail staging UI pending | M4 |
| M7 Share Extension | implemented; true-device share sheet validation pending | M6 |
| M8 便捷入口 | implemented; lock-screen/widget timing validation pending | M7 |

---

## 关键决策记录

- [ADR-001](./decisions/ADR-001-local-first-three-layer-storage.md) — 2026-05-06 · **accepted** · 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）
- [ADR-002](./decisions/ADR-002-native-durable-fsync.md) — 2026-05-07 · **accepted** · M2 原子写入必须通过 native durable fsync，不允许 JS noop
- [ADR-003](./decisions/ADR-003-native-icloud-drive-bridge.md) — 2026-05-07 · **accepted** · M3 使用本地 Expo native module 接入 iCloud Drive，不引入服务端

## 已有 Plans

- [2026-05-06 M1 本地存储层](./plans/2026-05-06-m1-local-storage-layer.md) — **completed**
- [2026-05-07 M2 原子写入 + 文本 Capture MVP](./plans/2026-05-07-m2-atomic-write-and-capture-ui.md) — **implemented**
- [2026-05-07 M3 同步引擎 + iCloud Bridge](./plans/2026-05-07-m3-sync-engine-icloud-bridge.md) — **implemented**
- [2026-05-07 M4 Mac 端 ingest 接入](./plans/2026-05-07-m4-mac-mobile-inbound.md) — **implemented**
- [2026-05-07 M5/M6 语音与图片 Capture](./plans/2026-05-07-m5-m6-media-capture.md) — **implemented**

---

## 已知风险 / 待观察

| 风险 | 说明 | 缓解计划 |
|---|---|---|
| native `fsync()` 需要真机确认 | M2 已提供 iOS native module，但耐久性语义仍需真机杀进程/断电类验证 | TestFlight 前执行 `docs/TESTING.md` M2 真机清单 |
| iCloud 同步延迟不可控 | Apple 不承诺秒级 | UI 层透明展示状态，不让用户误以为卡住 |
| iCloud native module 需 capability 验证 | 本地 module 已实现，Apple Developer capability / EAS 配置需真机确认 | M3 手动验收时确认 iCloud Drive 可见 |
| `expo-speech-recognition` 稳定性 | 新 API，实机可能有坑 | M5 开工时先做 spike，不行就自写 native module |
| App Group 共享存储复杂度 | Share Extension 已采用 App Group inbox + 主 app 导入，避免 extension 直接写 SQLite | 真机分享和杀进程导入场景验收 |
| iCloud Container 权限审核 | App Store 审核可能要求说明 | 隐私说明文档 + 明示数据流向 |

---

## 如何更新本文件

每次 commit 前自问：

1. 是否勾选了新完成的 checkbox？
2. 是否更新了 "Last updated" / "Last updater"？
3. 是否当前 milestone 需要推进？
4. 是否引入了新的风险要记录？
5. "给下一个 AI 的最重要信息"部分是否还准确？
