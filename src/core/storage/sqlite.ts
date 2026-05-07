export type SQLiteValue = string | number | null | Uint8Array;

export interface SQLiteRunResultLike {
  changes: number;
  lastInsertRowId: number;
}

export interface SQLiteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SQLiteValue[]): Promise<SQLiteRunResultLike>;
  getFirstAsync<T>(source: string, params?: SQLiteValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SQLiteValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  withExclusiveTransactionAsync?(task: (txn: SQLiteDatabaseLike) => Promise<void>): Promise<void>;
  closeAsync?(): Promise<void>;
}
