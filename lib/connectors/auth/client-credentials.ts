import { tokenRequest } from './oauth2.ts';
import type { TokenSet } from './oauth2.ts';
import type { FetchLike } from '../types.ts';

export interface ClientCredentialsInput {
  fetch: FetchLike;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  resource?: string;
  clientAuth?: 'body' | 'basic';
  now?: number;
}

/** OAuth 2.0 client credentials grant. No refresh token: callers simply re-request on expiry. */
export function clientCredentialsToken(i: ClientCredentialsInput): Promise<TokenSet> {
  return tokenRequest({
    fetch: i.fetch,
    tokenUrl: i.tokenUrl,
    clientId: i.clientId,
    clientSecret: i.clientSecret,
    clientAuth: i.clientAuth,
    now: i.now,
    params: { grant_type: 'client_credentials', scope: i.scope, resource: i.resource },
  });
}
