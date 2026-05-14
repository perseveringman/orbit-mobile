/**
 * Waveform.tsx — 轻量波形条
 *
 * 使用录音时从麦克风 buffer 抽出的 RMS 包络渲染。
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';

interface WaveformProps {
  /** 0..1，进度比例 */
  progress?: number;
  /** 录音中波形会更"活泼" */
  active?: boolean;
  /** 自定义条数 */
  bars?: number;
  /** 高度（控件外框） */
  height?: number;
  /** 真实 RMS/peak 包络，取值 0..1 */
  samples?: number[];
  /** @deprecated 旧调用保留兼容；不再用于生成假波形 */
  seed?: string;
  variant?: 'long' | 'compact';
}

export function Waveform({
  progress = 0,
  active = false,
  bars = 64,
  height = 72,
  samples = [],
  variant = 'long',
}: WaveformProps): React.ReactElement {
  const heights = useMemo(() => sampleBars(samples, bars), [samples, bars]);
  const filledIndex = Math.round(progress * (bars - 1));

  return (
    <View
      style={[
        styles.wrap,
        { height },
        variant === 'compact' ? styles.compact : null,
      ]}
    >
      {heights.map((h, idx) => {
        const filled = idx <= filledIndex;
        return (
          <View
            key={idx}
            style={[
              styles.bar,
              {
                height: Math.max(4, h * (height - 12)),
                backgroundColor: filled
                  ? colors.accent
                  : active
                    ? colors.recordRed
                    : colors.borderStrong,
                opacity: active && !filled ? 0.55 + 0.35 * h : filled ? 1 : 0.7,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function sampleBars(samples: number[], count: number): number[] {
  if (samples.length === 0) {
    return Array.from({ length: count }, () => 0.04);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * samples.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / count));
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      peak = Math.max(peak, normalizeSample(samples[j] ?? 0));
    }
    out.push(Math.max(0.04, Math.min(1, peak)));
  }
  return out;
}

function normalizeSample(sample: number): number {
  if (!Number.isFinite(sample)) return 0;
  return Math.max(0, Math.min(1, sample));
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  compact: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  bar: {
    borderRadius: 2,
    width: 3,
  },
});
