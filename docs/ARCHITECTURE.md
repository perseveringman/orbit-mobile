# Orbit Mobile — Architecture

> **Status**: 设计阶段（2026-05-06 初稿）
> **Audience**: 所有写代码的人 / AI
> **Prerequisites**: 先读 [`VISION.md`](./VISION.md) 确认方向对齐

---

## 1. 核心原则（再次强调）

```
┌────────────────────────────────────────────────────────────┐
│  设备本地是唯一真相源 (Single Source of Truth)               │
│  iCloud 是同步通道，不是数据源                                 │
└────────────────────────────────────────────────────────────┘
```

所有架构决策都服务这一条。如果某个方案让"iCloud 挂了 = 功能挂了"，方案就是错的。

---

## 2. 三层存储架构

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: Hot Cache (内存 + Zustand)                          │
│  ────────────────────────────────────────                     │
│  - 当前输入中的内容（未保存）                                    │
│  - 最近 N 条 capture 的预览列表                                  │
│  - 同步状态的实时展示                                           │
│  - app 被杀 → 靠 Layer 2 完整重建                               │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: Durable Local Store (沙盒 + SQLite + 文件系统)       │
│  ────────────────────────────────────────                     │
│  - 所有 capture 的真实数据                                      │
│  - SQLite 做元数据索引 + 同步状态机                               │
│  - 文件系统存 manifest.json / 附件 / 校验和                       │
│  - 只有 app 被卸载才清空                                         │
│  - iCloud 挂了对这一层零影响                                     │
├──────────────────────────────────────────────────────────────┤
│  Layer 3: Sync Transport (iCloud Drive Container)             │
│  ────────────────────────────────────────                     │
│  - 只放"待被 Mac 消费"的副本                                      │
│  - 结构：inbox/ → processed/                                   │
│  - Mac 端消费后移到 processed/，iOS 看到后标记 acked             │
│  - 这一层可以随时重建（从 Layer 2 重新上传）                       │
└──────────────────────────────────────────────────────────────┘
```

**心智模型**：
- Layer 1 是**视图**
- Layer 2 是**数据**
- Layer 3 是**管道**

管道堵了不影响数据；视图可以随时从数据重建；数据在原子写入保护下永远一致。

---

## 3. 目录结构（Layer 2）

所有路径基于 Expo 沙盒 `FileSystem.documentDirectory`：

```
<app sandbox>/Documents/
├── orbit.db                              # SQLite 主库
├── orbit.db-wal                          # SQLite WAL (自动)
├── orbit.db-shm                          # SQLite 共享内存 (自动)
│
├── captures/                             # 🔑 用户数据的真实存放
│   ├── mob_cap_a7f3b2c1/                 # 每条 capture 一个目录
│   │   ├── manifest.json                 # 元数据 + 文本内容
│   │   ├── manifest.json.sha256          # 校验和
│   │   ├── audio.m4a                     # 录音原件（若有）
│   │   ├── photo-1.jpg                   # 图片（若有）
│   │   ├── photo-2.jpg
│   │   └── .complete                     # 原子性完成标记（最后写）
│   │
│   └── .staging/                         # 写入中间态（不会被扫到）
│       └── <txn_id>/                     # 进行中的原子事务
│
├── drafts/                               # 输入中但未保存的草稿
│   ├── <session_id>.json                 # 草稿元数据
│   └── attachments/<session_id>/         # 草稿附件
│
├── wal/                                  # Write-Ahead Log（崩溃恢复）
│   └── <txn_id>.ndjson                   # 每笔原子事务的 WAL
│
├── logs/
│   └── sync-<YYYY-MM-DD>.ndjson          # 同步历史审计
│
├── dead-letter/                          # 无法修复的损坏数据
│   └── <id>/                             # 人工审查用
│
└── tmp/                                  # 临时文件（录音/选图过程态）
    └── ...
```

**iCloud Container**（Layer 3）：
```
~/Library/Mobile Documents/iCloud~com.zhouyanbo.orbit.capture/Documents/
├── inbox/                                # 待 Mac 消费
│   └── <id>/
│       ├── manifest.json
│       ├── manifest.json.sha256
│       └── 附件...
└── processed/                            # Mac 已消费
    └── <id>/ ...
```

---

## 4. SQLite Schema

详见 [`DATA-MODEL.md`](./DATA-MODEL.md)。核心四张表：

| 表 | 用途 |
|---|---|
| `captures` | 每条 capture 的元数据 + 同步状态 |
| `sync_events` | 同步历史审计 |
| `drafts` | 未完成的输入草稿 |
| `device_info` | 设备元信息（device_id、schema_version...） |

---

## 5. 原子写入协议

这是整个架构**最关键**的部分。任何改动这里的代码必须极度小心。

### 5.1 五个阶段

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: 准备（内存）                                     │
│  1. 生成 id = "mob_cap_" + uuid                         │
│  2. 构造 manifest 对象                                    │
│  3. 记录所有 attachment 的 tmp 路径                       │
├─────────────────────────────────────────────────────────┤
│ Phase 2: 写 WAL                                          │
│  4. 写 wal/<txn_id>.ndjson                               │
│     内容：{ op: "create", id, expected_attachments }     │
│  5. fsync WAL 文件                                       │
├─────────────────────────────────────────────────────────┤
│ Phase 3: 原子落盘                                         │
│  6. mkdir captures/.staging/<txn_id>/                    │
│  7. 把所有 attachment 从 tmp → staging（copy）            │
│  8. 写 manifest.json → staging                           │
│  9. 算 sha256 → 写 manifest.json.sha256 → staging        │
│  10. fsync staging 目录                                  │
│  11. rename staging/<txn_id> → captures/<id>  ← 原子！    │
│  12. touch captures/<id>/.complete  ← 完成标记           │
│  13. fsync captures 目录                                 │
├─────────────────────────────────────────────────────────┤
│ Phase 4: 事务写 SQLite                                    │
│  14. BEGIN IMMEDIATE                                     │
│  15. INSERT INTO captures (..., sync_state='pending')    │
│  16. INSERT INTO sync_events (event='created')           │
│  17. COMMIT                                              │
├─────────────────────────────────────────────────────────┤
│ Phase 5: 清理 + 通知                                      │
│  18. DELETE wal/<txn_id>.ndjson                          │
│  19. 清理原 tmp（若还在）                                   │
│  20. 返回 UI "已保存" ← 到这里才告诉用户成功                  │
│  21. 触发 SyncWorker                                     │
└─────────────────────────────────────────────────────────┘
```

### 5.2 崩溃恢复矩阵

| 崩溃发生在 | Layer 2 状态 | SQLite 状态 | 恢复动作 |
|---|---|---|---|
| Phase 1-2 | 无痕迹 | 无记录 | 什么都不做（用户从没真正保存） |
| Phase 3 step 6-10 | `staging/<txn_id>/` | 无记录 | 启动扫描：删 staging，删 WAL |
| Phase 3 step 11（rename 中） | 系统保证原子，要么全成功要么全失败 | - | 取决于 rename 前后 |
| Phase 3 step 11-12 之间 | `captures/<id>/` 在但无 `.complete` | 无记录 | **保守**：移到 `dead-letter/<id>/` 供人工审查 |
| Phase 3 step 13-Phase 4 start | `captures/<id>/` 完整 + `.complete` | 无记录 | 扫描：找到 WAL → 按 WAL 补 SQLite INSERT → 删 WAL |
| Phase 4 中（事务未提交） | `captures/<id>/` 完整 | SQLite WAL 自动回滚 | 同上：补 INSERT |
| Phase 5 前 | `captures/<id>/` 完整 | 记录已写 | 扫描：WAL 存在但 SQLite 已有 → 删 WAL 即可 |
| Phase 5 后 | 完整 | 完整 | 无异常 |

**关键细节**：

- **Phase 2 的 WAL 是"未来日志"**——声明"我即将做 X"
- **`.complete` 哨兵文件**是磁盘层的"已完成"标记，区别于 SQLite 事务
- **rename 原子性**依赖同一卷——沙盒内全部同卷，保证可靠
- **fsync 目录**确保元数据也落盘，防止 rename 本身在断电时丢失

### 5.3 草稿增量保存

输入过程中每 2 秒或关键动作触发：

```ts
upsertDraft(sessionId, { content, tags, attachments })
  → UPSERT INTO drafts (...) VALUES (?)
```

草稿**不走原子写入协议**——频繁写入不需要那么重，也没用户承诺。  
但录音/选图产生的附件**立刻落盘**到 `drafts/attachments/<session_id>/`（录音到一半 app 被杀也不丢）。

保存时：
1. 草稿的 attachment 从 `drafts/attachments/` 移到 tmp
2. 走原子写入协议创建正式 capture
3. 成功后 `DELETE FROM drafts` + 删草稿附件目录

---

## 6. 同步引擎 (SyncWorker)

详细协议见 [`SYNC-PROTOCOL.md`](./SYNC-PROTOCOL.md)。核心要点：

### 6.1 状态机

```
  [pending] ──尝试同步──▶ [syncing] ──成功──▶ [uploaded] ──Mac ack──▶ [acked]
      ▲                       │
      │                       ↓ 失败
      │                   [failed]
      │                       │
      └──── 退避重试 ─────────┘
```

### 6.2 触发时机

| 触发源 | 动作 |
|---|---|
| 新 capture 写入 | 立即入队 |
| App 启动 | 扫 pending + failed，全部入队 |
| App 前台 | 重试 failed |
| NetInfo: 断 → 连 | 重试 failed |
| iCloud container: 不可用 → 可用 | 重试全部 |
| 定时器 60s | 保险扫一遍 |
| 用户手动点"重试" | 单条强制 |

### 6.3 退避策略

```
attempt 1:  立即
attempt 2:  +5s
attempt 3:  +30s
attempt 4:  +2min
attempt 5:  +10min
attempt 6+: +1h (封顶)
```

失败永不丢数据——Layer 2 文件完好，只是 `sync_state='failed'` + `sync_attempts++`。

### 6.4 ACK 机制

Mac 端 ingest 成功后把 `inbox/<id>/` 移到 `processed/<id>/`。  
iOS 端通过 `NSMetadataQuery`（native module）监听 `processed/`，看到 `<id>` 出现 → `sync_state = 'acked'`。

---

## 7. 启动自愈（ReconcileJob）

每次冷启动都跑：

```
1. 扫 wal/ 目录
   对每个遗留 WAL：
     - 对应 captures/<id>/ 完整 → 补 SQLite → 删 WAL
     - 对应 captures/<id>/ 不完整 → 移到 dead-letter + 删 WAL
     - 对应 staging/<txn_id>/ 存在 → 清理 staging + 删 WAL

2. 扫 captures/ 目录
   对每个子目录：
     - 缺 .complete → 移到 dead-letter（不应发生，但防御）
     - SQLite 有记录 → OK
     - SQLite 无记录 → 从 manifest 补 INSERT

3. 扫 captures/.staging/ 目录
   - 任何残留 → 删掉（对应事务已经通过 WAL 恢复了）

4. SQLite 侧对账
   - sync_state='syncing' 的 → reset 为 pending（卡住的）
   - sync_state='uploaded' 没 acked_at → 重新查 iCloud processed/

5. 扫 drafts/ 目录
   - 有草稿 → 在 UI 层面标记"有未完成草稿可恢复"

6. iCloud 健康检查
   - getContainerStatus() → 更新全局状态

7. 触发 SyncWorker
```

**启动性能预算**：冷启动到可输入 **< 1 秒**。ReconcileJob 不能阻塞输入界面渲染，要异步跑。

---

## 8. 模块划分

```
src/
├── core/                            # 无 UI 依赖的纯业务
│   ├── storage/                     # Layer 2
│   │   ├── db.ts                    # SQLite 开库 + migration
│   │   ├── schema.ts                # 建表 SQL
│   │   ├── captures-repo.ts         # CRUD captures 表
│   │   ├── drafts-repo.ts           # CRUD drafts 表
│   │   └── events-repo.ts           # CRUD sync_events 表
│   │
│   ├── capture/                     # 原子写入协议
│   │   ├── atomic-write.ts          # 五阶段写入
│   │   ├── manifest.ts              # manifest 构造 + 校验
│   │   ├── hash.ts                  # sha256
│   │   └── types.ts
│   │
│   ├── sync/                        # Layer 3 + 状态机
│   │   ├── worker.ts                # SyncWorker 主循环
│   │   ├── state-machine.ts         # 状态转换
│   │   ├── backoff.ts               # 退避计算
│   │   └── icloud-transport.ts      # 调 native module
│   │
│   ├── audio/
│   │   ├── recorder.ts              # 录音
│   │   └── transcription.ts         # 实时转写
│   │
│   ├── media/
│   │   ├── picker.ts                # 选图/拍照
│   │   └── compressor.ts            # 压缩
│   │
│   └── reconcile/
│       └── reconcile-job.ts         # 启动自愈
│
├── ui/
│   ├── screens/
│   │   ├── capture-screen.tsx       # 主输入界面（核心）
│   │   ├── recent-screen.tsx        # 最近记录列表
│   │   └── detail-screen.tsx        # 单条详情 + 同步状态
│   │
│   ├── components/
│   │   ├── voice-button.tsx
│   │   ├── media-picker.tsx
│   │   ├── sync-indicator.tsx       # 单条状态
│   │   └── global-status-bar.tsx    # 顶部全局状态
│   │
│   └── hooks/
│       ├── use-captures.ts
│       ├── use-draft.ts
│       └── use-sync-status.ts
│
├── native/                          # Swift native module 的 JS 层 wrapper
│   └── icloud-bridge.ts             # copyToICloud / getUploadStatus / subscribe...
│
├── utils/
│   ├── id.ts                        # uuid 生成
│   ├── fs.ts                        # 文件操作封装（含 fsync）
│   ├── time.ts
│   └── logger.ts
│
└── types/
    ├── capture.ts                   # Capture 领域类型
    └── sync.ts
```

---

## 9. 外部依赖清单（尽量少）

| 依赖 | 用途 | 备注 |
|---|---|---|
| `expo` | SDK 50+ | 支持 app extension |
| `expo-sqlite` | Layer 2 索引 | 官方 API |
| `expo-file-system` | 文件操作 | 官方 API |
| `expo-av` / `expo-audio` | 录音 | 下一代选 `expo-audio` |
| `expo-image-picker` | 选图 | 官方 |
| `expo-camera` | 拍照 | 官方 |
| `expo-image-manipulator` | 图片压缩 | 官方 |
| `expo-speech-recognition` | 实时语音转写 | 或自写 SFSpeechRecognizer module |
| `expo-clipboard` | 粘贴板识别 | 官方 |
| `expo-haptics` | 触觉反馈 | 官方 |
| `expo-task-manager` + `expo-background-fetch` | 后台同步机会 | 官方 |
| `@react-native-community/netinfo` | 网络感知 | 标准库 |
| `zustand` | 状态管理 | 和桌面端一致 |
| `nanoid` | ID 生成 | 或用 `expo-crypto` |

**自写 native module**：iCloud Bridge（Swift，约 200 行）——没有现成库能替代。

---

## 10. 性能预算

| 指标 | 目标 | 备注 |
|---|---|---|
| 冷启动到可输入 | < 1000ms P95 | 核心 UX 指标 |
| 单次文本保存耗时 | < 50ms P95 | 原子写入协议全流程 |
| 单次带录音保存 | < 200ms P95 | 含附件复制 |
| 列表首屏渲染 | < 300ms | 100 条以内 |
| 同步单条耗时 | < 3s P95 | 不含网络传输 |
| 内存占用（前台） | < 80 MB | |

---

## 11. 与 Orbit 桌面端的接口契约

详见 [`ORBIT-INTEGRATION.md`](./ORBIT-INTEGRATION.md)。要点：

- iOS 写 `iCloud/inbox/<id>/` 目录
- Mac 新增 `src/main/capture/mobile_inbound/` 模块监听
- ingest 成功后 Mac 把 `inbox/<id>/` 移到 `processed/<id>/`
- 失败 Mac 写 `inbox/<id>/.failed.json` 带错误原因
- iOS 监听 `processed/` 和 `.failed.json` 更新状态

---

**本文描述的是"应该怎样"。实际实施进度看 [`STATUS.md`](./STATUS.md)。**
