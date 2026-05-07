/**
 * id.ts — id 生成
 *
 * - generateCaptureId(): `mob_cap_<uuid>`（前缀让 Mac 端识别手机来源）
 * - generateSessionId(): 纯 uuid
 * - generateDeviceId(): 纯 uuid，首启生成后存 device_info
 *
 * 用 expo-crypto 的 randomUUID，不引 nanoid（DATA-MODEL §8 决策）。
 *
 */

import * as Crypto from 'expo-crypto';

export function generateCaptureId(): string {
  return `mob_cap_${Crypto.randomUUID()}`;
}

export function generateSessionId(): string {
  return Crypto.randomUUID();
}

export function generateDeviceId(): string {
  return Crypto.randomUUID();
}
