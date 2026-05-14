# Orbit Mobile — Roadmap

> **Update cadence**: 每个里程碑落地后更新本文件  
> **Status source**: 实时进度见 [`STATUS.md`](./STATUS.md)

本文用"里程碑"而不是"季度"来组织——每个里程碑是一个**可以独立收获价值**的状态。

---

## 里程碑总览

```
     M0: 文档与骨架 (done)
      ↓
   M1: 本地存储层 (done) ← 本地优先的基础
      ↓
   M2: 原子写入 + 文本 Capture (implemented) ← 第一个可用形态
     ↓
  M3: 同步引擎 + iCloud Bridge (implemented) ← 数据能到 Mac
     ↓
  M4: Mac 端 ingest 接入 (implemented) ← 端到端闭环
     ↓
  M5: 语音 Capture (implemented) ← 多模态第一步
     ↓
  M6: 图片 Capture (implemented)
     ↓
   M7: Share Extension (implemented)
      ↓
   M8: 粘贴板 + Widget 等便捷入口 (implemented)
      ↓
   M9: 长录音 + 录音笔记 UI 本地落地 (implemented)
      ↓
   MVP 发布！
     ↓
  V2: Siri / Watch / OCR / Whisper 等长尾能力
```

---

## M0 — 文档与项目骨架（done）

**目标**：让任何 AI 接手都知道做什么、怎么做、做到哪。

- [x] 项目目录创建
- [x] `AGENTS.md` 迭代守则 + 文档索引
- [x] `docs/VISION.md` 产品愿景
- [x] `docs/ARCHITECTURE.md` 架构总览
- [x] `docs/ROADMAP.md`（本文）
- [x] `docs/STATUS.md` 进度跟踪
- [x] `docs/DATA-MODEL.md` 数据模型详述
- [x] `docs/SYNC-PROTOCOL.md` 同步协议详述
- [x] `docs/ORBIT-INTEGRATION.md` Mac 端接入契约
- [x] `docs/UX-PRINCIPLES.md` 交互设计原则
- [x] `docs/TESTING.md` 验收测试清单
- [x] `docs/DEVELOPMENT.md` 环境搭建指南
- [x] `docs/open-questions.md` 未定事项
- [x] Expo 项目初始化 (`npx create-expo-app`) — M1 开始时完成
- [x] 目录骨架 stub 文件 — 占位 + 导出空壳，让 import 能通
- [x] TypeScript 配置 + ESLint + Prettier
- [x] Git 仓库初始化 + 基础 `.gitignore`

---

## M1 — 本地存储层（done）

**目标**：把 Layer 2 写扎实——SQLite schema、repo 层、基础 CRUD。**没 UI**。

- [x] `src/core/storage/schema.ts` — 四张表建表 SQL
- [x] `src/core/storage/db.ts` — SQLite 开库 + migration 框架
- [x] `src/core/storage/captures-repo.ts` — captures 表 CRUD
- [x] `src/core/storage/drafts-repo.ts` — drafts 表 CRUD
- [x] `src/core/storage/events-repo.ts` — sync_events 表 CRUD
- [x] `src/utils/fs.ts` — 安全文件操作（含 fsync 封装）
- [x] `src/utils/id.ts` — uuid / nanoid 封装
- [x] `src/utils/logger.ts` — 日志工具
- [x] 单元测试：repo 层 CRUD + 事务回滚

**验收**：能在 Expo app 启动后打开 SQLite，读写四张表，断言成功。

---

## M2 — 原子写入 + 文本 Capture MVP

**目标**：用户能在主界面输入文本，保存后在列表页看到。**没同步，纯本地**。

- [x] `src/core/capture/manifest.ts` — manifest 构造器
- [x] `src/core/capture/hash.ts` — sha256 计算
- [x] `src/core/capture/atomic-write.ts` — **五阶段原子写入协议**
- [x] `src/core/reconcile/reconcile-job.ts` — 启动扫描与自愈
- [x] `src/ui/screens/capture-screen.tsx` — 主输入界面
  - 冷启动自动 focus 键盘
  - 保存按钮（右上）
  - 连续捕获（保存后清空继续）
- [x] `src/ui/screens/recent-screen.tsx` — 最近 capture 列表
- [x] `src/ui/screens/detail-screen.tsx` — 单条详情页（只读）
- [x] `src/ui/components/sync-indicator.tsx` — 状态徽章（现在永远是 pending）
- [x] `src/ui/hooks/use-draft.ts` — 草稿自动保存（debounce 2s）
- [x] 导航：expo-router 配置
- [x] **崩溃恢复测试**：输入中杀进程、保存中杀进程的场景（单元测试覆盖 fault injection/reconcile；真机杀进程清单待人工执行）

**验收**：
- 飞行模式下可正常保存文本
- 列表显示所有 capture
- 杀进程后重启数据完整
- 冷启动 < 1s 可输入

---

## M3 — 同步引擎 + iCloud Bridge

**目标**：数据能从 Layer 2 流到 Layer 3 (iCloud Drive)。**尚不需要 Mac 配合**。

- [x] 写 Swift native module `ios/ICloudBridge/`（以本地 Expo module `modules/orbit-icloud-bridge/` 实现）
  - `copyToICloud(localPath, remotePath)`
  - `getUploadStatus(remotePath)`
  - `subscribeToChanges(remotePath)`
  - `getContainerStatus()`
- [x] `src/native/icloud-bridge.ts` — JS wrapper
- [x] `src/core/sync/state-machine.ts` — 状态转换逻辑
- [x] `src/core/sync/backoff.ts` — 退避计算
- [x] `src/core/sync/worker.ts` — SyncWorker 主循环
- [x] `src/core/sync/icloud-transport.ts` — 调 native module 封装
- [x] `src/ui/components/global-status-bar.tsx` — 顶部全局状态
- [x] 触发源接入：AppState / Timer / 保存后立即 tick（NetInfo 暂不引入新依赖）
- [x] Entitlements 配置：iCloud Container（Expo `ios.usesIcloudStorage` + native module；EAS/Apple capability 仍需真机配置确认）
- [x] 测试：iCloud 未登录、断网/不可用自动失败重试（空间满需真机/CloudKit quota 手动验收）

**验收**：
- 保存后 iCloud 可见
- 飞行模式下不报错，恢复后自动同步
- iCloud 未登录有清晰 banner 引导
- 每条 capture 状态可见

---

## M4 — Mac 端 ingest 接入

**目标**：在 Orbit 桌面端加 `mobile_inbound` 模块，完成端到端闭环。

- [x] 在 Orbit 仓库新开 PR：`src/main/capture/mobile_inbound/`
  - `watcher.ts` — chokidar 监听 iCloud inbox
  - `ingest.ts` — 解析 manifest → 调 ThoughtService
  - `attachments.ts` — 附件复制到 `<vault>/.orbit/capture/attachments/`
  - `config.ts` — iCloud 路径探测
- [x] Mac 端 ingest 成功 → 移动到 `processed/<id>/`
- [x] Mac 端 ingest 失败 → 写 `failed/<id>/.failed.json`
- [x] iOS 端监听 `processed/` → 更新 acked（M3 worker 已预留 ACK 读取并更新）
- [x] iOS 端监听 `.failed.json` → 显示失败原因（M3 worker 已预留 failure 读取并更新）
- [x] 校验和校验：sha256 不匹配时 Mac 拒绝
- [ ] Mac 端 Dashboard 加卡片"今日来自手机 N 条"（MVP 端到端闭环后补 UI 卡片）

**验收**：
- iPhone 保存 → 自动出现在 Mac Inbox Thoughts
- 全流程 10 秒内完成（正常网络）
- iOS 端看到 ✓ 已接收

---

## M5 — 语音 Capture

**目标**：按住说话 → 实时转写 → 保存文本 + 原始录音。

- [x] `expo-audio` 或 `expo-av` 录音
- [x] 实时转写（本地 native module `orbit-speech-recognition` + Apple Speech framework；失败不阻断录音）
- [x] `src/core/audio/recorder.ts`
- [x] `src/core/audio/transcription.ts`
- [x] `src/ui/components/voice-button.tsx` — 按压录音交互
- [ ] 录音中 app 被杀 → 下次启动提示恢复（需真机验证 iOS 临时录音文件保留行为）
- [x] manifest 带 `transcription_source`（手动文本时为 `manual`）
- [x] 原始 `.m4a` 附件永久保留（除非用户关闭）

**验收**：
- 按住按钮开始录音 + 实时出现文字
- 松开立即可编辑文字或继续录
- 录音中来电被打断 → 自动保存已录部分
- Mac 端收到的 Thought 含原始录音附件链接

---

## M6 — 图片 Capture

**目标**：相册选图 + 相机拍照 + 压缩 + 多图。

- [x] `expo-image-picker` 集成
- [x] `expo-camera` 集成（通过 `expo-image-picker` camera API）
- [x] `expo-image-manipulator` 压缩（当前使用 picker quality 0.82，未单独引入 manipulator）
- [x] `src/core/media/picker.ts`（实现为 `src/core/image/picker.ts`）
- [x] `src/core/media/compressor.ts`（封装当前 picker quality 压缩策略；不引入额外 native 依赖）
- [x] `src/ui/components/media-picker.tsx`（实现为 `src/ui/components/image-button.tsx`）
- [x] 多图支持（UI + manifest）
- [x] 原图可选保留（当前默认保留 picker 返回文件进入本地原子协议）
- [ ] 用户设置："总是压缩" / "仅 Wi-Fi 原图" / "总是原图"（MVP 后设置项）

**验收**：
- 选图/拍照后立即出现在输入框上方预览
- 保存后 Mac 端可见图片
- 大图不会撑爆 iCloud

---

## M7 — Share Extension

**目标**：从其他 app 分享菜单直达 Orbit Mobile。

- [x] 原生 Share Extension target（`ios/OrbitShareExtension` + App Group entitlement）
- [x] 接收 URL / 文本 / 图片 / 多类型组合
- [x] 最小 UI：预览 + "保存"
- [x] 共享 App Group（Extension 写 `share-inbox/`，主 app 导入后走 SQLite + 文件系统原子协议）
- [ ] 对 URL 自动抓取标题（若能）
- [x] 保存后不弹回主 app（留在原 app）

**验收**：
- Safari 分享 → 选 Orbit → 3 秒内完成保存
- Twitter 分享推文 → 正文 + 作者 + 链接都在
- 图片分享 → 保存图片 + 可选备注

---

## M8 — 便捷入口（Widget / 粘贴板）

**目标**：降低"打开 app"这个摩擦到接近 0。

- [x] 粘贴板智能识别（打开 app 时读 clipboard）
- [x] URL 高亮建议
- [x] 主屏 Widget（WidgetKit，Swift；`ios/OrbitWidgets` target）
  - 小：图标 + "记一条"
  - 中：Capture 快捷入口（最近 3 条待后续共享只读摘要）
- [x] 锁屏 Widget（iOS 16+）
- [x] Haptic 反馈全面铺开（保存成功路径）

**验收**：
- 从锁屏到开始输入 < 2 秒
- 粘贴板有 URL 时 banner 建议保存

---

## M9 — 长录音 + 录音笔记 UI（implemented）

**目标**：把 M9.0 静态 UI mock 接入真实本地录音与 Layer 2 数据。

- [x] `recordings` 表 + migration v2
- [x] `kind='recording'` manifest 增量：原音、partial/final transcript、outline/summary/decisions/risks/todos
- [x] Recording Composer 使用真实录音 + Apple Speech 可用时实时转写
- [x] 录音列表 / 详情 / 笔记 / Ask 从 SQLite + capture 文件读取
- [x] 未配置云端 provider 时使用本地 `local-live-transcript` / `local-heuristic`，不引入服务端
- [ ] 云端 final transcription provider 配置（用户自持 key）
- [ ] diarization provider 接入
- [ ] 真机后台/锁屏/来电中断验收

---

## 🎉 MVP 发布

M9 真机验收后可发 TestFlight，收集早期用户反馈。

---

## V2 长尾

按需求优先级排：

| 功能 | 说明 |
|---|---|
| Siri Shortcuts / App Intents | "嘿 Siri，记个想法" |
| Apple Watch Capture | 手表语音快捕 |
| Whisper on-device 转写 | iOS 17+ |
| OCR 图片中文字 | Vision framework |
| iPad 适配 | 大屏布局 |
| 多设备间状态同步 | iPhone + iPad + Watch |
| 草稿加密 | SecureEnclave |
| 地理位置附带 | 可选开关 |
| 导出为邮件/文件 | 终极逃生出口 |
| 视频 Capture | 如果用户需求强 |

---

## 版本约定

- 当前版本：`0.0.0`（pre-alpha）
- M4 完成 → `0.1.0`（Alpha）
- M8 完成 → `0.9.0`（Beta / TestFlight）
- 验收测试全通过 → `1.0.0`（App Store）

---

## 如何更新本文

1. 一个里程碑**开工时**，在 [`STATUS.md`](./STATUS.md) 里把该 M 标为 in-progress
2. 里程碑**完成时**，在本文的 checkbox 里打勾
3. 大方向调整时，新增 ADR 进 `docs/decisions/` 并在本文引用
4. 长尾列表按实际需求动态调整
