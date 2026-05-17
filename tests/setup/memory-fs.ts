import type { FileInfo, FileSystemAdapter } from '@/utils/fs';

type Entry = { kind: 'file'; contents: string } | { kind: 'dir' };

export class MemoryFileSystem implements FileSystemAdapter {
  readonly documentDirectory = '/documents';

  private readonly entries = new Map<string, Entry>([['/documents', { kind: 'dir' }]]);

  readonly fsynced: string[] = [];

  getInfo(path: string): Promise<FileInfo> {
    const entry = this.entries.get(normalize(path));
    if (!entry) {
      return Promise.resolve({ exists: false });
    }
    return Promise.resolve({
      exists: true,
      isDirectory: entry.kind === 'dir',
      size: entry.kind === 'file' ? entry.contents.length : undefined,
    });
  }

  ensureDir(path: string): Promise<void> {
    const parts = normalize(path).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = `${current}/${part}`;
      this.entries.set(current, { kind: 'dir' });
    }
    return Promise.resolve();
  }

  async writeString(path: string, contents: string): Promise<void> {
    await this.ensureDir(parent(path));
    this.entries.set(normalize(path), { kind: 'file', contents });
  }

  readString(path: string): Promise<string> {
    const entry = this.entries.get(normalize(path));
    if (!entry || entry.kind !== 'file') {
      return Promise.reject(new Error(`memory_fs.not_file:${path}`));
    }
    return Promise.resolve(entry.contents);
  }

  async readBase64(path: string): Promise<string> {
    const contents = await this.readString(path);
    return Buffer.from(contents, 'utf8').toString('base64');
  }

  async copy(from: string, to: string): Promise<void> {
    const entry = this.entries.get(normalize(from));
    if (!entry) {
      throw new Error(`memory_fs.missing:${from}`);
    }
    await this.ensureDir(parent(to));
    if (entry.kind === 'file') {
      this.entries.set(normalize(to), { ...entry });
      return;
    }
    await this.ensureDir(to);
    for (const [path, child] of Array.from(this.entries.entries())) {
      if (path.startsWith(`${normalize(from)}/`)) {
        this.entries.set(path.replace(normalize(from), normalize(to)), { ...child });
      }
    }
  }

  async move(from: string, to: string): Promise<void> {
    await this.copy(from, to);
    await this.delete(from, { idempotent: false });
  }

  delete(path: string, opts: { idempotent?: boolean } = {}): Promise<void> {
    const normalized = normalize(path);
    if (!this.entries.has(normalized) && !opts.idempotent) {
      return Promise.reject(new Error(`memory_fs.missing:${path}`));
    }
    for (const key of Array.from(this.entries.keys())) {
      if (key === normalized || key.startsWith(`${normalized}/`)) {
        this.entries.delete(key);
      }
    }
    return Promise.resolve();
  }

  readDir(path: string): Promise<string[]> {
    const normalized = normalize(path);
    const entry = this.entries.get(normalized);
    if (!entry || entry.kind !== 'dir') {
      return Promise.reject(new Error(`memory_fs.not_dir:${path}`));
    }
    const prefix = `${normalized}/`;
    const children = new Set<string>();
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        const child = key.slice(prefix.length).split('/')[0];
        if (child) {
          children.add(child);
        }
      }
    }
    return Promise.resolve(Array.from(children).sort());
  }

  fsync(path: string): Promise<void> {
    this.fsynced.push(normalize(path));
    return Promise.resolve();
  }
}

function normalize(path: string): string {
  const prefixed = path.startsWith('/') ? path : `/${path}`;
  return prefixed.replace(/\/+$/g, '') || '/';
}

function parent(path: string): string {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '/' : normalized.slice(0, index);
}
