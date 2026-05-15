export function requireNativeModule<T>(name: string): T {
  if (name === 'OrbitICloudBridge') {
    return {
      getContainerStatus: () =>
        Promise.resolve({ available: false, reason: 'native_module_unavailable' }),
      copyToICloud: () => Promise.reject(new Error('icloud.native_module_unavailable')),
      getUploadStatus: (remotePath: string) =>
        Promise.resolve({ exists: false, uploaded: false, uploading: false, remotePath }),
      fileExists: () => Promise.resolve(false),
      readTextFile: () => Promise.resolve(null),
      deleteRemotePath: () => Promise.resolve(),
    } as T;
  }
  return {
    fsync: (path: string) => {
      void path;
      return Promise.resolve();
    },
    appendText: (path: string, text: string) => {
      void path;
      void text;
      return Promise.resolve();
    },
    appGroupContainerPath: (groupId: string) => {
      void groupId;
      return Promise.resolve('/app-group');
    },
  } as T;
}
