# Thinking Trail: 2026-05-06 项目初立与本地优先方案

> 第一次对话，确立 Orbit Mobile 的存在理由、边界、本地优先架构方向。  
> 后续所有工作的锚点。

---

## 关键共识（按时间顺序）

### 1. Orbit Mobile 的定位

- 不是 Orbit 桌面端的移动版
- 不是通用笔记 app
- **只做 BASB 方法论里的 Capture 阶段**
- 目标是"碎片时刻零摩擦入库"

### 2. 本期只做 Capture

用户明确表态："先只做Capture，要做成功能最全，交互体验最好的capture"。

具体含义：
- 手机端最重要的是"刷到碎片信息想记录，或者有灵感想记录"
- "打开应用就能直接输入"
- 同时支持语音 / 文本 / 图片输入

### 3. 数据归属

用户问："ios capture 的内容仅存 iCloud，能否在 Mac 端获取到完整的数据？"

回答核心：
- iCloud Drive + Document-based app 方案可行
- Mac Finder 可直接访问 `~/Library/Mobile Documents/iCloud~<bundle>/Documents/`
- 路径通过 chokidar 监听，复用桌面端已有 `ThoughtService` 就能 ingest
- 完全零服务端

### 4. 本地优先不可妥协

用户追加："ios 应用要有完整的本地优先的策略，网络不稳定时，数据也完好无损"。

这一句话定了整个架构：
- **"仅存 iCloud"这个提法要修正** —— 数据**先在设备本地**，iCloud 只是同步通道
- 三层存储：Hot Cache / Durable Local / iCloud Transport
- 原子写入协议保证崩溃不丢数据
- 同步状态机 + 退避 + ACK
- 启动 reconcile 自愈

### 5. 文档驱动 + AI 友好

用户："把所有愿景和规划都记录在项目内，且在 AGENTS.md 给出索引，让所有 AI 迭代时，都确保自己知道这个项目在做什么，以及现在做到哪里了"。

这是对 AI-Native 哲学的移动端延伸：
- AGENTS.md 是契约
- STATUS.md 是进度
- 每次迭代的 AI 都必须读文档再动手

---

## 设计决策的流向

```
用户需求 ——→ 选 Capture-only 定位 ——→ 选 iCloud Drive 通道
                                              │
                                              ▼
                             用户加码：本地优先硬要求
                                              │
                                              ▼
                 三层存储架构（Hot / Durable / Transport）
                 + 原子写入协议
                 + 状态机化的同步引擎
                 + 启动自愈
                                              │
                                              ▼
                         文档化（10+ docs）
                         AGENTS.md 作为 AI 迭代契约
                         STATUS.md 作为进度单点事实
```

---

## 留给后续的关键未决

见 [`../../open-questions.md`](../../open-questions.md)。

最关键的几个：
- iCloud 同步延迟的用户感知
- `expo-speech-recognition` 稳定性
- App Group + Share Extension 复杂度
- 重装 app 后的数据恢复 UX

---

## 本 trail 的后续引用

后续任何在项目方向、本地优先原则、数据归属上的讨论，都应该回看本文确认没有偏离初衷。

如果未来某次讨论决定**改变**本 trail 里的核心共识，必须：
1. 写新的 ADR 明确说明偏离的理由
2. 更新 VISION.md / ARCHITECTURE.md
3. 在本 trail 末尾补一条"superseded by ..."
