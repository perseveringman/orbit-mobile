/**
 * id.ts — id 生成
 *
 * - generateCaptureId(): `mob_cap_<uuid>`（前缀让 Mac 端识别手机来源）
 * - generateSessionId(): 纯 uuid
 * - generateDeviceId(): 纯 uuid，首启生成后存 device_info
 *
 * 用 expo-crypto 的 randomUUID，不引 nanoid（DATA-MODEL §8 决策）。
 *
 * TODO(M1): 实现三个函数
 */

export const __stub__ = true;
