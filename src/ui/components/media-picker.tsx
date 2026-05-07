/**
 * media-picker.tsx — 选图 / 拍照入口
 *
 * 轻触弹 ActionSheet：相册 / 拍照 / 取消。
 */

import { ActionSheetIOS, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { pickImages, takePhoto, type PickedImage } from '../../core/image/picker';

interface MediaPickerProps {
  disabled?: boolean;
  onPicked: (images: PickedImage[]) => void;
  onError: (error: unknown) => void;
}

export function MediaPicker({ disabled, onPicked, onError }: MediaPickerProps): React.ReactElement {
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

  function open(): void {
    if (disabled) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 2,
          options: ['从相册选择', '拍照', '取消'],
          title: '添加图片',
        },
        (index) => {
          if (index === 0) void run('library');
          if (index === 1) void run('camera');
        },
      );
      return;
    }
    void run('library');
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      onPress={open}
    >
      <Text style={styles.text}>图片</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
