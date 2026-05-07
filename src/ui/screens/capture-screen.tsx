/**
 * capture-screen.tsx — 主输入界面
 *
 * 核心屏：文本输入 + 录音按钮 + 选图。Draft 每 2s 自动保存。
 * 启动 < 1s 到可输入；不等 reconcile 完成。
 *
 * @see docs/UX-PRINCIPLES.md
 * @see docs/ARCHITECTURE.md §7
 *
 */

import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createTextCapture } from '../../core/capture/atomic-write';
import { runReconcile } from '../../core/reconcile/reconcile-job';
import { openDb } from '../../core/storage/db';
import { useDraft } from '../hooks/use-draft';

export function CaptureScreen(): React.ReactElement {
  const inputRef = useRef<TextInput>(null);
  const draft = useDraft();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const focusHandle = setTimeout(() => inputRef.current?.focus(), 50);
    openDb()
      .then((db) => runReconcile({ db }))
      .catch((reconcileError: unknown) => {
        setError(reconcileError instanceof Error ? reconcileError.message : String(reconcileError));
      });
    return () => clearTimeout(focusHandle);
  }, []);

  async function save(): Promise<void> {
    const content = draft.content.trim();
    if (!content || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const db = await openDb();
      await createTextCapture(
        {
          content,
          sessionId: draft.sessionId,
        },
        {
          db,
          sourceVersion: Constants.expoConfig?.version ?? '0.0.0',
        },
      );
      await draft.clear();
      setMessage('已保存 ✓');
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.topBar}>
        <Text style={styles.status}>○ 本地优先</Text>
        <Link href="/recent" style={styles.recentLink}>
          最近
        </Link>
      </View>

      {draft.restored ? <Text style={styles.restored}>已恢复上次未完成草稿</Text> : null}
      {message ? <Text style={styles.toast}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        ref={inputRef}
        autoFocus
        multiline
        placeholder="捕捉这一刻……"
        style={styles.input}
        textAlignVertical="top"
        value={draft.content}
        onChangeText={(value) => draft.setContent(value)}
      />

      <View style={styles.bottomBar}>
        <Text style={styles.disabledAction}>🎙</Text>
        <Text style={styles.disabledAction}>📷</Text>
        <Text style={styles.disabledAction}>#</Text>
        <Pressable
          accessibilityRole="button"
          disabled={saving || draft.content.trim().length === 0}
          style={({ pressed }) => [
            styles.saveButton,
            (saving || draft.content.trim().length === 0) && styles.saveButtonDisabled,
            pressed && styles.saveButtonPressed,
          ]}
          onPress={() => {
            void save();
          }}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>完成</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 32,
    justifyContent: 'space-between',
  },
  status: {
    color: '#475569',
    fontSize: 13,
  },
  recentLink: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  restored: {
    color: '#0f766e',
    fontSize: 13,
    marginTop: 8,
  },
  toast: {
    color: '#166534',
    fontSize: 13,
    marginTop: 8,
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
    marginTop: 8,
  },
  input: {
    flex: 1,
    fontSize: 22,
    lineHeight: 31,
    paddingVertical: 24,
  },
  bottomBar: {
    alignItems: 'center',
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 18,
    minHeight: 58,
    paddingTop: 10,
  },
  disabledAction: {
    fontSize: 24,
    opacity: 0.35,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 999,
    marginLeft: 'auto',
    minWidth: 88,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  saveButtonDisabled: {
    opacity: 0.35,
  },
  saveButtonPressed: {
    opacity: 0.75,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
