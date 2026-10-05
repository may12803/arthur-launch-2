import { generateKeyPairSync } from 'node:crypto';
import { setDefaultResolver } from '../net/safe-url.ts';

// Tests never touch the network: every hostname resolves to a fixed public address unless a test installs its own resolver.
setDefaultResolver(async () => ['93.184.216.34']);

/** Queue-based fake fetch. Each call consumes the next canned response and records {url, init}. */
export function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const r = typeof queue[0] === 'function' ? queue.shift()(String(url), init) : queue.shift();
    if (!r) throw new Error(`fakeFetch: no response queued for ${url}`);
    const body = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    return new Response(body, { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  fn.calls = calls;
  fn.testOnlyAllowUnpinnedFetch = true;
  return fn;
}

/** Handler-based fake fetch for flows where the call order is not fixed. */
export function routedFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const r = await handler(String(url), init);
    return new Response(r.text !== undefined ? r.text : JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  fn.calls = calls;
  fn.testOnlyAllowUnpinnedFetch = true;
  return fn;
}

export const hdr =(call, name) => {
  const h = call.init.headers ?? {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? h[k] : undefined;
};

export const body = (call) => JSON.parse(call.init.body);

export function rsaPem() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

export function jwtParts(jwt) {
  const [h, p, s] = jwt.split('.');
  return { header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')), signingInput: `${h}.${p}`, sig: Buffer.from(s, 'base64url') };
}

export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  const sleeps = [];
  return { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, sleeps, advance: (ms) => { t += ms; } };
}
