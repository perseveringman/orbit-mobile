# Tests

## 结构

```
tests/
├── storage/       # Layer 2 repo 单元测试（M1 先做）
├── capture/       # 原子写入协议（M2）
├── sync/          # 状态机 + 退避（M3）
├── integration/   # 跨模块（M3+）
└── setup/         # 测试工具（in-memory-db 等）
```

## 测试策略

- **单元测试（Vitest）**：核心业务逻辑，快、无副作用
- **集成测试**：真实文件系统 + SQLite 的端到端路径
- **真机烟囱测**：每个 milestone 验收时最小 App.tsx 跑一次

## 关键约定

- `expo-sqlite` 在 Node 跑不起来 → 用 `better-sqlite3` 伪装相同 async API（见 `setup/in-memory-db.ts`）
- 所有 SQL 用 `?` 占位符（兼容两端）
- 时间注入：repo 不自动生成时间戳，测试显式传入

详见 `docs/TESTING.md` 与各 milestone plan。
