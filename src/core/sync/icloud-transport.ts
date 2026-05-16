import type { CaptureRow } from '../../types/capture';
import * as iCloudBridge from '../../native/icloud-bridge';

export interface AckInfo {
  schema_version?: 1 | 2;
  acked_at?: string;
  artifact_kind?: string;
  vault_path?: string;
  note_id?: string;
  note_path?: string;
  library_item_id?: string;
  library_item_path?: string;
  timeline_event_id?: string;
  inbox_item_id?: string;
  vault_note_path?: string;
  [key: string]: unknown;
}

export interface RemoteFailureInfo {
  failed_at?: string;
  error_code?: string;
  error_message?: string;
  retryable?: boolean;
  [key: string]: unknown;
}

export interface UploadResult {
  remotePath: string;
  uploaded: boolean;
}

export interface ICloudTransport {
  getContainerStatus(): Promise<iCloudBridge.ICloudContainerStatus>;
  uploadCapture(capture: CaptureRow): Promise<UploadResult>;
  clearFailure(captureId: string): Promise<void>;
  readAck(captureId: string): Promise<AckInfo | null>;
  readFailure(captureId: string): Promise<RemoteFailureInfo | null>;
}

function parseJson<T>(text: string | null, path: string): T | null {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`icloud.invalid_json:${path}`);
  }
}

export function inboxPath(captureId: string): string {
  return `inbox/${captureId}`;
}

export function processedAckPath(captureId: string): string {
  return `processed/${captureId}/.acked`;
}

export function failedInfoPath(captureId: string): string {
  return `failed/${captureId}/.failed.json`;
}

export function failedDirPath(captureId: string): string {
  return `failed/${captureId}`;
}

export class NativeICloudTransport implements ICloudTransport {
  async getContainerStatus(): Promise<iCloudBridge.ICloudContainerStatus> {
    return iCloudBridge.getContainerStatus();
  }

  async uploadCapture(capture: CaptureRow): Promise<UploadResult> {
    const remotePath = inboxPath(capture.id);
    const status = await iCloudBridge.copyToICloud(capture.local_path, remotePath);
    return {
      remotePath,
      uploaded: status.exists && !status.error,
    };
  }

  async clearFailure(captureId: string): Promise<void> {
    await iCloudBridge.deleteRemotePath(failedDirPath(captureId));
  }

  async readAck(captureId: string): Promise<AckInfo | null> {
    const path = processedAckPath(captureId);
    return parseJson<AckInfo>(await iCloudBridge.readTextFile(path), path);
  }

  async readFailure(captureId: string): Promise<RemoteFailureInfo | null> {
    const path = failedInfoPath(captureId);
    return parseJson<RemoteFailureInfo>(await iCloudBridge.readTextFile(path), path);
  }
}
