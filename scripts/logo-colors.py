#!/usr/bin/env python3
"""Brand color per connector logo, for the tinted logo square on /integrations and the industry pages.
SVG: its fill colour. PNG/JPG: the most common saturated, non-white, non-black pixel colour.
Writes src/content/logo-colors.json  {"xero.svg": "#13B5EA", ...}.   python3 scripts/logo-colors.py"""
import json, os, re
from collections import Counter
from PIL import Image

DIR = "public/connectors/logos"
OUT = "lib/client-portal/logo-colors.json"
NEUTRAL = "#5b6472"

def from_svg(path):
    s = open(path, encoding="utf8", errors="ignore").read()
    for c in re.findall(r'fill[=:]\s*["\']?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b', s):
        c = c if len(c) == 7 else "#" + "".join(ch * 2 for ch in c[1:])
        r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
        if max(r, g, b) - min(r, g, b) > 24 or max(r, g, b) < 90:  # coloured, or a deliberately dark mark
            return c.upper()
    return NEUTRAL

def from_raster(path):
    im = Image.open(path).convert("RGBA").resize((64, 64))
    seen = Counter()
    for r, g, b, a in im.getdata():
        if a < 200 or max(r, g, b) > 235 and min(r, g, b) > 215 or max(r, g, b) < 25:
            continue
        if max(r, g, b) - min(r, g, b) < 30:
            continue
        seen[(r // 16 * 16, g // 16 * 16, b // 16 * 16)] += 1
    if not seen:
        return NEUTRAL
    r, g, b = seen.most_common(1)[0][0]
    return "#%02X%02X%02X" % (r, g, b)

colors = {}
for f in sorted(os.listdir(DIR)):
    p = os.path.join(DIR, f)
    if f.endswith(".svg"):
        colors[f] = from_svg(p)
    elif f.rsplit(".", 1)[-1] in ("png", "jpg", "jpeg", "webp"):
        colors[f] = from_raster(p)
json.dump(colors, open(OUT, "w"), indent=1)
print(len(colors), "logo colours ->", OUT)
