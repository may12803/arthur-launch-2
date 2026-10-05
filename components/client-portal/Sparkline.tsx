// Inline SVG sparkline, no client JS. Points are [isoDate, value]; the last point is marked.
export function Sparkline({ points, label, width = 132, height = 36 }: { points: [string, number][]; label: string; width?: number; height?: number }) {
  if (points.length < 2) return <span className="text-[11px] text-[var(--muted)]">No history</span>;
  const vals = points.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, ${points[0][0].slice(0, 4)} to ${last[0].slice(0, 4)}`}>
      <path d={d} fill="none" stroke="var(--blue-action)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last[1])} r="2.5" fill="var(--blue-action)" />
    </svg>
  );
}
