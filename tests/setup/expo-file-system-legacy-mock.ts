export const documentDirectory = '/documents/';

export enum EncodingType {
  UTF8 = 'utf8',
  Base64 = 'base64',
}

export function getInfoAsync(path: string): Promise<{ exists: boolean }> {
  void path;
  return Promise.resolve({ exists: false });
}

export function makeDirectoryAsync(): Promise<void> {
  return Promise.resolve();
}

export function writeAsStringAsync(): Promise<void> {
  return Promise.resolve();
}

export function readAsStringAsync(): Promise<string> {
  return Promise.resolve('');
}

export function copyAsync(): Promise<void> {
  return Promise.resolve();
}

export function moveAsync(): Promise<void> {
  return Promise.resolve();
}

export function deleteAsync(): Promise<void> {
  return Promise.resolve();
}

export function readDirectoryAsync(): Promise<string[]> {
  return Promise.resolve([]);
}
