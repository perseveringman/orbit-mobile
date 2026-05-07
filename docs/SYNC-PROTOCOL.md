# Orbit Mobile — Sync Protocol

> **Status**: 设计阶段  
> **Related**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`DATA-MODEL.md`](./DATA-MODEL.md) · [`ORBIT-INTEGRATION.md`](./ORBIT-INTEGRATION.md)

---

## 1. 目标

把 Layer 2 的 capture 数据可靠传到 Mac 端 Orbit，并收到 ACK 闭环。

**约束**：
- 用户已经被告知"保存成功"，同步是**后台的事**
- 任何同步失败不能影响本地数据
- 用户可见但不打扰的状态反馈
- iCloud 挂了 app 不挂

---

## 2. 通道：iCloud Drive

```
 iOS app
   ↓ 写入
 iCloud Drive Container
   ↓ Apple 自动同步
 Mac: ~/Library/Mobile Documents/iCloud~com.orbit.capture/Documents/
   ↓ chokidar 监听
 Mac Orbit mobile_inbound watcher
   ↓ ingest
 Mac 移动 inbox/<id> → processed/<id>
   ↓ iCloud 同步回 iOS
 iOS 端 NSMetadataQuery 监听到
   ↓
 SQLite: sync_state = 'acked'
```

为什么选 iCloud Drive？
- 零服务端
- Apple 自己处理传输、冲突、断网恢复
- 用户无需登录任何账号
- Mac Finder 可直接看到目录（调试友好）

---

## 3. iCloud Container 结构

```
iCloud Drive/iCloud~com.orbit.capture/Documents/
├── inbox/                     # 待 Mac 消费
│   ├── <id>/                  # 每条 capture 一个目录
│   │   ├── manifest.json
│   │   ├── manifest.json.sha256
│   │   ├── audio.m4a
│   │   ├── photo-1.jpg
│   │   └── .uploading          # 可选：正在上传时放一个哨兵
│   └── ...
│
├── processed/                 # Mac 已成功 ingest（由 Mac 移入）
│   ├── <id>/
│   │   ├── manifest.json       # 留档
│   │   ├── .acked              # Mac 写入的 ACK 哨兵，含 ingest 时间
│   │   └── ...
│   └── ...
│
├── failed/                    # Mac ingest 失败（由 Mac 移入）
│   ├── <id>/
│   │   ├── manifest.json
│   │   └── .failed.json        # 含失败原因
│   └── ...
│
└── _control/                  # 控制信道（可选，V2）
    ├── mac-identity.json       # Mac 的 vault path / version
    └── ping.txt                # 心跳
```

**设计要点**：
- 三态目录：inbox / processed / failed
- Mac 端**移动**而不是复制，避免重复处理
- iOS 端监听 processed 和 failed 即可知道结局

---

## 4. 状态机

### 4.1 完整图

```
  ┌────────────────────────────────────────────────────┐
  │                                                      │
  │    [原子写入完成]                                     │
  │           │                                          │
  │           ▼                                          │
  │     ┌─────────┐                                      │
  │     │ pending │ ─────enqueued event──▶ SyncWorker   │
  │     └────┬────┘                                      │
  │          │ worker 拾取                                │
  │          ▼                                           │
  │     ┌─────────┐                                      │
  │     │ syncing │                                      │
  │     └────┬────┘                                      │
  │          │                                           │
  │     ┌────┴────┐                                      │
  │     │ 成功     │ 失败                                 │
  │     ▼         ▼                                      │
  │ ┌────────┐ ┌────────┐                                │
  │ │uploaded│ │ failed │                                │
  │ └───┬────┘ └───┬────┘                                │
  │     │          │ 退避等待                             │
  │     │          ▼                                     │
  │     │     ┌─────────┐                                │
  │     │     │ pending │ (重试)                          │
  │     │     └─────────┘                                │
  │     │                                                │
  │     │ Mac 消费 → processed/<id>/.acked               │
  │     │ iOS NSMetadataQuery 监听到                      │
  │     ▼                                                │
  │ ┌────────┐                                           │
  │ │ acked  │  ← 终态                                   │
  │ └────────┘                                           │
  │                                                      │
  │  异常分支：                                           │
  │    uploaded → Mac 发 .failed.json → conflicted       │
  │    syncing 卡住 >10min → reset pending               │
  │    连续失败 >20 次 → 暂停 + UI 高亮                    │
  │                                                      │
  └────────────────────────────────────────────────────┘
```

### 4.2 状态定义

| 状态 | 含义 | 进入条件 | 离开条件 |
|---|---|---|---|
| `pending` | 待同步 | 原子写入刚完成 / 退避到期 | Worker 拾取 |
| `syncing` | 正在复制 | Worker 开始操作 | iCloud copy API 返回 |
| `uploaded` | 本机认为已上云 | copy 成功 | Mac ACK 或 Mac 报错 |
| `acked` | **终态** | Mac ingest 成功 + processed/.acked 可见 | 无 |
| `failed` | 本次失败 | Worker 报错 | 退避到期重新 pending |
| `conflicted` | 数据冲突 | sha256 不匹配 / Mac 明确拒绝 | 用户介入 |

---

## 5. Worker 主循环

伪代码：

```ts
async function syncWorkerTick() {
  // 1. 找候选
  const candidates = await db.query(`
    SELECT * FROM captures
    WHERE deleted_locally = 0
      AND sync_state IN ('pending', 'failed')
      AND (sync_next_retry_at IS NULL OR sync_next_retry_at <= datetime('now'))
    ORDER BY created_at ASC
    LIMIT 5
  `);
  
  // 2. 并发处理（但控制并发度，避免 iCloud 打爆）
  await Promise.all(candidates.map(processOne));
}

async function processOne(capture) {
  try {
    // 3. 标记 syncing
    await db.run(`
      UPDATE captures SET 
        sync_state = 'syncing',
        sync_last_try_at = datetime('now')
      WHERE id = ? AND sync_state IN ('pending', 'failed')
    `, [capture.id]);
    
    // 4. 检查 iCloud 容器可用性
    const status = await iCloudBridge.getContainerStatus();
    if (status !== 'available') {
      throw new Error(`icloud_unavailable:${status}`);
    }
    
    // 5. 复制到 iCloud inbox/<id>/
    await copyDirectoryToICloud(
      capture.local_path,
      `inbox/${capture.id}/`
    );
    
    // 6. 等 iCloud 认为真的 uploaded（可选，有 native bridge 的话）
    await waitForICloudUpload(`inbox/${capture.id}/`);
    
    // 7. 标记 uploaded
    await db.run(`
      UPDATE captures SET 
        sync_state = 'uploaded',
        uploaded_at = datetime('now'),
        sync_attempts = sync_attempts + 1,
        sync_last_error = NULL
      WHERE id = ?
    `, [capture.id]);
    
    await logEvent(capture.id, 'uploaded', {});
  } catch (err) {
    // 8. 失败：写入 failed + 退避
    const attempts = capture.sync_attempts + 1;
    const nextRetry = computeBackoff(attempts);
    
    await db.run(`
      UPDATE captures SET 
        sync_state = 'failed',
        sync_attempts = ?,
        sync_last_error = ?,
        sync_next_retry_at = ?
      WHERE id = ?
    `, [attempts, err.message, nextRetry, capture.id]);
    
    await logEvent(capture.id, 'failed', { 
      attempt: attempts, 
      error: err.message 
    });
  }
}
```

---

## 6. 退避策略

```ts
function computeBackoff(attempt: number): ISO8601 {
  const delays = [
    0,           // attempt 1: 立即
    5,           // attempt 2: 5s
    30,          // attempt 3: 30s
    120,         // attempt 4: 2min
    600,         // attempt 5: 10min
    3600,        // attempt 6+: 1h（封顶）
  ];
  const delaySec = attempt < delays.length 
    ? delays[attempt - 1] 
    : delays[delays.length - 1];
  return new Date(Date.now() + delaySec * 1000).toISOString();
}
```

**熔断**：`sync_attempts > 20` 时暂停重试，写事件 `attempts_exhausted`，UI 在详情页高亮。用户可以手动点"重试"强制重新入队。

---

## 7. 触发时机

| 触发源 | 动作 |
|---|---|
| 原子写入完成 | `enqueue(captureId)` → 立即 tick |
| App 启动 | 启动 Worker + 立即 tick |
| `AppState: background → active` | tick |
| `NetInfo: offline → online` | tick，且重置所有 `failed` 的 `sync_next_retry_at = now` |
| `iCloudBridge.onContainerStatusChange` 变 available | 同上 |
| 定时器（60s） | tick |
| iOS Background Fetch | tick（机会型，iOS 自己决定频率） |
| 用户手动 "重试" | 单条强制 pending + tick |

**并发控制**：同一时刻最多 3 个 capture 在 syncing。iCloud API 有节流。

---

## 8. ACK 机制

### 8.1 Mac 端的动作

Mac 端 `mobile_inbound` watcher：
1. 监听 `inbox/<id>/manifest.json` 的出现
2. 等附件全部到齐（轮询 `.sha256` 存在 + 所有 attachment 文件存在）
3. 校验 sha256
4. 调 `ThoughtService.create()` 写入 vault
5. 成功：**移动** `inbox/<id>/` 到 `processed/<id>/`，同时写 `.acked` 文件：
   ```json
   {
     "acked_at": "2026-05-06T10:32:15.123Z",
     "inbox_item_id": "thought_xxx",
     "vault_path": "/Users/.../vault",
     "mac_identity": "MacBook-Pro-Ryan"
   }
   ```
6. 失败：移动到 `failed/<id>/`，写 `.failed.json`：
   ```json
   {
     "failed_at": "2026-05-06T10:32:15.123Z",
     "error_code": "sha256_mismatch" | "invalid_manifest" | "fs_error" | ...,
     "error_message": "...",
     "retryable": true
   }
   ```

### 8.2 iOS 端的动作

iOS 通过 native module 订阅 `processed/` 和 `failed/` 的变化：

```ts
iCloudBridge.subscribeToChanges('processed/', (event) => {
  if (event.type === 'created' && event.path.endsWith('/.acked')) {
    const captureId = parseIdFromPath(event.path);
    const ackInfo = readJson(event.path);
    markAcked(captureId, ackInfo);
  }
});

iCloudBridge.subscribeToChanges('failed/', (event) => {
  if (event.type === 'created' && event.path.endsWith('/.failed.json')) {
    const captureId = parseIdFromPath(event.path);
    const failInfo = readJson(event.path);
    if (failInfo.retryable) {
      // 重新入队
      resetToPending(captureId, failInfo);
    } else {
      // 永久失败
      markConflicted(captureId, failInfo);
    }
  }
});
```

**ACK 补偿**：如果 iOS 启动时发现某条已 uploaded > 1 天但没 acked，主动扫描一次 processed/ 看是否漏了监听事件。

---

## 9. 异常处理详表

| 场景 | 检测 | 动作 |
|---|---|---|
| 网络断开 | NetInfo 事件 | 暂停 tick，state 保持 |
| iCloud 未登录 | getContainerStatus → 'not-signed-in' | 全部 pending，顶部 banner |
| iCloud 空间满 | copy 报 `NSFileProviderErrorInsufficientQuota` | 标记 failed + 特殊 banner "iCloud 空间已满" + 不再自动重试（等用户清理） |
| iCloud 账号变更 | getContainerStatus → 'restricted' | 暂停 + 提示"重新登录相同 Apple ID" |
| 某文件传输损坏 | Mac sha256 mismatch → failed.json retryable=true | iOS 自动重传 |
| manifest schema 错误 | Mac 解析报错 → failed.json retryable=false | iOS 标 conflicted |
| Mac 端 Orbit 没在运行 | 数据留在 inbox 等 Mac 下次启动 | 正常——这是预期 |
| iOS 重装 app | 沙盒清空 | iCloud 里的不受影响；但本地也没了。提示用户"检测到 iCloud 有 N 条未 ack 的记录，是否恢复到本地"（V2 功能） |
| 连续失败 > 20 次 | sync_attempts | 暂停 + UI 高亮 |
| syncing 状态卡 > 10min | 启动扫描 | reset 为 pending |

---

## 10. 与 App Group / Share Extension 的交互

Share Extension 是**独立进程**。为了让它能写主 app 的 SQLite 和文件系统：

1. 配置 **App Group**（如 `group.com.orbit.capture`）
2. SQLite 和 `captures/` 目录放 App Group 共享容器
3. Extension 进程**直接走同样的原子写入协议**
4. 写完后**不触发 SyncWorker**（Extension 可能立刻被系统杀）
5. 主 app 下次启动扫描到新 capture → 正常触发 Worker

**⚠️ App Group 的沙盒路径和单 app 沙盒不同**，代码要用统一的 path 抽象。

---

## 11. 调试与可观测性

### 11.1 UI 层

- 每条 capture 详情页展示完整 sync_events
- "立即重试"按钮
- "强制标记为 acked"（高级用户）
- "查看本地文件"（打开 FilesApp 对应目录，调试用）

### 11.2 日志

- `logs/sync-<YYYY-MM-DD>.ndjson` 追加写入所有事件
- 崩溃前的日志在 Apple 崩溃日志里

### 11.3 "健康检查"命令

开发环境暴露一个调试屏幕：
- 当前所有 capture 的状态分布
- 最近 20 次 sync 事件
- iCloud container 实时状态
- "跑一次 Reconcile"按钮
- "清空失败重试"按钮
- "导出所有日志"按钮

---

## 12. 为什么不用 Mac 端推送回 iOS？

考虑过：Mac 端写完 processed 后，通过某种机制（推送？WebSocket？）主动通知 iOS。

**否决原因**：
- 需要服务端中转 → 违反"零服务端"原则
- 或需要 iOS/Mac 在同一局域网 + 复杂的发现机制
- iCloud 的同步延迟已经够快（通常 30s 以内），被动监听 processed/ 足够
- 多设备场景下（iPhone 和 iPad 同时监听）简单一致

---

**修改同步协议的 PR 必须同步更新此文档。**
