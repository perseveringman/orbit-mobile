import { StyleSheet, Text, View } from 'react-native';

type ComposerIconName = 'hash' | 'image' | 'keyboard' | 'mic' | 'recording' | 'send' | 'x';

interface ComposerIconProps {
  name: ComposerIconName;
  color?: string;
  size?: number;
}

export function ComposerIcon({
  name,
  color = '#0f172a',
  size = 24,
}: ComposerIconProps): React.ReactElement {
  switch (name) {
    case 'hash':
      return (
        <Text style={[styles.hash, { color, fontSize: size * 0.9, lineHeight: size }]}>#</Text>
      );
    case 'image':
      return (
        <View style={[styles.box, { borderColor: color, height: size * 0.78, width: size }]}>
          <View
            style={[
              styles.imageDot,
              {
                backgroundColor: color,
                height: size * 0.16,
                right: size * 0.18,
                top: size * 0.14,
                width: size * 0.16,
              },
            ]}
          />
          <View
            style={[
              styles.imageSlope,
              {
                borderColor: color,
                height: size * 0.32,
                left: size * 0.14,
                width: size * 0.5,
              },
            ]}
          />
        </View>
      );
    case 'keyboard':
      return (
        <View style={{ height: size, width: size }}>
          <View
            style={[
              styles.chevron,
              {
                borderColor: color,
                height: size * 0.34,
                left: size * 0.26,
                top: size * 0.26,
                width: size * 0.34,
              },
            ]}
          />
        </View>
      );
    case 'mic':
      return (
        <View style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}>
          <View
            style={[
              styles.micCapsule,
              {
                borderColor: color,
                borderRadius: size * 0.2,
                height: size * 0.6,
                width: size * 0.34,
              },
            ]}
          />
          <View
            style={[
              styles.micStem,
              {
                backgroundColor: color,
                height: size * 0.24,
                top: size * 0.66,
                width: Math.max(2, size * 0.08),
              },
            ]}
          />
          <View
            style={[
              styles.micBase,
              {
                backgroundColor: color,
                top: size * 0.88,
                width: size * 0.44,
              },
            ]}
          />
        </View>
      );
    case 'recording':
      return (
        <View
          style={[
            styles.recordingRing,
            {
              borderColor: color,
              borderRadius: size * 0.42,
              height: size * 0.84,
              width: size * 0.84,
            },
          ]}
        >
          <View
            style={[
              styles.recordingDot,
              {
                backgroundColor: color,
                borderRadius: size * 0.18,
                height: size * 0.36,
                width: size * 0.36,
              },
            ]}
          />
        </View>
      );
    case 'send':
      return (
        <View style={{ height: size, width: size }}>
          <View
            style={[
              styles.sendLine,
              {
                backgroundColor: color,
                height: Math.max(2, size * 0.1),
                left: size * 0.18,
                top: size * 0.45,
                width: size * 0.56,
              },
            ]}
          />
          <View
            style={[
              styles.sendHead,
              {
                borderColor: color,
                height: size * 0.34,
                right: size * 0.18,
                top: size * 0.32,
                width: size * 0.34,
              },
            ]}
          />
        </View>
      );
    case 'x':
      return (
        <View style={{ height: size, width: size }}>
          <View
            style={[
              styles.xLine,
              {
                backgroundColor: color,
                left: size * 0.18,
                top: size * 0.47,
                width: size * 0.64,
              },
            ]}
          />
          <View
            style={[
              styles.xLine,
              styles.xLineReverse,
              {
                backgroundColor: color,
                left: size * 0.18,
                top: size * 0.47,
                width: size * 0.64,
              },
            ]}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 5,
    borderWidth: 2,
  },
  chevron: {
    borderBottomWidth: 2,
    borderRightWidth: 2,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  hash: {
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  imageDot: {
    borderRadius: 999,
    position: 'absolute',
  },
  imageSlope: {
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    bottom: 3,
    position: 'absolute',
    transform: [{ rotate: '-18deg' }],
  },
  micBase: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
  },
  micCapsule: {
    borderWidth: 2,
  },
  micStem: {
    borderRadius: 999,
    position: 'absolute',
  },
  recordingDot: {},
  recordingRing: {
    alignItems: 'center',
    borderWidth: 2,
    justifyContent: 'center',
  },
  sendHead: {
    borderRightWidth: 3,
    borderTopWidth: 3,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  sendLine: {
    borderRadius: 999,
    position: 'absolute',
  },
  xLine: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  xLineReverse: {
    transform: [{ rotate: '-45deg' }],
  },
});
