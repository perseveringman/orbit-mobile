# Orbit Mobile — Product Vision

> **Last rewritten**: 2026-05-06
> **Companion documents**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`ROADMAP.md`](./ROADMAP.md) · [`UX-PRINCIPLES.md`](./UX-PRINCIPLES.md)

---

## 一句话定位

**Orbit Mobile 是 Orbit 桌面端的 iOS Capture 前哨——把碎片时刻的灵感、见闻、想法，以零摩擦、零丢失、零锁定的方式送进你的 Second Brain。**

它**不是**：
- 一个带 AI 的笔记 App
- 桌面端 Orbit 的移动版
- 又一个待办/灵感收集工具

它**是**：
- BASB (Building a Second Brain) 方法论里 **Capture** 阶段的移动端专用入口
- 用户在 Mac 不在手边时的"思维暂存器"
- 数据通过 iCloud Drive 流回桌面端 Orbit，进入正式的 Inbox → Thoughts 工作流

---

## 为什么需要 Orbit Mobile

Orbit 桌面端已经完整实现了 BASB 的 CODE 四阶段——但整个工作台假设用户坐在 Mac 前。

**真实的灵感分布并不在工位上**：
- 地铁上刷到一条推文想到一个产品思路
- 洗澡时突然想通一个困扰很久的问题
- 开会时同事一句话触发联想
- 深夜床上看书时划出一段想存下来
- 播客里听到一句话想记录

这些时刻有三个共同特点：
1. **转瞬即逝**——超过 10 秒就忘
2. **多模态**——可能是文本、语音、图片、URL
3. **不需要加工**——只要"先存下来"就够了

桌面端 Orbit 的 `⌘⇧I` Quick Capture 解决了"坐在 Mac 前时"的问题。**Orbit Mobile 要解决其余 80% 的时间。**

---

## 核心哲学（继承 Orbit 但有移动端特化）

### 1. 本地优先 (Local-First) — 比桌面端更严格

桌面端的"本地优先"说的是 vault 在用户自己的文件夹里。  
移动端的"本地优先"有**更强的含义**：

- **设备本地是唯一真相源**——iCloud 只是同步通道，不是数据源
- **网络不稳时数据完好无损**——飞行模式、iCloud 挂了、空间满了，app 功能都不降级
- **原子写入协议**——任何一次保存要么完整成功要么完全不存在，杜绝"半写"状态
- **崩溃可恢复**——输入过程中被杀、保存过程中断电，重启后数据完整

这是**不可妥协的底线**。详见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

### 2. 零摩擦输入 (Frictionless Capture)

移动端 Capture 的敌人是"多按一次都嫌多"。

- **冷启动 ≤ 1 秒** 到可输入状态
- **键盘自动弹起 + 光标就位**
- **不问用户**项目归属/标签/分类——这些是 Mac 端事后做的事
- **三种输入形态一键可达**：文字、语音、图片
- **语音按下即录**——不要弹框确认
- **连续捕获模式**——保存后不退出，继续记下一条

详见 [`UX-PRINCIPLES.md`](./UX-PRINCIPLES.md)。

### 3. 多模态无损 (Multi-Modal Lossless)

手机是多模态设备，Capture 要吃下所有输入：

- **文本**——键盘输入
- **语音实时转写**——边说边出文字（iOS 原生 `SFSpeechRecognizer`）
- **语音备忘**——保留原始录音文件，Mac 端可二次转写（Whisper）提升质量
- **图片**——相册选图 + 相机拍照
- **分享扩展**——Safari/Twitter/其他 app 分享菜单直达
- **粘贴板识别**——打开 app 检测 URL 自动建议保存

**关键：原材料永远保留**。Mac 端可能需要重新处理（Whisper 更准的转写、Vision OCR 图片），所以 iOS 端上传的不只是结果文本，还有录音和图片原件。

### 4. 人机对等 (AI-Native, 继承自 Orbit)

移动端本身不跑 agent，但它产生的数据要让桌面端 agent **方便消费**：

- manifest JSON 结构化完整（时间戳、来源、设备、标签、位置）
- 附件命名规范（audio.m4a / photo-N.jpg）
- 校验和确保传输完整（sha256）
- 语音转写结果同时包含原始录音，agent 可选择用哪个

### 5. 透明可信 (Transparent Trust)

用户把数据交给你，他必须能**看见数据的状态**：

- 每条 capture 显示：已本地保存 / 同步中 / 已上云 / Mac 已接收 / 失败
- 同步失败可见原因，可手动重试
- 顶部全局状态栏实时反映 iCloud 健康度
- 终极逃生出口：导出为邮件/文件

---

## Orbit Mobile 的工作流

```
┌─────────────────────────────────────────────────────────────┐
│                      碎片时刻                                 │
│  地铁/排队/开会/床上/洗澡出来/走路/播客/阅读/刷推特             │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
                 打开 Orbit Mobile（图标/Widget/分享菜单/Siri）
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
     打字输入            按住录音           选图/拍照
        ↓                  ↓                  ↓
        └──────────────────┼──────────────────┘
                           ↓
                    点"完成" （< 3 次点击）
                           ↓
       ┌───────────────────────────────────────┐
       │  Layer 2: 设备本地沙盒（真相源）        │
       │    ├─ SQLite: 元数据 + 同步状态         │
       │    └─ FS: manifest + 附件 + 校验和      │
       └─────────────────┬─────────────────────┘
                         ↓ 后台异步
       ┌───────────────────────────────────────┐
       │  Layer 3: iCloud Drive Container       │
       │    （Apple 自动同步到 Mac）             │
       └─────────────────┬─────────────────────┘
                         ↓
       ┌───────────────────────────────────────┐
       │  Mac Orbit: mobile_inbound watcher     │
       │    ingest → ThoughtService.create()    │
       │    → Inbox → Thoughts                  │
       └───────────────────────────────────────┘
                         ↓
       Mac 移动 inbox/<id> → processed/<id>
                         ↓
       iOS 端监听到，更新同步状态为 acked
```

---

## 长期方向

按优先级排列。

### 近期（MVP 后第一轮迭代）

1. **Widget + Lock Screen Widget**——主屏/锁屏一点直达
2. **Share Extension 深化**——Safari 分享提取正文全文（不只是 URL）
3. **粘贴板智能识别**——URL / 长文本区分处理
4. **OCR 图片中文字**——iOS Vision framework 本地识别

### 中期

5. **Apple Watch Capture**——手表按一下开始录音
6. **Siri Shortcuts / App Intents**——"嘿 Siri，记个想法"
7. **语音转写质量优化**——Whisper on-device（iOS 17+ 可行）

### 长期

8. **iPad 适配**——大屏形态（但仍只做 Capture，不做编辑）
9. **Shortcut automations**——接 iOS 快捷指令的自动化场景
10. **多设备协同**——iPhone + iPad + Watch 间的统一状态

---

## 不做什么

**继承 Orbit 桌面端的"不做什么"，并加入移动端的特化：**

### 继承自 Orbit 桌面端

- **不做实时协作**——这是个人工具
- **不做专有云存储**——不引入任何中心化服务
- **不做 AI 聊天界面封装**——不在手机上做 ChatGPT UI
- **不强制绑定特定 AI 提供商**
- **不做通知中心**——不推送打扰用户

### 移动端特有

- **不做完整 Markdown 编辑器**——手机屏不适合长文，Obsidian Mobile 已经是生态标准
- **不做项目/任务管理**——那是桌面端 Orbit 的职责
- **不做 agent 执行**——手机没有 node-pty / git worktree 运行环境
- **不做跨设备同步自建方案**——iCloud Drive 足够，不要自造轮子
- **不做用户账号系统**——一切靠 iCloud，零注册
- **不做服务端**——零网络依赖（除了 Apple 的 iCloud）
- **不做通用笔记 App**——只做 Capture 这一件事

---

## 与 Orbit 桌面端的关系

Orbit Mobile 是 Orbit 生态的**专用卫星**，不是独立产品：

| 方面 | 说明 |
|---|---|
| **数据格式** | 完全兼容 Orbit ThoughtPayload / InboxItem schema |
| **数据流向** | iOS → iCloud Drive → Mac Orbit `mobile_inbound` watcher → `ThoughtService.create()` → 正式 Inbox |
| **用户心智** | "Capture 前哨"——所有 Mac 端 Quick Capture (`⌘⇧I`) 能做的事，手机上也能做，且有移动端独有的输入形态 |
| **版本关系** | 独立迭代节奏；需要 Mac 端配合时通过 ADR 记录改动点 |
| **无障碍** | 用户没有 Mac 端？iOS 数据仍完整保存在设备和 iCloud，随时可启用 Mac 端接收 |

Mac 端需要的改动集中在一个新模块 `src/main/capture/mobile_inbound/`，详见 [`ORBIT-INTEGRATION.md`](./ORBIT-INTEGRATION.md)。

---

## 成功标准

MVP 上线后 3 个月内：

- [ ] 用户冷启动到输入 **< 1 秒**（P95）
- [ ] 保存成功率（Layer 2）**= 100%**（本地写入不允许失败）
- [ ] 最终同步到 Mac 的成功率 **> 99.5%**（允许极端网络场景重试）
- [ ] 飞行模式/无 iCloud 的场景下功能完全可用
- [ ] 数据丢失事件 **= 0**（这是硬指标）
- [ ] 每日活跃用户的平均 capture 数 > 3 条

---

## 文档关系图

```
VISION.md (你在这里)
    ├─── 为什么存在
    ├─── 什么样的用户
    └─── 不做什么

ARCHITECTURE.md
    ├─── 三层存储
    ├─── 原子写入
    └─── 同步引擎

ROADMAP.md
    ├─── 里程碑
    └─── 优先级

STATUS.md
    └─── 当前进度（每次迭代更新）

UX-PRINCIPLES.md
    └─── 交互设计细节

DATA-MODEL.md
    ├─── SQLite schema
    ├─── manifest JSON
    └─── 目录结构

SYNC-PROTOCOL.md
    ├─── 状态机
    └─── 重试/ACK

ORBIT-INTEGRATION.md
    └─── Mac 端接入点

TESTING.md
    └─── 验收清单

decisions/ADR-*.md
    └─── 关键决策历史
```

---

**发现本文与其他文档冲突时，更新本文的优先级最高。**
