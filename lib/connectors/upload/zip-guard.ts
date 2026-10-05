import { inflateRawSync } from 'node:zlib';

/**
 * Decompression-bomb guard for .xlsx uploads. Reads the ZIP central directory with plain Buffer code, enforces
 * entry-count, per-entry and total uncompressed-size and compression-ratio ceilings BEFORE any spreadsheet library
 * touches the bytes, then inflates each entry with an output cap equal to its declared size so a central directory
 * that understates the real size cannot slip past (the inflate throws instead of allocating).
 */
export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxRatio: number;
  /** the ratio test only applies to entries at least this large; tiny repetitive XML is legitimate and harmless */
  ratioFloorBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 2000,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxRatio: 200,
  ratioFloorBytes: 64 * 1024,
};

export class ZipBombError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipBombError';
  }
}

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function assertSafeZip(buf: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): void {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipBombError('zip end-of-directory record not found');
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === EOCD64_LOCATOR_SIG) throw new ZipBombError('zip64 archives are not accepted');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipBombError('zip64 archives are not accepted');
  if (count > limits.maxEntries) throw new ZipBombError(`archive has more than ${limits.maxEntries} entries`);
  if (cdOffset + cdSize > eocd) throw new ZipBombError('zip central directory is out of bounds');

  let p = cdOffset;
  let total = 0;
  const entries: { method: number; csize: number; usize: number; local: number }[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_SIG) throw new ZipBombError('zip central directory is malformed');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) throw new ZipBombError('zip64 entry sizes cannot be bounded');
    if (usize > limits.maxEntryBytes) throw new ZipBombError('an archive entry is larger than the allowed size when unpacked');
    total += usize;
    if (total > limits.maxTotalBytes) throw new ZipBombError('archive is larger than the allowed size when unpacked');
    if (usize >= limits.ratioFloorBytes && usize / Math.max(csize, 1) > limits.maxRatio) throw new ZipBombError('an archive entry has a suspicious compression ratio');
    if (method !== 0 && method !== 8) throw new ZipBombError('archive uses an unsupported compression method');
    entries.push({ method, csize, usize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p > cdOffset + cdSize) throw new ZipBombError('zip central directory is malformed');

  // Verify the declared sizes are true: inflate with a hard output cap and compare.
  for (const e of entries) {
    if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== LOCAL_SIG) throw new ZipBombError('zip entry header is malformed');
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    if (start + e.csize > buf.length) throw new ZipBombError('zip entry is truncated');
    const data = buf.subarray(start, start + e.csize);
    if (e.method === 0) {
      if (e.csize !== e.usize) throw new ZipBombError('zip entry sizes are inconsistent');
      continue;
    }
    try {
      const out = inflateRawSync(data, { maxOutputLength: Math.max(e.usize, 1) });
      if (out.length !== e.usize) throw new ZipBombError('zip entry size does not match its header');
    } catch (err) {
      if (err instanceof ZipBombError) throw err;
      throw new ZipBombError('zip entry is corrupt or larger than its header declares');
    }
  }
}
