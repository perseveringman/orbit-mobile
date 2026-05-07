/**
 * picker.ts — 选图 / 拍照
 *
 * expo-image-picker + expo-camera。返回原始文件 URI，
 * 压缩由 compressor.ts 单独处理（关注点分离）。
 *
 * @see docs/ARCHITECTURE.md §8
 *
 */

export {
  pickImages as pickFromLibrary,
  takePhoto,
  type PickedImage,
} from '../image/picker';
