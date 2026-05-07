# Plans

具体功能的实施方案。`ROADMAP.md` 定"做什么"，本目录的 plan 文档定"怎么做"。

## 命名约定

```
YYYY-MM-DD-<kebab-slug>.md
```

## 状态字段

每份 plan 顶部的 frontmatter 应有：

```yaml
---
status: draft | in-progress | completed | abandoned
milestone: M1 | M2 | ...
related_adr: ADR-001, ADR-002
---
```

## 已有 plans

- [2026-05-06 · M1 本地存储层](./2026-05-06-m1-local-storage-layer.md) — **draft** · SQLite schema / repo / migration / 测试

## 何时写 plan

- 开工一个中型以上功能前
- 需要跨多次 commit 完成的工作
- 需要 agent/开发者对齐方案细节时

## Plan vs STATUS

- **Plan**: 做某个功能的具体步骤设计
- **STATUS**: 整个项目目前做到哪一步（索引性质）

每个 milestone 开工通常对应一份 plan；plan 状态变化时同步更新 STATUS。
