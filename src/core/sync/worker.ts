import type { CaptureRow } from '../../types/capture';
import { isoNow } from '../../utils/time';
import * as capturesRepo from '../storage/captures-repo';
import * as eventsRepo from '../storage/events-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { computeNextRetryAt } from './backoff';
import { NativeICloudTransport, type ICloudTransport, type RemoteFailureInfo } from './icloud-transport';
import { assertTransition } from './state-machine';

const MAX_AUTO_RETRY_ATTEMPTS = 20;

export interface SyncTickOptions {
  db?: SQLiteDatabaseLike;
  transport?: ICloudTransport;
  batchSize?: number;
  now?: Date;
}

export interface SyncTickResult {
  processed: number;
  uploaded: number;
  failed: number;
  acked: number;
  conflicted: number;
}

export interface SyncWorker {
  start(): void;
  stop(): void;
  tick(): Promise<SyncTickResult>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function markFailed(
  db: SQLiteDatabaseLike,
  capture: CaptureRow,
  attempts: number,
  error: string,
  now: Date,
): Promise<void> {
  const exhausted = attempts >= MAX_AUTO_RETRY_ATTEMPTS;
  await capturesRepo.updateSyncState(db, capture.id, {
    sync_state: 'failed',
    sync_attempts: attempts,
    sync_last_error: error,
    sync_next_retry_at: exhausted ? null : computeNextRetryAt(attempts, now),
  });
  await eventsRepo.append(db, capture.id, exhausted ? 'attempts_exhausted' : 'failed', {
    attempt: attempts,
    error,
  });
}

async function applyRemoteFailure(
  db: SQLiteDatabaseLike,
  capture: CaptureRow,
  info: RemoteFailureInfo,
  now: Date,
): Promise<'failed' | 'conflicted'> {
  const message = info.error_message ?? info.error_code ?? 'icloud.remote_failed';
  if (info.retryable === false) {
    assertTransition(capture.sync_state, 'conflicted');
    await capturesRepo.updateSyncState(db, capture.id, {
      sync_state: 'conflicted',
      sync_last_error: message,
      sync_next_retry_at: null,
    });
    await eventsRepo.append(db, capture.id, 'failed', { remote: true, retryable: false, error: message });
    return 'conflicted';
  }
  await markFailed(db, capture, capture.sync_attempts + 1, `remote:${message}`, now);
  return 'failed';
}

export async function processOneCapture(
  capture: CaptureRow,
  options: Required<Pick<SyncTickOptions, 'transport' | 'db' | 'now'>>,
): Promise<'uploaded' | 'failed' | 'acked' | 'conflicted'> {
  const { db, transport, now } = options;

  const remoteFailure = await transport.readFailure(capture.id);
  if (remoteFailure !== null) {
    return applyRemoteFailure(db, capture, remoteFailure, now);
  }

  const ack = await transport.readAck(capture.id);
  if (ack !== null) {
    assertTransition(capture.sync_state, 'acked');
    await capturesRepo.updateSyncState(db, capture.id, {
      sync_state: 'acked',
      acked_at: typeof ack.acked_at === 'string' ? ack.acked_at : isoNow(),
      ack_vault_path: typeof ack.vault_path === 'string' ? ack.vault_path : null,
      sync_last_error: null,
      sync_next_retry_at: null,
    });
    await eventsRepo.append(db, capture.id, 'ack', ack);
    return 'acked';
  }

  if (capture.sync_state === 'uploaded') {
    return 'uploaded';
  }

  assertTransition(capture.sync_state, 'syncing');
  const attempts = capture.sync_attempts + 1;
  await capturesRepo.updateSyncState(db, capture.id, {
    sync_state: 'syncing',
    sync_attempts: attempts,
    sync_last_try_at: now.toISOString(),
    sync_next_retry_at: null,
  });
  await eventsRepo.append(db, capture.id, 'started', { attempt: attempts });

  try {
    const containerStatus = await transport.getContainerStatus();
    if (!containerStatus.available) {
      throw new Error(`icloud_unavailable:${containerStatus.reason ?? 'unknown'}`);
    }

    const upload = await transport.uploadCapture(capture);
    if (!upload.uploaded) {
      throw new Error(`icloud_upload_pending:${upload.remotePath}`);
    }

    assertTransition('syncing', 'uploaded');
    await capturesRepo.updateSyncState(db, capture.id, {
      sync_state: 'uploaded',
      uploaded_at: isoNow(),
      sync_last_error: null,
      sync_next_retry_at: null,
    });
    await eventsRepo.append(db, capture.id, 'uploaded', { remotePath: upload.remotePath });
    return 'uploaded';
  } catch (error) {
    await markFailed(db, capture, attempts, errorMessage(error), now);
    return 'failed';
  }
}

export async function runSyncTick(options: SyncTickOptions = {}): Promise<SyncTickResult> {
  const db = options.db ?? (await (await import('../storage/db')).openDb());
  const transport = options.transport ?? new NativeICloudTransport();
  const batchSize = options.batchSize ?? 3;
  const now = options.now ?? new Date();
  const result: SyncTickResult = {
    processed: 0,
    uploaded: 0,
    failed: 0,
    acked: 0,
    conflicted: 0,
  };

  const candidates = [
    ...(await capturesRepo.listByState(db, 'pending', { limit: batchSize, dueBefore: now.toISOString() })),
    ...(await capturesRepo.listByState(db, 'failed', { limit: batchSize, dueBefore: now.toISOString() })),
    ...(await capturesRepo.listByState(db, 'uploaded', { limit: batchSize })),
  ].slice(0, batchSize);

  for (const capture of candidates) {
    const status = await processOneCapture(capture, { db, transport, now });
    result.processed += 1;
    result[status] += 1;
  }

  return result;
}

export function createSyncWorker(options: SyncTickOptions & { intervalMs?: number } = {}): SyncWorker {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  const intervalMs = options.intervalMs ?? 60000;

  const tick = async (): Promise<SyncTickResult> => {
    if (running) {
      return { processed: 0, uploaded: 0, failed: 0, acked: 0, conflicted: 0 };
    }
    running = true;
    try {
      return await runSyncTick(options);
    } finally {
      running = false;
    }
  };

  return {
    start() {
      void tick();
      if (timer === null) {
        timer = setInterval(() => {
          void tick();
        }, intervalMs);
      }
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    tick,
  };
}
