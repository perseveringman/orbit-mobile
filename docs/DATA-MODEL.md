# Orbit Mobile — Data Model

> **Status**: 设计阶段，实施以此文为准  
> **Related**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`SYNC-PROTOCOL.md`](./SYNC-PROTOCOL.md)

---

## 1. SQLite Schema

数据库文件：`<app sandbox>/Documents/orbit.db`

### 1.1 captures 表

每条 capture 的**元数据 + 同步状态**。真实的 manifest 和附件在文件系统。

```sql
CREATE TABLE captures (
  -- 主键
  id                   TEXT PRIMARY KEY,     -- "mob_cap_<uuid>"
  
  -- 时间
  created_at           TEXT NOT NULL,        -- ISO8601 UTC，写入本地的时间
  captured_at_local    TEXT NOT NULL,        -- 带时区的本地时间，展示用
  
  -- 内容
  kind                 TEXT NOT NULL,        -- 'thought' | 'voice' | 'photo' | 'share' | 'mixed' | 'recording'
  content_preview      TEXT,                 -- 前 200 字，列表展示用
  content_hash         TEXT NOT NULL,        -- manifest.json 的 sha256
  byte_size            INTEGER NOT NULL,     -- 整个 capture 目录总大小
  
  -- 附件标记
  has_audio            INTEGER DEFAULT 0,
  has_image            INTEGER DEFAULT 0,
  attachment_count     INTEGER DEFAULT 0,
  
  -- 同步状态机
  sync_state           TEXT NOT NULL DEFAULT 'pending',
    -- pending    : 本地已写完，未尝试同步
    -- syncing    : 正在复制到 iCloud
    -- uploaded   : iCloud 显示已上传
    -- acked      : Mac 已 ingest（processed/ 里见到）
    -- failed     : 尝试失败，等退避重试
    -- conflicted : 异常（极少，通常是 sha256 不匹配）
  sync_attempts        INTEGER DEFAULT 0,
  sync_last_error      TEXT,                 -- 最近一次失败的错误消息
  sync_last_try_at     TEXT,                 -- 最近一次尝试时间
  sync_next_retry_at   TEXT,                 -- 下次重试最早时间（退避计算后写入）
  uploaded_at          TEXT,                 -- sync_state 变 uploaded 的时间
  acked_at             TEXT,                 -- Mac ingest 确认时间
  ack_vault_path       TEXT,                 -- Mac 端 ingest 写到了哪（ACK v2 note_path；legacy 回退路径）
  
  -- 本地管理
  local_path           TEXT NOT NULL,        -- captures/<id>/ 的绝对路径
  deleted_locally      INTEGER DEFAULT 0,    -- 软删除
  
  -- 扩展
  metadata_json        TEXT,                 -- 额外字段 JSON
  schema_version       INTEGER NOT NULL DEFAULT 1
);

-- 索引
CREATE INDEX idx_captures_sync_state  ON captures(sync_state, sync_next_retry_at);
CREATE INDEX idx_captures_created     ON captures(created_at DESC);
CREATE INDEX idx_captures_kind        ON captures(kind);
```

**关键字段解释**：

- `id` 格式 `mob_cap_<uuid>`：`mob_cap_` 前缀让 Mac 端能一眼认出是手机来的
- `content_hash`：manifest.json 的 sha256。Mac 端 ingest 时会重算一次校验
- `sync_state` 是 enum 但用 TEXT 存，因为后续可能扩展
- `sync_next_retry_at`：预先算好的最早重试时间，worker 可以直接 `WHERE sync_next_retry_at <= now()`
- `metadata_json`：任何 schema 里没定义但未来会用到的字段都塞这里，避免频繁 migration

### 1.2 sync_events 表

同步历史的审计日志。对调试和"详情页可见同步历史"非常重要。

```sql
CREATE TABLE sync_events (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id           TEXT NOT NULL,
  event                TEXT NOT NULL,
    -- created    : 本地原子写入完成
    -- enqueued   : 入 SyncWorker 队列
    -- started    : 开始上传
    -- uploaded   : 复制到 iCloud 完成
    -- ack        : 收到 Mac ACK
    -- failed     : 某次尝试失败
    -- retried    : 重试
    -- manual_retry : 用户手动重试
    -- reset      : 启动扫描时 reset syncing → pending
  timestamp            TEXT NOT NULL,        -- ISO8601 UTC
  details_json         TEXT,                 -- 错误消息、网络状态等
  FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_events_capture ON sync_events(capture_id, timestamp DESC);
CREATE INDEX idx_sync_events_time    ON sync_events(timestamp DESC);
```

**保留策略**：`sync_events` 可能膨胀，定期清理：
- 保留最近 30 天
- 或单条 capture 保留最近 100 条

### 1.3 drafts 表

**输入过程中**的未完成草稿。允许用户切出去查资料/被打断后回来继续。

```sql
CREATE TABLE drafts (
  session_id           TEXT PRIMARY KEY,     -- uuid
  content              TEXT NOT NULL DEFAULT '',
  tags_json            TEXT,                 -- JSON array
  attachments_json     TEXT,                 -- JSON array，草稿期间的附件 tmp 路径
  kind_hint            TEXT,                 -- 预期 kind（主要看用户录没录音/选没选图）
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX idx_drafts_updated ON drafts(updated_at DESC);
```

**注意**：
- 草稿**不走原子写入协议**——频率太高成本不划算
- 但草稿的附件**立即落盘**到 `drafts/attachments/<session_id>/`，保证录音中崩溃不丢
- 提交时附件从 drafts 目录移到正式 `captures/<id>/`，再走原子写入

### 1.4 device_info 表

设备级的元信息。KV 表。

```sql
CREATE TABLE device_info (
  key                  TEXT PRIMARY KEY,
  value                TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
```

**已知 keys**：
- `device_id` — 首次启动生成的 uuid，此后不变
- `schema_version` — 当前 DB schema 版本
- `last_reconcile_at` — 最近一次启动扫描时间
- `last_healthcheck_at` — 最近一次 iCloud 健康检查
- `icloud_container_status` — 缓存的 `available | not-signed-in | disabled | restricted`
- `user_setting_keep_audio_original` — 用户是否保留原录音（默认 1）
- `user_setting_image_compression` — `always | wifi_only | never`
- `user_setting_gc_days` — acked 后多久本地清理，默认 30

### 1.5 recordings 表

长录音是 `captures.kind = 'recording'` 的扩展形态；用户数据仍以 capture 目录为真相源，`recordings` 只保存查询和 UI 所需元数据。

```sql
CREATE TABLE recordings (
  id                   TEXT PRIMARY KEY,     -- 与 captures.id 一致
  title                TEXT NOT NULL,
  duration_ms          INTEGER NOT NULL,
  channels             INTEGER DEFAULT 1,
  sample_rate          INTEGER DEFAULT 48000,
  language_hints       TEXT,                 -- JSON array
  speaker_count        INTEGER,
  partial_state        TEXT NOT NULL DEFAULT 'idle',
  final_state          TEXT NOT NULL DEFAULT 'pending',
  partial_provider     TEXT NOT NULL DEFAULT 'unavailable',
  final_provider       TEXT,
  final_attempts       INTEGER DEFAULT 0,
  final_last_error     TEXT,
  final_done_at        TEXT,
  created_at           TEXT NOT NULL,
  FOREIGN KEY (id) REFERENCES captures(id) ON DELETE CASCADE
);
```

当前本地实现写入：
- `partial_provider = 'ios-speech' | 'unavailable'`
- `final_provider = 'local-live-transcript'`
- 派生物 provider 为 `local-heuristic`

---

## 2. manifest.json Schema

写到 `captures/<id>/manifest.json`。这是**Mac 端消费的正式契约**。

```json
{
  "schema_version": 1,
  "id": "mob_cap_a7f3b2c1-9d2e-4a55-b6e0-f1c3a8d9e0b7",
  "source": "orbit-mobile-ios",
  "source_version": "0.1.0",
  "device_id": "a3b8c9d0-e1f2-3456-7890-abcdef123456",
  "created_at": "2026-05-06T10:30:00.123Z",
  "captured_at_local": "2026-05-06T18:30:00.123+08:00",
  
  "kind": "thought",
  
  "content": "今天在地铁上想到一个关于 capture 的想法……",
  
  "tags": ["idea", "product"],
  
  "attachments": [
    {
      "type": "audio",
      "filename": "audio.m4a",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "byte_size": 184320,
      "duration_ms": 34200,
      "mime": "audio/mp4",
      "transcription": "今天在地铁上想到一个关于 capture 的想法……",
      "transcription_source": "ios-speech",
      "transcription_confidence": 0.92,
      "recorded_at": "2026-05-06T10:29:45.000Z"
    },
    {
      "type": "image",
      "filename": "photo-1.jpg",
      "sha256": "...",
      "byte_size": 524288,
      "mime": "image/jpeg",
      "width": 3024,
      "height": 4032,
      "captured_at": "2026-05-06T10:29:30.000Z",
      "original_exif": {
        "camera": "iPhone 15 Pro",
        "lat": 22.54,
        "lon": 114.05
      }
    }
  ],
  
  "context": {
    "clipboard_hint": null,
    "share_context": null,
    "location": null,
    "network": "wifi",
    "battery": 0.86
  },
  
  "local_timestamps": {
    "input_started_at": "2026-05-06T10:29:30.000Z",
    "input_finished_at": "2026-05-06T10:30:00.000Z",
    "total_input_duration_ms": 30000
  }
}
```

### 字段说明

| 字段 | 必填 | 含义 |
|---|---|---|
| `schema_version` | ✅ | 当前 `1`。新增不兼容字段要升版本 |
| `id` | ✅ | 和 SQLite `id` 一致 |
| `source` | ✅ | 固定 `"orbit-mobile-ios"`（iPad 可能是 `-ipados`） |
| `source_version` | ✅ | app 版本号 |
| `device_id` | ✅ | 同一 Apple ID 多设备时可区分 |
| `created_at` | ✅ | UTC ISO8601 |
| `captured_at_local` | ✅ | 带时区的本地时间，Mac 展示用 |
| `kind` | ✅ | 主类型 |
| `content` | ✅ | 文本内容。可为空（纯录音/纯图片）但字段必须存在 |
| `tags` | - | 默认 `[]` |
| `attachments` | - | 默认 `[]` |
| `context` | - | 弱上下文（可选） |
| `local_timestamps` | - | 用户行为分析用，可选 |

### `context.share_context`

从 Share Extension、剪贴板或手动 URL 捕获进入的外部内容，可以在 `context.share_context` 写入平台上下文。手机端只负责识别来源和保留原始材料，不在保存路径上做网络解析；Mac 端按该上下文异步解析。

```json
{
  "capture_method": "share_extension",
  "source_platform": "wechat_article",
  "parser_hint": "wechat_article",
  "source_url": "https://mp.weixin.qq.com/s/abc123",
  "canonical_url": "https://mp.weixin.qq.com/s/abc123",
  "raw_share_text": "用户分享时系统给到的原始文本",
  "source_title": "分享标题（如果 iOS LinkPresentation 可取到）",
  "origin_app": null,
  "enrichment_state": "pending"
}
```

`source_platform` 目前取值：

| 值 | 含义 | Mac 端预期解析 |
|---|---|---|
| `wechat_article` | 微信公众号文章，通常为 `mp.weixin.qq.com` | 提取公众号文章正文 |
| `xiaohongshu` | 小红书笔记或短链 | 尝试提取页面 metadata/正文；失败时保留 URL、分享文本、截图/图片 |
| `x` | X/Twitter post | 通过公开 oEmbed/页面信息提取 post 文本 |
| `web` | 普通网页 | 通用网页 metadata/readability |
| `unknown` | 未识别来源 | 不解析，仅保留原始 capture |

### kind 取值

| kind | 含义 |
|---|---|
| `thought` | 纯文本灵感 |
| `voice` | 主体是语音（转写后的文字 + 原始录音） |
| `photo` | 主体是图片（有/无备注） |
| `share` | 来自 Share Extension |
| `mixed` | 混合（文字 + 多附件） |
| `recording` | 长录音（原音 + partial/final transcript + 派生笔记） |

### 长录音增量字段

`recording` capture 的 manifest 会附加：

```json
{
  "kind": "recording",
  "attachments": [
    {"type": "audio", "filename": "audio.m4a"},
    {"type": "derivative", "filename": "waveform.json", "schema": "orbit.waveform@1", "derivative_kind": "waveform"},
    {"type": "transcript-partial", "filename": "partial-transcript.ndjson", "schema": "orbit.transcript-partial@1"},
    {"type": "transcript", "filename": "final-transcript.json", "schema": "orbit.transcript@1"},
    {"type": "derivative", "filename": "summary.json", "derivative_kind": "summary"}
  ],
  "recording": {
    "duration_ms": 65000,
    "language_hints": ["zh-CN"],
    "speakers": [{"id": "S1", "label": "说话人", "color": "#2563eb"}],
    "partial_provider": "ios-speech",
    "final_provider": "local-live-transcript",
    "diarization_provider": null
  },
  "derivatives": [
    {"kind": "outline", "filename": "outline.json"},
    {"kind": "summary", "filename": "summary.json"},
    {"kind": "decisions", "filename": "decisions.json"},
    {"kind": "risks", "filename": "risks.json"},
    {"kind": "todos", "filename": "todos.json"}
  ]
}
```

`waveform.json` 保存录音时从同一麦克风 buffer 抽取的 RMS/peak 包络采样（0..1），用于列表、录音中和详情页的真实波形显示。所有这些文件与 `audio.m4a` 一起走同一条五阶段原子写入协议，然后由现有 iCloud worker 同步。

### 校验和文件

`manifest.json.sha256` 是 `manifest.json` 的 sha256 十六进制字符串（单行，无换行）。

Mac 端 ingest 时：
1. 读 manifest.json.sha256
2. 读 manifest.json 计算 sha256
3. 比对
4. 不一致 → 拒绝 ingest，写 `.failed.json`，iOS 收到后重传

---

## 3. 附件命名规范

在 `captures/<id>/` 目录里：

| 类型 | 命名 |
|---|---|
| 单条录音 | `audio.m4a` |
| 多条录音（极少用） | `audio-1.m4a`, `audio-2.m4a` |
| 图片 | `photo-1.jpg`, `photo-2.jpg`, ... |
| 视频（V2） | `video-1.mp4` |
| 原始剪贴板 HTML | `clipboard.html` |
| Share 原始 payload | `share-payload.json` |

**不允许**：
- 中文文件名
- 空格
- 特殊字符

**MIME / 格式**：
- 音频：m4a（AAC）默认，更通用
- 图片：jpg 压缩后默认，png 仅用户明确要求时

---

## 4. 状态机图（sync_state）

```
                    ┌──────────┐
    (原子写入完成)   │ pending  │
    ─────────────▶  │          │
                    └────┬─────┘
                         │ SyncWorker 拾取
                         ▼
                    ┌──────────┐
                    │ syncing  │
                    └────┬─────┘
                         │
             ┌───────────┴────────────┐
             │ 复制到 iCloud 成功       │ 失败
             ▼                        ▼
        ┌──────────┐             ┌──────────┐
        │ uploaded │             │  failed  │
        └────┬─────┘             └────┬─────┘
             │                        │ 退避时间到
             │ Mac ACK                 │
             ▼                        ▼
        ┌──────────┐             ┌──────────┐
        │  acked   │             │ pending  │ ← 再试
        └──────────┘             └──────────┘

 终态：acked
 异常：
   - syncing 状态卡住 >10min → 启动扫描时 reset 为 pending
   - uploaded 但 Mac 返回 failed → state 变 conflicted，写 sync_last_error
   - 连续失败 > 20 次 → 暂停重试，UI 高亮提示用户介入
```

---

## 5. 索引与 GC 策略

### 5.1 captures 表索引使用

| 查询场景 | 使用索引 |
|---|---|
| 最近记录列表 | `idx_captures_created` |
| SyncWorker 找待同步 | `idx_captures_sync_state` |
| 筛选类型 | `idx_captures_kind` |

### 5.2 GC 策略

**acked 的 capture 本地保留多久？** 由用户设置 `user_setting_gc_days` 控制（默认 30 天）。

GC 任务（每次启动或每天一次）：
```sql
-- 候选清理
SELECT id, local_path FROM captures
WHERE sync_state = 'acked'
  AND acked_at < datetime('now', '-30 days');

-- 对每条：
-- 1. rm -rf local_path
-- 2. 不删 SQLite 记录（保留元数据供"列表还能看到"）
-- 3. UPDATE captures SET deleted_locally = 1
```

**不 GC 的场景**：
- 用户设置 `gc_days = 0` → 永不 GC
- 用户在详情页手动标记"收藏" → 永不 GC（V2）

**sync_events 表 GC**：保留 30 天内的 + 每个 capture 最近 20 条。

**dead-letter 目录**：永不自动清理，需要人工处理。

---

## 6. 迁移策略（schema_version）

**iOS 端 SQLite migration**：

```
src/core/storage/migrations/
├── 001_initial.ts
├── 002_add_xxx.ts
└── ...
```

每次启动：
1. 读 `device_info.schema_version`（默认 0）
2. 从当前版本顺序应用到最新
3. 每个 migration 在事务里执行
4. 成功后 `UPDATE device_info SET value = <new_version>`

**manifest.json schema migration**：

- 向后兼容——Mac 端解析 manifest 时，新字段用 `optional`，老字段全都保留
- 不兼容变更 → 升 `schema_version` 字段 + Mac 端加版本判断

---

## 7. 大小预算

- 单条 capture manifest: < 5 KB
- 单条录音 (1 min @ AAC 64kbps): ~500 KB
- 单张压缩图片: ~300 KB
- 单条平均: ~1 MB
- iCloud 免费 5GB → 约 5000 条，够大多数用户用

**若用户大量使用录音/图片**：
- 设置引导用户开启 GC（30 天清理 acked）
- UI 显示 iCloud 剩余空间
- 超 4 GB 时提示"考虑清理或升级 iCloud"

---

## 8. 为什么这样设计

### 为什么 SQLite + 文件系统混合而不是纯 SQLite？

- 大附件（录音/图片）放 SQLite 会让 db 膨胀，性能崩坏
- 文件系统是 iCloud Drive 的直接单位（iCloud 同步的就是文件）
- 元数据用 SQLite 的索引/事务能力是最省心的

### 为什么 manifest 和 sha256 分开两个文件？

- Mac 端可以先校验 sha256（小文件，极快），再决定是否解析 manifest
- manifest 改一个字节 sha256 就变，天然检测传输损坏

### 为什么不用 nanoid 而用 uuid？

- 为了和 Orbit 桌面端的 id 生态对齐（`thought_<uuid>` 格式）
- uuid 信息量足够，冲突概率忽略不计
- 可选：用 `expo-crypto` 的 `randomUUID()`，零新依赖

### 为什么要保留 `deleted_locally` 软删除？

- 硬删除 + iCloud 同步冲突会难调试
- 软删除保留审计能力
- UI 层过滤即可

---

**任何修改 schema 的 PR 必须同步更新此文档。**
