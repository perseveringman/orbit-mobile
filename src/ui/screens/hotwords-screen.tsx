import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  loadAppSettings,
  setAiHotwords,
} from '../../core/settings/app-settings';
import { openDb } from '../../core/storage/db';
import { returnTo } from '../navigation/back';

export function HotwordsScreen(): React.ReactElement {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    openDb()
      .then((db) => loadAppSettings(db))
      .then((settings) => {
        if (!cancelled) setDraft(settings.aiHotwords.join('\n'));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hotwords = useMemo(() => normalizeInput(draft), [draft]);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await setAiHotwords(await openDb(), hotwords);
      setDraft(hotwords.join('\n'));
      setMessage(`已保存 ${hotwords.length} 个热词`);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  function remove(word: string): void {
    setDraft((current) => normalizeInput(current).filter((item) => item !== word).join('\n'));
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={() => returnTo(router, '/settings')}
        style={styles.backButton}
      >
        <Text style={styles.back}>返回</Text>
      </Pressable>
      <Text style={styles.title}>热词列表</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        placeholder="Orbit\nBASB\n纽曼 X1"
        placeholderTextColor="#94a3b8"
        value={draft}
        onChangeText={setDraft}
        style={styles.editor}
        textAlignVertical="top"
      />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>{busy ? '保存中' : '保存'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy || draft.length === 0}
          onPress={() => setDraft('')}
          style={({ pressed }) => [
            styles.secondaryButton,
            (pressed || busy || draft.length === 0) && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>清空</Text>
        </Pressable>
      </View>

      <View style={styles.previewSection}>
        <Text style={styles.sectionTitle}>当前热词</Text>
        <View style={styles.chipWrap}>
          {hotwords.length === 0 ? (
            <Text style={styles.empty}>暂无热词</Text>
          ) : hotwords.map((word) => (
            <Pressable
              key={word}
              accessibilityRole="button"
              onPress={() => remove(word)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Text style={styles.chipText}>{word}</Text>
              <Text style={styles.chipRemove}>×</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function normalizeInput(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value.split(/\r?\n|,/g)) {
    const word = item.trim().replace(/\s+/g, ' ');
    const key = word.toLocaleLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word.slice(0, 80));
    if (out.length >= 200) break;
  }
  return out;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flexGrow: 1,
    padding: 20,
    paddingTop: 16,
  },
  back: {
    color: '#2563eb',
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 18,
  },
  message: {
    color: '#166534',
    marginBottom: 12,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 12,
  },
  editor: {
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#0f172a',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 220,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  primaryButton: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  previewSection: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 22,
    paddingTop: 18,
  },
  sectionTitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  chipRemove: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '800',
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
  },
});
