# Orbit Mobile — Development Guide

> **Status**: 项目骨架阶段（2026-05-06）  
> **Environment**: macOS + iOS 开发

---

## 1. 前置要求

| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | 20+ | 开发 |
| pnpm 或 npm | 最新 | 包管理 |
| Xcode | 15+ | iOS 构建 |
| iOS Simulator | 17+ | 调试 |
| 真机 iPhone | iOS 16+ | iCloud 真实测试（必须） |
| Apple Developer 账号 | 免费账号足够 | iCloud entitlement |
| Watchman | 最新 | React Native 文件监听 |
| CocoaPods | 最新 | iOS 依赖管理 |

**关于 iCloud 测试**：Simulator 对 iCloud 支持有限，真实端到端必须真机。iOS Simulator 的 iCloud Drive 路径可能不同，调试时注意区分。

---

## 2. 首次 setup

⚠️ **M0 尚未执行 `create-expo-app`**。下一个接手的 AI 动 M1 前需要完成。

### 2.1 Expo 项目初始化

目录已存在且包含文档，不能直接 `create-expo-app .`。推荐流程：

```bash
# 在别处初始化
cd /tmp
npx create-expo-app orbit-mobile-temp --template blank-typescript

# 把 Expo 生成的文件移到目标目录（保留已有文档）
cd /tmp/orbit-mobile-temp
# 移动所有非冲突文件
cp -r . /Users/ryanbzhou/Developer/vibe/orbit-mobile/
cd /Users/ryanbzhou/Developer/vibe/orbit-mobile
rm -rf /tmp/orbit-mobile-temp

# 确认 docs/、src/、AGENTS.md 等没被覆盖
git status
```

### 2.2 核心依赖安装

```bash
cd /Users/ryanbzhou/Developer/vibe/orbit-mobile

# Expo 原生模块
npx expo install \
  expo-sqlite \
  expo-file-system \
  expo-crypto \
  expo-clipboard \
  expo-haptics \
  expo-image-picker \
  expo-camera \
  expo-image-manipulator \
  expo-av \
  expo-speech-recognition \
  expo-background-fetch \
  expo-task-manager \
  expo-router

# 生态
npm install zustand @react-native-community/netinfo

# 开发
npm install -D \
  @types/react \
  typescript \
  eslint \
  prettier \
  vitest
```

### 2.3 Entitlements 配置

在 `app.json` 的 `ios.entitlements`：

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.orbit.capture",
      "entitlements": {
        "com.apple.developer.icloud-container-identifiers": [
          "iCloud.com.orbit.capture"
        ],
        "com.apple.developer.icloud-services": [
          "CloudDocuments"
        ],
        "com.apple.developer.ubiquity-container-identifiers": [
          "iCloud.com.orbit.capture"
        ]
      }
    }
  }
}
```

关键：必须声明 `CloudDocuments` 服务才能使用 iCloud Drive。

### 2.4 iCloud Container 在 Apple Developer 创建

（M3 开工时做）

1. Apple Developer Portal → Certificates, IDs & Profiles → Identifiers
2. 新建 iCloud Container：`iCloud.com.orbit.capture`
3. 在 App ID 里绑定该 Container
4. 重新生成 provisioning profile

---

## 3. 常用命令

### 3.1 Development Build（M2 起必需）

从 M2 起，Orbit Mobile 依赖两个自定义原生模块：

- `modules/orbit-durable-fs/`：真实 `fsync()` / native append，支撑本地原子写入
- `modules/orbit-icloud-bridge/`：iCloud Drive container / upload / ACK 通道

**Expo Go 不包含这些自定义 native module，因此 M2+ 不能再用 Expo Go 调试。** 如果看到 `Cannot find native module 'OrbitDurableFS'`，说明正在用 Expo Go 或尚未重新编译 Development Build。

首次生成并运行 iOS Development Build：

```bash
npx expo prebuild --platform ios
npx expo run:ios

# 真机（Capture/iCloud 推荐）
npx expo run:ios --device
```

之后的开发流：

- 改 JS/TS/TSX：`npm start` 后热重载
- 改 `modules/**/ios/*.swift`：必须重新运行 `npx expo run:ios`
- Share Extension / WidgetKit（M7/M8）：需要保留并维护生成的 `ios/` 工程

前置要求：完整 Xcode、CocoaPods、真机调试时 Xcode 登录 Apple ID。

### 3.2 常用脚本

```bash
# 开发模式
npm start                     # Expo Metro bundler
npm run ios                   # Development Build 跑 iOS simulator
npm run ios -- --device       # Development Build 跑真机调试

# 构建
eas build --platform ios      # 需要 Expo Application Services

# 质量检查
npm run typecheck             # TypeScript
npm run lint                  # ESLint
npm run test                  # Vitest

# 清理
npx expo start --clear        # 清 Metro 缓存
npx expo prebuild --clean     # 重建 iOS 原生项目
```

---

## 4. 项目结构

详见 [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8。简述：

```
src/
├── core/           # 纯业务逻辑（无 UI 依赖）
├── ui/             # React Native 组件
├── native/         # Swift native module 的 JS wrapper
├── utils/
└── types/

ios/                # 原生 iOS 项目（Expo prebuild 生成）
└── ICloudBridge/   # 我们自写的 Swift native module

docs/               # 全部设计文档
tests/              # 测试
```

---

## 5. 开发规范

### 5.1 文件命名

- TypeScript 源文件：`kebab-case.ts`
- React 组件：`kebab-case.tsx`（文件名）+ `PascalCase`（默认导出）
- 测试：`<name>.test.ts`
- 常量：`UPPER_SNAKE_CASE`

### 5.2 模块边界

**纪律**：
- `core/` **不允许** import UI
- `ui/` **不允许**直接操作 SQLite 或文件系统（通过 core 的 repo）
- `native/` 只暴露 Promise 接口

这是让同步引擎、原子写入等可以独立单元测试的前提。

### 5.3 错误处理

- 业务错误 throw Error with `.code` 字段（例如 `err.code === 'icloud_unavailable'`）
- UI 层根据 error code 决定用户文案
- 绝不吞掉错误（至少写 log）

### 5.4 日志

通过 `src/utils/logger.ts` 统一出口：

```ts
import { logger } from '@/utils/logger';

logger.info('sync.uploaded', { captureId, durationMs: 234 });
logger.warn('sync.failed', { captureId, error: err.message });
logger.error('atomic.phase3', err, { captureId });
```

所有日志写到 `logs/<date>.ndjson`（用 `expo-file-system`）。

---

## 6. 调试技巧

### 6.1 查看沙盒内容

```bash
# 真机：通过 Xcode > Window > Devices and Simulators > 选设备 > 下载 app container

# Simulator：
xcrun simctl get_app_container booted com.orbit.capture data
# 输出路径下就是沙盒
```

### 6.2 查看 iCloud Drive 内容

Finder 侧边栏 → iCloud Drive → Orbit Capture

或命令行：
```bash
ls "$HOME/Library/Mobile Documents/iCloud~com.orbit.capture/Documents/"
```

### 6.3 查看 SQLite

```bash
# 拷贝 db 文件出来
cp /path/in/sandbox/orbit.db /tmp/
# 用任何 SQLite 客户端打开
sqlite3 /tmp/orbit.db
> .schema
> SELECT * FROM captures ORDER BY created_at DESC LIMIT 10;
```

### 6.4 隐藏的 Developer Screen

主界面连点 logo 5 次 → 进 Developer Screen（见 `docs/TESTING.md` §四）

---

## 7. 写 Native Module

M3 开工时需要写 iCloud Bridge。参考：
- Expo 官方文档：https://docs.expo.dev/modules/
- 使用 `expo-modules-core` 写 Swift module
- 接口见 [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.4

典型结构：

```
modules/icloud-bridge/
├── android/           # 留空，不支持 Android
├── ios/
│   ├── ICloudBridgeModule.swift
│   └── ICloudBridge.podspec
├── src/
│   └── index.ts       # TypeScript 接口
└── expo-module.config.json
```

---

## 8. 常见坑

### 8.1 iCloud entitlement 审核

App Store 审核时需要说明 iCloud 用途。隐私说明模板见 `docs/open-questions.md`。

### 8.2 Simulator 和真机差异

| 功能 | Simulator | 真机 |
|---|---|---|
| iCloud Drive | 有限支持 | 完整 |
| 录音 | 用麦 / 无声 | 完整 |
| 相机 | 模拟 | 完整 |
| Share Extension | 可用 | 可用 |
| Push | 不支持 | 支持（本项目不用） |
| Background Fetch | 不准 | 实际调度 |

**规则**：所有同步相关功能必须真机测试。

### 8.3 Metro Bundler 卡死

```bash
npx expo start --clear
# 或
rm -rf node_modules/.cache
```

### 8.4 pod install 卡住

```bash
cd ios
pod install --repo-update
```

### 8.5 TypeScript 路径别名

`tsconfig.json` 配置：
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

Metro 需要 `babel-plugin-module-resolver` 或 Expo 自带的路径处理。

---

## 9. 提交前 checklist

每次 commit 前：

- [ ] `npm run typecheck` 无错误
- [ ] `npm run lint` 无错误
- [ ] `npm run test` 全部通过
- [ ] `docs/STATUS.md` 已更新
- [ ] commit message 符合规范（见 `AGENTS.md` §6）
- [ ] 只 `git add` 相关文件，不用 `-A`

---

## 10. 发布（遥远的未来）

- `eas submit --platform ios` 上传 TestFlight
- App Store Connect 配置隐私说明、分类、截图
- 审核注意：iCloud 用途说明要清楚

---

**环境问题不确定时优先查 Expo 官方文档，版本对齐很重要。**
