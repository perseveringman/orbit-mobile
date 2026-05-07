export const NativeModules = {
  OrbitDurableFS: {
    fsync: (path: string) => {
      void path;
      return Promise.resolve();
    },
  },
};

export const Platform = {
  OS: 'ios',
  select: <T>(options: { ios?: T; default?: T }) => options.ios ?? options.default,
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  hairlineWidth: 1,
};

export const Text = 'Text';
export const View = 'View';
export const Pressable = 'Pressable';
export const TextInput = 'TextInput';
export const ActivityIndicator = 'ActivityIndicator';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const ScrollView = 'ScrollView';
export const FlatList = 'FlatList';
