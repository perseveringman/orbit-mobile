/**
 * Waveform.tsx — 静态/简动波形条（mock）
 *
 * 真实实现会从 audio buffer 抽 RMS 包络。这里用稳定伪随机生成 + 进度填充。
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
  /** 用于伪随机种子，保证同一条录音波形稳定 */
  seed?: string;
  variant?: 'long' | 'compact';
}

export function Waveform({
  progress = 0,
  active = false,
  bars = 64,
  height = 72,
  seed = 'orbit',
  variant = 'long',
}: WaveformProps): React.ReactElement {
  const heights = useMemo(() => generateBars(seed, bars, active), [seed, bars, active]);
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

function generateBars(seed: string, count: number, active: boolean): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const base = (hash % 1000) / 1000;
    // 让波形中段更高一点，模拟会议/讲话能量
    const env = 0.4 + 0.6 * Math.sin((Math.PI * i) / count);
    let value = 0.25 + base * 0.75 * env;
    if (active && i > count - 8) {
      // 录音中尾部"正在产生"，再放大一点
      value = Math.min(1, value + 0.15);
    }
    out.push(value);
  }
  return out;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 3,
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
