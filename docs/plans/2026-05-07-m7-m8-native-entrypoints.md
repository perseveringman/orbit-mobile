---
status: implemented
milestone: M7-M8
depends_on: M6
created: 2026-05-07
---

# M7/M8 Plan: Share Extension + Widgets

## 当前状态

`ios/` 工程已生成并提交，Share Extension、App Group 共享容器、主屏 Widget、锁屏 Widget 均已作为真实 iOS native targets 接入。当前剩余工作是真机分享、Widget、iCloud 异常与端到端验收。

## 已先行完成

- M8 剪贴板智能识别：打开 app 后读取 clipboard，并提供一键粘贴。
- 保存成功 haptic feedback。
- App Group entitlement：`group.com.zhouyanbo.orbit.capture`。
- `OrbitShareExtension` target：接收 text/url/image，写入 App Group `share-inbox/<id>/payload.json + attachments + .complete`。
- 主 app `importShareInbox()`：启动时读取 App Group inbox，并通过 `createCapture()` 导入，因此仍执行五阶段本地原子写入，不直接写 iCloud。
- `OrbitWidgets` target：主屏 small/medium 与 iOS 16+ 锁屏 accessory widget，deep link 到 `orbit-mobile://`。
- `scripts/add-ios-extension-targets.rb`：用 `xcodeproj` 幂等维护 extension targets，避免手改 pbxproj UUID。

## 已完成的 native 工作

1. 运行 `npx expo prebuild --platform ios` 并提交 `ios/` Development Build 工程。
2. 配置 App Group：`group.com.zhouyanbo.orbit.capture`。
3. 新增 Share Extension target：
    - 接收 text/url/image
    - 写入 App Group 下的 `share-inbox/`
    - 主 app 导入时复用五阶段原子写入协议，不直接写 iCloud
4. 新增 Widget Extension target：
    - 主屏小/中组件
    - 锁屏组件
    - deep link 到主 app Capture input

## 待真机验收

1. Safari share → Orbit → 保存
2. 图片 share → 保存原图
3. 锁屏到输入 <2 秒
4. 主 app 导入 share-inbox 时杀进程，重启后不能产生半写
5. iCloud 不可用时分享导入后的本地 Capture 仍完整可见
