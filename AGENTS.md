# Orbit Mobile — Agent Guidelines

> **任何 AI 在这个项目里动代码之前，必须先把本文从头读完。**  
> 本文是所有后续 AI 迭代的"入口契约"，目的是让任何一个接手的 agent 在动手之前就知道：
> 1. 这个项目在做什么（方向）
> 2. 它为什么存在（与 Orbit 桌面端的关系）
> 3. 当前做到哪里（状态）
> 4. 下一步应该做什么（优先级）
> 5. 有哪些不可逾越的原则（底线）

---

## 1. 这个项目是什么

**Orbit Mobile 是 [Orbit](https://github.com/) 桌面端的 iOS Capture 前哨**。

- **定位**：手机只做 BASB 方法论里的 **C 阶段（Capture）** ——随时记录灵感、想法、见闻、语音、图片
- **不做**：编辑、执行、终端、agent 对话、Kanban——这些是桌面端的职责
- **核心价值**：让用户在地铁、排队、开会、深夜床上的碎片时刻，能在 **1 秒内**从想到"我要记一下"进入输入状态
- **数据去向**：所有 capture 通过 iCloud Drive 同步回 Mac 端 Orbit，直接 materialize 为 Notes，并通过 `note.created` 展示在 Timeline

**详细愿景见 [`docs/VISION.md`](./docs/VISION.md)。任何方向性改动前必读。**

---

## 2. 最重要的一条：本地优先

这是整个项目的**最高原则**，无条件遵守。

> **设备本地是唯一真相源（Single Source of Truth）。iCloud 只是同步通道，不是数据源。**

具体意味着：

- 用户数据**必须先完整落到设备本地**（SQLite + 文件系统），再谈同步
- 飞行模式、iCloud 未登录、iCloud 空间满、网络抖动—— **app 功能完全不降级**
- 任何一次写入失败，都**不允许出现数据残留或不一致**（原子写入协议）
- 同步状态是数据的**附加元数据**，不是数据本身

**违反这条原则的 PR 一律不接受。** 设计细节见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

---

## 3. 文档索引（按阅读优先级）

### 🔥 必读（开工前）

| 文档 | 作用 | 何时读 |
|---|---|---|
| [`AGENTS.md`](./AGENTS.md) | 本文——迭代守则 + 索引 | **每次**接手任务前 |
| [`docs/VISION.md`](./docs/VISION.md) | 产品愿景 + 为什么存在 + 不做什么 | 第一次接触项目 |
| [`docs/STATUS.md`](./docs/STATUS.md) | **当前进度**——做到哪一步了 | **每次**动代码前 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 三层存储、原子写入、同步引擎 | 改核心逻辑前 |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | 优先级排序 + 里程碑 | 决定做什么前 |

### 📖 按需读

| 文档 | 作用 |
|---|---|
| [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md) | SQLite schema、manifest JSON、目录结构 |
| [`docs/SYNC-PROTOCOL.md`](./docs/SYNC-PROTOCOL.md) | iCloud 同步状态机、ACK 机制、重试策略 |
| [`docs/ORBIT-INTEGRATION.md`](./docs/ORBIT-INTEGRATION.md) | Mac 端 Orbit 如何 ingest（改动点 + 接口契约） |
| [`docs/UX-PRINCIPLES.md`](./docs/UX-PRINCIPLES.md) | 交互设计原则、"1 秒可输入"的具体展开 |
| [`docs/TESTING.md`](./docs/TESTING.md) | 本地优先的验收测试清单 |
| [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) | 环境搭建、常用命令 |
| [`docs/decisions/`](./docs/decisions/) | ADR 历史决策记录 |
| [`docs/plans/`](./docs/plans/) | 具体功能的实施方案 |
| [`docs/thinking-trail/`](./docs/thinking-trail/) | 重要设计讨论的对话留痕 |
| [`docs/open-questions.md`](./docs/open-questions.md) | 已识别但本期不做的问题 |

---

## 4. 迭代工作流（强制流程）

每次接到任务，严格按这个顺序：

```
1. 读 AGENTS.md（本文）                      ← 记住本地优先、不做什么
2. 读 docs/STATUS.md                         ← 知道当前到哪一步
3. 读 docs/ROADMAP.md                        ← 知道你接到的任务在整体的哪一步
4. 按需读 ARCHITECTURE / DATA-MODEL / ...     ← 不要跳过
5. 对齐任务方向是否和愿景一致                  ← 有冲突必须先和用户确认
6. 动手写代码（最小改动原则）
7. 跑验收清单（docs/TESTING.md）
8. 更新 docs/STATUS.md —— 标记完成的条目
9. 如果引入新概念或决策 → 写 ADR 进 docs/decisions/
10. Commit（规范见下）
```

**⚠️ 最容易被忽略的两步：第 5 步和第 8 步。**

- 跳过第 5 步 → 代码越走越偏，最后回头大规模推倒
- 跳过第 8 步 → 下一个 agent 不知道你干了什么，重复劳动

---

## 5. 不可逾越的底线

| # | 底线 | 为什么 |
|---|---|---|
| 1 | **本地数据先于同步**——任何路径都先落本地，再谈上传 | 违反了就是数据丢失风险 |
| 2 | **原子写入**——要么完整要么不存在，不允许"半写" | 崩溃恢复的基础 |
| 3 | **iCloud 挂掉 app 不能挂**——所有依赖 iCloud 的代码路径都要有降级 | 本地优先的直接推论 |
| 4 | **手机不做编辑器**——不要在手机上做完整 Markdown 编辑、项目管理、任务列表等桌面端功能 | 手机是 Capture 前哨，不是小号 Mac |
| 5 | **不引入服务端**——不做账号系统、不做自建云、不做中心化服务 | 违反 Orbit 愿景"本地优先、不做专有云存储" |
| 6 | **附件数据无损**——原始录音和图片必须保留（除非用户明确关闭） | Mac 端可能二次转写/OCR，需要原材料 |
| 7 | **同步状态对用户可见**——不要隐藏同步失败 | 用户对数据的信任依赖透明度 |
| 8 | **冷启动 1 秒内可输入**——启动路径上的任何新代码都要考虑这个指标 | 核心 UX 指标 |

---

## 6. Commit 规范

- 格式：`<type>(<scope>): <中文描述>`
  - 例：`feat(capture): 支持语音实时转写`
  - 例：`fix(sync): 修复 iCloud 空间满时的重试死循环`
- **只暂存当前任务相关文件**，禁止 `git add -A` / `git add .`
- 一个 commit 对应一个逻辑变更
- 完成一个里程碑后，务必更新 `docs/STATUS.md` 并在同一个 commit 里提交

**type** 可选值：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `adr`

---

## 7. 当前状态快照（随时更新）

> 最新详情永远以 [`docs/STATUS.md`](./docs/STATUS.md) 为准。本节只是给快速扫一眼。

- **阶段**：M0 文档与骨架初始化
- **下一步**：M1 本地存储层（SQLite schema + 原子写入协议）
- **尚未做**：Expo 项目实际 bootstrap、SyncWorker、UI、iCloud native module

---

## 8. 提问与答复

**如果你（AI）对方向有疑问，不要擅自决定——停下来问用户。**

特别是以下情况必须先问：

- 任务方向和 `docs/VISION.md` 有冲突
- 要引入新的外部依赖（尤其是服务端、账号、云服务）
- 要改 `docs/ARCHITECTURE.md` 里定义的核心抽象
- 要跳过某个底线（见 §5）
- `docs/STATUS.md` 和代码实际状态不一致

> "沉默地走错方向" 比 "多问一句" 糟糕得多。
