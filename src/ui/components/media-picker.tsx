/**
 * media-picker.tsx — 选图 / 拍照入口
 *
 * 轻触弹 ActionSheet：相册 / 拍照 / 取消。
 */

import { ActionSheetIOS, Platform, Pressable, StyleSheet } from 'react-native';

import { pickImages, takePhoto, type PickedImage } from '../../core/image/picker';
import { ComposerIcon } from './composer-icons';

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
          options: ['从相册多选', '拍照', '取消'],
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
      accessibilityLabel="添加图片"
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={open}
    >
      <ComposerIcon name="image" color="#0f172a" size={23} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
