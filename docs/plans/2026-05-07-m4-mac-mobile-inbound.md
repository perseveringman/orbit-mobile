---
status: implemented
milestone: M4
depends_on: M3
created: 2026-05-07
---

# M4 Plan: Mac 端 mobile inbound ingest

## 目标

让 Mac 端 Orbit 监听 Orbit Mobile 写入的 iCloud Drive `inbox/<id>/`，校验 manifest/hash 后创建桌面端 artifact，并通过 `processed/<id>/.acked` 或 `failed/<id>/.failed.json` 回写结果。

> 2026-05-15 update: 早期目标是创建 Thought；当前契约已由 ADR-005 更新为直接 materialize Note、发布 `note.created` Timeline，并写 ACK v2。`inbox/` 仅保留为 iCloud transport queue 名称。

## 实施结果

- 用户确认 PR 策略：Mac 仓库独立分支 + 独立 commit。
- 实际仓库路径修正为 `/Users/ryanbzhou/Developer/new-orbit`。
- Mac 分支：`feat/mobile-inbound-ingest`
- Mac commit：`9486799 feat(mobile): 接入手机捕获入站`
- 新增 `src/main/capture/mobile_inbound/`：
  - `watcher.ts`
  - `ingest.ts`
  - `attachments.ts`
  - `config.ts`
  - `ack.ts`
  - `types.ts`
- 接入 `src/main/index.ts` vault runtime。
- 新增 Mac ADR：`docs/decisions/ADR-017-mobile-inbound-integration.md`。

## 验收

- [x] manifest schema 1 解析
- [x] `manifest.json.sha256` 校验
- [x] 成功 ingest 创建 Note、发布 Timeline，并移动到 `processed/<id>/.acked`
- [x] sha256 mismatch 移动到 `failed/<id>/.failed.json`
- [x] Mac focused test `tests/mobile_inbound.test.ts` 通过
- [ ] 真机端到端 iCloud smoke（需 iPhone + Mac iCloud 环境）
