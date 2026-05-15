# ADR-001: 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）

- **Status**: accepted
- **Date**: 2026-05-06
- **Author**: BoxAI + user (original discussion)
- **Update 2026-05-15**: Mobile-to-Mac materialization semantics are superseded by [ADR-005](./ADR-005-mobile-captures-materialize-as-notes.md): iCloud `inbox/` is transport-only, and desktop Orbit writes Notes + Timeline events rather than Inbox Thoughts.

## Context

Orbit Mobile 的定位在 2026-05-06 的项目初立对话中被收敛为"Orbit 桌面端的 iOS Capture 前哨"——只做 BASB 方法论里的 Capture 阶段，承接用户在 Mac 不在手边时的"碎片时刻"输入，并把数据回流给桌面端 Orbit。早期接入目标是 `ThoughtService`，2026-05-15 后由 ADR-005 更新为 Notes + Timeline。详见 [`VISION.md`](../VISION.md) 与 [`thinking-trail/2026-05-06-project-inception`](../thinking-trail/2026-05-06-project-inception/README.md)。

在对话推进过程中，用户最初提出"iOS Capture 的内容仅存 iCloud，Mac 端能否获取到完整数据"的方案设想。初步回答确认 iCloud Drive + Document-based app + `chokidar` 监听的技术路径可行、零服务端。但用户紧接着加码了一条**不可妥协的底线**：

> "ios 应用要有完整的本地优先的策略，网络不稳定时，数据也完好无损。"

这句话直接否决了"仅存 iCloud"的提法——iCloud 作为数据源存在至少四类不可控风险：

1. **同步延迟不可预测**——Apple 的 iCloud Drive 上行并无 SLA，大附件可能数十秒到数分钟
2. **账户状态不可控**——用户未登录 iCloud、家庭共享切换、企业 MDM 限制都会让 container 不可用
3. **配额不可控**——iCloud 空间满时写入静默失败或延迟
4. **跨设备冲突语义弱**——同一文件在多台设备写入时冲突策略由系统决定，对 Capture 场景不可接受

同时，Orbit 桌面端已有的"本地优先"哲学是指 vault 存在用户自己的文件夹里。移动端需要**更强的含义**：设备本地就是真相源、飞行模式功能不降级、崩溃/断电数据完整、app 行为独立于 iCloud 可用性。

因此必须在项目的第一份 ADR 里把存储架构钉死，作为后续所有数据层决策（schema、同步协议、崩溃恢复、模块划分）的根基。

## Decision

**采用三层存储架构，并把"iCloud 仅为同步通道、非数据源"写成架构不可动摇的第一原则。**

三层分工如下：

| 层 | 介质 | 角色 | 失效影响 |
|---|---|---|---|
| **Layer 1 — Hot Cache** | 内存 + Zustand | 视图层：输入中的内容、最近列表、同步状态实时展示 | app 被杀即丢，由 Layer 2 完整重建 |
| **Layer 2 — Durable Local** | Expo 沙盒 `Documents/`：SQLite + 文件系统（manifest/附件/校验和/WAL） | **唯一真相源**：所有 capture 的完整数据 | 只有 app 被卸载才清空；iCloud 挂了零影响 |
| **Layer 3 — iCloud Transport** | iCloud Drive Container（`inbox/` → `processed/`） | 同步管道：存放待 Mac 消费的副本 | 可随时从 Layer 2 重建 |

配套约束：

- 用户交互的"保存成功"承诺只在 **Layer 2 原子落盘 + SQLite 事务提交**之后才给出（原子写入协议五阶段，详见 [`ARCHITECTURE.md`](../ARCHITECTURE.md) §5）
- Layer 3 的写入是异步的、状态机化的（`pending → syncing → uploaded → acked`），失败永不影响 Layer 2 数据完整性
- iCloud Container 的所有内容都是**可推导的**——丢了全部 `inbox/` 也能从 Layer 2 重发

具体目录结构、SQLite schema、原子写入五阶段流程、崩溃恢复矩阵、SyncWorker 状态机都在 [`ARCHITECTURE.md`](../ARCHITECTURE.md) §2/§3/§5 中有详细规格。本 ADR 钉死的是**"为什么这样分层"**。

## Rationale

三层分工对应三个正交关注点，各自有独立的失败模式：

- **视图**可以随时从数据重建 —— Layer 1 不需要持久化保证
- **数据**在原子写入保护下永远一致 —— Layer 2 承担全部持久化责任
- **管道**堵塞不影响数据 —— Layer 3 的失败只是"没送到 Mac"，不是"数据丢了"

这种分层是本地优先哲学的自然延伸：Orbit 桌面端已经证明"把数据放在用户看得见、管得住的地方"是一个能跨越工具生命周期的设计原则；移动端把这个原则推到更极端——**iCloud 的每一种失败模式都不能让 app 降级**。

关键细节：

- 把 iCloud 降级为"管道"而不是"数据源"，使得 Layer 3 的实现可以大胆容错（失败重试、退避、重建都无后顾之忧）
- SQLite 的同步状态机与文件系统的 `.complete` 哨兵文件、WAL 日志分别对应"元数据真相"和"磁盘真相"，两者通过启动时的 ReconcileJob 对账
- 所有 attachment（录音、图片原件）都在 Layer 2 本地持久化后才进入同步队列——这保障了 VISION 中"原材料永远保留"的承诺，也让 Mac 端事后用 Whisper/Vision 重处理成为可能
- 架构允许用户**永远不接 Mac 端**仍然正常使用——Layer 2 就是完整的个人数据库

## Alternatives Considered

- **Option A: 纯 iCloud Document-based App（用户最初设想）** — rejected
  数据主体直接存 iCloud Drive container，本地只做临时缓存。否决原因：直接违背用户"网络不稳时数据完好无损"的硬要求。iCloud 的同步延迟、账号未登录、空间满、跨设备冲突等每一种状态都会直接降级为数据层故障。无法给出原子写入与崩溃恢复语义。

- **Option B: 自建云端同步服务（REST/WebSocket + 对象存储）** — rejected
  自己运营后端做同步、ACK、冲突解决。否决原因：直接违反 [`VISION.md`](../VISION.md) "不做专有云存储"、"不做服务端"、"不做用户账号系统"三条底线。同时引入运维成本、隐私政策、成本结构——对"个人 Capture 前哨"这种场景完全不对等。

- **Option C: CloudKit Private Database** — rejected
  用 Apple 的 CloudKit 私有库做跨设备同步。否决原因：(1) Apple 生态锁定——绑死在 CKRecord 模型上，以后想接 Android 或纯文件方案都不可能；(2) 调试链路极长——schema 变更需要走 CloudKit Dashboard，本地 dev 环境与 production 环境分离；(3) Mac 端 Orbit 当前依赖"文件即真相"的心智（vault 是文件夹），CloudKit 记录需要再写一层导出到文件系统的桥，引入额外一致性风险。最致命的是——它依然没解决"本地是不是真相源"这个根本问题，反而让本地更薄。

- **Option D: 两层（跳过 Hot Cache，UI 直读 SQLite）** — rejected
  省掉 Layer 1 的内存缓存。否决原因：冷启动 <1s、列表首屏 <300ms 等性能预算要求 UI 必须基于内存快照渲染；同步状态的高频刷新直接打 SQLite 会竞争写锁；Zustand 的内存层本身成本极低，没有省的必要。

## Consequences

### Positive

- **离线完全可用**：飞行模式、无 iCloud 账号、iCloud 空间满的所有场景下，Capture 核心流程零降级
- **崩溃可恢复**：原子写入协议 + WAL + 启动 ReconcileJob 保证输入被杀、保存断电、rename 中途崩溃等场景数据完整
- **零服务端**：继续符合 Orbit "不做专有云存储"原则，无运维、无账号、无隐私政策负担
- **桌面端接入面小**：Mac 端只需新增 `src/main/capture/mobile_inbound/` 一个 watcher 模块消费 iCloud transport queue；具体 materialization 目标已由 ADR-005 更新为 Notes + Timeline
- **用户永远可脱离 Mac 端**：Layer 2 就是完整数据库，用户今天不用 Mac 端、一年后再启用，数据完整
- **AI 友好**：manifest + 校验和 + 原材料保留，桌面端 agent 消费时有完整上下文

### Negative / Trade-offs

- **本地 + iCloud 双份数据管理复杂度**：SQLite 状态机、文件系统 `.complete` 哨兵、iCloud 端 `inbox/processed` 三处都要对账。复杂度集中体现在启动 ReconcileJob 的正确性上
- **必须自写 Swift native module**：iCloud Bridge（约 200 行 Swift）没有成熟的 React Native 封装替代，`NSMetadataQuery` 订阅、`FileProvider` 上传状态、container 可用性检测都要自己包
- **GC 策略需要设计**：Mac 端 ack 后 Layer 2 是否立即删附件？保留多久？磁盘压力下如何按 LRU 回收？这些在本 ADR 中不决定，留给后续 ADR
- **原子写入协议 5 个阶段** + 崩溃恢复矩阵 8 种情形的实现需要极高代码质量——这是整个架构的关键路径
- **调试成本**：沙盒内文件不可从 Mac Finder 直接看（除非开发证书下用 Xcode），排错时需要自建日志/导出工具

### Neutral

- iOS 端不承担任何 agent/AI 执行职责，所有 AI 处理仍在 Mac 端——这是边界清晰化，不是牺牲
- 选用 Expo 而非 bare React Native 带来了 SDK 约束，但也覆盖了 `expo-sqlite` / `expo-file-system` / `expo-av` 等绝大多数需求
- `dead-letter/` 目录的存在承认"极端情况下数据可能进入需人工审查的状态"——这是透明而非失败

## References

- [`VISION.md`](../VISION.md) — Orbit Mobile 的价值主张与"本地优先比桌面端更严格"声明
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) §2（三层存储）/ §3（目录结构）/ §5（原子写入协议）— 本 ADR 的具体实施规格
- [`DATA-MODEL.md`](../DATA-MODEL.md) — SQLite schema 与 manifest JSON 规格（schema 产物）
- [`SYNC-PROTOCOL.md`](../SYNC-PROTOCOL.md) — Layer 3 同步状态机与 ACK 协议（同步协议产物）
- [`thinking-trail/2026-05-06-project-inception/README.md`](../thinking-trail/2026-05-06-project-inception/README.md) — 确立本地优先底线的原始对话
- [`ORBIT-INTEGRATION.md`](../ORBIT-INTEGRATION.md) — Mac 端 `mobile_inbound` watcher 接入点
