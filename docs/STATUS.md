# Orbit Mobile — Current Status

> **此文件必须随每次提交更新。**  
> 下一个接手的 AI 第一件事是读这里，知道"做到哪里了"。

**Last updated**: 2026-05-06（项目初始化，仅文档）  
**Last updater**: BoxAI (初始化)  
**Current milestone**: **M0 — 文档与项目骨架**  
**Next milestone**: M1 — 本地存储层

---

## 🔴 给下一个 AI 的最重要信息

**当前项目只有文档，还没有任何可运行代码。**  
如果你接手，你的第一个大任务是完成 M0 的"项目骨架"部分（Expo 初始化）+ 开始 M1。

**开始前必读**（按顺序）：
1. `AGENTS.md`
2. `docs/VISION.md`
3. 本文件（你现在读的）
4. `docs/ARCHITECTURE.md`（动代码前必读）
5. `docs/ROADMAP.md`（确认你的任务在哪一步）

**动代码前必做**：
- [ ] 确认任务方向与 VISION 一致
- [ ] 确认当前不会破坏 ARCHITECTURE 里定义的原则
- [ ] 读完这个文件你知道接下来应该做什么

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

### ⏳ 未完成（M0 剩余）

- [ ] Expo 项目实际 bootstrap (`npx create-expo-app . --template blank-typescript`)
  - **注意**：因为目录非空，需要用 `--template` 先在临时目录生成再合并，或使用 `create-expo --yes` 在空目录做
  - 由下一个接手的 AI 在开始 M1 时做
- [ ] `package.json` + `app.json` + `tsconfig.json` + `.eslintrc`
- [ ] 首次 `npm install` 确认依赖装好
- [ ] iOS Entitlements 模板（iCloud Container 占位）
- [ ] Git 仓库 `git init` + 首次 commit

### 🎯 M0 完成标准

1. 所有文档齐全（已完成）
2. Expo 项目能 `npm start` 起来（待做）
3. 能在模拟器看到"Hello Orbit"占位屏（待做）

---

## 后续里程碑（未开始）

详见 [`ROADMAP.md`](./ROADMAP.md)。

| 里程碑 | 状态 | 依赖 |
|---|---|---|
| M1 本地存储层 | not started | M0 骨架完成 |
| M2 原子写入 + 文本 Capture MVP | not started | M1 |
| M3 同步引擎 + iCloud Bridge | not started | M2 |
| M4 Mac 端 ingest 接入 | not started | M3 |
| M5 语音 Capture | not started | M4 |
| M6 图片 Capture | not started | M4 |
| M7 Share Extension | not started | M6 |
| M8 便捷入口 | not started | M7 |

---

## 关键决策记录

- [ADR-001](./decisions/ADR-001-local-first-three-layer-storage.md) — 2026-05-06 · **accepted** · 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）

## 已有 Plans

- [2026-05-06 M1 本地存储层](./plans/2026-05-06-m1-local-storage-layer.md) — **draft**

---

## 已知风险 / 待观察

暂无代码实施，以下风险源于架构假设，需要实施中验证：

| 风险 | 说明 | 缓解计划 |
|---|---|---|
| iCloud 同步延迟不可控 | Apple 不承诺秒级 | UI 层透明展示状态，不让用户误以为卡住 |
| `expo-speech-recognition` 稳定性 | 新 API，实机可能有坑 | M5 开工时先做 spike，不行就自写 native module |
| App Group 共享存储复杂度 | Share Extension 需要 | M7 时评估，若太复杂可先用简单 iCloud 中转 |
| iCloud Container 权限审核 | App Store 审核可能要求说明 | 隐私说明文档 + 明示数据流向 |

---

## 如何更新本文件

**每次 commit 前自问**：

1. 是否勾选了新完成的 checkbox？
2. 是否更新了"Last updated" / "Last updater"？
3. 是否当前 milestone 需要推进？
4. 是否引入了新的风险要记录？
5. "给下一个 AI 的最重要信息"部分是否还准确？

**写给下一个 AI 的话**（每次接手时自己改）：

> 例如：
> > 下一步是 M1 的 SQLite schema。注意 `drafts` 表的 attachments_json 字段存的是 JSON 数组，不是 JSON 对象。
> > 还有，我在 ADR-002 里决定不用 nanoid 而用 expo-crypto，记得别引入 nanoid 依赖。
��新的风险要记录？
5. "给下一个 AI 的最重要信息"部分是否还准确？

**写给下一个 AI 的话**（每次接手时自己改）：

> 例如：
> > 下一步是 M1 的 SQLite schema。注意 `drafts` 表的 attachments_json 字段存的是 JSON 数组，不是 JSON 对象。
> > 还有，我在 ADR-002 里决定不用 nanoid 而用 expo-crypto，记得别引入 nanoid 依赖。
-crypto，记得别引入 nanoid 依赖。
