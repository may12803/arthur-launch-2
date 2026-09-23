"use client";

import { useEffect, useState } from "react";

// Server components render in the server's time zone (UTC on Fly), which a
// client would misread as their own. This shows the viewer's local time, with
// the UTC value as the fallback before hydration and in the tooltip.
export function LocalTime({ iso }: { iso: string }) {
  const fmt = (tz?: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short",
    });
  const [text, setText] = useState(() => fmt("UTC"));
  useEffect(() => setText(fmt()), [iso]); // eslint-disable-line react-hooks/exhaustive-deps
  return <time dateTime={iso} title={fmt("UTC")}>{text}</time>;
}
