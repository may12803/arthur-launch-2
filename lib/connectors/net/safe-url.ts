import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import type { FetchLike } from '../types.ts';

/**
 * SSRF guard for every outbound request whose host comes from customer-supplied credentials or configuration.
 * assertPublicHttpsUrl parses the URL, requires https and no userinfo, rejects IP literals and DNS answers that are not
 * public unicast addresses. safeFetch repeats the assertion before EVERY request and handles redirects manually.
 *
 * The HTTPS connector checks DNS at connection time and passes the checked address to the socket lookup callback.
 * TLS still uses the original hostname for SNI and certificate verification. Every redirect gets a new check.
 */

export type Resolver = (hostname: string) => Promise<string[]>;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export const systemResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

let defaultResolver: Resolver = systemResolver;
/** Test seam: replace (or with no argument restore) the resolver used when a caller does not pass one. */
export function setDefaultResolver(r?: Resolver): void {
  defaultResolver = r ?? systemResolver;
}

function parseV4(s: string): number[] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

function parseV6(input: string): number[] | null {
  let s = input.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':');
    const v4 = parseV4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':'));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const groups = [...head];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    for (let i = 0; i < fill; i++) groups.push('0');
    groups.push(...rest);
  } else if (head.length !== 8) return null;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const words = groups.map((g) => parseInt(g, 16));
  if (tail.length) {
    words[6] = tail[0];
    words[7] = tail[1];
  }
  return words;
}

function publicV4(o: number[]): boolean {
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function publicV6(w: number[]): boolean {
  const v4of = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) return publicV4(v4of(w[6], w[7])); // ::ffff:a.b.c.d
  if (w.slice(0, 6).every((x) => x === 0)) return false; // ::, ::1 and IPv4-compatible ::a.b.c.d
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return publicV4(v4of(w[6], w[7])); // NAT64
  if (w[0] === 0x2002) return publicV4(v4of(w[1], w[2])); // 6to4 embeds an IPv4 address
  if (w[0] === 0x2001 && w[1] === 0) return false; // Teredo
  if (w[0] === 0x2001 && w[1] === 0xdb8) return false; // documentation
  return (w[0] & 0xe000) === 0x2000; // only global unicast 2000::/3 (excludes fc00::/7, fe80::/10, ff00::/8, ::1)
}

/** True when the address is a public unicast IPv4 or IPv6 address. Anything unparseable is not public. */
export function isPublicAddress(addr: string): boolean {
  const a = addr.replace(/^\[|\]$/g, '');
  const kind = isIP(a);
  if (kind === 4) {
    const o = parseV4(a);
    return !!o && publicV4(o);
  }
  if (kind === 6) {
    const w = parseV6(a);
    return !!w && publicV6(w);
  }
  return false;
}

/** Throws UnsafeUrlError unless `raw` is a public https URL. Returns the parsed URL. */
export async function assertPublicHttpsUrl(raw: string, opts: { resolve?: Resolver } = {}): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid URL');
  }
  if (u.protocol !== 'https:') throw new UnsafeUrlError('URL must use https');
  if (u.username || u.password) throw new UnsafeUrlError('URL must not contain credentials');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new UnsafeUrlError('URL has no host');
  const literal = host.replace(/^\[|\]$/g, '');
  if (isIP(literal)) {
    if (!isPublicAddress(literal)) throw new UnsafeUrlError('host is not a public address');
    return u;
  }
  // WHATWG parsing turns decimal/hex/octal IPv4 into dotted form, so anything numeric that is left is malformed.
  if (/^[0-9.x]+$/i.test(host) || !host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|localdomain|home|lan|corp)$/.test(host)) {
    throw new UnsafeUrlError('host is not a public name');
  }
  let addrs: string[];
  try {
    addrs = await (opts.resolve ?? defaultResolver)(host);
  } catch {
    throw new UnsafeUrlError('host could not be resolved');
  }
  if (!addrs.length) throw new UnsafeUrlError('host did not resolve');
  for (const a of addrs) if (!isPublicAddress(a)) throw new UnsafeUrlError('host resolves to a non-public address');
  return u;
}

/** Message for forms and routes: null when the URL is acceptable. */
export async function publicHttpsUrlError(raw: string, opts: { resolve?: Resolver } = {}): Promise<string | null> {
  try {
    await assertPublicHttpsUrl(raw, opts);
    return null;
  } catch (e) {
    return e instanceof UnsafeUrlError ? e.message : 'URL could not be checked';
  }
}

const MAX_REDIRECTS = 3;
const SENSITIVE = /^(authorization|proxy-authorization|cookie|x-esri-authorization|x-shopify-access-token|bb-api-subscription-key|lld-.*)$/i;

export type SafeConnector = (url: string, init: RequestInit, lookup: (host: string) => Promise<{ address: string; family: 4 | 6 }>) => Promise<Response>;

const nativeConnector: SafeConnector = async (raw, init, checkedLookup) => {
  const u = new URL(raw);
  const address = await checkedLookup(u.hostname);
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(u, {
      method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers)),
      lookup: (_host, _options, cb) => cb(null, address.address, address.family),
      servername: u.hostname, rejectUnauthorized: true,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: res.headers as Record<string, string> })));
      res.on('error', reject);
    });
    req.on('error', reject);
    const abort = () => req.destroy(init.signal?.reason instanceof Error ? init.signal.reason : new DOMException('Request aborted', 'AbortError'));
    if (init.signal?.aborted) abort();
    else init.signal?.addEventListener('abort', abort, { once: true });
    req.on('close', () => init.signal?.removeEventListener('abort', abort));
    if (init.signal?.aborted) return;
    if (init.body) req.write(init.body as string);
    req.end();
  });
};

export interface SafeFetchOptions { resolve?: Resolver; connect?: SafeConnector; followRedirects?: boolean; testOnlyAllowUnpinnedFetch?: boolean }

/** Asserts the target before every request, never lets the platform follow a redirect, and re-asserts each hop. */
export async function safeFetch(fetch: FetchLike, url: string, init: RequestInit = {}, opts: SafeFetchOptions = {}): Promise<Response> {
  let target = url;
  let cur: RequestInit = { ...init, redirect: 'manual' };
  for (let hop = 0; ; hop++) {
    await assertPublicHttpsUrl(target, opts);
    const checked = async (host: string) => {
      const answers = await (opts.resolve ?? defaultResolver)(host);
      if (!answers.length) throw new UnsafeUrlError('host did not resolve');
      if (answers.some((a) => !isPublicAddress(a))) throw new UnsafeUrlError('host resolves to a non-public address');
      return { address: answers[0], family: isIP(answers[0]) as 4 | 6 };
    };
    const testFetch = process.env.NODE_TEST_CONTEXT === 'child-v8' && (opts.testOnlyAllowUnpinnedFetch || (fetch as FetchLike & { testOnlyAllowUnpinnedFetch?: boolean }).testOnlyAllowUnpinnedFetch);
    if (fetch !== globalThis.fetch && !opts.connect && !testFetch) throw new UnsafeUrlError('injected fetch cannot use the checked address');
    const res = await (opts.connect ?? (fetch === globalThis.fetch ? nativeConnector : async (u, i, lookup) => {
      await lookup(new URL(u).hostname);
      return fetch(u, i);
    }))(target, cur, checked);
    if (res.status < 300 || res.status >= 400 || res.status === 304 || opts.followRedirects === false) return res;
    const loc = res.headers.get('location');
    if (!loc) return res;
    if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError('too many redirects');
    const next = new URL(loc, target).toString();
    // the loop re-asserts the next target before it is fetched, so nothing is sent to a refused hop
    const crossOrigin = new URL(next).origin !== new URL(target).origin;
    const headers = new Headers(cur.headers);
    if (crossOrigin) for (const k of [...headers.keys()]) if (SENSITIVE.test(k)) headers.delete(k);
    const toGet = res.status === 301 || res.status === 302 || res.status === 303;
    cur = { ...cur, headers, redirect: 'manual', ...(toGet ? { method: 'GET', body: undefined } : {}) };
    target = next;
  }
}

/** Wrap a FetchLike so every call goes through safeFetch. */
export function guardedFetch(fetch: FetchLike, opts: SafeFetchOptions = {}): FetchLike {
  return (url, init) => safeFetch(fetch, url, init, opts);
}
