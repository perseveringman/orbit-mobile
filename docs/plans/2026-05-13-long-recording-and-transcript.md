# 持续录音 + 实时/整体双线转写 + 多结构笔记

> **Status**: 本地实现已落地（录音 UI 不再使用静态 mock；云端 final/diarization provider 后续接入）
> **Date**: 2026-05-13
> **Author**: Codex（按用户口述需求草拟）
> **Companion docs**: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) · [`docs/DATA-MODEL.md`](../DATA-MODEL.md) · [`docs/UX-PRINCIPLES.md`](../UX-PRINCIPLES.md) · [`docs/VISION.md`](../VISION.md)

---

## 0. 一句话目标

让 Orbit Mobile 在保留 "1 秒记一条" 的 Capture 基底之上，新增**长会议/讲座/课堂**场景：长按或一键开始**持续录音**，过程中实时出现转写并能区分说话人（180+ 语言）；录完后获得一篇可边听边看的"会议纪要"，并能围绕它生成**总结/决策/风险/待办/自定义模板**等多种结构化笔记。

> 仍然遵守 [VISION § 不做什么](../VISION.md#不做什么) — 手机不做编辑器、不做服务端、不做账号；所有数据先落本地、再走 iCloud 回 Mac。

---

## 1. 用户故事

| # | 场景 | 期待 |
|---|---|---|
| U1 | 30 分钟产品评审会 | 一键开始 → 实时看到转写文字 → 中途锁屏不丢 → 散会 → 1 分钟内拿到带说话人、带大纲的整篇纪要 |
| U2 | 路上听播客边走边录灵感 | 后台持续录音 + 实时转写 → 解锁后能继续看 / 编辑 |
| U3 | 国际会议（中英日混说） | 自动检测语言，180+ 语言可选；最终整体转写比实时更准确 |
| U4 | 课堂笔记 | 录完后让 AI 生成"决策""待办""风险""自定义模板"，跳到原音任意位置可校对 |
| U5 | 复盘 | 历史录音按时间线浏览，进入后能边听边看、双击文字跳转、对每个段落点赞/反馈 |

---

## 2. 设计原则（在底线之上）

1. **Capture 优先：录音永远先到本地完整 `.m4a`**（[ARCHITECTURE §5 五阶段原子写入](../ARCHITECTURE.md#5-原子写入协议)）。即使转写全挂、网络全断，原始音频与时间戳都不能少。
2. **双线转写互不阻塞**：实时（partial）只追求"看到东西在动"；整体（final）追求准确度与说话人区分。**实时挂掉不影响整体；整体挂掉不影响实时**。
3. **180+ 语言支持靠云端整体转写完成**——本地 `SFSpeechRecognizer` 仅作为"实时回声"，不在它身上堆质量。
4. **说话人分离 (diarization) 只在整体转写阶段做**，避免实时阶段抖动。
5. **生成式结构（总结 / 决策 / 风险 / 待办 / 自定义模板）= 派生物**，永远可重生成，原始音频和原始转写是单一真相源。
6. **本地优先延伸到 AI**：派生物先写到 Layer 2（`derivatives/<kind>.json`），再随 manifest 同步给 Mac。Mac 端可重新生成同名派生物覆盖（带 `regenerated_at`）。
7. **不引入服务端**：转写/总结全部由"用户自己持有 key 的云端供应商"完成，调用通过设备直连（详见 §6.3）。Box 自己不存任何用户数据。

---

## 3. 信息架构（增量）

```
现有：
  Capture (短) — text / voice / photo / share / mixed

新增：
  Recording (长) — kind = 'recording'
    └─ attachments[]
       ├─ audio.m4a                    # 原音
       ├─ partial-transcript.ndjson    # 实时流（用于回放体验）
       └─ final-transcript.json        # 整体转写（说话人 + 时间戳）
    └─ derivatives/                    # AI 生成物（可多次重生）
       ├─ outline.json                 # 大纲（带时间戳）
       ├─ summary.md
       ├─ decisions.json
       ├─ risks.json
       ├─ todos.json
       └─ custom/<template_id>.json
```

`kind = 'recording'` 是 `voice` 的"长形态"。短录音保持原 `voice`（不必上整体转写）。判定阈值：**> 60s 的录音自动升级为 recording 形态**。

---

## 4. UI 流（与设计图对齐）

### 4.1 入口
- 主 Capture 页右下角"完成"左侧新增长按图标 ⏺。
- 单击 = 进入 **Recording Composer**（专用全屏录音页）。
- 长按 1s = 直接开录（保持 Capture 速度信仰）。

### 4.2 Recording Composer（录制中）
```
┌──────────────────────────────────────────┐
│  ✕  来源  转写  标记                       │
│  ───────────────                         │
│  会议主标题（可后改）                       │
│  ──── 波形 + 时长 22:14 ────              │
│  [⏸] [-15] [+15] [1×] [✏︎]                 │
│  [大纲（实时占位）]                         │
│  [转写（partial 流式追加，自动滚屏）]        │
└──────────────────────────────────────────┘
```
- 左上 ✕ = 暂存并退出（继续后台录）；右上"完成"= 停止并触发整体转写。
- 顶部三 Tab 与设计图 1 完全对齐：**来源 / 转写 / 标记**。
- 后台运行：iOS Background Audio capability + audio session category `.playAndRecord` + lockscreen now-playing 控件。

### 4.3 录音详情页（已停止后）= **设计图 1**
- 同样三 Tab，区别是数据已 final：
  - **来源**：原音播放器 + 波形（可点击跳转）。
  - **转写**：按说话人分块，每块带 `mm:ss` 锚点，点击跳到音频；右侧 👍/👎 反馈用于以后微调；"编辑"按钮支持手动修正个别段落。
  - **标记**：用户高亮、AI 高亮、书签。

### 4.4 笔记页 = **设计图 2/3**
顶 Tab：**总结 · 决策 · 风险 · 待办事项 · +**（自定义模板）。
- 设计图 2 = 总结（概述 / 目标）。
- 设计图 3 = 决策（决策 1/2/3 卡片）。
- 风险、待办同结构；待办可勾选并写回 manifest 派生物，Mac 端读取后流入 Inbox。

### 4.5 自定义模板 = **设计图 4**
- 用户点 "+" 进入"新笔记"模板选择 sheet。
- 内置模板：演讲表达力、推理总结、行动清单……（mock 即可）。
- 选模板 → "立即生成" → 填进当前录音的派生物（mock：直接给一段静态结果）。

### 4.6 Ask 页 = **设计图 5**
- 录音详情顶部右侧"…"菜单 → "向 Orbit 提问"。
- 是一个针对当前录音上下文的 mini chat，预置三个建议问题（可点）。
- 三个底部按钮：**获取洞察 / 生成待办 / 写邮件**——映射到不同模板生成动作。
- 不联网时按钮 disable，给"打开后会请求 Mac 端处理"提示（保持 LOCAL-FIRST）。

---

## 5. 数据模型扩展

### 5.1 SQLite — 新表 `recordings`
```sql
CREATE TABLE recordings (
  id                   TEXT PRIMARY KEY,         -- 与 captures.id 一致 (mob_cap_*)
  duration_ms          INTEGER NOT NULL,
  channels             INTEGER DEFAULT 1,
  sample_rate          INTEGER DEFAULT 48000,
  language_hints       TEXT,                     -- JSON array, 如 ["zh-CN","en-US"]
  speaker_count        INTEGER,                  -- final transcript 完成后写入
  partial_state        TEXT NOT NULL DEFAULT 'idle',
    -- idle | live | finished | failed
  final_state          TEXT NOT NULL DEFAULT 'pending',
    -- pending | running | done | failed | offline_queued
  final_provider       TEXT,                     -- 'apple-on-device' | 'whisper-1' | 'gemini-1.5' ...
  final_attempts       INTEGER DEFAULT 0,
  final_last_error     TEXT,
  final_done_at        TEXT,
  created_at           TEXT NOT NULL,
  FOREIGN KEY (id) REFERENCES captures(id) ON DELETE CASCADE
);

CREATE INDEX idx_recordings_final_state ON recordings(final_state);
```

### 5.2 manifest.json 增量
```json
{
  "kind": "recording",
  "attachments": [
    {"type":"audio","filename":"audio.m4a", "...": "..."},
    {"type":"transcript","filename":"final-transcript.json","schema":"orbit.transcript@1"},
    {"type":"transcript-partial","filename":"partial-transcript.ndjson","schema":"orbit.transcript-partial@1"}
  ],
  "recording": {
    "duration_ms": 1320000,
    "language_hints": ["zh-CN","en-US"],
    "speakers": [
      {"id":"S1","label":"Carlin","color":"#2563eb"},
      {"id":"S2","label":"Peter","color":"#16a34a"}
    ],
    "partial_provider": "apple-on-device",
    "final_provider": "user.openai.whisper-1",
    "diarization_provider": "user.pyannote.community-1"
  },
  "derivatives": [
    {"kind":"outline","filename":"derivatives/outline.json"},
    {"kind":"summary","filename":"derivatives/summary.md"},
    {"kind":"decisions","filename":"derivatives/decisions.json"},
    {"kind":"risks","filename":"derivatives/risks.json"},
    {"kind":"todos","filename":"derivatives/todos.json"},
    {"kind":"custom","template_id":"reasoning-summary","filename":"derivatives/custom/reasoning-summary.json"}
  ]
}
```

### 5.3 final-transcript.json 结构
```json
{
  "schema": "orbit.transcript@1",
  "language_detected": ["zh-CN","en-US"],
  "speakers": [{"id":"S1","label":"Carlin"}, {"id":"S2","label":"Peter"}],
  "segments": [
    {
      "id": 0,
      "speaker": "S1",
      "start_ms": 0,
      "end_ms": 7200,
      "text": "欢迎各位，今天的 30 分钟同步会议……",
      "confidence": 0.92,
      "words": [
        {"text":"欢迎","start_ms":0,"end_ms":600,"confidence":0.99}
      ]
    }
  ]
}
```
- `segments` 至少要有 `speaker / start_ms / end_ms / text`，其他都可选。
- `partial-transcript.ndjson` 每行一条 `{ts, text, isFinal}`；只用于"实时回放体验"，**不参与最终入库**。

### 5.4 派生物结构（mock-friendly）
- `summary.md`：纯 markdown。
- `decisions.json` / `risks.json` / `todos.json`：
```json
{
  "schema": "orbit.derivative@1",
  "kind": "decisions",
  "generated_at": "2026-05-13T10:01:22Z",
  "provider": "user.openai.gpt-4o",
  "items": [
    {
      "id": "d1",
      "title": "决策 1 — Q1 目标",
      "body": "新用户引导界面的版式重新设计……",
      "anchors": [{"start_ms": 264000, "end_ms": 320000}],
      "speakers": ["S1","S3"]
    }
  ]
}
```
- 每个 item 必须能"双向定位"——点条目跳到原音 (`anchors`)；选中音频段可看是否被某条收录。

---

## 6. 双线转写架构

```
            ┌──────────────────────────────────────────────┐
            │                  录音中                         │
            │  AVAudioEngine ──► AAC encoder ──► audio.m4a   │
            │       │                                        │
            │       ├──► ring buffer (60s) ──► 实时 ASR       │
            │       │     (Apple SFSpeechRecognizer，本机)   │
            │       │     ──► partial-transcript.ndjson     │
            │       │     ──► UI 实时显示                     │
            │       │                                        │
            │       └──► uploaded chunks (5s) ─► Final ASR ?  │
            │                                                │
            └──────────────────────────────────────────────┘
                            │ 录音停止
                            ▼
            ┌──────────────────────────────────────────────┐
            │  Final pipeline                              │
            │   1. 等 audio.m4a 完整落盘并校验 sha256        │
            │   2. 入队 final_state=pending                │
            │   3. FinalTranscriber：                       │
            │       - 选用户配置的 Whisper / Gemini / 等      │
            │       - 上传 m4a，要求 word-level + 多语言     │
            │   4. Diarizer：                               │
            │       - 调用支持说话人分离的 provider          │
            │       - 拿到 segments → 与 transcript 对齐    │
            │   5. 写 final-transcript.json (atomic)        │
            │   6. 触发 Derivatives Job → summary/decisions… │
            │   7. UI 收到事件 → 通知 + 列表更新              │
            └──────────────────────────────────────────────┘
```

### 6.1 实时层（partial）
- 复用现有 `modules/orbit-speech-recognition`（[`src/core/audio/transcription.ts`](../../src/core/audio/transcription.ts)），扩展：
  - `start({locale, mode: 'long'})`：长录音模式下，每 30 秒主动 reset request（绕开 Apple 的 1 分钟限制），把上一段固化进 ndjson。
  - 新增 `addPartialSegmentListener` 事件，区别于现有 `onTranscription`。
- 失败/不可用时 UI 直接降级为"录音中…（无实时转写）"，不能阻断录音。

### 6.2 整体层（final）
- 新增 `src/core/audio/final-transcriber.ts`：
  - 提供 `enqueue(captureId)` / `runOne()` / `subscribeStatus()`。
  - 内部调 `src/core/transcribe/providers/*.ts`（每个 provider 一个文件，统一接口）。
  - 重试退避复用 [`src/core/sync/backoff.ts`](../../src/core/sync/backoff.ts)。
- Provider 接口：
```ts
interface FinalTranscribeProvider {
  id: string;                          // 'whisper-1', 'gemini-1.5-flash'
  supportsDiarization: boolean;
  supportedLanguages: string[] | 'auto-180+';
  transcribe(input: { audioPath: string; languageHints?: string[] }): Promise<FinalTranscript>;
}
```
- 配置存在 `device_info` KV：
  - `final_transcribe.provider_id`
  - `final_transcribe.api_key_keychain_ref` (实际密钥进 iOS Keychain，不进 SQLite)
  - `final_transcribe.diarization_provider_id`
- 默认占位 provider：**`mock-final`** — 离线/未配置 key 时由本地"伪造"一份接近真实结构的 transcript，保证 UI 全链路可用（这也是当前 mock 阶段用的）。

### 6.3 不引入服务端的方式
- 用户在设置页粘贴 OpenAI / Anthropic / 自托管 endpoint 的 key。
- 调用走设备直连（`fetch` + multipart）。
- Mac 端配置同样 key 时可"代办整体转写"（远期）。
- 我们的代码库永远不持有用户数据。

### 6.4 后台与功耗
- iOS `UIBackgroundModes: ["audio"]`（已在 Capture 短录音预留）。
- 后台仅录音 + partial。Final 在前台或下次启动时跑，避免后台流量爆。
- 下次进 app 自动检查 `final_state='pending'` 队列。

### 6.5 失败模型
| 场景 | 行为 |
|---|---|
| Apple ASR 不可用 | UI 标灰"实时转写不可用"，录音继续 |
| Final provider 401 | `final_state='failed'`，详情页红条 + 设置页跳转 |
| Final provider 网络抖动 | 走 backoff，状态保持 `running`；UI 显示"还在转写…" |
| Diarization 失败 | 单独标记 `diarization=failed`，转写仍可用，speakers 退化为单一 `S?` |
| 派生物生成失败 | 仅该派生物 disabled，其他不影响；可手动重试 |

---

## 7. 派生物（Notes）系统

### 7.1 内置 kinds（设计图 2/3 对齐）
- `summary` — 概述 + 目标
- `decisions` — 决策列表
- `risks` — 风险列表
- `todos` — 待办（带勾选状态，回写 manifest）
- `outline` — 大纲（设计图 1 中部）

### 7.2 自定义模板（设计图 4）
- Template = `{ id, name, author, description, prompt, output_schema }`
- mock 阶段：内置 5 个常用模板（推理总结 / 表达力提升 / 行动清单 / SWOT / 1-3-1 决策框架）。
- 后续：支持从 Mac 端 vault 拉模板（用户自定义）。

### 7.3 Ask（设计图 5）
- 不是模板生成器，是一个"针对此录音"的 contextual chat。
- mock 实现：固定三个建议问 + 三个动作按钮（获取洞察 / 生成待办 / 写邮件）。
- 真实实现：把 transcript + 现有派生物作为上下文，调 LLM；不存对话历史在云上，只在本地。

---

## 8. 列表与时间轴

录音详情入口列表（与 Capture "最近"区分）= 一条时间轴：

```
2026-05-13
  10:30  产品交付决策     32:14  3 人  ✓ 已转写  ✏ 6 决策
  09:00  产品评审         18:42  2 人  ⏳ 转写中
2026-05-12
  14:00  AI 路线图         44:11  4 人  ✓
  ...
```
- 按"日期"分组。
- 状态徽章：`pending` / `live`（红点）/ `transcribing` / `done` / `failed`。
- 点进去 = 录音详情页（§4.3）。
- 实现上是 `recent-screen` 的孪生兄弟 `recordings-screen`，复用大半样式。

---

## 9. 与现有架构的兼容点

| 现有 | 增量 |
|---|---|
| 五阶段原子写入 ([ARCHITECTURE §5](../ARCHITECTURE.md#5-原子写入协议)) | 录音停止时整段走一次原子写入；派生物每次生成走"派生写入子事务" |
| `captures` 表 | 不动，新增 `recordings` 一表 1:1 关联 |
| iCloud transport | manifest 内附件多了 transcript / derivatives，自动随 inbox 上传 |
| Mac `mobile_inbound` | 仅需识别新 `kind=recording` + 新 attachment type，老逻辑不破坏 |
| `voice-button.tsx` 短录音 | 保留；新增 `record-button.tsx` 长录音入口（mock UI 已实现） |
| `expo-av` Audio | 短录音继续用；长录音走 `expo-av` + 自定义 audio session（保持后台） |

---

## 10. 路线图（落地拆分）

| 里程碑 | 范围 |
|---|---|
| **M9.0** | 路由 + Recording Composer + 详情页 + 笔记多 Tab + Ask + 列表 |
| **M9.1** | `recordings` 表 + manifest schema + `partial-transcript.ndjson` / `final-transcript.json` 真实写入（已完成） |
| M9.2 | Long-mode partial ASR（解决 Apple 1 分钟 reset） |
| M9.3 | Final transcribe provider 接口 + Whisper/Gemini 二选一接入 |
| M9.4 | Diarization 接入（pyannote 远端 / Apple 18+ on-device） |
| M9.5 | 派生物生成（summary/decisions/risks/todos） |
| M9.6 | 自定义模板加载 + Ask Plaud-style chat |
| M9.7 | Mac 端 mobile_inbound 适配 |

每一步都可独立 ship，UI 不必等 backend。

---

## 11. 风险登记

| 风险 | 缓解 |
|---|---|
| Apple ASR 1 分钟限制 | partial 30s reset + 跨段拼接；最坏只丢"实时观感"，final 不受影响 |
| 后台录音被系统杀 | category `.playAndRecord` + Now Playing + audio capability；崩溃后启动扫描 `recordings.partial_state='live'` 的孤儿，自动停止并标记 |
| 上传大文件耗流量 | UI 显示大小，默认 Wi-Fi only；用户可强制蜂窝 |
| 用户隐私 | API key 走 iOS Keychain；transcript / 派生物先本地，再可选同步；可整条删除并联动 iCloud `processed/` |
| LLM 输出不稳定 | 派生物全部带 `regenerate` 按钮 + `provider/version` 字段，可换模型重生 |
| 多语言准确度 | UI 显示 `language_hints`，允许用户在录前/录后手选；final provider 失败时降级到 Apple ASR 文字 |

---

## 12. 待决问题

- [ ] iOS 18 起 Apple 自家 on-device Whisper 是否够用？需要真机评估准确度（中文 / 多语 / 说话人）。
- [ ] 派生物的"再生成"是否覆盖旧版本？建议保留 `derivatives/<kind>.<ts>.json` 历史，UI 默认看最新。
- [ ] Mac 端是否要把 transcript 拆成多条 Thought 还是单条 Thought + 链接？建议单条 + 内嵌附件。
- [ ] 待办勾选回写到哪？建议 manifest derivative 内 + Mac 端 `task` 模块。

---

**任何方向性改动请先更新本文，再动代码。本文件是录音特性的"宪法"。**
