---
status: blocked
milestone: M7-M8
depends_on: M6
created: 2026-05-07
---

# M7/M8 Plan: Share Extension + Widgets

## 当前阻塞

仓库当前没有生成的 `ios/` 工程。Share Extension、App Group 共享容器、主屏 Widget、锁屏 Widget 都需要真实 iOS native targets 和 entitlements，不能只用 JS 文件诚实完成。

## 已先行完成

- M8 剪贴板智能识别：打开 app 后读取 clipboard，并提供一键粘贴。
- 保存成功 haptic feedback。

## 需要补的 native 工作

1. 运行 `npx expo prebuild --platform ios` 并决定是否长期提交 `ios/`。
2. 配置 App Group：`group.com.orbit.capture`。
3. 新增 Share Extension target：
   - 接收 text/url/image
   - 写入 App Group 下的 SQLite + `captures/`
   - 复用五阶段原子写入协议，不直接写 iCloud
4. 新增 Widget Extension target：
   - 主屏小/中组件
   - 锁屏组件
   - deep link 到主 app Capture input
5. 真机验收：
   - Safari share → Orbit → 保存
   - 图片 share → 保存原图
   - 锁屏到输入 <2 秒
