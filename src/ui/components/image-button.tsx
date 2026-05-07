import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pickImages, takePhoto, type PickedImage } from '../../core/image/picker';

interface ImageButtonProps {
  disabled?: boolean;
  onPicked: (images: PickedImage[]) => void;
  onError: (error: unknown) => void;
}

export function ImageButton({ disabled, onPicked, onError }: ImageButtonProps): React.ReactElement {
  async function run(action: 'library' | 'camera'): Promise<void> {
    if (disabled) return;
    try {
      if (action === 'camera') {
        const image = await takePhoto();
        if (image) onPicked([image]);
        return;
      }
      onPicked(await pickImages());
    } catch (error) {
      onError(error);
    }
  }

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        style={[styles.button, disabled && styles.disabled]}
        onPress={() => {
          void run('library');
        }}
      >
        <Text style={styles.text}>图片</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        style={[styles.button, disabled && styles.disabled]}
        onPress={() => {
          void run('camera');
        }}
      >
        <Text style={styles.text}>拍照</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    borderColor: '#cbd5e1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  disabled: {
    opacity: 0.35,
  },
  text: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
});
