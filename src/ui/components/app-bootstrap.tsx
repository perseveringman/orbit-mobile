import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { runAiWorkerTick } from '../../core/ai/worker';
import { runReconcile } from '../../core/reconcile/reconcile-job';
import { importShareInbox } from '../../core/share/share-inbox';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import { writeWidgetSnapshot } from '../../core/widget/snapshot';

interface BootstrapSnapshot {
  message: string | null;
  error: string | null;
}

export function AppBootstrap(): React.ReactElement | null {
  const [snapshot, setSnapshot] = useState<BootstrapSnapshot>({ message: null, error: null });
  const runningRef = useRef(false);

  useEffect(() => {
    async function runStartupPass(reason: string): Promise<void> {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const db = await openDb();
        const imported = await importShareInbox({
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        });
        await runReconcile({ db });
        await runAiWorkerTick({ db }).catch(() => undefined);
        await writeWidgetSnapshot(db).catch(() => undefined);
        await runSyncTick({ db });
        setSnapshot({
          message: imported > 0 ? `已导入 ${imported} 条分享` : null,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSnapshot({ message: null, error: `${reason}: ${message}` });
      } finally {
        runningRef.current = false;
      }
    }

    void runStartupPass('startup');
    const interval = setInterval(() => {
      void runStartupPass('interval');
    }, 60_000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runStartupPass('active');
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  if (!snapshot.message && !snapshot.error) {
    return null;
  }

  return (
    <View style={[styles.container, snapshot.error ? styles.error : styles.info]}>
      <Text style={styles.text}>{snapshot.error ?? snapshot.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  error: {
    backgroundColor: '#fff2f0',
  },
  info: {
    backgroundColor: '#eef6ff',
  },
  text: {
    color: '#233',
    fontSize: 12,
    fontWeight: '600',
  },
});
