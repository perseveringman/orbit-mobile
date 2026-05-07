const MAX_DELAY_SECONDS = 3600;
const DELAYS_SECONDS = [0, 5, 30, 120, 600, MAX_DELAY_SECONDS] as const;

export function computeNextRetryAt(attempts: number, now = new Date()): string {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('sync.backoff.invalid_attempts');
  }
  const index = Math.min(attempts - 1, DELAYS_SECONDS.length - 1);
  const delaySeconds: number = DELAYS_SECONDS[index] ?? MAX_DELAY_SECONDS;
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}
