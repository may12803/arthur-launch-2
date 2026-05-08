// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

// arthur-online middleware:
//   1. HTTP Basic Auth gate on every non-public path.
//   2. Reverse-proxy Bearer header injection for paths rewritten to arthur-ai.
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
  "/login",
  "/signup",
  "/forgot-password",
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

function isPublic(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (PUBLIC_PREFIXES.some(p => path.startsWith(p))) return true;
  return false;
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

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Step 1: Auth gate for non-public paths — Basic OR Bearer
  if (!isPublic(path)) {
    if (!checkBasicAuth(req) && !checkBearerAuth(req)) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Arthur - Daniel only", charset="UTF-8"',
          "Content-Type": "text/plain",
        },
      });
    }
  }

  // Step 2: Bearer injection for proxied paths
  const isProxied = PROXIED_PREFIXES.some(p => path === p || path.startsWith(p));
  if (!isProxied) return NextResponse.next();

  const secret = process.env.ARTHUR_SECRET;
  if (!secret) return NextResponse.next();

  const requestHeaders = new Headers(req.headers);
  if (!requestHeaders.has("authorization") || requestHeaders.get("authorization")?.toLowerCase().startsWith("basic ")) {
    requestHeaders.set("authorization", `Bearer ${secret}`);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}


export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}

