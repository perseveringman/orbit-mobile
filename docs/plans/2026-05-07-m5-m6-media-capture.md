---
status: implemented
milestone: M5-M6
depends_on: M4
created: 2026-05-07
---

# M5/M6 Plan: 语音与图片 Capture

## 目标

把附件纳入 M2 的五阶段原子写入协议，保证语音 `.m4a` 与图片文件先完整落本地，再进入同步。

## 实施结果

- `createCapture()` 泛化了文本写入，支持 `attachments`。
- atomic write 会在 staging 内复制附件、fsync 附件、写 manifest、rename、写 `.complete`、SQLite transaction。
- 语音：
  - `expo-av` 录音
  - `VoiceButton` 按住录音、松开保存
  - 原始 `audio.m4a` 永久保留为 attachment
- 图片：
  - `expo-image-picker`
  - 相册多选
  - 相机拍照
  - 图片作为 attachment 进入 manifest，带 dimensions/mime
- 剪贴板/触感反馈为 M8 先行能力已接入主 Capture UI。

## 未完成但已明确

- 实时语音转写未接入不稳定外部依赖；当前保存手动文本为 `transcription_source: manual`。
- 录音中 app 被杀后的 native recording session 恢复需真机专项处理。
- 图片缩略图预览/删除队列未做，当前是选择后立即保存。
