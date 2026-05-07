export function requireNativeModule<T>(name: string): T {
  void name;
  return {
    fsync: (path: string) => {
      void path;
      return Promise.resolve();
    },
  } as T;
}
