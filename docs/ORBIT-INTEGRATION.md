# Orbit Mobile — Orbit Desktop Integration

> **Status**: 设计阶段  
> **Target**: Orbit 桌面端仓库 `/Users/ryanbzhou/Developer/vibe/new-orbit`  
> **Scope**: 指导 Mac 端新增 `mobile_inbound` 模块

---

## 1. 为什么需要 Mac 端改动

iOS 端的数据通过 iCloud Drive 到达 Mac，但 Mac 端 Orbit 还没有**监听这个目录 + 把数据送进 Thoughts** 的模块。

本文是**两个仓库间的正式接口契约**。iOS 端的 manifest 格式和 iCloud 目录结构必须稳定，Mac 端据此实现 ingest。

---

## 2. Mac 端新增模块位置

```
<orbit-repo>/src/main/capture/mobile_inbound/
├── index.ts           # 模块导出
├── watcher.ts         # chokidar 监听 iCloud 目录
├── ingest.ts          # 解析 manifest + 调 ThoughtService
├── attachments.ts     # 附件复制到 vault 内
├── config.ts          # iCloud container 路径探测
├── ack.ts             # 写 .acked / .failed.json
└── types.ts           # 共享类型
```

与 Orbit 现有架构的对齐：
- 和 `src/main/capture/{feed,library,thoughts}` 并列
- 通过 `createThoughtService()` 复用 Thoughts 写入逻辑
- 通过 `emitActivity()` 记录 Activity Log
- 在 `src/main/index.ts` 打开 vault 时注册 watcher

---

## 3. 接口契约（iOS 写入 Mac 读取）

### 3.1 目录结构

```
~/Library/Mobile Documents/iCloud~com.orbit.capture/Documents/
├── inbox/<id>/
│   ├── manifest.json                    ← iOS 写入
│   ├── manifest.json.sha256             ← iOS 写入
│   ├── audio.m4a (可选)                 ← iOS 写入
│   ├── photo-N.jpg (可选)               ← iOS 写入
│   └── .complete (哨兵，由 iOS 最后写)
│
├── processed/<id>/                      ← Mac 从 inbox/ 移入
│   ├── manifest.json
│   ├── .acked (Mac 写入)
│   └── 附件...
│
└── failed/<id>/                         ← Mac 从 inbox/ 移入
    ├── manifest.json
    ├── .failed.json (Mac 写入)
    └── 附件...
```

### 3.2 manifest.json 契约

详见 [`DATA-MODEL.md`](./DATA-MODEL.md) §2。关键约束：

- Mac 端**必须**按 `schema_version` 字段判断兼容性
- Mac 端**必须**校验 `manifest.json.sha256`，不匹配拒绝 ingest
- Mac 端**必须**等 `.complete` 哨兵出现后才开始处理（否则可能是附件没到齐）
- 所有附件路径都是 `manifest` 同目录内的相对路径

### 3.3 Mac 端 ACK 格式

Mac ingest 成功，写 `processed/<id>/.acked`：

```json
{
  "schema_version": 1,
  "acked_at": "2026-05-06T10:32:15.123Z",
  "inbox_item_id": "thought_<uuid>",
  "vault_path": "/Users/ryanbzhou/.../MyVault",
  "vault_note_path": ".orbit/inbox/thought_<uuid>.json",
  "mac_identity": "MacBook-Pro-Ryan",
  "orbit_version": "1.0.0"
}
```

Mac ingest 失败，写 `failed/<id>/.failed.json`：

```json
{
  "schema_version": 1,
  "failed_at": "2026-05-06T10:32:15.123Z",
  "error_code": "sha256_mismatch | invalid_manifest | vault_unavailable | fs_error | unsupported_schema_version",
  "error_message": "Human readable message",
  "retryable": true,
  "orbit_version": "1.0.0"
}
```

`retryable` 语义：
- `true`：iOS 端可以重传（通常是传输损坏）
- `false`：iOS 端标 conflicted，等用户手动处理（通常是 schema 不兼容）

---

## 4. Mac 端实施建议

### 4.1 watcher.ts

```ts
import chokidar from 'chokidar';
import { getICloudInboxPath } from './config';
import { ingestCapture } from './ingest';

export async function startMobileInboundWatcher(vaultPath: string) {
  const inboxPath = await getICloudInboxPath();
  if (!inboxPath) {
    // iCloud 不可用 —— 不阻塞 Orbit 启动，只记日志
    console.warn('[mobile_inbound] iCloud container not found, skipping');
    return { stop: () => {} };
  }
  
  const watcher = chokidar.watch(`${inboxPath}/*/.complete`, {
    ignoreInitial: false,
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  });
  
  watcher.on('add', async (completeMarkerPath) => {
    const captureDir = path.dirname(completeMarkerPath);
    await ingestCapture(vaultPath, captureDir);
  });
  
  return {
    stop: () => watcher.close(),
  };
}
```

**启动时全量扫描**：chokidar `ignoreInitial: false` 会把已存在的 `.complete` 也触发一次，刚好处理"Mac 没运行期间积攒的"。

### 4.2 ingest.ts

```ts
export async function ingestCapture(vaultPath: string, captureDir: string) {
  const captureId = path.basename(captureDir);
  
  try {
    // 1. 读取 + 校验
    const manifest = await readManifest(captureDir);
    await verifySha256(captureDir);
    assertSchemaVersion(manifest.schema_version);
    
    // 2. 复制附件到 vault 内
    const attachmentPaths = await copyAttachments(
      vaultPath, 
      captureDir, 
      manifest
    );
    
    // 3. 构造 Thought content
    const content = buildThoughtContent(manifest, attachmentPaths);
    
    // 4. 调 ThoughtService
    const thoughtService = createThoughtService(vaultPath);
    const inboxItem = await thoughtService.create({
      content,
      tags: manifest.tags,
      createdFrom: 'quick_capture',
      actor: 'user',
      actorId: `ios:${manifest.device_id}`,
    });
    
    // 5. 移动到 processed/ + 写 .acked
    await moveToProcessed(captureDir, {
      inbox_item_id: inboxItem.id,
      vault_path: vaultPath,
      vault_note_path: resolveNotePath(inboxItem),
    });
    
    // 6. emitActivity
    emitActivity({
      actor: 'user',
      action: 'mobile_capture.ingested',
      context: { capture_id: captureId, inbox_item_id: inboxItem.id },
      payload: { source: manifest.source, device: manifest.device_id },
      summary: `Ingested mobile capture: ${manifest.content.slice(0, 60)}`,
    });
  } catch (err) {
    const errorCode = classifyError(err);
    const retryable = ['sha256_mismatch', 'fs_error'].includes(errorCode);
    await moveToFailed(captureDir, {
      error_code: errorCode,
      error_message: err.message,
      retryable,
    });
    // 也写 Activity Log 让用户在 Review 页面能看到
  }
}
```

### 4.3 attachments.ts

附件复制目标：`<vault>/.orbit/capture/attachments/<capture_id>/`

```
<vault>/.orbit/capture/attachments/
└── mob_cap_a7f3b2c1/
    ├── audio.m4a
    └── photo-1.jpg
```

Thought content 里引用：
```markdown
今天在地铁上想到一个关于 capture 的想法……

---

🎙 [语音原件](attachment://mob_cap_a7f3b2c1/audio.m4a) · 34s
> 转写：今天在地铁上想到一个关于 capture 的想法……

![](attachment://mob_cap_a7f3b2c1/photo-1.jpg)
```

Orbit 现有的 `attachment://` 协议重写器（若无则新增）处理资源路径。

### 4.4 config.ts

iCloud container 路径探测：

```ts
export async function getICloudInboxPath(): Promise<string | null> {
  const base = path.join(
    os.homedir(),
    'Library',
    'Mobile Documents',
    'iCloud~com.orbit.capture',
    'Documents',
    'inbox',
  );
  
  try {
    await fs.access(base);
    return base;
  } catch {
    // iCloud 不可用或用户没安装 iOS app
    return null;
  }
}
```

**Bundle ID 必须两边对齐**：
- iOS app 的 Bundle ID: `com.orbit.capture`（或你定的）
- iCloud Container ID: `iCloud.com.orbit.capture`
- Mac 端路径：`iCloud~com.orbit.capture`（波浪号替换了点）

**注意**：Bundle ID 一旦上线不能改。现在就要定下来。

### 4.5 ack.ts

```ts
export async function moveToProcessed(
  captureDir: string, 
  ackInfo: AckInfo
): Promise<void> {
  const id = path.basename(captureDir);
  const processedBase = path.join(
    path.dirname(path.dirname(captureDir)),  // 退到 Documents/
    'processed',
  );
  const targetDir = path.join(processedBase, id);
  
  await fs.mkdir(processedBase, { recursive: true });
  await fs.rename(captureDir, targetDir);  // 原子移动
  await fs.writeFile(
    path.join(targetDir, '.acked'),
    JSON.stringify(ackInfo, null, 2),
    'utf8',
  );
}
```

---

## 5. 在 Orbit 主流程接入

### 5.1 IPC 注册（选择性暴露）

在 `src/shared/ipc.ts` 新增：

```ts
export namespace IPC {
  export namespace mobileInbound {
    export const status = 'mobileInbound:status';    // 返回 { available, inbox_count, acked_today }
    export const list = 'mobileInbound:list';        // 列出最近处理的 captures
    export const retry = 'mobileInbound:retry';      // 强制重新扫描 failed/
  }
}
```

### 5.2 启动时注册

在 `src/main/index.ts` 打开 vault 的地方：

```ts
async function openVaultRuntime(vaultPath: string) {
  // ... 现有代码
  
  // 新增
  const mobileInbound = await startMobileInboundWatcher(vaultPath);
  vaultRuntimes.set(vaultPath, {
    ...existing,
    mobileInbound,
  });
}

async function closeVaultRuntime(vaultPath: string) {
  const runtime = vaultRuntimes.get(vaultPath);
  runtime?.mobileInbound?.stop();
  // ... 现有关闭逻辑
}
```

### 5.3 Dashboard 显示

在 Dashboard 的 "knowledge growth" 象限增加一个计数卡片：

```
📱 手机捕获
今日 3 条 / 本周 18 条
```

---

## 6. 路径选项：应用前缀

**推荐 Bundle ID**：`com.orbit.capture`

**替代选项**（如果 ID 已被占用）：
- `com.your-handle.orbit-capture`
- `io.orbit.mobile-capture`

**⚠️ 一旦上线不可更改**——会让所有用户的 iCloud 数据不可见。

Mac 端配置从环境变量或 Orbit settings 读取：

```ts
const ICLOUD_BUNDLE = process.env.ORBIT_MOBILE_ICLOUD_BUNDLE 
  || 'com.orbit.capture';
```

开发期可以用本地配置覆盖。

---

## 7. 渐进部署策略

### 7.1 iOS 先行（M3 完成时）

iOS 端 M3 完成后，数据已经在 iCloud 里，但 Mac 端还没有 ingest 模块。  
此时 Mac Finder 侧边栏能看到 `iCloud Drive > Orbit Capture > inbox/...`，用户视觉可见，但没进 Orbit Inbox。

### 7.2 Mac 端接入（M4）

Mac 端 `mobile_inbound` 模块上线后：
- 全量扫描现有 inbox/
- 历史积攒的数据一次性全部进 Inbox
- 之后实时同步

### 7.3 向后兼容

iOS manifest schema 升版本时：
- `schema_version: 1 → 2` 先保持兼容（新字段可选）
- 真不兼容的话 Mac 端：
  - 旧版 Orbit：把数据留在 inbox/（不处理）
  - 新版 Orbit：发现 `schema_version > 本地支持的最高` → 写 failed.json，错误码 `unsupported_schema_version`，retryable=false
- 给用户 Orbit 更新提示

---

## 8. 测试策略

### 8.1 Mac 端单元测试

- mock iCloud 路径，准备固定 manifest + 附件
- 测试正常 ingest
- 测试 sha256 不匹配
- 测试 schema_version 不兼容
- 测试附件缺失
- 测试重复 ingest（幂等）

### 8.2 端到端 smoke 测试

iOS 真机 + Mac 真机：
1. iOS 保存一条文本
2. 等 iCloud 同步（最多 1 分钟）
3. Mac 端看到 Inbox Thoughts 出现新条目
4. iOS 端看到 ✓ 已接收

---

## 9. iOS/Mac 版本兼容性矩阵

| iOS schema | Mac orbit version | 行为 |
|---|---|---|
| 1 | 老 Orbit（没 mobile_inbound 模块） | 数据留在 iCloud inbox/，iOS 一直 uploaded 未 acked，用户看到警告 |
| 1 | 支持 schema 1 的 Orbit | 正常 ingest |
| 2 | 支持 schema 1 的 Orbit | Mac 写 failed.json 错误码 `unsupported_schema_version`, retryable=false |
| 2 | 支持 schema 2 的 Orbit | 正常 |

---

## 10. 在 Orbit 仓库的实施 checklist

**本文只描述契约。实际 PR 由负责 Mac 端的 agent/开发者提交**。提交时：

- [ ] 新增 `src/main/capture/mobile_inbound/` 模块
- [ ] 注册 IPC `mobileInbound:*`
- [ ] 在 `openVaultRuntime` 接入 watcher
- [ ] 在 Dashboard 展示计数卡片
- [ ] 新增 ADR: `ADR-017-mobile-inbound-integration.md`
- [ ] 在 `docs/architecture.md` 更新"Capture v2 is split into three domains" → 四个 domain（增加 mobile_inbound）
- [ ] 在 `docs/ROADMAP.md` 的 Phase 4+ 增加条目
- [ ] 单元测试：mock iCloud 目录的完整流程
- [ ] 手动 smoke：真实 iCloud 同步

---

**iOS 侧 manifest 或目录结构任何变更，必须同步更新本文 + Mac 端实现 + 升 schema_version。**
