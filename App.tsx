import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { openDb } from './src/core/storage/db';
import * as capturesRepo from './src/core/storage/captures-repo';
import { generateCaptureId } from './src/utils/id';
import { isoLocal, isoNow } from './src/utils/time';

export default function App() {
  const [storageStatus, setStorageStatus] = useState('Opening local store...');

  useEffect(() => {
    async function runSmokeTest() {
      const db = await openDb();
      const id = generateCaptureId();
      const now = isoNow();
      await capturesRepo.insert(db, {
        id,
        created_at: now,
        captured_at_local: isoLocal(),
        kind: 'thought',
        content_preview: 'hello m1',
        content_hash: 'm1-smoke',
        byte_size: 8,
        local_path: `captures/${id}/`,
      });
      const row = await capturesRepo.get(db, id);
      setStorageStatus(row ? `Local store OK: ${row.id}` : 'Local store failed');
    }

    runSmokeTest().catch((error: unknown) => {
      setStorageStatus(error instanceof Error ? error.message : String(error));
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello Orbit</Text>
      <Text style={styles.status}>{storageStatus}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  status: {
    color: '#555',
    paddingHorizontal: 24,
    textAlign: 'center',
  },
});
