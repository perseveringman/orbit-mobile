import { describe, expect, it } from 'vitest';

import { loadAppSettings, setKeepImageOriginal } from '@/core/settings/app-settings';
import { createMigratedTestDb } from '../setup/in-memory-db';

describe('app settings', () => {
  it('keeps image originals by default and persists opt-out', async () => {
    const db = await createMigratedTestDb();

    await expect(loadAppSettings(db)).resolves.toEqual({ keepImageOriginal: true });

    await setKeepImageOriginal(db, false);
    await expect(loadAppSettings(db)).resolves.toEqual({ keepImageOriginal: false });

    await setKeepImageOriginal(db, true);
    await expect(loadAppSettings(db)).resolves.toEqual({ keepImageOriginal: true });
  });
});
