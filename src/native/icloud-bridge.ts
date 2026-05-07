/**
 * icloud-bridge.ts — Swift native module 的 JS 层 wrapper
 *
 * 封装 NSFileCoordinator + NSMetadataQuery 提供的能力：
 *   - copyToICloud(src, dstRelative)
 *   - getUploadStatus(id)
 *   - subscribeContainerEvents(cb)：processed/ 出现即 ack
 *   - probeAvailability()
 *
 * Swift 侧约 200 行，无现成库替代（working_memory 定稿）。
 *
 * @see docs/ARCHITECTURE.md §9
 *
 * TODO(M3): 实现 + 对接 iOS 原生 Swift module
 */

export const __stub__ = true;
