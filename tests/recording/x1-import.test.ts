import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}));

import {
  importX1UsbAudioFile,
  listImportedX1AudioFileNames,
} from '@/core/recorder-device/x1-usb-import';
import * as capturesRepo from '@/core/storage/captures-repo';
import { setValue } from '@/core/storage/device-info';
import * as recordingsRepo from '@/core/storage/recordings-repo';
import { joinPath } from '@/utils/fs';
import { createMigratedTestDb } from '../setup/in-memory-db';
import { MemoryFileSystem } from '../setup/memory-fs';

describe('x1 import', () => {
  it('imports X1 USB disk audio through the recording capture pipeline', async () => {
    const db = await createMigratedTestDb();
    const fs = new MemoryFileSystem();
    await setValue(db, 'device_id', 'device-1');
    await fs.writeString('/tmp/20260521123045.mp3', 'x1-audio-bytes');

    const detail = await importX1UsbAudioFile(
      {
        byteSize: 14,
        displayName: '20260521123045.mp3',
        filename: '20260521123045.mp3',
        mime: 'audio/mpeg',
        uri: '/tmp/20260521123045.mp3',
      },
      { db, fs, sourceVersion: 'test' },
    );

    const capture = await capturesRepo.get(db, detail.meta.id);
    const recording = await recordingsRepo.get(db, detail.meta.id);
    const importedNames = await listImportedX1AudioFileNames({ db });
    const manifest = JSON.parse(await fs.readString(joinPath(capture?.local_path ?? '', 'manifest.json'))) as {
      recording?: {
        source?: {
          file_name?: string;
          transfer_mode?: string;
        };
      };
    };

    expect(capture).toMatchObject({
      attachment_count: 9,
      has_audio: 1,
      kind: 'recording',
    });
    expect(recording).toMatchObject({
      duration_ms: 0,
      final_state: 'offline_queued',
      partial_provider: 'x1-import',
    });
    expect(importedNames.has('20260521123045.mp3')).toBe(true);
    expect(manifest.recording?.source).toMatchObject({
      file_name: '20260521123045.mp3',
      transfer_mode: 'usb_disk',
    });
    await expect(fs.readString(joinPath(capture?.local_path ?? '', 'audio.mp3'))).resolves.toBe('x1-audio-bytes');
  });
});
