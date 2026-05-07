# Orbit Mobile — Open Questions

> **Purpose**: 记录"认识到但本期不做"的问题，避免遗忘或重复讨论  
> **Update rule**: 发现新未决问题随时追加；收敛的问题移到本文末尾归档

---

## 1. iCloud 同步延迟的用户感知

**问题**：Apple 不保证秒级同步。实测 Wi-Fi 下 5-30s，蜂窝下可能几分钟。

**担忧**：用户保存完看到 ✓ 已上传，但在 Mac 端迟迟看不到 → 怀疑产品有 bug。

**当前方案**：
- UI 状态显示细分（pending / syncing / uploaded / acked）
- 状态栏明示"同步中"而不是承诺"已同步"

**未决**：
- 要不要在详情页加"预计同步时间"估算
- 长时间未 ack 时是否主动询问用户检查 Mac 端

**期望阶段**：M4 上线后观察真实用户反馈。

---

## 2. `expo-speech-recognition` 的稳定性

**问题**：这是 Expo 较新的 API，和 iOS 原生 `SFSpeechRecognizer` 的封装层，实机可能有边缘问题。

**担忧**：
- 中英文混杂转写质量
- 长时间录音（> 1min）是否稳定
- 是否真的完全 on-device 免网

**当前方案**：M5 开工时先做 spike（2-3 天），不行就自写 native module。

**备选**：自写 SFSpeechRecognizer module，Expo Modules API 成熟度足够。

---

## 3. App Group 共享存储的复杂度

**问题**：Share Extension 是独立进程，要访问主 app 的 SQLite 和 captures/，必须配置 App Group。

**复杂性**：
- Expo 对 App Group 的原生支持程度
- Extension 进程生命周期短，SQLite 开库成本
- 并发写入冲突

**当前方案**：M7 开工时评估。如果 Expo 支持差，考虑 Extension 只写 iCloud Drive，主 app 下次启动从 iCloud 拉回本地——牺牲本地一致性换简化。

**但这违反"Layer 2 = 真相源"**。需要再讨论。

---

## 4. iCloud 空间管理引导

**问题**：iCloud 免费 5GB，用户大量录音/图片会很快满。

**未决**：
- 达到 80% 时提示？
- 提供 "仅 Wi-Fi 上传原图" 省空间模式？
- 提供 "本地保留 + 不同步" 紧急模式？
- 帮用户跳到系统设置的 iCloud 管理？

**期望阶段**：M6（图片）完成后观察真实占用，再定策略。

---

## 5. 隐私：录音和图片的敏感性

**问题**：
- 用户录到敏感内容（开会、私密对话）怎么办？
- 图片可能含个人信息（截图密码、身份证等）

**风险**：iCloud 虽然 Apple 声称加密，但仍是云端副本。

**未决方向**：
- 设置里提供"敏感模式"：某条 capture 标记敏感 → 不同步到 iCloud，仅本地
- Face ID / Touch ID 保护详情页
- 自动检测敏感内容（Vision framework + OCR）

**期望阶段**：MVP 后 V2。MVP 默认信任用户自己判断。

---

## 6. 多设备同时 capture

**问题**：用户可能同时在 iPhone + iPad（未来）+ Watch 上 capture。

**场景**：
- iPhone 和 iPad 在同一 Apple ID 下，两台都同步到同一个 iCloud container
- device_id 不同但都进 Mac 端 Inbox

**未决**：
- 多设备间是否需要状态可见（"这条是 iPhone 记的，那条是 iPad 记的"）
- 是否需要设备间的草稿同步

**期望阶段**：iPad 版本正式开发时。

---

## 7. 离线重装 app 后的数据恢复

**问题**：用户卸载 app → 沙盒清空，但 iCloud 里还有数据。重装后：

- 所有 capture 的本地副本没了
- 只能看 iCloud 里的内容
- SQLite 状态表也没了，哪些 acked 哪些没 acked 不清楚

**当前方案**：重装后的初次启动扫描 iCloud：
- `inbox/` 里的 → 插入 SQLite 状态 uploaded（不知道有没 ack）
- `processed/` 里有 `.acked` 的 → 插入为 acked
- `failed/` 里的 → 插入为 conflicted

**未决**：
- UI 如何呈现"我重装了，历史数据还在吗"的引导
- 对普通用户透明（什么都不问就恢复）还是显式问"是否恢复"

**期望阶段**：MVP 发版前。

---

## 8. 录音的最大时长与分段

**问题**：iOS 原生录音没有硬性上限，但：
- 长录音 → 文件大（10 分钟 AAC ~5MB）
- 长转写 → SFSpeechRecognizer 60s 默认限制（需要循环重启）
- 电量消耗

**未决**：
- 单次录音默认上限（建议 5min）
- 超限是自动分段还是提示用户结束
- UI 是否显示剩余时间

**期望阶段**：M5 开工时。

---

## 9. OCR 图片中文字（V2）

**问题**：用户拍的图（白板、书、屏幕）里的文字应该可被索引。

**方案**：iOS Vision framework 本地 OCR，结果写入 manifest 的 image.ocr_text。

**未决**：
- iOS 端跑 OCR（耗电）还是 Mac 端跑（延迟）
- 中英文混杂识别质量
- 是否默认开启

**期望阶段**：V2。

---

## 10. Siri / Shortcuts 集成

**问题**：用户说"嘿 Siri，记一个想法"应该能直达。

**技术**：App Intents framework（iOS 16+）。

**未决**：
- 语音记录的落点（和 app 内一致？）
- 能否在不打开 app 的情况下完成录音 + 转写 + 保存
- Intents 能不能访问 App Group 共享存储

**期望阶段**：V2。

---

## 11. Widget 的刷新策略

**问题**：主屏 Widget 显示最近 3 条 capture 需要定期刷新。

**iOS 限制**：
- WidgetKit 刷新由系统调度，每天最多几十次
- 用户保存新 capture 后能主动触发刷新吗？（通过 WidgetCenter.reloadTimelines）

**未决**：
- Widget 内容从哪读（App Group 共享存储？还是 NSUserDefaults 里的预计算？）
- 状态图标是否显示

**期望阶段**：M8。

---

## 12. 草稿自动恢复的 UX

**问题**：用户打字一半被打断，下次打开 app 看到什么？

**选项**：
- (a) 弹 modal 问"是否恢复上次未保存的内容"
- (b) 直接恢复到输入框，顶部小提示"已恢复 X 分钟前的草稿"
- (c) 侧边按钮，用户主动点才恢复

**当前倾向**：(b)，减少打断。但需要验证用户心智是否认可。

**期望阶段**：M2 实施时做 A/B 或直接 (b) 上线观察。

---

## 13. 已识别失败的自动 GC

**问题**：`failed` / `conflicted` 状态的 capture 一直留着占空间。

**未决**：
- 30 天未手动重试/解决 → 自动归档？自动删除？
- 归档后的数据去哪（本地 vs iCloud failed/）

**期望阶段**：MVP 运行 2-3 个月后根据实际数据决定。

---

## 14. Mac 端不在身边的长期体验

**问题**：用户有 iPhone 但暂时没买 Mac / Mac 维修中 / 出差数月。

**当前状态**：
- iOS 数据全在本地 + iCloud
- 但没有查看/编辑/整理能力
- 用户只能"往里塞"，看不到"塞了什么"

**未决**：
- 是否允许 iOS 端至少**阅读** iCloud 里的历史 capture
- 搜索？按时间/标签浏览？
- 这会滑向"iOS 小号 Mac"——违反"只做 Capture"原则

**设计判断**：倾向于**允许只读浏览**（降低焦虑），但**不允许编辑/整理**。

**期望阶段**：V2。

---

## 15. Apple ID 变更 / 切换

**问题**：用户换了 Apple ID（换工作账号、换家庭账号），iCloud container 下的数据不可见。

**当前方案**：
- 检测到 iCloud 身份变化 → 顶部警告
- 本地 Layer 2 数据保留
- 等用户登回原 Apple ID 继续同步

**未决**：
- 永久切换时如何引导用户导出 + 导入到新账号

**期望阶段**：MVP 运行 3-6 个月后根据真实 case。

---

## 如何更新本文

- 每次重要讨论识别出新的"本期不做但要记住"问题 → 追加新条目
- 问题已解决或决定不做 → 移到文件底部的"已解决"段
- 问题晋升为本期 task → 从本文移除，写入 `docs/plans/` 或 `docs/decisions/`

---

## 已解决 / 已决定不做

_（暂无）_
