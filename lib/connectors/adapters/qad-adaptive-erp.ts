import { assertPublicHttpsUrl } from '../net/safe-url.ts';
import type { Adapter } from '../types.ts';

// QXtend REST endpoints and authentication are UNVERIFIED. Core QXtend is SOAP; the supported interim path is CSV/SFTP.
export const qadAdaptiveErp: Adapter = {
  key: 'qad-adaptive-erp', objects: [],
  async validate(creds) {
    if (!creds.base_url) throw new Error('customer QXtend or REST base URL is required');
    await assertPublicHttpsUrl(creds.base_url);
    return { ok: true, detail: 'public HTTPS URL accepted; QXtend API access is unverified. Use the CSV/SFTP layout until the customer confirms endpoints.' };
  },
  async pull() { throw new Error('QAD API endpoints are unverified; use the CSV/SFTP layout'); },
};
