import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createPublicKey, createVerify, generateKeyPairSync, createHash } from 'node:crypto';
import { signOAuth1, oauth1BaseString } from '../auth/oauth1.ts';
import { signV4, assumeRole, amzDateOf } from '../auth/aws.ts';
import { signJwtRS256, googleServiceAccountAssertion, boxAssertion, snowflakeJwt, publicKeyFingerprint, exchangeJwtBearer } from '../auth/jwt.ts';
import { issueSftpCredential, parseOpenSshEd25519, sftpChroot } from '../auth/sftp.ts';
import { validateCredentials, staticAuthHeaders } from '../auth/key-validate.ts';
import { HttpError } from '../types.ts';
import { fakeFetch, hdr, jwtParts, rsaPem } from './_helpers.mjs';

test('OAuth 1.0a signer reproduces the OAuth Core 1.0 Appendix A.5 HMAC-SHA1 signature', () => {
  const r = signOAuth1({
    method: 'GET', url: 'http://photos.example.net/photos?file=vacation.jpg&size=original',
    consumerKey: 'dpf43f3p2l4k3l03', consumerSecret: 'kd94hf93k423kf44', token: 'nnch734d00sl2jdk', tokenSecret: 'pfkkdhi9sl3r4s00',
    signatureMethod: 'HMAC-SHA1', nonce: 'kllo9940pd9333jh', timestamp: 1191242096,
  });
  assert.equal(r.signature, 'tR3+Ty81lMeYAr/Fid0kMTYa/WM=');
  assert.equal(r.baseString, 'GET&http%3A%2F%2Fphotos.example.net%2Fphotos&file%3Dvacation.jpg%26oauth_consumer_key%3Ddpf43f3p2l4k3l03%26oauth_nonce%3Dkllo9940pd9333jh%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1191242096%26oauth_token%3Dnnch734d00sl2jdk%26oauth_version%3D1.0%26size%3Doriginal');
});

const ns = { method: 'POST', url: 'https://1234567.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=10', consumerKey: 'CK', consumerSecret: 'CS', token: 'TK', tokenSecret: 'TS', realm: '1234567', nonce: 'fixednonce1234567890', timestamp: 1700000000 };

test('NetSuite TBA: HMAC-SHA256 with realm is deterministic and matches an independently built base string', () => {
  const a = signOAuth1(ns);
  const b = signOAuth1({ ...ns });
  assert.equal(a.header, b.header);
  const base = 'POST&https%3A%2F%2F1234567.suitetalk.api.netsuite.com%2Fservices%2Frest%2Fquery%2Fv1%2Fsuiteql&limit%3D10%26oauth_consumer_key%3DCK%26oauth_nonce%3Dfixednonce1234567890%26oauth_signature_method%3DHMAC-SHA256%26oauth_timestamp%3D1700000000%26oauth_token%3DTK%26oauth_version%3D1.0';
  assert.equal(a.baseString, base);
  assert.equal(a.signature, createHmac('sha256', 'CS&TS').update(base).digest('base64'));
  assert.match(a.header, /^OAuth realm="1234567", oauth_consumer_key="CK"/);
  assert.match(a.header, /oauth_signature_method="HMAC-SHA256"/);
  assert.ok(!a.baseString.includes('realm'), 'realm is not part of the signature base string');
});

test('NetSuite TBA: any changed input changes the signature', () => {
  const base = signOAuth1(ns).signature;
  for (const change of [{ nonce: 'other' }, { timestamp: 1700000001 }, { tokenSecret: 'TS2' }, { url: ns.url + '1' }, { method: 'GET' }]) {
    assert.notEqual(signOAuth1({ ...ns, ...change }).signature, base, JSON.stringify(change));
  }
  assert.equal(signOAuth1({ ...ns, realm: 'OTHER' }).signature, base, 'realm must not affect the signature');
  assert.notEqual(signOAuth1({ ...ns, nonce: undefined }).header, signOAuth1({ ...ns, nonce: undefined }).header, 'random nonce when none is given');
});

test('SigV4 matches the AWS documented IAM ListUsers example signature', () => {
  const r = signV4({
    method: 'GET', url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Host: 'iam.amazonaws.com' },
    region: 'us-east-1', service: 'iam', creds: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }, amzDate: '20150830T123600Z',
  });
  assert.equal(createHash('sha256').update(r.canonicalRequest).digest('hex'), 'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59');
  assert.equal(r.signature, '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  assert.equal(r.headers.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
});

test('SigV4 signature changes with the secret, the date and the query string', () => {
  const base = { method: 'GET', url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08', headers: { host: 'iam.amazonaws.com' }, region: 'us-east-1', service: 'iam', creds: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'a' }, amzDate: '20150830T123600Z' };
  const s = signV4(base).signature;
  assert.notEqual(signV4({ ...base, creds: { ...base.creds, secretAccessKey: 'b' } }).signature, s);
  assert.notEqual(signV4({ ...base, amzDate: '20150830T123601Z' }).signature, s);
  assert.notEqual(signV4({ ...base, url: base.url + '&x=1' }).signature, s);
});

test('amzDateOf formats a basic ISO 8601 timestamp', () => assert.equal(amzDateOf(Date.UTC(2015, 7, 30, 12, 36, 0)), '20150830T123600Z'));

test('STS AssumeRole sends the per-customer ExternalId, is SigV4 signed, and parses credentials', async () => {
  const xml = '<AssumeRoleResponse><AssumeRoleResult><Credentials><AccessKeyId>ASIATEMP</AccessKeyId><SecretAccessKey>tempsecret</SecretAccessKey><SessionToken>tok</SessionToken><Expiration>2026-10-05T13:00:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>';
  const f = fakeFetch([{ text: xml }]);
  const out = await assumeRole({ fetch: f, platform: { accessKeyId: 'AKIDPLATFORM', secretAccessKey: 'ps' }, roleArn: 'arn:aws:iam::111122223333:role/LOVELEEDAYReadRole', externalId: 'ext-abc-123', now: Date.UTC(2026, 9, 5, 12, 0, 0) });
  assert.equal(out.accessKeyId, 'ASIATEMP');
  assert.equal(out.sessionToken, 'tok');
  const c = f.calls[0];
  assert.equal(c.url, 'https://sts.amazonaws.com/');
  const p = new URLSearchParams(c.init.body);
  assert.equal(p.get('Action'), 'AssumeRole');
  assert.equal(p.get('ExternalId'), 'ext-abc-123');
  assert.equal(p.get('RoleArn'), 'arn:aws:iam::111122223333:role/LOVELEEDAYReadRole');
  assert.match(hdr(c, 'authorization'), /^AWS4-HMAC-SHA256 Credential=AKIDPLATFORM\/20261005\/us-east-1\/sts\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  const denied = fakeFetch([{ status: 403, text: '<ErrorResponse><Error><Code>AccessDenied</Code></Error></ErrorResponse>' }]);
  await assert.rejects(() => assumeRole({ fetch: denied, platform: { accessKeyId: 'a', secretAccessKey: 'b' }, roleArn: 'r', externalId: 'e' }), (e) => e instanceof HttpError && e.status === 403 && /AccessDenied/.test(e.message));
});

const verifyRs256 = (jwt, pem) => {
  const { signingInput, sig } = jwtParts(jwt);
  return createVerify('RSA-SHA256').update(signingInput).verify(createPublicKey(pem), sig);
};

test('RS256 JWT verifies with the public key and fails on a tampered payload', () => {
  const pem = rsaPem();
  const jwt = signJwtRS256({ a: 1 }, pem);
  assert.ok(verifyRs256(jwt, pem));
  const [h, , s] = jwt.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ a: 2 })).toString('base64url')}.${s}`;
  assert.equal(verifyRs256(forged, pem), false);
  assert.equal(jwtParts(jwt).header.alg, 'RS256');
});

test('Google service account assertion has iss/scope/aud/iat/exp<=1h and optional delegated sub', () => {
  const pem = rsaPem();
  const now = 1_700_000_000_000;
  const jwt = googleServiceAccountAssertion({ clientEmail: 'sa@proj.iam.gserviceaccount.com', privateKey: pem, privateKeyId: 'kid1', scope: 'https://www.googleapis.com/auth/drive.readonly', subject: 'admin@customer.com', now, ttlSeconds: 99999 });
  const { header, claims } = jwtParts(jwt);
  assert.equal(header.kid, 'kid1');
  assert.deepEqual(claims, { iss: 'sa@proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: 1_700_000_000, exp: 1_700_003_600, sub: 'admin@customer.com' });
  assert.ok(verifyRs256(jwt, pem));
});

test('Box assertion has client id iss, enterprise sub, box_sub_type, unique jti and exp within 60s', () => {
  const pem = rsaPem();
  const a = jwtParts(boxAssertion({ clientId: 'bxid', subject: '12345', subType: 'enterprise', privateKey: pem, publicKeyId: 'pk1', now: 1_700_000_000_000, ttlSeconds: 500 }));
  const b = jwtParts(boxAssertion({ clientId: 'bxid', subject: '12345', subType: 'enterprise', privateKey: pem, publicKeyId: 'pk1', now: 1_700_000_000_000 }));
  assert.equal(a.claims.iss, 'bxid');
  assert.equal(a.claims.sub, '12345');
  assert.equal(a.claims.box_sub_type, 'enterprise');
  assert.equal(a.claims.aud, 'https://api.box.com/oauth2/token');
  assert.equal(a.claims.exp - 1_700_000_000, 60);
  assert.notEqual(a.claims.jti, b.claims.jti);
  assert.equal(a.header.kid, 'pk1');
});

test('JWT bearer exchange posts the RFC 7523 grant type', async () => {
  const f = fakeFetch([{ json: { access_token: 'X' } }]);
  await exchangeJwtBearer({ fetch: f, tokenUrl: 'https://oauth2.googleapis.com/token', assertion: 'a.b.c' });
  const p = new URLSearchParams(f.calls[0].init.body);
  assert.equal(p.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(p.get('assertion'), 'a.b.c');
});

test('Snowflake key-pair JWT: iss ACCOUNT.USER.SHA256:<fingerprint of public key DER>, sub ACCOUNT.USER', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const fp = 'SHA256:' + createHash('sha256').update(der).digest('base64');
  assert.equal(publicKeyFingerprint(pem), fp);
  const jwt = snowflakeJwt({ account: 'xy12345.us-east-1', user: 'svc_loveleeday', privateKey: pem, now: 1_700_000_000_000 });
  const { claims } = jwtParts(jwt);
  assert.equal(claims.sub, 'XY12345.SVC_LOVELEEDAY');
  assert.equal(claims.iss, `XY12345.SVC_LOVELEEDAY.${fp}`);
  assert.equal(claims.exp - claims.iat, 3540);
  assert.ok(verifyRs256(jwt, pem));
});

test('SFTP issuance: per-tenant user, chroot /tenants/<id>/inbox, ed25519 public material only', () => {
  const tenant = '3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab';
  let delivered = '';
  const cred = issueSftpCredential({ tenantId: tenant, deliverPrivateKey: (pem) => { delivered = pem; } });
  assert.equal(cred.chroot, `/tenants/${tenant}/inbox`);
  assert.equal(cred.chroot, sftpChroot(tenant));
  assert.match(cred.username, /^ll-[0-9a-f]{16}$/);
  assert.match(cred.publicKey, /^ssh-ed25519 AAAA/);
  assert.match(cred.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.match(delivered, /BEGIN PRIVATE KEY/);
  assert.ok(!JSON.stringify(cred).includes('PRIVATE'), 'return value must hold public material only');
  assert.equal(parseOpenSshEd25519(cred.publicKey).fingerprint, cred.fingerprint);
  const other = issueSftpCredential({ tenantId: '99999999-aaaa-4bbb-8ccc-0123456789ab', deliverPrivateKey: () => {} });
  assert.notEqual(other.username, cred.username);
  assert.notEqual(other.chroot, cred.chroot);
});

test('SFTP issuance: customer-supplied key is validated and no private key is ever created', () => {
  const t = '3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab';
  const gen = issueSftpCredential({ tenantId: t, deliverPrivateKey: () => {} });
  const cred = issueSftpCredential({ tenantId: t, customerPublicKey: gen.publicKey + ' customer@host' });
  assert.equal(cred.keyOrigin, 'customer_supplied');
  assert.equal(cred.fingerprint, gen.fingerprint);
  assert.throws(() => issueSftpCredential({ tenantId: t, customerPublicKey: 'ssh-rsa AAAAB3NzaC1yc2E customer' }), /ed25519/);
  assert.throws(() => issueSftpCredential({ tenantId: t }), /deliverPrivateKey/);
  assert.throws(() => issueSftpCredential({ tenantId: '../../etc', deliverPrivateKey: () => {} }), /uuid/);
});

test('key validation: static headers, and failures never echo the credential', async () => {
  assert.deepEqual(staticAuthHeaders({ api_key: 'K' }, 'api_key'), { authorization: 'Bearer K' });
  assert.deepEqual(staticAuthHeaders({ api_key: 'K', header_name: 'api-key' }, 'api_key'), { 'api-key': 'K' });
  assert.equal(staticAuthHeaders({ username: 'u', password: 'p' }, 'basic').authorization, 'Basic ' + Buffer.from('u:p').toString('base64'));
  const adapter = { key: 'x', objects: [], validate: async () => { throw new HttpError(401, 'bad', null, 'echo SECRET-KEY-123'); }, pull: async () => ({}) };
  const r = await validateCredentials(adapter, { api_key: 'SECRET-KEY-123' }, fakeFetch());
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes('SECRET-KEY-123'));
  assert.match(r.detail, /rejected/);
  const good = await validateCredentials({ ...adapter, validate: async () => ({ ok: true, detail: 'fine' }) }, {}, fakeFetch());
  assert.equal(good.ok, true);
});

test('oauth1BaseString sorts duplicate keys by value and encodes RFC 3986', () => {
  const s = oauth1BaseString('get', 'https://Example.com:443/p?b=2&a=1&a=0', [['c', "x y!'()*"]]);
  assert.equal(s, 'GET&https%3A%2F%2Fexample.com%2Fp&a%3D0%26a%3D1%26b%3D2%26c%3Dx%2520y%2521%2527%2528%2529%252A');
});
