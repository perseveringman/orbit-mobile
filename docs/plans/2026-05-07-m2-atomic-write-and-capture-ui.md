---
status: draft
milestone: M2
depends_on: M1
created: 2026-05-07
---

# M2 Plan: 原子写入 + 文本 Capture MVP

## 目标

M2 结束时，用户可以在手机主界面输入文本并保存。保存必须先完整落到 Layer 2（SQLite + 文件系统），飞行模式和 iCloud 不可用不影响功能。

## 明确不做

- iCloud SyncWorker / native iCloud Bridge（M3）
- Mac 端 ingest（M4）
- 语音、图片、Share Extension（M5+）
- 完整 Markdown 编辑器或任务管理

## 实施步骤

1. **Manifest 与 hash**
   - 实现 `src/core/capture/types.ts`
   - 实现 `src/core/capture/manifest.ts`
   - 实现 `src/core/capture/hash.ts`
   - manifest schema 对齐 `docs/DATA-MODEL.md §2`

2. **文件系统原子写入**
   - 先解决 `src/utils/fs.ts` 里的真实 `fsync()` 策略
   - 实现 `src/core/capture/atomic-write.ts` 五阶段协议
   - 输出 `captures/<id>/manifest.json`、`manifest.json.sha256`、`.complete`
   - SQLite `captures` 和 `sync_events(created)` 在同一事务中写入

3. **崩溃恢复**
   - 实现 `src/core/reconcile/reconcile-job.ts`
   - 启动后异步扫描 `wal/`、`captures/`、`captures/.staging/`
   - 能清理 staging、补 SQLite、移动 dead-letter

4. **文本 Capture UI**
   - 用真实 Capture screen 替换 M1 smoke `App.tsx`
   - 冷启动自动 focus 输入框
   - 保存后清空输入，保持连续捕获
   - 最近列表只读展示本地 captures
   - 每条状态显示 pending（同步留给 M3）

5. **草稿自动保存**
   - 实现 `src/ui/hooks/use-draft.ts`
   - 输入 debounce 2 秒写 `drafts`
   - 重启后提示恢复草稿

6. **测试**
   - manifest 构造与 sha256 测试
   - atomic-write happy path
   - fault injection 覆盖 Phase 2/3/4 关键崩溃点
   - reconcile 清理 staging、补 SQLite、dead-letter
   - repo + atomic-write 集成测试

## 验收标准

- [ ] 飞行模式下可保存文本
- [ ] 正常保存后 `captures/<id>/` 完整且 SQLite 有记录
- [ ] 列表显示所有未删除 capture
- [ ] 输入中杀进程后草稿可恢复
- [ ] 保存中崩溃不会出现半成品
- [ ] `npm run typecheck` / `npm run lint` / `npm run test` 全绿
- [ ] `docs/STATUS.md` 和 `docs/ROADMAP.md` 更新

## 注意事项

- `fsync()` 不能继续 noop 后直接宣称原子写入完成。
- ReconcileJob 不能阻塞首屏输入，UI 可先渲染，后台再自愈。
- 同步状态只是附加元数据，保存成功不依赖 iCloud。
