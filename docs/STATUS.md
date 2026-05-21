# Orbit Mobile — Current Status

> **此文件必须随每次提交更新。**  
> 下一个接手的 AI 第一件事是读这里，知道"做到哪里了"。

**Last updated**: 2026-05-21（X1 U 盘模式导入支持）
**Last updater**: Codex
**Current milestone**: **M0-M9 — local code complete; DeepSeek AI notes/proofread + Volcengine imported-audio ASR implemented; X1 BLE file import + realtime capture code complete**
**Next milestone**: 真机/iCloud/TestFlight 验收 + 纽曼 X1 实时录音端到端复测 + Voice Memos `.m4a` 火山识别兼容性/必要转码验证

---

## 🔴 给下一个 AI 的最重要信息

**当前项目已经是可运行的 Expo SDK 54 TypeScript + iOS Development Build 项目，并完成 M2-M9 主链路：本地原子 Capture、iCloud Drive 同步、Mac inbound、语音实时转写/原始录音、图片附件、Share Extension、Widget 入口、全局启动自愈/同步，以及长录音 UI 的真实本地落地。**

M7/M8 已接入原生入口：Share Extension 只写 App Group `share-inbox/` 交换目录，主 app 启动后通过 `createCapture()` 导入，继续走同一套五阶段本地原子写入协议；WidgetKit 只提供 deep link 快捷入口，主屏 small/medium widget 现在有“笔记 / iPhone 录音 / X1 录音”三个按钮，分别打开 `orbit-mobile://`、`orbit-mobile://recording/new`、`orbit-mobile://recording/x1-session`。Extension/Widget 都不直接写 iCloud。

TestFlight 前优先验收：

1. Development Build 真机：打开 app → 输入 → 保存 → 杀进程 → 重启 → 数据完整
2. iCloud Drive 真机：保存后 Finder 可见 `inbox/<id>/`，Mac inbound 自动 materialize Note 或 Library item、发布 Timeline，并写 ACK v2
3. Share Extension 真机：Safari/text/image → Orbit → 保存后主 app 列表可见
4. Widget 真机：主屏/锁屏 Widget deep link 到 Capture，锁屏到输入 <2 秒
5. 录音异常恢复真机：录音中杀进程 → 重开录音列表 → 提示保存/丢弃未保存录音
6. iCloud 异常：飞行模式、未登录、空间满时本地 Capture 完整，失败状态可见
7. 纽曼智能录音笔 X1 真机：扫描 → 连接 → 同步时间 → 读取电量/版本/容量 → 读取录音列表 → 导入录音，确认导入文件先进入本地 recording capture，再进入同步队列
8. 火山 ASR 真机：配置用户 App ID + Secret/Access Token → 从文件导入 MP3/WAV/OGG、从 iOS 语音备忘录分享到 Orbit、从 X1 离线列表导入 → 确认原始音频先本地落盘，随后 `recording_transcription` 补写转写；`.m4a` 需重点验证火山极速版是否接受，失败时应保留本地录音并显示转写失败/离线队列状态

开始前必读（按顺序）：

1. `AGENTS.md`
2. `docs/VISION.md`
3. 本文件（你现在读的）
4. `docs/ARCHITECTURE.md`
5. `docs/DATA-MODEL.md` §2 attachments
6. `docs/ROADMAP.md` M7/M8/M9

**重要实现备注**：

- M2 已实现本地文本 Capture：manifest/hash、五阶段原子写入、reconcile、自愈、草稿和 Expo Router UI。
- 2026-05-17 TestFlight 首版已上传：EAS project 已绑定为 `@yanbob/orbit-mobile`（projectId `371314e9-4ff3-423b-b20c-ad3f38cb6959`），ASC App ID 为 `6770225506`，新增 `eas.json` production/submit profile，app / Share Extension / Widget 版本统一为 `0.1.0`。首轮 build `5910b40b-ddaf-4126-9410-c8cecb702acf` 因 `package-lock.json` 与 `package.json` 不同步在 `npm ci` 失败；已移除不匹配的直接 `@expo/cli@55` devDependency、显式 pin `react-dom@19.1.0` 并刷新 lock。`npm ci --include=dev`、`npm run typecheck`、`npm run lint`、`npm test`、`git diff --check` 通过。EAS build `445a5209-1e09-4350-a90d-c877aa5f8885` 已成功生成 `0.1.0 (4)` IPA，并通过 EAS Submit 上传到 App Store Connect；Apple 正在处理，TestFlight 页面为 `https://appstoreconnect.apple.com/apps/6770225506/testflight/ios`。
- 2026-05-18 TestFlight 第二版已上传：发布前 `npm ci --include=dev`、`npm run typecheck`、`npm run lint`、`npm test`（25 files / 84 tests）和 `git diff --check` 通过。EAS build `cb2a3ab1-faed-41b5-8344-c5ed9e064e78` 已成功生成 `0.1.0 (5)` IPA，并通过 EAS Submit `5f1dcf67-fc6d-4a43-bacc-e30131af8a19` 上传到 App Store Connect；Apple 正在处理，TestFlight 页面为 `https://appstoreconnect.apple.com/apps/6770225506/testflight/ios`。注意：EAS `--what-to-test` / changelog submit 需要 Enterprise plan，本次先无 changelog 重新提交成功。
- `src/utils/fs.ts` 的 `fsync()` 不再是 noop；运行时依赖本地 Expo native module `orbit-durable-fs`。
- 从 M2 起不能使用 Expo Go；必须使用 Development Build。`Cannot find native module 'OrbitDurableFS'` 表示尚未 `npx expo prebuild --platform ios && npx expo run:ios`。
- 已生成 `ios/` 工程，并为 `orbit-durable-fs` / `orbit-icloud-bridge` 补齐 podspec；`expo-modules-autolinking resolve --platform ios` 能识别两个本地模块。
- 当前本机已升级到 Xcode 26.4.1；`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 通过。
- M3 已实现 native `orbit-icloud-bridge`、JS wrapper、SyncWorker、退避、状态机、iCloud transport 和全局同步 banner。
- 2026-05-14 已新增 app 级 `AppBootstrap`：主 app 启动、回前台和 60s 心跳都会执行 Share inbox 导入、reconcile、自愈后 Widget snapshot 写入、以及一次 SyncWorker tick；`useSyncStatus()` 默认只轮询状态，不再每 5s 隐式跑 worker。
- `src/utils/logger.ts` 已改为通过 `orbit-durable-fs.appendText()` 追加写，避免读-拼-写退化。
- M4 已合入 `/Users/ryanbzhou/Developer/new-orbit` 的 `main`，merge commit `feat(mobile): 合并手机入站接入`；focused test `tests/mobile_inbound.test.ts` 通过。
- 2026-05-15 已刷新 mobile → `/Users/ryanbzhou/Developer/new-orbit` 的入站链路：Mac 端 schema v1 现在支持 `recording`、`transcript` / `transcript-partial` / `derivative` artifact、附件逐文件 sha256 校验、普通 capture 直接 materialize Notes、发布 `note.created` Timeline、ACK v2、重复 ACK 幂等处理，以及成功重试后清理旧 `failed/<id>`。DeepSeek 派生笔记默认进入 Note Workbench / Synthesis，不写死进 Note 正文。
- M5/M6 已把附件纳入同一五阶段原子协议：语音 `.m4a` 和图片都会进入 `captures/<id>/` manifest attachments。
- M5/M6 媒体保存现在会在写 SQLite 前复写并验证最终 capture 目录的 `manifest.json`、sha256 和附件；不完整时不会显示保存成功，既有坏记录会在启动 reconcile 中标为 `conflicted`。
- Capture 主输入页现在是统一 composer：底部工具条全部改为图标，短语音是“按住转文字”并以语音附件 chip 留在 composer；图片选择支持多选并进入横向预览，不会立刻保存；文字、图片、语音可以一起保存为同一条 mixed capture。
- 2026-05-16 主输入页升级为 **Markdown Capture**：Markdown 是承载体，文字、图片、文件、短录音都以 `attachment://` 块插入同一条草稿，保存时附件继续进入同一套五阶段本地原子写入协议。该模式只做移动端 capture-grade composer，不扩展为桌面端完整 Markdown 编辑器。
- 2026-05-16 真机测试发现中文文件名附件会被安全化成 `.pptx-1` 这类隐藏文件名；已将文件名规范化抽成 `src/core/file/filename.ts`，当可见文件名全是非 ASCII 时保留扩展名并使用 `file-*.ext` / `event-file-*.ext` 回退，避免生成 dotfile。
- Capture 主输入页的 composer 会跟随键盘上移，并在键盘打开时把 `#` 快捷入口切换为收起键盘图标，避免被键盘遮挡且无法 dismiss。
- 最近列表和详情页已改为用户友好的 Capture 展示：按文字/图片/语音/混合类型渲染卡片，图片显示缩略图/大图，语音可播放，同步技术记录默认折叠。
- 2026-05-16 最近列表项改为共享 Markdown 阅读渲染：H1-H6、粗体/斜体/引用/高亮/删除线、标签、代码块、有序/无序/待办列表、`attachment://` 图片/文件/短录音块都会按笔记时间轴卡片渲染；超长内容按块数和字符数截断并显示“阅读全文”，点击卡片进入详情页查看完整 Markdown。
- 当前语音实时转写通过本地 native module `orbit-speech-recognition` 接 Apple Speech framework；转写失败不影响原始 `.m4a` 保存。
- M6 图片入口使用 ActionSheet，相册/拍照统一为 `MediaPicker`；2026-05-14 起图片经本地 native module `orbit-image-tools` 使用 iOS `UIImage` 压缩/缩放；2026-05-15 起设置页提供“总是压缩 / 仅 Wi-Fi 原图 / 总是原图”策略，默认无损保留原图，不上传到外部服务；2026-05-16 起主输入页选图只加入 composer 预览，用户可继续补文字后一次保存。
- `sync_events.gc({ keepPerCapture })` 已实现窗口函数裁剪；全局同步状态改为 `useSyncStatus()` 聚合并 5s 刷新。
- 详情页现在对 `failed` / `conflicted` capture 提供手动“重新同步”，会把状态重置为 `pending` 并立即跑一次 SyncWorker；设置页提供 iCloud 状态、sync state 计数、手动同步、手动自愈和“保留原图”开关。
- M7 已新增 `OrbitShareExtension` target，支持 text/url/image 分享写入 App Group `share-inbox/`；2026-05-14 起主 app 导入是逐条容错、幂等的，失败条目会带 `.failed.json` 移入 `share-inbox-failed/`，URL 分享会尝试通过 `LinkPresentation` 补标题。
- 2026-05-16 Share Extension / share inbox 新增平台感知 `context.share_context`：微信文章（`mp.weixin.qq.com`）、小红书（`xiaohongshu.com` / `xhslink.com`）和 X/Twitter（`x.com` / `twitter.com`）会写入 `source_platform`、`parser_hint`、原始 URL、canonical URL、分享文本和标题；手机端只做本地原子保存与同步，Mac Orbit inbound 再做 best-effort 解析，解析失败不影响 ACK。
- 2026-05-17 Mac inbound 契约更新：带 URL 的 mobile share 不再 materialize 为 Note，而是进入 Mac Orbit Library；ACK v2 支持 `artifact_kind='library_item'` + `library_item_path`，iOS 同步层会把 `library_item_path` 写入 `ack_vault_path`，UI 文案统一为 `✓ 已到 Orbit`。Mac 端解析能力已抽成 Content Connector，OpenCLI 可作为首个外部 connector，内置解析作为 fallback。
- M8 已新增 `OrbitWidgets` target，支持主屏 small/medium 和 iOS 16+ lock screen accessory widget；2026-05-16 起主屏 small/medium 改为三入口快捷按钮：笔记 → `orbit-mobile://`，iPhone 录音 → `orbit-mobile://recording/new`，X1 录音 → `orbit-mobile://recording/x1-session`。Widget 只负责打开主 app，不写 SQLite / iCloud。
- M9 长录音 UI 已从静态 mock 改为真实 Layer 2 数据：`recordings` 表 + `recording_annotations` 表 + `kind='recording'` capture + `audio.m4a` / `waveform.json` / `partial-transcript.ndjson` / `final-transcript.json` / 本地派生物附件。Recording Composer 以原始录音为最高优先级；iOS 录音与 Apple Speech 实时转写共用同一条 native 麦克风管线，实时波形来自同一麦克风 buffer 的 RMS/peak 采样，避免 `expo-av` 与 Speech 并发抢占音频会话；录音中页面已改为实时大纲和真实来源状态，未配置云端模型时使用透明的 `local-live-transcript` / `local-heuristic` 派生，不引入服务端。
- `orbit-speech-recognition` 已新增 recoverable sidecar：录音开始写 `orbit-recording-*.json`，正常保存/取消会清理；app 被杀后下次进入录音列表会扫描残留 CAF/M4A 并提示保存或丢弃，保存继续走本地原子 capture。
- 2026-05-15 起录音笔记/Ask 接入 DeepSeek V4 Flash：用户 API Key 通过 `expo-secure-store` 存 iOS Keychain，SQLite 只存非敏感设置；AI task 写入 `ai_tasks`，录音保存后自动排队生成 summary/decisions/risks/todos/custom，Ask Orbit 直连 DeepSeek。AI 只发送转写文本和时间戳，不上传原始音频；失败不影响本地 capture。
- 2026-05-17 录音保存后会额外排队 `recording_proofread` AI task：继续复用用户自持 DeepSeek Key，只发送转写文本、时间戳和本地热词列表；建议写入 `recording_annotations.kind='transcript_correction'`，录音详情“转写”页原地高亮原文并展示“原文 → 建议”提示，支持逐条通过或全部通过。通过后会原子改写本机 `final-transcript.json`、manifest/audio transcription/hash 和 `captures` 本地元数据；原始音频不变，AI 失败不影响录音保存。
- 2026-05-17 设置页新增热词列表入口 `/hotwords`：热词以 `device_info.user_setting_ai_hotwords` JSON array 保存在本机 SQLite，支持多行批量编辑、去重和清空；AI 校对 input hash 会包含热词，热词变化后重新校对会产生新任务输入。
- 2026-05-17 导入录音接入火山引擎豆包语音大模型 ASR：新增 `recording_transcription` AI task，用户火山 App ID + Secret/Access Token 通过 `expo-secure-store` 存 iOS Keychain，SQLite 只存 base URL、resource id、自动识别开关和可选 `boosting_table_id`；任务读取已经本地原子保存的音频附件并以 `audio.data` base64 调用 `recognize/flash`，成功后原子改写本机 `final-transcript.json`、manifest/audio transcription/hash、`captures` 本地元数据和 `recordings.final_state`，再排队 DeepSeek notes/proofread。导入/ASR 失败不影响原始录音保存。
- 2026-05-17 火山 ASR 设置页已从单个 X-Api-Key 改为 App ID + Secret/Access Token 两个输入框；保存旧版凭证时会清理残留的 X-Api-Key，避免请求鉴权头继续走旧值。
- 2026-05-17 新增开发测试路由 `/recording/asr-test-latest`：真机打开后会读取最近一条录音、使用 Keychain 中的火山 App ID + Secret/Access Token 直连 `recognize/flash`，并把识别结果写回本地录音，用于端到端验证凭证、音频读取和说话人区分是否跑通。
- 2026-05-17 火山 ASR 已开启说话人区分：请求体传 `enable_speaker_info=true`、`ssd_version='200'`、`show_utterances=true`，解析返回分句里的 `additions.speaker` 并映射为 `S1/S2/...`；识别写回时会更新 `final-transcript.json.speakers`、每个 segment 的 speaker、`recordings.speaker_count` 和 `manifest.recording.diarization_provider`。如果服务端不返回说话人信息，则继续降级为单一 `S1`，不影响转写成功。
- 2026-05-17 录音入口新增“导入录音文件”，`expo-document-picker` 选择的音频会以 `partial_provider='audio-import'` 进入 recording capture；Share Extension 新增 audio attachment 支持，iOS 语音备忘录分享到 Orbit 后主 app 会导入为 `partial_provider='share-audio-import'`；X1 离线文件导入继续走 `x1-import`，三类无 Apple Speech 转写的录音都会进入 `offline_queued` 等待 ASR。
- SyncWorker 对录音 capture 增加 AI gate：如果自动 AI notes 还在 queued/running 或等待重试，首次 iCloud 上传会暂缓；AI 成功、跳过或终态失败后再放行，避免 Mac 端优先 ingest 本地 heuristic 派生物。
- SyncWorker 现在对 Mac 回执使用 ACK 优先级：先读 `processed/<id>/.acked`，再处理 `failed/<id>/.failed.json`；retryable failure 重传前会清理远端旧 `failed/<id>`，避免 stale failure 覆盖成功 ACK。
- 录音详情/笔记的用户操作已真实持久化：片段反馈、片段书签、录音中即时标记、todo 勾选状态和自定义派生笔记都会写入 `recording_annotations`，不再依赖 UI 内存状态。
- 2026-05-16 录音中页面升级为 **Recording Session**：默认视角是“时间点”，主操作为“标记此刻”，随后笔记、拍照、图片、文件都锚到同一个录音时间戳。停止录音时，时间点附件作为 `sessionAttachments` 随 recording capture 原子落盘，时间点元数据写入 `recording_annotations.kind='session_event'`，并同步写 bookmark 以兼容当前详情页标记视图。
- 2026-05-16 Recording Session 交互收敛：主按钮继续保持“标记此刻”，但“写笔记 / 拍照 / 图片 / 文件”已移入“正在编辑 <timestamp>”当前标记面板内，时间线 active 行显示“正在编辑”，避免用户误以为补充动作会新建标记。
- 2026-05-16 Recording Session 键盘避让修复：标题、录音控制卡、当前标记编辑器和时间线现在处在同一个页面滚动流里；键盘出现时会增加底部 inset，并把当前标记的笔记输入框滚到可视区，避免 X1 / iPhone 录音时键盘遮挡输入。
- 2026-05-16 Recording Session 实时转写改为策略分块：Apple Speech 的 live transcript 会按句末标点、约 60 字长度、以及 3.5 秒静默后继续说话分成多个块；保存后的 `final-transcript.json` 优先使用这些实时分块的起止时间，不再把整段转写压成一个块。
- 2026-05-17 Recording Session 实时转写分块时间修正：静默恢复触发的 forced break 现在同时记录上一段结束时间和下一段开始时间，保存 `partial-transcript.ndjson` / `final-transcript.json` 时保留中间静默空白，避免第二段被贴到上一段结尾；实时大纲也改为使用各 partial 自己的时间戳。
- 2026-05-17 Recording Session Apple Speech 时间戳接入：native `orbit-speech-recognition` 现在把 `bestTranscription.segments` 的 substring、start/end/duration、confidence 和 substringRange 传到 JS；Recording Session 分段器优先用这些 native 时间戳对齐 chunk，并把词级时间写入 `partial-transcript.ndjson` / `final-transcript.json.words`，缺失或匹配失败时继续回退到静默锚点估算。
- 2026-05-16 Recording Session 结束保存加二次确认：“完成”和“结束并保存录音”都会先弹出确认；保存成功后进入录音详情并带 `fromSession=1`，详情页返回按钮会回到首页，避免从录音会话替换栈后无法返回。
- 2026-05-16 Recording Session 标题命名改为两阶段：录音开始时默认使用来源前缀 + 本地紧凑时间戳，iPhone 录音为 `iphone-YYYYMMDDHHmmss`，X1/录音卡录音为 `录音卡-YYYYMMDDHHmmss`，不再显示“现在”；AI 录音笔记生成成功后，DeepSeek JSON 会返回 `semantic_title`，本地会同步更新 `recordings.title`、`manifest.content`、`manifest.json.sha256` 和 `captures.content_preview/content_hash/byte_size`，让本机列表/详情和后续 Mac ingest 都使用语义化标题。无可用转写、未配置 Key 或 AI 被跳过时保留来源时间戳标题。
- 2026-05-16 X1 录音入口已统一到 Recording Session：新增 `/recording/x1-session`，进入后自动扫描/连接 X1，并在同一套时间点页面里实时接收 X1 MP3、使用 Apple Speech 作为临时字幕来源、保存时把 X1 音频与时间点附件一起原子落盘。
- 2026-05-16 X1 录音会话新增 BLE 接收活动波形：X1 实时 MP3 流尚未在 native 层解码为 PCM 振幅，因此录音中页面先用 BLE 音频包的接收增量生成活动波形，避免 X1 录音时波形区域空白；真实音频仍以原始 MP3 无损保存。
- 2026-05-16 录音列表入口恢复为 **iPhone 录音 / X1 录音卡** 两个同级卡片：iPhone 进入 `/recording/new`，X1 “开始录音”进入 `/recording/x1-session`；X1 Recording Session 的“来源”页会在连接后展示电量、固件版本、容量和 MAC。
- 2026-05-16 录音入口 X1 卡片改为状态优先：录音页直接展示 X1 连接状态；未连接时明确显示“未连接”并提示将录音卡开机靠近 iPhone；已连接时展示设备名、电量、容量和固件。入口卡片不展示 MAC；iPhone / X1 两张入口卡统一为顶部状态行、标题区、参数 chip 区、底部按钮四层布局，底部“开始录音”完全对齐，继续进入各自 Recording Session。
- 2026-05-16 录音入口 X1 卡片新增自动探测连接：录音页可见时会周期性检查 X1 连接状态；未连接则自动扫描 AE20 服务或常见 X1 设备名，发现后先连接、同步时间、读取电量/固件/容量/MAC，再把卡片切到已连接信息态。该探测只建立连接和刷新设备信息，不会自动开始录音。
- 2026-05-16 录音入口卡片内容精简：iPhone 卡片只保留“本机录音 · 实时转写”和 `原始音频 / Apple Speech / 本机保存` 三个 chip；X1 卡片只保留“打开录音卡并靠近 iPhone / 设备名”和状态 chip，已连接后展示 `电量 / 容量 / 固件`，避免入口页变成协议说明页。
- 2026-05-16 录音入口 chip 防省略调整：iPhone 卡片将 `Apple Speech` 放到整行、`本机保存` 放半宽；X1 未连接态将 `靠近 iPhone` 放整行、`开机即连接` 放半宽；X1 已连接态将 `容量` 放整行、`固件` 放半宽，避免半宽 chip 出现省略号。
- 2026-05-17 X1 录音卡新增正式详情页 `/recording/x1`：录音入口卡点击进入设备详情，顶部展示连接状态、设备名、电量、固件、MAC 和“已用 / 总量”容量；下方读取设备录音列表，每条显示未导入/已导入状态，并支持导入到本机 recording capture 或从 X1 设备删除。原 BLE 协议维护台迁移到 `/recording/x1-debug`。X1 导入会在 `recording_annotations.kind='x1_import'` 和 manifest `recording.source` 记录原始设备文件名，用于跨会话标记已导入。
- 2026-05-17 X1 录音卡详情页顶部设备信息已压缩为紧凑标题行、一行参数和一行小按钮，优先把首屏空间让给设备录音列表。
- 2026-05-17 X1 录音卡详情页继续压缩：页面右上角不再重复显示连接状态，设备录音列表去掉右侧导入状态条，改为左侧文件信息、右侧紧凑“导入/删除”按钮，导入按钮自身显示已导入状态。
- 2026-05-17 X1 离线导入性能排查：正式导入页未监听 BLE 帧调试事件，但 native 仍为每个音频包生成完整 `frameHex` / `payloadHex` 并跨桥发送，同时每包触发进度 setState；这会把 1 分钟录音导入拖到约 30 秒。已改为默认关闭帧调试，只有 `/recording/x1-debug` 显式开启；导入和实时进度事件节流到约 4Hz / 16KB。原始音频写入、sha256、五阶段本地原子落盘和 AI/同步队列不变。
- 2026-05-17 X1 正式详情页导入复测：真机 Debug build 安装到 iPhone 15 Pro Max 后，在 `/recording/x1` 导入 `20260517231127.mp3`（75s，303,104 bytes）。`[x1-import-timing]` 显示 native BLE 接收从 23:23:17.391 到 23:23:36.797，用时 19.406s；本地 recording capture 从 23:23:36.799 到 23:23:37.230，用时 431ms；详情页总耗时 19.868s。结论：当前主要瓶颈已经不是本地原子落盘 / hash / AI 入队，而是 BLE/native 收包写临时 MP3 这一段；已保留 dev-only 分段 timing 日志便于后续继续对比。
- 2026-05-16 录音列表、录音详情、录音笔记页的本地数据加载期不再展示“正在读取本机录音…”提示；错误态和空态仍保留原有可见反馈。
- 2026-05-16 全面收敛返回按钮导航：最近/设置/Capture 详情/录音列表/X1 通信测试/录音详情缺失态/录音笔记/Ask/录音会话取消不再用 `Link href` push 新页面，改为 `dismissTo` 或无历史时 `replace` fallback，避免页面栈持续增长。
- 2026-05-16 首页改为 **笔记 / 录音** 两个 tab，默认停留在笔记；录音 tab 直接嵌入录音列表，原 `/recording` 路由仍保留。笔记页底部工具栏移除红色长录音按钮，只保留短录音入口；短录音实时写入 Markdown 时会先插入录音附件引用，再以 blockquote 标出“短录音转录（实时）/ 短录音转录”，避免把转写误认为手写正文。
- 2026-05-16 笔记页底部工具栏参考 Obsidian Mobile 重做：左侧为单个横向滚动胶囊工具组，默认顺序为撤销、恢复、标签、图片、文件、短录音、标题、加粗、引用、斜体、删除、标亮、有序列表、无序列表、待办、代码块；保存从滚动工具组中移出，作为关闭键盘左侧的独立发送按钮。标题按钮改为 iOS ActionSheet 选择 H1-H6；关闭键盘会隐藏工具栏，重新点进编辑器后再展示。使用频次排序暂未落地，后续可在该 action 顺序上接入统计。
- 2026-05-16 Markdown Capture 编辑区新增渲染层：H1-H6、粗体、斜体、引用、删除线、高亮、标签、有序/无序/待办列表、代码块、图片和文件/短录音附件引用会直接以渲染后的形态显示；底层仍保留 TextInput 负责输入、选区和保存 Markdown 原文。工具栏图标从手绘 View/Text 切换为 `lucide-react-native`，并按 Expo SDK 54 安装 `react-native-svg@15.12.1`。
- 2026-05-16 Obsidian 工具栏密度调整：Markdown 工具栏外层从 68dp 高度压到 52dp，胶囊从 52dp 压到 42dp，单个 action 从 42dp 压到 36dp，lucide 图标从 24-25dp 压到 21dp；发送与收键盘独立按钮同步压到 42dp，整体更接近 Obsidian Mobile 键盘上方的小胶囊比例。
- 2026-05-16 Obsidian 工具栏宽度调整：底部 Markdown 工具栏从 `editorShell` 内部移出为页面底部独立横条，并用负水平边距抵消 CaptureScreen 的 16dp 页面 padding；左侧工具胶囊继续 `flex: 1` 吃满剩余空间，右侧发送/收键盘按钮固定 42dp，整体横向拉通屏幕。
- 2026-05-16 Markdown 编辑光标修复：移除“透明 TextInput 叠在渲染层上”的编辑方式；键盘/输入聚焦时只挂载原始 Markdown TextInput，收起键盘或失焦后才挂载可滚动渲染预览，避免光标按原始文本排版而可见内容按渲染块排版导致错位。工具栏文本变换抽到 `src/core/markdown/toolbar-actions.ts` 并补单测，覆盖标签、H1-H6、粗体、引用、斜体、删除、高亮、有序/无序/待办列表、代码块和附件 block 插入。
- 2026-05-16 Widget SwiftUI 编译兼容修复：`OrbitWidgets` 的 family switch 外层使用 `Group` 再套 widget background modifier；图标字体使用 `Font.system(size:weight:)`，避免 iOS 15.1 Widget target 调用 iOS 16-only `Image.fontWeight`。
- 2026-05-16 新增 iOS-only native module `orbit-recorder-device`，用静态逆向得到的 AE20/AE21/AE22 BLE 协议实现纽曼智能录音笔 X1 扫描、连接、同步时间、电量/版本/容量读取、录音列表读取和音频导入。导入音频先写入 app 临时文件，再通过 `createRecordingCapture()` 原子落入本机 SQLite + `captures/`，不绕过同步状态机。
- 2026-05-16 纽曼 X1 真机初测通过：iPhone 15 Pro Max 连接 `录音笔X1-0B19`，读到电量 90%、版本 1.0.7、容量信息和 2 条录音列表；成功导入 `20260516125126.mp3`，BLE 收满 27,648/27,648 bytes，真机 app container 中确认生成 `kind='recording'` capture、`.complete`、`manifest.json`、`audio.mp3`，且音频 sha256 与 manifest 一致。X1 原始录音时间现在写入 attachment `recorded_at`，本次导入时间写入 local input timestamps，避免把“录音发生到导入完成”的间隔误记成输入耗时。
- 2026-05-16 纽曼 X1 实时录音协议初测通过：X1 页面新增“实时录音协议测试”区和 `autoRealtime=1` deeplink 探针；`startRealtimeRecord` 后设备持续推 `type=1 cmd=1` RX 帧，payload 形如 `01 01 FF F3 48 C4 ...`，其中 `FF F3` 是 MP3 frame sync，说明 BLE notify 可实时传输 MP3 音频帧；`stopRealtimeRecord` 后设备返回 ACK 并在录音列表新增 mp3 文件（如 `20260516141128.mp3` 11s/46,080 bytes、`20260516141325.mp3` 4s/19,456 bytes）。下一步可把实时帧的 payload 去掉前 2 字节后流式写入临时 `.mp3`，停止后继续走 `createRecordingCapture()` 原子落地。
- 2026-05-16 X1 “边录边导入”代码已实现：`startRealtimeImport()` 创建临时 `.mp3` 并发送 `[1,0]`，native 在 `type=1 cmd=1` 帧中去掉前 2 字节后 append MP3 数据，`stopRealtimeImport()` 发送 `[1,2]` 后 fsync/close 并返回文件；JS `saveRealtimeX1Audio()` 再通过 `createRecordingCapture()` 原子写入本地 recording capture。X1 页面新增“X1 实时录制”区，支持开始录制、停止并保存、取消、实时字节/时长展示，并新增 `autoRealtimeCapture=1` deeplink 用于自动扫描连接、录 5 秒、保存。当前实时字幕先复用 Apple Speech 监听 iPhone 麦克风，并以 `x1-realtime-ios-speech` 标记；它不是直接对 X1 BLE MP3 流做转写。2026-05-16 复测发现 X1 firmware 1.0.7 停止实时录音会回 `type=1 cmd=4 payload=010402`，其中 `state=2` 表示已停止确认而不是失败；native 已将 `status/state=2` 且已收到 MP3 bytes 的场景视为成功，避免误删临时音频。
- 2026-05-16 X1 BLE 协议覆盖已按 APK `Cmd.java` 补齐：新增设备身份/SN 命令 `[0,12] -> [0,13]`、设置读取 `[0,5] -> [0,6]`、三项设置 `[0,7/8/9,bool]`、绑定/解绑 `[0,16]` / `[0,17]`、导入暂停/继续 `[2,10,bool]`、删除指定录音 `[2,8,count,names] -> [2,34]`、删除全部录音 `[2,9] -> [2,34]`，并把设备状态位 `[0,14]` 解码为播放/录音/USB/实时转写/导入/暂停/忙。X1 页面现在有设备设置开关、协议维护命令、文件级删除和删除全部确认；旧版 `[2,0] -> [2,1]` 列表命令只保留 raw 探针，因为当前官方 app 的业务代码也改用 `[2,30]` / `[2,32]` 新列表协议。
- 2026-05-16 修复录音详情打开本地坏记录时直接显示 Expo `readAsStringAsync` 文件路径错误的问题：`loadRecordingDetail()` 现在会在 `manifest.json` 缺失/损坏时把 capture 标为 `conflicted` + `recording_manifest_unreadable`，并返回空结果；录音详情、笔记、Ask Orbit 统一显示用户可读的“本地文件不完整或已被移除”提示；非关键 JSON 附件读取失败会降级为空，不再拖垮整条录音。
- M9 仍待真机人工验收：DeepSeek Key 配置/生成、录音中杀进程恢复、后台持续录音、锁屏/来电中断、长音频耗电、以及后续云端 final transcription/diarization provider 配置。
- 2026-05-17 AI 转写校对与热词页验证：`npx tsc --noEmit`、`npm run lint`、`npm test`、`git diff --check` 已通过；新增 `tests/ai/worker.test.ts` 覆盖热词参与 DeepSeek 校对、建议写入 `recording_annotations`、逐条通过后回写 `final-transcript.json` / manifest / audio transcription；`tests/settings/app-settings.test.ts` 覆盖热词去重和本地持久化。真机视觉、DeepSeek 真实返回质量和通过按钮手感仍需人工验收。
- M2 已通过自动化验证；飞行模式、冷启动 <1s、真机杀进程恢复仍需人工在真机上执行。
- M3 已通过自动化验证；iCloud 登录、空间满、Finder 可见性和真机上传状态仍需人工验收。
- 2026-05-15 自动化验证：`npm run typecheck`、`npm run lint`、`npm test`、`pod install`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过。
- 2026-05-16 X1 BLE 验证：`npm run typecheck`、`pod install`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已在真机安装并启动；因现有 React peer dependency 冲突，本次安装本地 module 使用了 `npm install --legacy-peer-deps`。
- 2026-05-16 X1 realtime capture 验证：`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build；`orbit-mobile://recording/x1-debug?autoRealtimeCapture=1` 已启动扫描，已确认自动连接会跳过名字像但无 AE20 服务的 `23x1`，但本轮未扫到真实 X1，因此尚未完成 5 秒实时录制落地复测。
- 2026-05-16 X1 realtime stop status 修复验证：`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build；`orbit-mobile://recording/x1-debug?autoRealtimeCapture=1` 成功连接 `录音笔X1-0B19`，收到实时 MP3 帧并在停止时看到 `payloadHex=010402`，本次按 stopped state 成功保存，日志显示 `action-complete auto-realtime-capture`。
- 2026-05-16 X1 协议覆盖验证：`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build。新增绑定/解绑、删除、设置等命令仍需在 X1 真机上逐项人工确认，特别是删除/解绑这类会改变设备状态的命令。
- 2026-05-17 X1 导入性能优化与真机实测：瓶颈确认在 X1 BLE 离线文件传输本身，native 收到的音频包最大仍为 512 bytes。已将 `orbit-recorder-device` 的 CoreBluetooth 工作迁到专用 userInitiated 串行队列，关闭默认逐帧 hex 事件，导入/实时录音改为 64KB 批量写临时音频文件，并将导入 progress / timeout 刷新降频；JS 保留 dev-only `[x1-import-timing]` 日志。实测 `20260517231127.mp3`（75s / 303,104 bytes）从优化前 native 19.406s、总 19.868s 降到 native 18.256s、总 18.678s；`20260517180722.mp3`（245s / 982,528 bytes）native 56.093s、总 56.612s，1,919 个 chunk、maxChunkBytes=512，速度随文件大小近似线性。`npm run typecheck`、`npm run lint`、`npm test`、`git diff --check`、`xcodebuild -project ios/Pods/Pods.xcodeproj -target OrbitRecorderDevice -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build -quiet` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已成功完成 iphoneos Debug build、安装并接入 Metro。完整 app 级 simulator build 此前被既有 `expo-sqlite` Pod 问题阻塞（`SQLiteModule.swift` 找不到 `exsqlite3_*` 符号），后续仍需单独复测 simulator 全量 build。
- 2026-05-21 X1 U 盘模式导入支持：新增 `/recording/x1-usb`，通过 iOS 系统文件选择器从外接 U 盘/文件位置多选 X1 录音文件，页面按 X1 BLE 设备录音列表样式展示待导入文件、大小和 `已导入` 状态；导入后继续使用 `partial_provider='x1-import'`、`source.kind='x1_file'` 和 `recording_annotations.kind='x1_import'`，并在 manifest source 标记 `transfer_mode='usb_disk'`。录音入口 X1 卡片和 X1 详情页均新增 `U 盘导入` 入口。已补 `tests/recording/x1-import.test.ts` 覆盖 U 盘文件进入本地 recording capture、已导入状态查询和 manifest source 标记；`npm run typecheck`、`npm run lint`、`npm test`、`git diff --check` 已通过；真机仍需用 X1 U 盘模式 + USB-C/读卡器人工确认系统文件选择器能看到设备盘并完成大文件导入。
- 2026-05-16 录音坏 manifest 降级验证：`npx vitest run tests/recording/recording-service.test.ts`、`npm run typecheck`、`npm run lint`、`npm test` 已通过。
- 2026-05-16 双模式 Capture 交互验证：`npm run typecheck`、`npm run lint`、`npm test` 已通过；真机手感、录音中拍照/选文件权限路径仍需人工验证，Recording Session 键盘避让已单独修复并重新安装真机 build。
- 2026-05-16 Recording Session 键盘避让验证：`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已重新安装真机 build；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording/x1-session" com.zhouyanbo.orbit.capture` 已启动 X1 Recording Session。键盘打开后的最终手感仍需在真机屏幕上人工确认。
- 2026-05-16 Recording Session 转写/结束交互验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；新增 `tests/recording/live-transcript-segmenter.test.ts` 覆盖标点分块、长文本分块和静默分块；X1 活动波形与结束确认弹窗仍需真机手感确认。
- 2026-05-16 录音入口双卡与 X1 信息展示验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 构建/安装/启动通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording" com.zhouyanbo.orbit.capture` 已在真机打开录音页。
- 2026-05-16 首页 tab 与短录音标识验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 构建/安装/启动通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。短录音最终手感仍需在真机屏幕上人工确认。
- 2026-05-16 Obsidian 风格 Markdown 工具栏验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 构建/安装/启动通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。真机视觉和各 Markdown action 的最终手感仍需人工确认。
- 2026-05-16 Markdown 工具栏标题级别与键盘显隐验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 构建/安装/启动通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。标题 H1-H6 ActionSheet、关闭键盘隐藏工具栏、重新聚焦展示工具栏、独立发送按钮的最终手感仍需人工确认。
- 2026-05-16 Widget 三入口快捷按钮验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；主屏 widget 的三个按钮分别 deep link 到笔记、iPhone 录音和 X1 录音。真机仍需把 widget 加到主屏后逐个点按确认。
- 2026-05-16 Markdown 渲染编辑区与 Lucide 图标验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test`、`xcodebuild -workspace ios/OrbitMobile.xcworkspace -scheme OrbitMobile -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build` 已通过；设备恢复后 `npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已完成真机 build / install / bundle，`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning，未见阻断性错误。
- 2026-05-16 Obsidian 工具栏密度验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已完成真机 build / install / bundle，`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning，未见阻断性错误；最终比例需看真机屏幕手感确认。
- 2026-05-16 Obsidian 工具栏宽度验证：`git diff --check`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已完成真机 build / install / bundle 且 Xcode 0 warnings，`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning，未见阻断性错误。
- 2026-05-16 Markdown 编辑光标与工具栏按钮验证：`git diff --check`、`npx vitest run tests/markdown/toolbar-actions.test.ts`、`npm run typecheck`、`npm run lint`、`npm test` 已通过；`tests/markdown/toolbar-actions.test.ts` 覆盖所有文字类 toolbar action 与附件块插入。`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 已完成真机 build / install / bundle 且 Xcode 0 warnings，`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://" com.zhouyanbo.orbit.capture` 已打开首页。Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning，未见阻断性错误；最终编辑/预览切换手感仍需看真机屏幕确认。
- 2026-05-16 录音入口 X1 状态卡验证：`git diff --check`、`npx tsc --noEmit`、`npm run lint`、`npm test` 已通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording" com.zhouyanbo.orbit.capture` 已打开录音页。Metro 仅出现既有 require cycle、`expo-av` deprecation warning 和 RN animated listener warning，未见新的 JS 错误；X1 未连接/已连接状态的最终视觉仍需在真机屏幕上确认。
- 2026-05-16 X1 卡片自动探测连接验证：`git diff --check`、`npx tsc --noEmit`、`npm run lint`、`npm test` 已通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording" com.zhouyanbo.orbit.capture` 已重新打开录音页。Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning，未见新的 JS 错误；仍需在 X1 设备开机时人工确认卡片从未连接自动切到设备信息态。
- 2026-05-16 录音入口卡片精简验证：`git diff --check`、`npx tsc --noEmit`、`npm run lint`、`npm test` 已通过；`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording" com.zhouyanbo.orbit.capture` 已打开录音页。Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning，未见新的 JS 错误；X1 已连接态的最终视觉仍需设备开机时人工确认。
- 2026-05-16 录音入口 chip 防省略验证：`git diff --check`、`npx tsc --noEmit`、`npm run lint` 已通过；本次仅调整入口 chip 排序与整行宽度。
- 2026-05-16 录音标题语义化验证：`git diff --check`、`npx tsc --noEmit`、`npx vitest run tests/ai/worker.test.ts tests/recording/title.test.ts`、`npm run lint`、`npm test` 已通过；`tests/recording/title.test.ts` 覆盖 `iphone-YYYYMMDDHHmmss` / `录音卡-YYYYMMDDHHmmss` 标题和语义标题过滤，`tests/ai/worker.test.ts` 覆盖 DeepSeek `semantic_title` 写回 recordings 表和 manifest。`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording/new" com.zhouyanbo.orbit.capture` 已打开 iPhone 录音页，Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning。
- 2026-05-16 录音来源前缀标题验证：`git diff --check`、`npx tsc --noEmit`、`npx vitest run tests/recording/title.test.ts tests/ai/worker.test.ts`、`npm run lint`、`npm test` 已通过；iPhone Recording Session 默认标题使用 `iphone-YYYYMMDDHHmmss`，X1 Recording Session 与 X1 导入默认标题使用 `录音卡-YYYYMMDDHHmmss`，AI 语义标题过滤会拒绝这两种占位标题。`xcrun devicectl device process launch --device "00008130-001468400EF8001C" --terminate-existing --payload-url "orbit-mobile://recording/new" com.zhouyanbo.orbit.capture` 已打开 iPhone 录音页，Metro 仅出现既有 require cycle 与 `expo-av` deprecation warning。
- 2026-05-16 最近列表 Markdown 阅读态验证：`git diff --check`、`npx tsc --noEmit`、`npm run typecheck`、`npx vitest run tests/markdown/render-model.test.ts`、`npm run lint`、`npm test` 已通过。真机视觉仍需人工确认最近列表卡片高度、附件缩略图和“阅读全文”手感。
- 2026-05-16 双模式真机初测：`npx expo run:ios --device "00008130-001468400EF8001C" --configuration Debug` 构建/安装/启动通过；真机保存了纯文字 Markdown capture 和包含 3 张图片、原图、中文 `.pptx` 文件、短录音的 mixed capture，沙盒确认 `.complete`、`manifest.json`、附件文件都存在；重装期间触发一次录音中 app 终止，恢复入口保存出 1 分 11 秒 `恢复的录音` recording capture。中文文件名修复后的二次真机文件选择尚待再次手动保存验证。
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
| M4 Mac 端 ingest 接入 | Notes/Library + Timeline ingest implemented; focused test passed; real iCloud E2E pending | M3 |
| M5 语音 Capture | implemented; Apple Speech true-device validation pending | M4 |
| M6 图片 Capture | local native compression + image original policy implemented; true-device validation pending | M4 |
| M7 Share Extension | implemented with idempotent/failure-tolerant import; true-device share sheet validation pending | M6 |
| M8 便捷入口 | widget snapshot implemented; lock-screen/widget timing validation pending | M7 |
| M9 长录音 + 录音笔记 UI | local implementation complete with persisted annotations, recovery, and DeepSeek AI notes; manual validation pending | M8 |
| X1 录音笔 BLE 导入 | file import true-device validation passed; realtime MP3 capture code complete; realtime true-device save retest pending | M9 |

### 2026-05-17 Share / Library ACK 更新

- [x] iOS ACK parser 支持 schema v2 `artifact_kind='library_item'`
- [x] `ack_vault_path` 优先记录 `note_path`，其次记录 `library_item_path`，再回退 legacy 路径
- [x] 同步成功 UI 从 `✓ 已到 Notes` 改为 `✓ 已到 Orbit`
- [x] Mac integration 文档改为：普通 capture 进 Notes，URL share 进 Library

---

## 关键决策记录

- [ADR-001](./decisions/ADR-001-local-first-three-layer-storage.md) — 2026-05-06 · **accepted** · 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）
- [ADR-002](./decisions/ADR-002-native-durable-fsync.md) — 2026-05-07 · **accepted** · M2 原子写入必须通过 native durable fsync，不允许 JS noop
- [ADR-003](./decisions/ADR-003-native-icloud-drive-bridge.md) — 2026-05-07 · **accepted** · M3 使用本地 Expo native module 接入 iCloud Drive，不引入服务端
- [ADR-004](./decisions/ADR-004-user-key-deepseek-ai-notes.md) — 2026-05-15 · **accepted** · 用户自持 Key 直连 DeepSeek V4 Flash 生成录音 AI 笔记
- [ADR-005](./decisions/ADR-005-mobile-captures-materialize-as-notes.md) — 2026-05-15 · **accepted** · 非 URL mobile capture 直接 materialize 为 Notes + Timeline，AI 派生默认进 Workbench
- [ADR-006](./decisions/ADR-006-two-mode-capture-interaction.md) — 2026-05-16 · **accepted** · 移动端拆成 Markdown Capture 与 Recording Session 两种 capture 模式
- [ADR-007](./decisions/ADR-007-platform-aware-share-context.md) — 2026-05-16 · **accepted** · 小红书、微信文章、X 分享只在手机端标准化上下文，解析后置到 Mac Orbit
- [ADR-008](./decisions/ADR-008-mobile-link-shares-materialize-as-library-items.md) — 2026-05-17 · **accepted** · 带 URL 的 mobile share 进入 Mac Library，ACK v2 支持 `library_item`
- [ADR-009](./decisions/ADR-009-user-key-volcengine-asr-for-imported-recordings.md) — 2026-05-17 · **accepted** · 用户自持火山 ASR 凭证直连豆包语音大模型，为导入录音补 ASR 转写

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
| 双模式交互需要真机手感校准 | Markdown Capture 与 Recording Session 已实现初版，但键盘、拍照权限、文件选择、录音中切换 tab 的真实手感必须在 iPhone 上跑完 | 下一轮真机从冷启动、短录音、长录音打点、录音中拍照/选文件、保存后详情回看逐项复测 |
| 纽曼 X1 BLE 实时流端到端复测未完成 | 代码已把实时 MP3 帧边收边写入临时 `.mp3` 并在停止后原子保存 Capture，但本轮真机扫描未看到真实 X1 广播，未完成 5 秒自动保存复测 | 打开 `orbit-mobile://recording/x1-debug?autoRealtimeCapture=1`，确认连接 `录音笔X1-*` 后自动录 5 秒并生成 recording capture；补测断连/取消/后台场景 |
| X1 实时字幕目前不是直连 BLE 音频 | 当前实时字幕复用 Apple Speech 监听 iPhone 麦克风；保存的原始音频来自 X1 BLE MP3 流，二者可能因距离/环境不同而不完全一致 | 若必须“看到的字就是 X1 音频”，下一步在 native 层解码 BLE MP3 为 PCM，再接 Apple Speech/SFSpeechAudioBufferRecognitionRequest 或后续本地/用户自持 provider |

---

## 如何更新本文件

每次 commit 前自问：

1. 是否勾选了新完成的 checkbox？
2. 是否更新了 "Last updated" / "Last updater"？
3. 是否当前 milestone 需要推进？
4. 是否引入了新的风险要记录？
5. "给下一个 AI 的最重要信息"部分是否还准确？
