// Plain-language versions of the auth errors a client can hit. Raw messages like "invalid claim: missing sub
// claim" never reach the page. `signedOut` means the session is gone and the only fix is signing in again.
export function friendlyAuthError(raw: string | undefined | null): { text: string; signedOut: boolean } {
  const m = (raw || "").toLowerCase();
  if (/missing sub claim|jwt|session.*(missing|expired|not found)|not authenticated|auth session missing|refresh token/.test(m))
    return { text: "Your sign-in ended. Sign in again to continue.", signedOut: true };
  if (/invalid totp|invalid code|code.*(invalid|expired)|mfa_verification_failed/.test(m))
    return { text: "That code didn't match. Codes change every 30 seconds; enter the one showing now.", signedOut: false };
  if (/factor.*not found|mfa_factor_not_found|challenge.*(expired|not found)/.test(m))
    return { text: "This setup code expired. Remove the old LOVELEEDAY entry from your app and scan the new code below.", signedOut: false };
  if (/rate limit|too many/.test(m))
    return { text: "Too many attempts. Wait a few minutes, then try again.", signedOut: false };
  if (/invalid login credentials|invalid email or password/.test(m))
    return { text: "That email and password didn't match.", signedOut: false };
  if (/password.*(pwned|leaked|breach|known|compromised)|weak_password/.test(m))
    return { text: "That password has appeared in a data breach. Choose a different one.", signedOut: false };
  if (/password.*(at least|should be|characters|length)/.test(m))
    return { text: "Use at least 12 characters.", signedOut: false };
  return { text: "Something went wrong. Try again, and if it keeps happening, email daniel@loveleedaystudios.com.", signedOut: false };
}

export function sendToSignIn(next: string) {
  window.location.href = `/client/login?next=${encodeURIComponent(next)}`;
}
