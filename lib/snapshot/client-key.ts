// Identity for the anonymous Snapshot rate limits. Fly's edge proxy sets `fly-client-ip` itself and overwrites any value
// the caller sends, so it is the only header trusted. `x-forwarded-for` is caller-controlled (its first hop is whatever
// the client wrote), so it is never read: a request without the Fly header joins ONE shared bucket instead of letting
// a rotating header mint a fresh identity per request.
export const SHARED_BUCKET = 'shared-unidentified';

export function clientKeyFromHeaders(get: (name: string) => string | null | undefined): string {
  const ip = (get('fly-client-ip') ?? '').trim();
  return ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : SHARED_BUCKET;
}
