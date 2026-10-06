// Stable public error codes for anything a browser can see (URLs, JSON bodies, rendered pages). Vendor OAuth error text
// and raw database messages never go there: they can carry internals, land in browser history, referrers and logs.
// The detail is logged server-side by the caller; the client gets a code and a fixed sentence.

export const OAUTH_ERRORS = {
  vendor_declined: "The vendor declined the sign-in.",
  incomplete: "The sign-in response was incomplete. Start again from the connector page.",
  not_configured: "Connector sign-in is not configured on the server.",
  link_expired: "That sign-in link expired, was already used, or was started by someone else. Start again from the connector page.",
  system_not_configured: "Sign-in for this system is not configured on the server.",
  exchange_failed: "The vendor did not complete the sign-in. Start again from the connector page.",
  save_failed: "The sign-in worked but the connection could not be saved. Start again from the connector page.",
} as const;
export type OAuthErrorCode = keyof typeof OAUTH_ERRORS;

/** Text for a code read back from the URL; anything that is not one of ours becomes the generic message. */
export function oauthErrorText(code: string | null | undefined): string | null {
  if (!code) return null;
  return (OAUTH_ERRORS as Record<string, string>)[code] ?? "The sign-in did not complete. Start again from the connector page.";
}

export type PublicDbError = { status: number; code: string; message: string };

/** Map a database failure to a status and a fixed public code/message. The raw message is only for server logs. */
export function publicDbError(rawMessage: string): PublicDbError {
  const m = (rawMessage || "").toLowerCase();
  if (m.includes("not signed in") || m.includes("two-factor")) return { status: 401, code: "not_signed_in", message: "Please sign in again." };
  if (m.includes("only an owner") || m.includes("not allowed") || m.includes("permission denied")) return { status: 403, code: "forbidden", message: "You do not have permission to do that." };
  if (m.includes("not found") || m.includes("unknown")) return { status: 404, code: "not_found", message: "That item was not found." };
  if (m.includes("larger than") || m.includes("too many")) return { status: 413, code: "too_large", message: "That is larger than allowed." };
  if (m.includes("does not exist") || m.includes("could not find the function")) return { status: 501, code: "not_available", message: "This is not available yet." };
  return { status: 500, code: "server_error", message: "Something went wrong. Please try again." };
}
