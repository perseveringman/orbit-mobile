import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'react-native': path.resolve(__dirname, 'tests/setup/react-native-mock.ts'),
      'expo-crypto': path.resolve(__dirname, 'tests/setup/expo-crypto-mock.ts'),
      'expo-file-system/legacy': path.resolve(
        __dirname,
        'tests/setup/expo-file-system-legacy-mock.ts',
      ),
      'expo-modules-core': path.resolve(__dirname, 'tests/setup/expo-modules-core-mock.ts'),
      'expo-secure-store': path.resolve(__dirname, 'tests/setup/expo-secure-store-mock.ts'),
    },
  },
});
