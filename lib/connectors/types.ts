export type AuthMethod =
  | 'oauth2_authcode'
  | 'oauth2_client_credentials'
  | 'oauth1_tba'
  | 'api_key'
  | 'basic'
  | 'service_account'
  | 'key_pair'
  | 'jwt'
  | 'sftp'
  | 'upload'
  | 'none';

// 'live' is deliberately absent: live status comes only from probes (Rule 41).
export type BuildStatus = 'implemented' | 'sftp_csv_path' | 'planned';
export type AccessGate = 'self-serve' | 'partner/license' | 'unverified';

export interface RateLimit {
  rps: number;
  burst: number;
  source: 'documented' | 'default_unverified';
}

export interface ConnectorDefinition {
  key: string;
  name: string;
  vendor: string;
  category: string;
  auth_method: AuthMethod;
  auth_methods: AuthMethod[];
  access_gate: AccessGate;
  recommended_path: string;
  partner_program: string;
  sandbox: { available: boolean | string; how_to_get: string };
  objects: string[];
  incremental_sync: string;
  rate_limits: string;
  rate_limit: RateLimit;
  scopes: string[];
  build_status: BuildStatus;
  logo: string;
  source_file: string;
  api_base_url: string;
  token_lifetime: string;
  refresh: string;
  build_effort_days: number;
  blockers: string[];
  /** Names of fields whose vendor text still says UNVERIFIED. Never cleared by code. */
  unverified: string[];
}

export type Creds = Record<string, string>;
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PulledRecord {
  source_ref: string;
  payload: Record<string, unknown>;
  observed_at?: string;
  valid_from?: string;
}

export interface PullResult {
  records: PulledRecord[];
  /** Opaque cursor to persist once these records are ingested. null = nothing to persist. */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ValidateResult {
  ok: boolean;
  detail: string;
  account?: string;
}

/** A catalog system whose auth is delegated to a Nango integration (long-tail path). Not an Adapter: Nango holds the tokens. */
export interface ViaNangoEntry {
  kind: 'via_nango';
  /** Catalog definition key (data/connectors/systems/<key>.json). */
  system_key: string;
  /** Nango integration unique_key (provider_config_key). */
  nango_integration_id: string;
}

export interface Adapter {
  key: string;
  objects: string[];
  validate(creds: Creds, fetch: FetchLike): Promise<ValidateResult>;
  pull(object: string, cursor: string | null, creds: Creds, fetch: FetchLike): Promise<PullResult>;
}

export class HttpError extends Error {
  status: number;
  retryAfterMs: number | null;
  body: string;
  constructor(status: number, message: string, retryAfterMs: number | null = null, body = '') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }
}
