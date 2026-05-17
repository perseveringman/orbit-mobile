import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  clearDeepSeekApiKey,
  clearVolcengineAsrCredentials,
  getDeepSeekApiKey,
  getVolcengineAsrCredentials,
  setDeepSeekApiKey,
  setVolcengineAsrApiKey,
} from '../../core/ai/api-key';
import { DeepSeekClient } from '../../core/ai/deepseek-client';
import { runReconcile } from '../../core/reconcile/reconcile-job';
import {
  loadAppSettings,
  setAiAutoGenerate,
  setAiBaseUrl,
  setAiEnabled,
  setAiModel,
  setImageOriginalPolicy,
  setVolcengineAsrAutoImported,
  setVolcengineAsrBaseUrl,
  setVolcengineAsrBoostingTableId,
  setVolcengineAsrEnabled,
  setVolcengineAsrResourceId,
  setVolcengineAsrUid,
  type AppSettings,
  type ImageOriginalPolicy,
} from '../../core/settings/app-settings';
import * as capturesRepo from '../../core/storage/captures-repo';
import { openDb } from '../../core/storage/db';
import { runSyncTick } from '../../core/sync/worker';
import * as iCloudBridge from '../../native/icloud-bridge';
import type { SyncStatusCounts } from '../../types/sync';
import { returnTo } from '../navigation/back';

const IMAGE_POLICIES: Array<{
  value: ImageOriginalPolicy;
  label: string;
  description: string;
}> = [
  {
    value: 'compressed_only',
    label: '总是压缩',
    description: '只保存压缩图，适合快速同步和节省空间。',
  },
  {
    value: 'wifi_original',
    label: '仅 Wi-Fi 原图',
    description: '本地保留原图并标记 Wi-Fi 优先；iCloud 蜂窝策略由系统控制。',
  },
  {
    value: 'always_original',
    label: '总是原图',
    description: '压缩图加原图都进入本地 Capture，最大程度无损。',
  },
];

export function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [counts, setCounts] = useState<SyncStatusCounts | null>(null);
  const [iCloud, setICloud] = useState<iCloudBridge.ICloudContainerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAiKey, setHasAiKey] = useState(false);
  const [hasAsrKey, setHasAsrKey] = useState(false);
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [asrKeyInput, setAsrKeyInput] = useState('');

  const refresh = useCallback(async () => {
    const db = await openDb();
    const [nextSettings, nextCounts, nextCloud, key, asrKey] = await Promise.all([
      loadAppSettings(db),
      capturesRepo.countByState(db),
      iCloudBridge.getContainerStatus(),
      getDeepSeekApiKey(),
      getVolcengineAsrCredentials(),
    ]);
    setSettings(nextSettings);
    setCounts(nextCounts);
    setICloud(nextCloud);
    setHasAiKey(key !== null);
    setHasAsrKey(asrKey !== null);
  }, []);

  useEffect(() => {
    refresh().catch((loadError: unknown) => setError(errorMessage(loadError)));
  }, [refresh]);

  async function runAction(action: 'sync' | 'reconcile'): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const db = await openDb();
      if (action === 'reconcile') {
        const result = await runReconcile({ db });
        setMessage(`自愈完成：${result.sqliteBackfilled} 条补齐，${result.deadLettered} 条隔离`);
      } else {
        const result = await runSyncTick({ db, batchSize: 10 });
        setMessage(`同步完成：处理 ${result.processed} 条`);
      }
      await refresh();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function updateImagePolicy(policy: ImageOriginalPolicy): Promise<void> {
    if (!settings) return;
    const previous = settings;
    const next = {
      ...settings,
      keepImageOriginal: policy !== 'compressed_only',
      imageOriginalPolicy: policy,
    };
    setSettings(next);
    try {
      await setImageOriginalPolicy(await openDb(), policy);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSettings(previous);
    }
  }

  async function updateAiSetting(action: 'enabled' | 'auto', value: boolean): Promise<void> {
    if (!settings) return;
    const previous = settings;
    const next = {
      ...settings,
      ai: {
        ...settings.ai,
        [action === 'enabled' ? 'enabled' : 'autoGenerate']: value,
      },
    };
    setSettings(next);
    try {
      const db = await openDb();
      if (action === 'enabled') {
        await setAiEnabled(db, value);
      } else {
        await setAiAutoGenerate(db, value);
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSettings(previous);
    }
  }

  async function updateAsrSetting(action: 'enabled' | 'autoImported', value: boolean): Promise<void> {
    if (!settings) return;
    const previous = settings;
    const next = {
      ...settings,
      volcengineAsr: {
        ...settings.volcengineAsr,
        [action === 'enabled' ? 'enabled' : 'autoTranscribeImported']: value,
      },
    };
    setSettings(next);
    try {
      const db = await openDb();
      if (action === 'enabled') {
        await setVolcengineAsrEnabled(db, value);
      } else {
        await setVolcengineAsrAutoImported(db, value);
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSettings(previous);
    }
  }

  async function saveAiConfig(): Promise<void> {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDb();
      if (aiKeyInput.trim()) {
        await setDeepSeekApiKey(aiKeyInput);
        setAiKeyInput('');
      }
      await setAiModel(db, settings.ai.model);
      await setAiBaseUrl(db, settings.ai.baseUrl);
      await refresh();
      setMessage('DeepSeek 设置已保存');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function removeAiKey(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await clearDeepSeekApiKey();
      setAiKeyInput('');
      await refresh();
      setMessage('DeepSeek Key 已清除');
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusy(false);
    }
  }

  async function saveAsrConfig(): Promise<void> {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDb();
      if (asrKeyInput.trim()) {
        await setVolcengineAsrApiKey(asrKeyInput);
        setAsrKeyInput('');
      }
      await setVolcengineAsrBaseUrl(db, settings.volcengineAsr.baseUrl);
      await setVolcengineAsrResourceId(db, settings.volcengineAsr.resourceId);
      await setVolcengineAsrUid(db, settings.volcengineAsr.uid);
      await setVolcengineAsrBoostingTableId(db, settings.volcengineAsr.boostingTableId);
      await refresh();
      setMessage('火山语音识别设置已保存');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function removeAsrKey(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await clearVolcengineAsrCredentials();
      setAsrKeyInput('');
      await refresh();
      setMessage('火山语音识别 Key 已清除');
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusy(false);
    }
  }

  async function testAiConnection(): Promise<void> {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const key = aiKeyInput.trim() || (await getDeepSeekApiKey());
      if (!key) {
        throw new Error('请先输入或保存 DeepSeek API Key');
      }
      const text = await new DeepSeekClient(settings.ai, key).chatText(
        [
          { role: 'system', content: '你是连接测试助手，只回复 OK。' },
          { role: 'user', content: 'Reply OK only.' },
        ],
        { temperature: 0 },
      );
      setMessage(`DeepSeek 连接正常：${text.slice(0, 40)}`);
    } catch (testError) {
      setError(errorMessage(testError));
    } finally {
      setBusy(false);
    }
  }

  if (!settings || !counts || !iCloud) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={() => returnTo(router, '/')}
        style={styles.backButton}
      >
        <Text style={styles.back}>返回</Text>
      </Pressable>
      <Text style={styles.title}>设置</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>图片</Text>
        <View style={styles.policyGroup}>
          {IMAGE_POLICIES.map((policy) => {
            const active = settings.imageOriginalPolicy === policy.value;
            return (
              <Pressable
                key={policy.value}
                accessibilityRole="button"
                onPress={() => {
                  void updateImagePolicy(policy.value);
                }}
                style={({ pressed }) => [
                  styles.policyOption,
                  active && styles.policyOptionActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.policyTitle, active && styles.policyTitleActive]}>
                  {policy.label}
                </Text>
                <Text style={styles.policyBody}>{policy.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>DeepSeek V4 Flash</Text>
            <Text style={styles.rowSub}>
              Key 保存在 iOS Keychain；录音 AI 笔记只发送转写文本，不上传原始音频。
            </Text>
            <Text style={styles.statusLine}>Key：{hasAiKey ? '已保存' : '未配置'}</Text>
          </View>
          <Switch
            value={settings.ai.enabled}
            onValueChange={(value) => {
              void updateAiSetting('enabled', value);
            }}
          />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>保存录音后自动生成</Text>
            <Text style={styles.rowSub}>AI 失败不会影响本地保存，可在录音笔记页重试。</Text>
          </View>
          <Switch
            value={settings.ai.autoGenerate}
            onValueChange={(value) => {
              void updateAiSetting('auto', value);
            }}
          />
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={hasAiKey ? '输入新 Key 可替换现有 Key' : 'DeepSeek API Key'}
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={aiKeyInput}
          onChangeText={setAiKeyInput}
          style={styles.input}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={settings.ai.baseUrl}
          onChangeText={(baseUrl) => setSettings({ ...settings, ai: { ...settings.ai, baseUrl } })}
          style={styles.input}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={settings.ai.model}
          onChangeText={(model) => setSettings({ ...settings, ai: { ...settings.ai, model } })}
          style={styles.input}
        />
        <View style={styles.buttonRow}>
          <ActionButton disabled={busy} label="保存 AI 设置" onPress={() => void saveAiConfig()} />
          <ActionButton disabled={busy} label="测试连接" onPress={() => void testAiConnection()} />
          <ActionButton
            disabled={busy || !hasAiKey}
            label="清除 Key"
            onPress={() => void removeAiKey()}
          />
        </View>
        <View style={styles.hotwordRow}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>热词列表</Text>
            <Text style={styles.rowSub}>
              当前 {settings.aiHotwords.length} 个，会在录音转写校对时提供给 AI。
            </Text>
          </View>
          <ActionButton
            disabled={busy}
            label="编辑"
            onPress={() => router.push('/hotwords')}
          />
        </View>
        <View style={styles.hotwordRow}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>火山引擎语音识别</Text>
            <Text style={styles.rowSub}>
              导入音频、语音备忘录分享和 X1 离线文件会先保存到本机，再上传音频副本识别。
            </Text>
            <Text style={styles.statusLine}>Key：{hasAsrKey ? '已保存' : '未配置'}</Text>
          </View>
          <Switch
            value={settings.volcengineAsr.enabled}
            onValueChange={(value) => {
              void updateAsrSetting('enabled', value);
            }}
          />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>导入后自动识别</Text>
            <Text style={styles.rowSub}>识别失败只影响转写状态，不影响原始录音和同步。</Text>
          </View>
          <Switch
            value={settings.volcengineAsr.autoTranscribeImported}
            onValueChange={(value) => {
              void updateAsrSetting('autoImported', value);
            }}
          />
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={hasAsrKey ? '输入新的 X-Api-Key 可替换现有 Key' : '火山 X-Api-Key'}
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={asrKeyInput}
          onChangeText={setAsrKeyInput}
          style={styles.input}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={settings.volcengineAsr.baseUrl}
          onChangeText={(baseUrl) => setSettings({
            ...settings,
            volcengineAsr: { ...settings.volcengineAsr, baseUrl },
          })}
          style={styles.input}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={settings.volcengineAsr.resourceId}
          onChangeText={(resourceId) => setSettings({
            ...settings,
            volcengineAsr: { ...settings.volcengineAsr, resourceId },
          })}
          style={styles.input}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="热词表 ID（可选，boosting_table_id）"
          placeholderTextColor="#94a3b8"
          value={settings.volcengineAsr.boostingTableId}
          onChangeText={(boostingTableId) => setSettings({
            ...settings,
            volcengineAsr: { ...settings.volcengineAsr, boostingTableId },
          })}
          style={styles.input}
        />
        <View style={styles.buttonRow}>
          <ActionButton disabled={busy} label="保存语音识别" onPress={() => void saveAsrConfig()} />
          <ActionButton
            disabled={busy || !hasAsrKey}
            label="清除语音 Key"
            onPress={() => void removeAsrKey()}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>同步</Text>
        <Text style={styles.statusLine}>
          iCloud：{iCloud.available ? '可用' : (iCloud.reason ?? '不可用')}
        </Text>
        <Text style={styles.statusLine}>
          本地 {counts.pending} · 同步中 {counts.syncing} · 已上传 {counts.uploaded} · 已接收{' '}
          {counts.acked} · 失败 {counts.failed} · 冲突 {counts.conflicted}
        </Text>
        <View style={styles.buttonRow}>
          <ActionButton
            disabled={busy}
            label="立即同步"
            onPress={() => {
              void runAction('sync');
            }}
          />
          <ActionButton
            disabled={busy}
            label="运行自愈"
            onPress={() => {
              void runAction('reconcile');
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
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
  section: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18,
  },
  sectionTitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  rowSub: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  statusLine: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  policyGroup: {
    gap: 10,
  },
  policyOption: {
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  policyOptionActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  policyTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  policyTitleActive: {
    color: '#1d4ed8',
  },
  policyBody: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  input: {
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#0f172a',
    fontSize: 13,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  hotwordRow: {
    alignItems: 'center',
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
