import { StyleSheet, Text, View } from 'react-native';

import type { RecordingSpeaker } from '../../../types/recording';
import { colors } from '../theme';

interface Props {
  speaker: RecordingSpeaker;
  size?: number;
}

export function SpeakerAvatar({ speaker, size = 32 }: Props): React.ReactElement {
  const initials = speaker.label
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((segment) => segment[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: speaker.color,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: size <= 28 ? 11 : 13 },
        ]}
      >
        {initials || '·'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.bg,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
