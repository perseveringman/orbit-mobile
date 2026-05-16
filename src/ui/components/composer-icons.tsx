import { StyleSheet, Text, View } from 'react-native';

export type ComposerIconName =
  | 'bold'
  | 'checklist'
  | 'codeBlock'
  | 'file'
  | 'hash'
  | 'heading'
  | 'highlight'
  | 'image'
  | 'italic'
  | 'keyboard'
  | 'keyboardHide'
  | 'mic'
  | 'orderedList'
  | 'quote'
  | 'recording'
  | 'redo'
  | 'send'
  | 'strikethrough'
  | 'tag'
  | 'undo'
  | 'unorderedList'
  | 'x';

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
    case 'bold':
      return <Text style={[styles.letterIcon, styles.boldIcon, { color, fontSize: size * 0.9, lineHeight: size }]}>B</Text>;
    case 'checklist':
      return (
        <View style={{ height: size, width: size }}>
          <View style={[styles.todoBox, { borderColor: color, height: size * 0.5, left: size * 0.14, top: size * 0.22, width: size * 0.5 }]} />
          <View style={[styles.todoCheckA, { backgroundColor: color, left: size * 0.27, top: size * 0.45, width: size * 0.18 }]} />
          <View style={[styles.todoCheckB, { backgroundColor: color, left: size * 0.39, top: size * 0.39, width: size * 0.34 }]} />
        </View>
      );
    case 'codeBlock':
      return <Text style={[styles.codeIcon, { color, fontSize: size * 0.56, lineHeight: size }]}>{'</>'}</Text>;
    case 'file':
      return (
        <View style={{ height: size, width: size }}>
          <View
            style={[
              styles.filePage,
              {
                borderColor: color,
                borderRadius: size * 0.08,
                height: size * 0.78,
                left: size * 0.2,
                top: size * 0.1,
                width: size * 0.58,
              },
            ]}
          />
          <View
            style={[
              styles.fileFold,
              {
                borderColor: color,
                height: size * 0.24,
                right: size * 0.21,
                top: size * 0.1,
                width: size * 0.24,
              },
            ]}
          />
          <View
            style={[
              styles.fileLine,
              {
                backgroundColor: color,
                top: size * 0.48,
                width: size * 0.3,
              },
            ]}
          />
          <View
            style={[
              styles.fileLine,
              {
                backgroundColor: color,
                top: size * 0.62,
                width: size * 0.24,
              },
            ]}
          />
        </View>
      );
    case 'hash':
      return (
        <Text style={[styles.hash, { color, fontSize: size * 0.9, lineHeight: size }]}>#</Text>
      );
    case 'heading':
      return <Text style={[styles.letterIcon, { color, fontSize: size * 0.88, lineHeight: size }]}>H</Text>;
    case 'highlight':
      return (
        <View style={{ height: size, width: size }}>
          <View
            style={[
              styles.markerTip,
              {
                borderColor: color,
                height: size * 0.42,
                left: size * 0.25,
                top: size * 0.22,
                width: size * 0.52,
              },
            ]}
          />
          <View
            style={[
              styles.markerLine,
              {
                backgroundColor: color,
                left: size * 0.18,
                top: size * 0.72,
                width: size * 0.58,
              },
            ]}
          />
        </View>
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
    case 'keyboardHide':
      return (
        <View style={{ height: size, width: size }}>
          {name === 'keyboardHide' ? (
            <View
              style={[
                styles.keyboardFrame,
                {
                  borderColor: color,
                  borderRadius: size * 0.08,
                  height: size * 0.48,
                  left: size * 0.12,
                  top: size * 0.1,
                  width: size * 0.76,
                },
              ]}
            >
              {Array.from({ length: 9 }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.keyboardDot,
                    {
                      backgroundColor: color,
                      left: `${18 + ((index % 3) * 26)}%`,
                      top: `${24 + (Math.floor(index / 3) * 25)}%`,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
          <View
            style={[
              styles.chevron,
              {
                borderColor: color,
                height: size * 0.28,
                left: size * 0.26,
                top: name === 'keyboardHide' ? size * 0.66 : size * 0.26,
                width: size * 0.28,
              },
            ]}
          />
        </View>
      );
    case 'italic':
      return <Text style={[styles.letterIcon, styles.italicIcon, { color, fontSize: size * 0.9, lineHeight: size }]}>I</Text>;
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
    case 'orderedList':
      return <ListIcon color={color} ordered size={size} />;
    case 'quote':
      return <Text style={[styles.quoteIcon, { color, fontSize: size, lineHeight: size }]}>{'”'}</Text>;
    case 'redo':
      return <Text style={[styles.arrowIcon, { color, fontSize: size * 1.12, lineHeight: size }]}>↷</Text>;
    case 'strikethrough':
      return (
        <View style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}>
          <Text style={[styles.letterIcon, { color, fontSize: size * 0.78, lineHeight: size }]}>S</Text>
          <View style={[styles.strikeLine, { backgroundColor: color, width: size * 0.7 }]} />
        </View>
      );
    case 'tag':
      return (
        <View style={{ height: size, width: size }}>
          <View
            style={[
              styles.tagBody,
              {
                borderColor: color,
                borderRadius: size * 0.08,
                height: size * 0.54,
                left: size * 0.2,
                top: size * 0.23,
                width: size * 0.58,
              },
            ]}
          >
            <View style={[styles.tagHole, { borderColor: color, height: size * 0.12, width: size * 0.12 }]} />
          </View>
        </View>
      );
    case 'undo':
      return <Text style={[styles.arrowIcon, { color, fontSize: size * 1.12, lineHeight: size }]}>↶</Text>;
    case 'unorderedList':
      return <ListIcon color={color} size={size} />;
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

function ListIcon({
  color,
  ordered = false,
  size,
}: {
  color: string;
  ordered?: boolean;
  size: number;
}): React.ReactElement {
  return (
    <View style={{ height: size, width: size }}>
      {[0, 1, 2].map((row) => (
        <View key={row}>
          {ordered ? (
            <Text
              style={[
                styles.listNumber,
                {
                  color,
                  fontSize: size * 0.22,
                  left: size * 0.08,
                  top: size * (0.15 + row * 0.25),
                },
              ]}
            >
              {row + 1}
            </Text>
          ) : (
            <View
              style={[
                styles.listBullet,
                {
                  backgroundColor: color,
                  left: size * 0.14,
                  top: size * (0.25 + row * 0.25),
                },
              ]}
            />
          )}
          <View
            style={[
              styles.listLine,
              {
                backgroundColor: color,
                left: size * 0.36,
                top: size * (0.27 + row * 0.25),
                width: size * 0.5,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  arrowIcon: {
    fontWeight: '500',
    includeFontPadding: false,
    textAlign: 'center',
  },
  box: {
    borderRadius: 5,
    borderWidth: 2,
  },
  boldIcon: {
    fontWeight: '900',
  },
  chevron: {
    borderBottomWidth: 2,
    borderRightWidth: 2,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  fileFold: {
    borderRightWidth: 2,
    borderTopWidth: 2,
    position: 'absolute',
  },
  fileLine: {
    borderRadius: 999,
    height: 2,
    left: '34%',
    position: 'absolute',
  },
  filePage: {
    borderWidth: 2,
    position: 'absolute',
  },
  codeIcon: {
    fontFamily: 'Menlo',
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  hash: {
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  italicIcon: {
    fontStyle: 'italic',
    fontWeight: '800',
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
  keyboardDot: {
    borderRadius: 999,
    height: 2.5,
    position: 'absolute',
    width: 2.5,
  },
  keyboardFrame: {
    borderWidth: 2,
    position: 'absolute',
  },
  letterIcon: {
    fontFamily: 'Menlo',
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  listBullet: {
    borderRadius: 999,
    height: 3,
    position: 'absolute',
    width: 3,
  },
  listLine: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
  },
  listNumber: {
    fontFamily: 'Menlo',
    fontWeight: '900',
    includeFontPadding: false,
    position: 'absolute',
  },
  markerLine: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
  },
  markerTip: {
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    position: 'absolute',
    transform: [{ rotate: '-38deg' }],
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
  quoteIcon: {
    fontFamily: 'Menlo',
    fontWeight: '900',
    includeFontPadding: false,
    textAlign: 'center',
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
  strikeLine: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
  },
  tagBody: {
    borderWidth: 2,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  tagHole: {
    borderRadius: 999,
    borderWidth: 2,
    left: '18%',
    position: 'absolute',
    top: '18%',
  },
  todoBox: {
    borderRadius: 4,
    borderWidth: 2,
    position: 'absolute',
  },
  todoCheckA: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  todoCheckB: {
    borderRadius: 999,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
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
