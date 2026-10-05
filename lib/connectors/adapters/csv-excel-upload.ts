import type { Adapter, PulledRecord } from '../types.ts';
import type { IngestRow } from '../upload/map.ts';

export interface UploadBatch {
  /** monotonic id of an accepted, mapped upload (e.g. the upload_mappings row id) */
  id: string;
  rows: IngestRow[];
}

export interface UploadSource {
  /** accepted batches for this tenant and target object, in order, strictly after `afterBatchId` */
  listBatches(object: string, afterBatchId: string | null): Promise<UploadBatch[]>;
}

export const toPulled = (rows: IngestRow[]): PulledRecord[] => rows.map((r) => ({ source_ref: r.source_ref, payload: r.payload, observed_at: r.observed_at }));

/** Uploads are push, not pull: the adapter replays batches the portal already parsed and mapped (see upload/map.ts). */
export function createUploadAdapter(source: UploadSource): Adapter {
  return {
    key: 'csv-excel-upload',
    objects: [],
    async validate() {
      return { ok: true, detail: 'uploads are authenticated by the portal session' };
    },
    async pull(object, cursor) {
      const batches = await source.listBatches(object, cursor);
      if (!batches.length) return { records: [], nextCursor: null, hasMore: false };
      const [first, ...rest] = batches;
      return { records: toPulled(first.rows), nextCursor: first.id, hasMore: rest.length > 0 };
    },
  };
}

const unwired: UploadSource = {
  async listBatches() {
    throw new Error('csv-excel-upload: no UploadSource wired; use createUploadAdapter(source)');
  },
};

export const csvExcelUpload = createUploadAdapter(unwired);
