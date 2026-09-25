// expo-file-system's File / Directory / Paths over node:fs, rooted in the test device dir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toPath = (x) => {
  if (x instanceof File || x instanceof Directory) return x.path;
  return x.startsWith('file://') ? fileURLToPath(x) : x;
};

export class Directory {
  constructor(...parts) { this.path = path.join(...parts.map(toPath)); }
  get uri() { return pathToFileURL(this.path).href; }
  get exists() { return fs.existsSync(this.path); }
  create() { fs.mkdirSync(this.path, { recursive: true }); }
}

export class File {
  constructor(...parts) { this.path = path.join(...parts.map(toPath)); }
  get uri() { return pathToFileURL(this.path).href; }
  get exists() { return fs.existsSync(this.path); }
  get size() { return this.exists ? fs.statSync(this.path).size : 0; }
  async bytes() { return new Uint8Array(fs.readFileSync(this.path)); }
  bytesSync() { return new Uint8Array(fs.readFileSync(this.path)); }
  write(content) { fs.writeFileSync(this.path, content); }
  create() { fs.mkdirSync(path.dirname(this.path), { recursive: true }); fs.writeFileSync(this.path, ''); }
  delete() { fs.rmSync(this.path, { force: true }); }
  async copy(dest) { fs.mkdirSync(path.dirname(dest.path), { recursive: true }); fs.copyFileSync(this.path, dest.path); }
}

export const Paths = {
  get document() { const d = new Directory(process.env.NETRASETU_TEST_ROOT, 'documents'); d.create(); return d; },
  get cache() { const d = new Directory(process.env.NETRASETU_TEST_ROOT, 'cache'); d.create(); return d; },
  get availableDiskSpace() { return Number(process.env.NETRASETU_TEST_FREE_BYTES ?? 8 * 1024 ** 3); },
};
