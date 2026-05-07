# Architecture Decision Records (ADR)

重要的设计决策记录在这里。每个 ADR 回答三个问题：

1. **What** — 决定了什么
2. **Why** — 为什么这样决定
3. **Consequences** — 带来什么后果（正面和负面）

## 格式

```
ADR-NNN-<kebab-slug>.md
```

每个 ADR 从模板生成，见 [`_template.md`](./_template.md)。

## 状态

- **proposed** — 提案中
- **accepted** — 已采纳
- **deprecated** — 不再采用（保留作历史）
- **superseded by ADR-XXX** — 被新 ADR 取代

## 已有 ADR

- [ADR-001: 本地优先的三层存储架构（Hot Cache / Durable Local / iCloud Transport）](./ADR-001-local-first-three-layer-storage.md) — 2026-05-06 · **accepted**

## 何时写 ADR

- 引入新的核心抽象
- 改变本地优先/原子写入/同步协议的任何语义
- 引入新的外部依赖（特别是平台级别的：iCloud / App Group / ...）
- 放弃某条 AGENTS.md 里的底线时（这种情况一定要写）
- 任何"以后看到这个决策会想知道为什么"的事情
