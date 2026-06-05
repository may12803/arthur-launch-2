// Deterministic, offline-safe vendor chip. No runtime favicon/Clearbit fetches
// (those spammed ~86 ERR_NAME_NOT_RESOLVED console errors + network round-trips).
// Tokens match app/stack/page.tsx (GLASS_BORDER, ACCENT #d4ff3d, green/amber, MONO).

interface ApiLogoProps {
  domain: string;
  name: string;
  size?: number;
}

const GLASS_BORDER = 'rgba(255,255,255,0.08)';
const MONO = "'JetBrains Mono','GeistMono',monospace";

// On-theme tint palette (accent-family + muted neutrals), assigned deterministically
// by name hash so a given vendor always renders the same chip — no rainbow slop.
const TINTS: { bg: string; fg: string }[] = [
  { bg: 'rgba(212,255,61,0.10)', fg: 'rgba(212,255,61,0.92)' }, // accent
  { bg: 'rgba(52,211,153,0.10)', fg: 'rgba(52,211,153,0.90)' }, // green
  { bg: 'rgba(251,191,36,0.10)', fg: 'rgba(251,191,36,0.92)' }, // amber
  { bg: 'rgba(245,246,248,0.07)', fg: 'rgba(245,246,248,0.82)' }, // neutral
  { bg: 'rgba(125,211,252,0.10)', fg: 'rgba(125,211,252,0.90)' }, // sky
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function monogram(name: string): string {
  const words = name.trim().split(/[\s.&/-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? name;
  return w.slice(0, 2).toUpperCase();
}

export function ApiLogo({ name, size = 28 }: ApiLogoProps) {
  const tint = TINTS[hash(name) % TINTS.length];
  const label = monogram(name);

  return (
    <div
      aria-label={name}
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: tint.bg,
        border: `1px solid ${GLASS_BORDER}`,
        color: tint.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * (label.length > 1 ? 0.36 : 0.46)),
        fontWeight: 700,
        fontFamily: MONO,
        letterSpacing: '-.02em',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
}
