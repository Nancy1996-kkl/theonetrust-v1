import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentFileType } from '@theonetrust/contracts';

/** Private file storage for transparency documents (#36). Keys are generated, never user input. */
export interface DocumentStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const KEY = /^[0-9a-f-]{36}\.(pdf|png|jpg)$/;

/** A folder outside the web root. Keys are checked so a path can never escape it. */
export function localDocumentStore(dir: string): DocumentStore {
  const file = (key: string) => {
    if (!KEY.test(key)) throw new Error('Invalid document key');
    return path.join(dir, key);
  };
  return {
    async put(key, data) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(file(key), data, { mode: 0o600, flag: 'wx' });
    },
    async get(key) {
      try {
        return await readFile(file(key));
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return null;
        throw error;
      }
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
  };
}

const EXTENSIONS: Record<DocumentFileType, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};
const NAME_EXTENSIONS: Record<DocumentFileType, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
};

/** The file's real type from its first bytes. Anything not on the allowlist is null. */
export function sniffType(data: Buffer): DocumentFileType | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  return null;
}

export type UploadProblem = 'empty' | 'too_large' | 'type_not_allowed' | 'type_mismatch';

/**
 * Server-side check of an upload: size, real type (magic bytes) and that the declared type and
 * file-name extension both agree with it. A renamed executable fails all three.
 */
export function checkUpload(
  data: Buffer,
  declared: DocumentFileType,
  fileName: string,
  maxBytes: number,
):
  | { ok: true; type: DocumentFileType; key: string; sha256: string }
  | { ok: false; problem: UploadProblem } {
  if (data.length === 0) return { ok: false, problem: 'empty' };
  if (data.length > maxBytes) return { ok: false, problem: 'too_large' };
  const real = sniffType(data);
  if (!real) return { ok: false, problem: 'type_not_allowed' };
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (real !== declared || !NAME_EXTENSIONS[real].includes(ext)) {
    return { ok: false, problem: 'type_mismatch' };
  }
  return {
    ok: true,
    type: real,
    key: `${randomUUID()}.${EXTENSIONS[real]}`,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
