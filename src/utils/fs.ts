/**
 * fs.ts — 文件系统封装
 *
 * DOCUMENTS_DIR / ensureDir / fsync
 *
 * ⚠️ fsync 是 M2 原子写入协议的硬依赖。expo-file-system 当前版本
 * 不直接暴露 fsync——M1 留 noop 占位；M2 必须补 native 实现
 * （候选：expo-file-system-next 的 openAsync({append:true}) / 自写 module）
 *
 * @see docs/ARCHITECTURE.md §5
 *
 * TODO(M1): DOCUMENTS_DIR + ensureDir
 * TODO(M2): 真正的 fsync 实现
 */

export const __stub__ = true;
