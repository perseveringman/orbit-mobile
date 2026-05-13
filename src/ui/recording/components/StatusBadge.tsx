import { StyleSheet, Text, View } from 'react-native';

import type { RecordingFinalState } from '../../../types/recording';
import { colors, radius } from '../theme';

interface Props {
  state: RecordingFinalState;
  live?: boolean;
}

const LABELS: Record<RecordingFinalState, string> = {
  pending: '待转写',
  running: '转写中',
  done: '已转写',
  failed: '转写失败',
  offline_queued: '离线队列',
};

export function StatusBadge({ state, live = false }: Props): React.ReactElement {
  if (live) {
    return (
      <View style={[styles.wrap, styles.live]}>
        <View style={styles.dotLive} />
        <Text style={[styles.text, styles.textLive]}>录音中</Text>
      </View>
    );
  }

  const tone = toneFor(state);
  return (
    <View style={[styles.wrap, tone.wrap]}>
      <View style={[styles.dot, tone.dot]} />
      <Text style={[styles.text, tone.text]}>{LABELS[state]}</Text>
    </View>
  );
}

function toneFor(state: RecordingFinalState): { wrap: object; dot: object; text: object } {
  switch (state) {
    case 'done':
      return {
        wrap: { backgroundColor: colors.successSoft },
        dot: { backgroundColor: colors.success },
        text: { color: '#15803d' },
      };
    case 'running':
      return {
        wrap: { backgroundColor: colors.accentSoft },
        dot: { backgroundColor: colors.accent },
        text: { color: colors.accent },
      };
    case 'failed':
      return {
        wrap: { backgroundColor: colors.dangerSoft },
        dot: { backgroundColor: colors.danger },
        text: { color: colors.danger },
      };
    case 'offline_queued':
      return {
        wrap: { backgroundColor: colors.warningSoft },
        dot: { backgroundColor: colors.warning },
        text: { color: '#92400e' },
      };
    case 'pending':
    default:
      return {
        wrap: { backgroundColor: colors.bgRaised },
        dot: { backgroundColor: colors.borderStrong },
        text: { color: colors.textSecondary },
      };
  }
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    height: 7,
    width: 7,
    borderRadius: 4,
  },
  dotLive: {
    backgroundColor: colors.recordRed,
    height: 8,
    width: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  live: {
    backgroundColor: colors.dangerSoft,
  },
  textLive: {
    color: colors.danger,
  },
});
