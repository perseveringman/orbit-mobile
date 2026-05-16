# Orbit Mobile — Current Status

> **此文件必须随每次提交更新。**  
> 下一个接手的 AI 第一件事是读这里，知道"做到哪里了"。

**Last updated**: 2026-05-16（录音坏 manifest 降级修复）
**Last updater**: Codex
**Current milestone**: **M0-M9 — local code complete; DeepSeek AI notes implemented; X1 BLE file import + realtime capture code complete**
**Next milestone**: 真机/iCloud/TestFlight 验收 + 纽曼 X1 实时录音端到端复测 + direct X1 audio transcription / diarization provider 选择

---

## 🔴 给下一个 AI 的最重要信息

**当前项目已经是可运行的 Expo SDK 54 TypeScript + iOS Development Build 项目，并完成 M2-M9 主链路：本地原子 Capture、iCloud Drive 同步、Mac inbound、语音实时转写/原始录音、图片附件、Share Extension、Widget 入口、全局启动自愈/同步，以及长录音 UI 的真实本地落地。**

M7/M8 已接入原生入口：Share Extension 只写 App Group `share-inbox/` 交换目录，主 app 启动后通过 `createCapture()` 导入，继续走同一套五阶段本地原子写入协议；WidgetKit 只 deep link 到主 Capture，并从 App Group `widget/recent.json` 读取最近 capture 快照。Extension/Widget 都不直接写 iCloud。

TestFlight 前优先验收：

1. Development Build 真机：打开 app → 输入 → 保存 → 杀进程 → 重启 → 数据完整
2. iCloud Drive 真机：保存后 Finder 可见 `inbox/<id>/`，Mac inbound 自动 materialize Note、发布 Timeline，并写 ACK v2
3. Share Extension 真机：Safari/text/image → Orbit → 保存后主 app 列表可见
4. Widget 真机：主屏/锁屏 Widget deep link 到 Capture，锁屏到输入 <2 秒
5. 录音异常恢复真机：录音中杀进程 → 重开录音列表 → 提示保存/丢弃未保存录音
6. iCloud 异常：飞行模式、未登录、空间满时本地 Capture 完整，失败状态可见
7. 纽曼智能录音笔 X1 真机：扫描 → 连接 → 同步时间 → 读取电量/版本/容量 → 读取录音列表 → 导入录音，确认导入文件先进入本地 recording capture，再进入同步队列

开始前必读（按顺序）：

1. `AGENTS.md`
2. `docs/VISION.md`
3. 本文件（你现在读的）
4. `docs/ARCHITECTURE.md`
5. `docs/DATA-MODEL.md` §2 attachments
6. `docs/ROADMAP.md` M7/M8/M9

**重要实现备注**：

- M2 已实现本地文本 Capture：manifest/hash、五阶段原子写入、reconcile、自愈、草稿和 Expo Router UI。
- `src/utils/fs.ts` 的 `fsync()` 不再是 noop；运行时依赖本地 Expo native module `orbit-durable-fs`。
- 从 M2 起不能使用 Expo Go；必须使用 Development Build。`Cannot find native module 'OrbitDurableFS'` 表示尚未 `npx expo prebuild --platform ios && npx expo run:ios`。
- 已生成 `ios/` 工程，并为 `orbit-durable-fs` / `orbit-icloud-bridge` 补齐 podspec；`expo-modules-autolinking resolve --platform ios` 能识别两个本地模块。
- 当前本机已升级到 Xcode 26.4.1；`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 通过。
- M3 已实现 native `orbit-icloud-bridge`、JS wrapper、SyncWorker、退避、状态机、iCloud transport 和全局同步 banner。
- 2026-05-14 已新增 app 级 `AppBootstrap`：主 app 启动、回前台和 60s 心跳都会执行 Share inbox 导入、reconcile、自愈后 Widget snapshot 写入、以及一次 SyncWorker tick；`useSyncStatus()` 默认只轮询状态，不再每 5s 隐式跑 worker。
- `src/utils/logger.ts` 已改为通过 `orbit-durable-fs.appendText()` 追加写，避免读-拼-写退化。
- M4 已合入 `/Users/ryanbzhou/Developer/new-orbit` 的 `main`，merge commit `feat(mobile): 合并手机入站接入`；focused test `tests/mobile_inbound.test.ts` 通过。
- 2026-05-15 已刷新 mobile → `/Users/ryanbzhou/Developer/new-orbit` 的入站链路：Mac 端 schema v1 现在支持 `recording`、`transcript` / `transcript-partial` / `derivative` artifact、附件逐文件 sha256 校验、直接 materialize Notes、发布 `note.created` Timeline、ACK v2、重复 ACK 幂等处理，以及成功重试后清理旧 `failed/<id>`。DeepSeek 派生笔记默认进入 Note Workbench / Synthesis，不写死进 Note 正文。
- M5/M6 已把附件纳入同一五阶段原子协议：语音 `.m4a` 和图片都会进入 `captures/<id>/` manifest attachments。
- M5/M6 媒体保存现在会在写 SQLite 前复写并验证最终 capture 目录的 `manifest.json`、sha256 和附件；不完整时不会显示保存成功，既有坏记录会在启动 reconcile 中标为 `conflicted`。
- Capture 主输入页现在是统一 composer：底部工具条全部改为图标，短语音是“按住转文字”并以语音附件 chip 留在 composer；图片选择支持多选并进入横向预览，不会立刻保存；文字、图片、语音可以一起保存为同一条 mixed capture。
- Capture 主输入页的 composer 会跟随键盘上移，并在键盘打开时把 `#` 快捷入口切换为收起键盘图标，避免被键盘遮挡且无法 dismiss。
- 最近列表和详情页已改为用户友好的 Capture 展示：按文字/图片/语音/混合类型渲染卡片，图片显示缩略图/大图，语音可播放，同步技术记录默认折叠。
- 当前语音实时转写通过本地 native module `orbit-speech-recognition` 接 Apple Speech framework；转写失败不影响原始 `.m4a` 保存。
- M6 图片入口使用 ActionSheet，相册/拍照统一为 `MediaPicker`；2026-05-14 起图片经本地 native module `orbit-image-tools` 使用 iOS `UIImage` 压缩/缩放；2026-05-15 起设置页提供“总是压缩 / 仅 Wi-Fi 原图 / 总是原图”策略，默认无损保留原图，不上传到外部服务；2026-05-16 起主输入页选图只加入 composer 预览，用户可继续补文字后一次保存。
- `sync_events.gc({ keepPerCapture })` 已实现窗口函数裁剪；全局同步状态改为 `useSyncStatus()` 聚合并 5s 刷新。
- 详情页现在对 `failed` / `conflicted` capture 提供手动“重新同步”，会把状态重置为 `pending` 并立即跑一次 SyncWorker；设置页提供 iCloud 状态、sync state 计数、手动同步、手动自愈和“保留原图”开关。
- M7 已新增 `OrbitShareExtension` target，支持 text/url/image 分享写入 App Group `share-inbox/`；2026-05-14 起主 app 导入是逐条容错、幂等的，失败条目会带 `.failed.json` 移入 `share-inbox-failed/`，URL 分享会尝试通过 `LinkPresentation` 补标题。
- M8 已新增 `OrbitWidgets` target，支持主屏 small/medium 和 iOS 16+ lock screen accessory widget，deep link 到 `orbit-mobile://`；medium widget 现在会显示 App Group 快照中的最近 capture。
- M9 长录音 UI 已从静态 mock 改为真实 Layer 2 数据：`recordings` 表 + `recording_annotations` 表 + `kind='recording'` capture + `audio.m4a` / `waveform.json` / `partial-transcript.ndjson` / `final-transcript.json` / 本地派生物附件。Recording Composer 以原始录音为最高优先级；iOS 录音与 Apple Speech 实时转写共用同一条 native 麦克风管线，实时波形来自同一麦克风 buffer 的 RMS/peak 采样，避免 `expo-av` 与 Speech 并发抢占音频会话；录音中页面已改为实时大纲和真实来源状态，未配置云端模型时使用透明的 `local-live-transcript` / `local-heuristic` 派生，不引入服务端。
- `orbit-speech-recognition` 已新增 recoverable sidecar：录音开始写 `orbit-recording-*.json`，正常保存/取消会清理；app 被杀后下次进入录音列表会扫描残留 CAF/M4A 并提示保存或丢弃，保存继续走本地原子 capture。
- 2026-05-15 起录音笔记/Ask 接入 DeepSeek V4 Flash：用户 API Key 通过 `expo-secure-store` 存 iOS Keychain，SQLite 只存非敏感设置；AI task 写入 `ai_tasks`，录音保存后自动排队生成 summary/decisions/risks/todos/custom，Ask Orbit 直连 DeepSeek。AI 只发送转写文本和时间戳，不上传原始音频；失败不影响本地 capture。
- SyncWorker 对录音 capture 增加 AI gate：如果自动 AI notes 还在 queued/running 或等待重试，首次 iCloud 上传会暂缓；AI 成功、跳过或终态失败后再放行，避免 Mac 端优先 ingest 本地 heuristic 派生物。
- SyncWorker 现在对 Mac 回执使用 ACK 优先级：先读 `processed/<id>/.acked`，再处理 `failed/<id>/.failed.json`；retryable failure 重传前会清理远端旧 `failed/<id>`，避免 stale failure 覆盖成功 ACK。
- 录音详情/笔记的用户操作已真实持久化：片段反馈、片段书签、录音中即时标记、todo 勾选状态和自定义派生笔记都会写入 `recording_annotations`，不再依赖 UI 内存状态。
- 2026-05-16 新增 iOS-only native module `orbit-recorder-device`，用静态逆向得到的 AE20/AE21/AE22 BLE 协议实现纽曼智能录音笔 X1 扫描、连接、同步时间、电量/版本/容量读取、录音列表读取和音频导入。导入音频先写入 app 临时文件，再通过 `createRecordingCapture()` 原子落入本机 SQLite + `captures/`，不绕过同步状态机。
- 2026-05-16 纽曼 X1 真机初测通过：iPhone 15 Pro Max 连接 `录音笔X1-0B19`，读到电量 90%、版本 1.0.7、容量信息和 2 条录音列表；成功导入 `20260516125126.mp3`，BLE 收满 27,648/27,648 bytes，真机 app container 中确认生成 `kind='recording'` capture、`.complete`、`manifest.json`、`audio.mp3`，且音频 sha256 与 manifest 一致。X1 原始录音时间现在写入 attachment `recorded_at`，本次导入时间写入 local input timestamps，避免把“录音发生到导入完成”的间隔误记成输入耗时。
- 2026-05-16 纽曼 X1 实时录音协议初测通过：X1 页面新增“实时录音协议测试”区和 `autoRealtime=1` deeplink 探针；`startRealtimeRecord` 后设备持续推 `type=1 cmd=1` RX 帧，payload 形如 `01 01 FF F3 48 C4 ...`，其中 `FF F3` 是 MP3 frame sync，说明 BLE notify 可实时传输 MP3 音频帧；`stopRealtimeRecord` 后设备返回 ACK 并在录音列表新增 mp3 文件（如 `20260516141128.mp3` 11s/46,080 bytes、`20260516141325.mp3` 4s/19,456 bytes）。下一步可把实时帧的 payload 去掉前 2 字节后流式写入临时 `.mp3`，停止后继续走 `createRecordingCapture()` 原子落地。
- 2026-05-16 X1 “边录边导入”代码已实现：`startRealtimeImport()` 创建临时 `.mp3` 并发送 `[1,0]`，native 在 `type=1 cmd=1` 帧中去掉前 2 字节后 append MP3 数据，`stopRealtimeImport()` 发送 `[1,2]` 后 fsync/close 并返回文件；JS `saveRealtimeX1Audio()` 再通过 `createRecordingCapture()` 原子写入本地 recording capture。X1 页面新增“X1 实时录制”区，支持开始录制、停止并保存、取消、实时字节/时长展示，并新增 `autoRealtimeCapture=1` deeplink 用于自动扫描连接、录 5 秒、保存。当前实时字幕先复用 Apple Speech 监听 iPhone 麦克风，并以 `x1-realtime-ios-speech` 标记；它不是直接对 X1 BLE MP3 流做转写。2026-05-16 复测发现 X1 firmware 1.0.7 停止实时录音会回 `type=1 cmd=4 payload=010402`，其中 `state=2` 表示已停止确认而不是失败；native 已将 `status/state=2` 且已收到 MP3 bytes 的场景视为成功，避免误删临时音频。
- 2026-05-16 X1 BLE 协议覆盖已按 APK `Cmd.java` 补齐：新增设备身份/SN 命令 `[0,12] -> [0,13]`、设置读取 `[0,5] -> [0,6]`、三项设置 `[0,7/8/9,bool]`、绑定/解绑 `[0,16]` / `[0,17]`、导入暂停/继续 `[2,10,bool]`、删除指定录音 `[2,8,count,names] -> [2,34]`、删除全部录音 `[2,9] -> [2,34]`，并把设备状态位 `[0,14]` 解码为播放/录音/USB/实时转写/导入/暂停/忙。X1 页面现在有设备设置开关、协议维护命令、文件级删除和删除全部确认；旧版 `[2,0] -> [2,1]` 列表命令只保留 raw 探针，因为当前官方 app 的业务代码也改用 `[2,30]` / `[2,32]` 新列表协议。
- 2026-05-16 修复录音详情打开本地坏记录时直接显示 Expo `readAsStringAsync` 文件路径错误的问题：`loadRecordingDetail()` 现在会在 `manifest.json` 缺失/损坏时把 capture 标为 `conflicted` + `recording_manifest_unreadable`，并返回空结果；录音详情、笔记、Ask Orbit 统一显示用户可读的“本地文件不完整或已被移除”提示；非关键 JSON 附件读取失败会降级为空，不再拖垮整条录音。
- M9 仍待真机人工验收：DeepSeek Key 配置/生成、录音中杀进程恢复、后台持续录音、锁屏/来电中断、长音频耗电、以及后续云端 final transcription/diarization provider 配置。
- M2 已通过自动化验证；飞行模式、冷启动 <1s、真机杀进程恢复仍需人工在真机上执行。
- M3 已通过自动化验证；iCloud 登录、空间满、Finder 可见性和真机上传状态仍需人工验收。
- 2026-05-15 自动化验证：`npm run typecheck`、`npm run lint`、`npm test`、`pod install`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过。
- 2026-05-16 X1 BLE 验证：`npm run typecheck`、`pod install`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已在真机安装并启动；因现有 React peer dependency 冲突，本次安装本地 module 使用了 `npm install --legacy-peer-deps`。
- 2026-05-16 X1 realtime capture 验证：`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build；`orbit-mobile://recording/x1?autoRealtimeCapture=1` 已启动扫描，已确认自动连接会跳过名字像但无 AE20 服务的 `23x1`，但本轮未扫到真实 X1，因此尚未完成 5 秒实时录制落地复测。
- 2026-05-16 X1 realtime stop status 修复验证：`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build；`orbit-mobile://recording/x1?autoRealtimeCapture=1` 成功连接 `录音笔X1-0B19`，收到实时 MP3 帧并在停止时看到 `payloadHex=010402`，本次按 stopped state 成功保存，日志显示 `action-complete auto-realtime-capture`。
- 2026-05-16 X1 协议覆盖验证：`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build。新增绑定/解绑、删除、设置等命令仍需在 X1 真机上逐项人工确认，特别是删除/解绑这类会改变设备状态的命令。
- 2026-05-16 录音坏 manifest 降级验证：`npx vitest run tests/recording/recording-service.test.ts`、`npm run typecheck`、`npm run lint`、`npm test` 已通过。
- 本机 `周延博的 iPhone` 此前已完成 `iphoneos` Debug build、签名、安装和启动；本次 DeepSeek 变更新增 `expo-secure-store` native 依赖，需要重新真机安装后执行 Key 设置、录音 AI 生成、Ask、飞行模式/杀进程/iCloud Finder/Share/Widget 交互验收。
- 2026-05-15 Mac inbound 自动化验证：`/Users/ryanbzhou/Developer/new-orbit` 的 `npm run typecheck`、`npm test`、`npm run lint` 已通过（lint 仍保留历史 warning）；focused `tests/mobile_inbound.test.ts` 通过。

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
| M4 Mac 端 ingest 接入 | Notes + Timeline ingest implemented; focused test passed; real iCloud E2E pending | M3 |
| M5 语音 Capture | implemented; Apple Speech true-device validation pending | M4 |
| M6 图片 Capture | local native compression + image original policy implemented; true-device validation pending | M4 |
| M7 Share Extension | implemented with idempotent/failure-tolerant import; true-device share sheet validation pending | M6 |
| M8 便捷入口 | widget snapshot implemented; lock-screen/widget timing validation pending | M7 |
| M9 长录音 + 录音笔记 UI | local implementation complete with persisted annotations, recovery, and DeepSeek AI notes; manual validation pending | M8 |
| X1 录音笔 BLE 导入 | file import true-device validation passed; realtime MP3 capture code complete; realtime true-device save retest pending | M9 |

---

## 关键决策记录

- [ADR-001](./decisions/ADR-001-local-first-three-layer-storage.md) — 2026-05-06 · **accepted** · 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）
- [ADR-002](./decisions/ADR-002-native-durable-fsync.md) — 2026-05-07 · **accepted** · M2 原子写入必须通过 native durable fsync，不允许 JS noop
- [ADR-003](./decisions/ADR-003-native-icloud-drive-bridge.md) — 2026-05-07 · **accepted** · M3 使用本地 Expo native module 接入 iCloud Drive，不引入服务端
- [ADR-004](./decisions/ADR-004-user-key-deepseek-ai-notes.md) — 2026-05-15 · **accepted** · 用户自持 Key 直连 DeepSeek V4 Flash 生成录音 AI 笔记
- [ADR-005](./decisions/ADR-005-mobile-captures-materialize-as-notes.md) — 2026-05-15 · **accepted** · mobile capture 直接 materialize 为 Notes + Timeline，AI 派生默认进 Workbench

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
| Apple Speech native module 真机行为 | 已自写 `orbit-speech-recognition`，但与 `expo-av` 同时占用麦克风需真机确认 | M5 真机验收时确认实时转写和录音可并行；失败时原始录音仍保存 |
| App Group 共享存储复杂度 | Share Extension 已采用 App Group inbox + 主 app 导入，避免 extension 直接写 SQLite | 真机分享和杀进程导入场景验收 |
| iCloud Container 权限审核 | App Store 审核可能要求说明 | 隐私说明文档 + 明示数据流向 |
| 图片“仅 Wi-Fi 原图”需要系统配合 | 本地会保留原图并写入 `sync_hint=wifi_only`，但 iCloud Drive 是否走蜂窝仍受 iOS 系统设置控制 | 如需 app 级强约束，后续先确认是否引入网络状态 native/dependency |
| final transcription / diarization provider 未选择 | DeepSeek V4 Flash 已用于文本派生笔记，但不处理 `.m4a` final transcription 或 diarization | 先保留原始录音与 Apple Speech 转写；后续再选音频转写/说话人分离 provider |
| 纽曼 X1 BLE 实时流端到端复测未完成 | 代码已把实时 MP3 帧边收边写入临时 `.mp3` 并在停止后原子保存 Capture，但本轮真机扫描未看到真实 X1 广播，未完成 5 秒自动保存复测 | 打开 `orbit-mobile://recording/x1?autoRealtimeCapture=1`，确认连接 `录音笔X1-*` 后自动录 5 秒并生成 recording capture；补测断连/取消/后台场景 |
| X1 实时字幕目前不是直连 BLE 音频 | 当前实时字幕复用 Apple Speech 监听 iPhone 麦克风；保存的原始音频来自 X1 BLE MP3 流，二者可能因距离/环境不同而不完全一致 | 若必须“看到的字就是 X1 音频”，下一步在 native 层解码 BLE MP3 为 PCM，再接 Apple Speech/SFSpeechAudioBufferRecognitionRequest 或后续本地/用户自持 provider |

---

## 如何更新本文件

每次 commit 前自问：

1. 是否勾选了新完成的 checkbox？
2. 是否更新了 "Last updated" / "Last updater"？
3. 是否当前 milestone 需要推进？
4. 是否引入了新的风险要记录？
5. "给下一个 AI 的最重要信息"部分是否还准确？
