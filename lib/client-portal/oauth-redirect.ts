// The one OAuth redirect URI every vendor app is registered against. It is fixed, never derived from the request
// host: a vendor rejects any URI that is not registered byte for byte, and a host-derived value would let a request
// that arrived on another hostname start a sign-in that can never complete.
export const OAUTH_CALLBACK_PATH = "/api/client/connectors/oauth/callback";
export const OAUTH_REDIRECT_URI_PROD = `https://portal.loveleedaystudios.com${OAUTH_CALLBACK_PATH}`;
export const OAUTH_REDIRECT_URI_DEV = `http://localhost:3000${OAUTH_CALLBACK_PATH}`;

export function oauthRedirectUri(env: string | undefined = process.env.NODE_ENV): string {
  return env === "development" ? OAUTH_REDIRECT_URI_DEV : OAUTH_REDIRECT_URI_PROD;
}
