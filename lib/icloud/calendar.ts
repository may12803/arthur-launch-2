/**
 * iCloud CalDAV — read events in a date range.
 * Returns [] if APPLE_APP_PASSWORD or APPLE_ID_EMAIL env vars are missing.
 *
 * Auth: Apple ID + app-specific password via Basic Auth.
 * Setup: https://account.apple.com → Sign-In & Security → App-Specific Passwords
 *   fly secrets set APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_ID_EMAIL=you@icloud.com -a arthur-online
 */

import https from "https";

const CALDAV_HOST = "caldav.icloud.com";

export interface ICloudEvent {
  id:       string;
  title:    string;
  start:    string;
  end:      string | null;
  all_day:  boolean;
  location: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

function rawRequest(
  method: string,
  path: string,
  body: string,
  auth: string,
  extraHeaders: Record<string, string> = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, "utf8");

    const options: https.RequestOptions = {
      hostname: CALDAV_HOST,
      port: 443,
      path,
      method,
      headers: {
        Authorization:  `Basic ${auth}`,
        "Content-Length": bodyBuf.length,
        ...extraHeaders,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        // Follow redirects
        if (status >= 300 && status < 400 && res.headers.location) {
          const loc = res.headers.location as string;
          const newPath = loc.startsWith("http") ? new URL(loc).pathname : loc;
          resolve(rawRequest(method, newPath, body, auth, extraHeaders));
        } else {
          resolve({ status, headers: res.headers as Record<string, string | string[]>, body: data });
        }
      });
    });

    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

async function discoverCalendarHome(auth: string): Promise<string> {
  const propfind = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:current-user-principal/>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`;

  const res = await rawRequest("PROPFIND", "/.well-known/caldav", propfind, auth, {
    Depth: "0",
    "Content-Type": "application/xml; charset=utf-8",
  });

  const match = res.body.match(/<[^:>]*:?href[^>]*>([^<]*calendars[^<]*)<\/[^:>]*:?href>/i);
  if (!match) {
    throw new Error(`CalDAV discovery failed: ${res.body.slice(0, 300)}`);
  }
  return match[1].trim();
}

/** Parse VCALENDAR/VEVENT blocks from a CalDAV REPORT response. */
function parseICSBlocks(raw: string): Array<Record<string, string>> {
  const events: Array<Record<string, string>> = [];
  const veventRx = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m: RegExpExecArray | null;
  while ((m = veventRx.exec(raw)) !== null) {
    const block = m[1];
    const ev: Record<string, string> = {};
    // Unfold RFC5545 line folding (CRLF + whitespace)
    const unfolded = block.replace(/\r?\n[ \t]/g, "");
    for (const line of unfolded.split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key   = line.slice(0, colon).toUpperCase();
      const value = line.slice(colon + 1).trim();
      // Store first occurrence; handle params like DTSTART;TZID=...
      const baseKey = key.split(";")[0];
      if (!ev[baseKey]) ev[baseKey] = value;
      // Also store full key for TZID-aware parsing
      if (!ev[key]) ev[key] = value;
    }
    if (ev["UID"] && (ev["DTSTART"] || ev["DTSTART;VALUE=DATE"])) {
      events.push(ev);
    }
  }
  return events;
}

/** Convert ICS date string (YYYYMMDD or YYYYMMDDTHHmmssZ) to ISO 8601. */
function icsToISO(ics: string): { iso: string; allDay: boolean } {
  const cleaned = ics.replace(/Z$/, "").trim();
  if (/^\d{8}$/.test(cleaned)) {
    // All-day: YYYYMMDD
    return {
      iso:    `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`,
      allDay: true,
    };
  }
  // DateTime: YYYYMMDDTHHmmss[Z]
  const iso = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T${cleaned.slice(9, 11)}:${cleaned.slice(11, 13)}:${cleaned.slice(13, 15)}${ics.endsWith("Z") ? "Z" : ""}`;
  return { iso, allDay: false };
}

/** Format Date as ICS UTC timestamp for CalDAV queries. */
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List iCloud Calendar events in [start, end].
 * Returns [] silently if APPLE_APP_PASSWORD is not set.
 */
export async function listIcloudEvents(start: string, end: string): Promise<ICloudEvent[]> {
  const email    = process.env.APPLE_ID_EMAIL;
  const password = process.env.APPLE_APP_PASSWORD;
  if (!email || !password) return [];

  const auth = Buffer.from(`${email}:${password}`).toString("base64");

  try {
    const homePath = await discoverCalendarHome(auth);

    const startDt = new Date(start);
    const endDt   = new Date(end);
    const report  = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toICSDate(startDt)}" end="${toICSDate(endDt)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    const res = await rawRequest("REPORT", homePath, report, auth, {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    });

    const blocks = parseICSBlocks(res.body);
    const events: ICloudEvent[] = [];

    for (const b of blocks) {
      const uid     = b["UID"] ?? crypto.randomUUID();
      const summary = (b["SUMMARY"] ?? "").replace(/\\n/g, " ").replace(/\\,/g, ",") || "(untitled)";
      const location = b["LOCATION"] ? b["LOCATION"].replace(/\\,/g, ",").replace(/\\n/g, " ") : null;

      // DTSTART — try several key forms
      const dtStartRaw = b["DTSTART"] ?? b["DTSTART;VALUE=DATE"] ?? "";
      if (!dtStartRaw) continue;

      const { iso: startISO, allDay } = icsToISO(dtStartRaw);
      const dtEndRaw = b["DTEND"] ?? b["DTEND;VALUE=DATE"] ?? "";
      const endISO   = dtEndRaw ? icsToISO(dtEndRaw).iso : null;

      events.push({ id: uid, title: summary, start: startISO, end: endISO, all_day: allDay, location });
    }

    return events;
  } catch (e) {
    console.warn("[icloud/calendar] error:", (e as Error).message);
    return [];
  }
}
