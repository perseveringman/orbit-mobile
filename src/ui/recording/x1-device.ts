import type { X1DiscoveredDevice, X1StorageInfo } from 'orbit-recorder-device';

export const X1_SERVICE_UUID = '0000ae20-0000-1000-8000-00805f9b34fb';

export function isAutoConnectX1Device(device: X1DiscoveredDevice): boolean {
  const advertisedServices = device.advertisedServices.map((service) => service.toLowerCase());
  if (advertisedServices.includes(X1_SERVICE_UUID)) return true;
  const name = device.name.toLowerCase();
  return name.includes('录音笔') || name.includes('newman') || name.includes('niuman');
}

export function formatBattery(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '读取中';
  return `${Math.round(value)}%`;
}

export function formatX1StorageUsage(storage: X1StorageInfo | null): string {
  if (!storage) return '读取中';
  return `已用 ${formatBytes(storage.usedBytes)} / ${formatBytes(storage.totalBytes)}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit] ?? 'B'}`;
}
