---
status: implemented
milestone: M3
depends_on: M2
created: 2026-05-07
---

# M3 Plan: 同步引擎 + iCloud Bridge

## 目标

把 M2 已完整落到 Layer 2 的 capture 目录复制到 iCloud Drive `Documents/inbox/<id>/`，并让同步状态对用户可见。同步失败不能影响本地保存。

## 明确不做

- Mac 端 ingest 逻辑（M4）
- 服务端、账号系统、自建云
- 语音、图片、Share Extension
- 把 iCloud 当作真相源

## 实施步骤

1. **Native iCloud Bridge**
   - 本地 Expo module `modules/orbit-icloud-bridge/`
   - `getContainerStatus()`
   - `copyToICloud(localPath, remotePath)`
   - `getUploadStatus(remotePath)`
   - `readTextFile(remotePath)` / `fileExists(remotePath)` 为 M4 ACK 做准备

2. **JS wrapper + transport**
   - `src/native/icloud-bridge.ts`
   - `src/core/sync/icloud-transport.ts`
   - native module 不可用时返回明确 unavailable 状态，不让 app 崩溃

3. **SyncWorker**
   - `pending/failed/uploaded` 候选扫描
   - `pending -> syncing -> uploaded`
   - iCloud 不可用时 `failed` + backoff，不影响 Capture
   - 预留 `processed/.acked` 和 `failed/.failed.json` 读取

4. **UI 与触发**
   - 全局顶部状态条展示 pending/syncing/uploaded/failed/conflicted/iCloud unavailable
   - App 启动、AppState active、定时器、保存后立即 tick
   - 暂不引入 NetInfo 新依赖，避免额外外部依赖面

5. **测试**
   - backoff schedule
   - 状态机合法转换
   - worker 成功上传
   - iCloud unavailable 下本地数据保留并重试

## 验收标准

- [x] 保存后 SyncWorker 会尝试复制到 iCloud inbox
- [x] iCloud unavailable 不影响本地 Capture，状态可见
- [x] 每条 capture 同步状态可见
- [x] `npm run typecheck` / `npm run lint` / `npm run test` 全绿
- [ ] 真机 iCloud Drive 可见文件（需 Apple ID/iCloud capability 手动验收）
- [ ] iCloud 空间满 banner / 错误分类（需真机构造 quota 场景）
