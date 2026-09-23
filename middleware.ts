// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// arthur-online middleware:
//   1. HTTP Basic Auth gate on every non-public path.
//   2. AAL2 (multi-factor) gate for real browser sessions with a verified
//      TOTP factor, or for every session when ARTHUR_REQUIRE_MFA=1.
//   3. Reverse-proxy Bearer header injection for paths rewritten to arthur-ai.
//
// Public paths (no auth required): / (landing), /pricing, /terms, /privacy,
//   /security, /contact, /favicon.ico, /_next/*, /api/webhooks/*.
// Everything else (including /brain, /skills, /graph, /chat, /goals, /studio,
//   /drafts, /labs, /api/*) requires Basic Auth.

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/security",
  "/contact",
  "/lock",
  "/login",
  "/api/login",
  "/api/logout",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  // Brain/skill/benchmark data files (public metadata, not sensitive)
  "/brain-graph-full.json",
  "/brain-snapshot.json",
  "/brain-files.json",
  "/brain-index.json",
  "/brain-utilization.json",
  "/skills.json",
  "/principles.json",
  "/benchmarks.json",
  "/employees.json",
];

const PUBLIC_PREFIXES = [
  "/_next/",
  "/api/webhooks/",
  "/api/employees/",
  "/static/",
  "/images/",
  "/fonts/",
  // LOVELEEDAY client portal — a separate Supabase project + auth system
  // from Daniel's admin session above. Carved out of the admin gate
  // entirely; app/client/(portal)/layout.tsx (requireClientPortal()) is
  // this area's own session + MFA gate instead.
  "/client",
  "/api/client",
];

const PROXIED_PREFIXES = [
  "/labs",
  "/drafts",
  "/api/benchmarks",
  "/api/outbound/email",
  "/api/backend",
  "/studio/api",
  "/brain/api",
  "/chat/",
  "/conversations/",
];

// Destinations of the MFA flow itself — never redirected by the AAL gate,
// or a session-cookie-authed user could never reach the screen that clears it.
const MFA_EXEMPT_PATHS = ["/mfa/challenge", "/settings/security", "/api/logout"];

function isPublic(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (PUBLIC_PREFIXES.some(p => path.startsWith(p))) return true;
  return false;
}

function isMfaExempt(path: string): boolean {
  return MFA_EXEMPT_PATHS.some(p => path === p || path.startsWith(p + "/"));
}

function checkBasicAuth(req: NextRequest): boolean {
  const expectedUser = process.env.ARTHUR_ONLINE_USER || "daniel";
  const expectedPass = process.env.ARTHUR_ONLINE_PASSWORD;
  // If no password configured, fail closed — never serve protected content.
  if (!expectedPass) return false;
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return false;
  try {
    const decoded = atob(header.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx < 0) return false;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return user === expectedUser && pass === expectedPass;
  } catch {
    return false;
  }
}

// Accept Bearer ARTHUR_SECRET / AUTOMATION_SECRET as an alternative to Basic Auth.
// Lets API probes (chat-probe.mjs, smoke-test.mjs, automation/cron) hit endpoints
// without the dashboard password. Mirrors lib/_auth.ts isAuthed().
function checkBearerAuth(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  const s1 = process.env.ARTHUR_SECRET;
  const s2 = process.env.AUTOMATION_SECRET;
  return (!!s1 && token === s1) || (!!s2 && token === s2);
}

// Session token derived from server-only secrets (mirror of /api/login's
// node:crypto computation). Edge runtime uses Web Crypto.
async function expectedSessionToken(): Promise<string | null> {
  const user = process.env.ARTHUR_ONLINE_USER || "daniel";
  const pass = process.env.ARTHUR_ONLINE_PASSWORD;
  if (!pass) return null;
  const secret = process.env.ARTHUR_SECRET || pass;
  const data = new TextEncoder().encode(`${user}:${pass}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkSessionCookie(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("arthur_session")?.value;
  if (!token) return false;
  const expected = await expectedSessionToken();
  return !!expected && token === expected;
}

function wantsHtml(req: NextRequest): boolean {
  return req.method === "GET" && (req.headers.get("accept") || "").includes("text/html");
}

// Reads the Supabase Auth (AAL) session bridged in at /api/login and decides
// whether this request needs to be sent to the MFA challenge or forced into
// enrollment. Writes any refreshed auth cookies onto `res`.
//
// Fails open on any error or missing config: the arthur_session cookie above
// is already the real access gate, so a Supabase hiccup must never lock a
// legitimate session out. Returns null when there is nothing to enforce.
async function checkMfaRedirect(req: NextRequest, res: NextResponse): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null; // no bridged Supabase session (bridge disabled or failed) — nothing to enforce

    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !aal) return null;

    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      return "/mfa/challenge";
    }
    if (process.env.ARTHUR_REQUIRE_MFA === "1" && aal.nextLevel !== "aal2") {
      // No verified factor yet and MFA is mandatory — force enrollment.
      return "/settings/security?enroll=1";
    }
    return null;
  } catch (err) {
    console.error("[middleware] MFA AAL check failed:", err);
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  let response = NextResponse.next({ request: { headers: req.headers } });

  // Step 1: Auth gate — session cookie, Basic, or Bearer
  let authedViaSession = false;
  if (!isPublic(path)) {
    const basicOrBearer = checkBasicAuth(req) || checkBearerAuth(req);
    if (!basicOrBearer) {
      authedViaSession = await checkSessionCookie(req);
    }
    const authed = basicOrBearer || authedViaSession;
    if (!authed) {
      // Real login UI for browser navigations; 401 for APIs + programmatic callers.
      if (wantsHtml(req) && !path.startsWith("/api/")) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = `?next=${encodeURIComponent(path + (req.nextUrl.search || ""))}`;
        return NextResponse.redirect(loginUrl);
      }
      return new NextResponse("Authentication required", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Arthur - Daniel only", charset="UTF-8"',
          "Content-Type": "text/plain",
        },
      });
    }

    // Step 1.5: AAL2 (multi-factor) gate. Only applies to real browser
    // sessions — Basic/Bearer auth is used by automation, probes, and the
    // smoke test, none of which carry a Supabase Auth session to check.
    if (authedViaSession && !isMfaExempt(path)) {
      const redirectTo = await checkMfaRedirect(req, response);
      if (redirectTo) {
        if (wantsHtml(req) && !path.startsWith("/api/")) {
          const [destPath, destQuery] = redirectTo.split("?");
          const dest = req.nextUrl.clone();
          dest.pathname = destPath;
          const nextParam = `next=${encodeURIComponent(path + (req.nextUrl.search || ""))}`;
          dest.search = destQuery ? `?${destQuery}&${nextParam}` : `?${nextParam}`;
          return NextResponse.redirect(dest);
        }
        return NextResponse.json({ error: "mfa_required", redirect: redirectTo }, { status: 401 });
      }
    }
  }

  // Step 2: Bearer injection for proxied paths
  const isProxied = PROXIED_PREFIXES.some(p => path === p || path.startsWith(p));
  if (!isProxied) return response;

  const secret = process.env.ARTHUR_SECRET;
  if (!secret) return response;

  const requestHeaders = new Headers(req.headers);
  if (!requestHeaders.has("authorization") || requestHeaders.get("authorization")?.toLowerCase().startsWith("basic ")) {
    requestHeaders.set("authorization", `Bearer ${secret}`);
  }
  const proxied = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of response.cookies.getAll()) {
    proxied.cookies.set(cookie);
  }
  return proxied;
}


export const config = {
  // All paths except static assets and API routes that are explicitly public.
  // The middleware itself handles which of these require auth.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|images/|fonts/|static/).*)",
  ],
};
