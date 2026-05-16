# ADR-006: 移动端拆成 Markdown Capture 与 Recording Session 两种 Capture 模式

- **Status**: accepted
- **Date**: 2026-05-16
- **Author**: Codex + user

## Context

Orbit Mobile 的边界是 Capture 前哨，不是桌面端 Orbit 的小屏复刻。随着语音、图片、文件、长录音、X1 录音笔逐步接入，单一 composer 已经开始承载两种本质不同的用户意图：

1. 用户打开 app 就想记一条东西，可能混合文字、图片、文件、短录音。
2. 用户处在会议/访谈/现场，核心任务是持续录音，并在过程中精确标出关键时间点。

如果继续把两者塞进同一个页面，会让主输入变重，也会让长录音里的“时间精确性”被弱化。反过来，如果在手机端做完整 Markdown 编辑器，又会违反项目底线：手机只做 Capture，不做桌面端编辑和组织工作。

## Decision

移动端采用两个并列模式：

| 模式 | 主对象 | 适用场景 | 数据形态 |
|---|---|---|---|
| **Markdown Capture** | Markdown 草稿 | 随手记录、混合素材、短音频 | 一条 capture，正文包含 `attachment://` block，附件进 manifest |
| **Recording Session** | 录音时间点 | 会议、访谈、现场记录、X1/iPhone 长录音 | 一条 recording capture，过程事件写入 `recording_annotations` |

具体规则：

- Markdown Capture 默认作为 app 启动页面，支持文字、图片、文件、短录音，但只提供 capture-grade Markdown composer，不提供桌面级 Markdown 编辑能力。
- Recording Session 默认显示“时间点”页签，主按钮是“标记此刻”。时间点一旦创建就固定 timestamp；笔记、拍照、图片、文件都锚定到该 timestamp。
- Recording Session 的补充动作必须放在“正在编辑 <timestamp>”的当前标记面板内；主按钮仍保持“标记此刻”，但“写笔记 / 拍照 / 图片 / 文件”不能作为全局并列动作出现。
- iPhone 麦克风和 X1 录音卡都必须进入同一套 Recording Session 页面，减少用户认知负担；X1 BLE 协议页保留为通信测试/维护入口。
- 录音过程附件必须随 recording capture 一起本地原子落盘，不能先变成独立 capture 再事后关联。
- X1 录音卡保留协议测试页面，但用户入口归入录音列表的设备卡；X1 导入和 iPhone 录音都进入同一套 recording capture / timeline 语义。
- 两个模式都不能绕过 Layer 2 本地原子写入。iCloud、AI、Mac ingest 都是后续异步流程。

## Rationale

这次拆分把交互模型和数据模型对齐了：

- Markdown Capture 里的附件是“笔记内容的一部分”，用户关心的是这条 capture 的正文。
- Recording Session 里的附件是“录音时间线的一部分”，用户关心的是它发生在第几分第几秒。

因此两个页面的主按钮也不同：

- Markdown Capture 的主按钮是保存当前草稿。
- Recording Session 的主按钮是标记当前时间点，保存录音只是结束会话。

这样既保留了手机端 1 秒输入的轻量性，也给长录音/X1 这类复杂场景一个更符合直觉的时间轴心智。

## Consequences

### Positive

- 主输入页不会被长录音复杂度拖重，仍然保持快速输入。
- 会议场景里的关键动作更精确：先锁定 timestamp，再补内容。
- X1/iPhone 长录音可以共享同一套 recording session 语义。
- Mac 端未来 ingest 时能清楚区分普通附件和录音过程事件。

### Negative / Trade-offs

- 需要维护两套 UI 状态机：Markdown 草稿状态机与录音中时间点状态机。
- 录音详情页需要继续演进，才能完整展示 `session_event` 的附件、笔记和 bookmark 兼容层。
- 真机上录音中拍照、选图、文件选择会打断当前 app 视图，需要额外验收权限和后台录音行为。

## References

- [`UX-PRINCIPLES.md`](../UX-PRINCIPLES.md) §0
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) §5
- [`DATA-MODEL.md`](../DATA-MODEL.md) §2
- [`STATUS.md`](../STATUS.md)
