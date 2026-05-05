"use client";
import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";

interface SnapshotNode {
  id: string;
  title: string;
  lobe: string;
  inDegree: number;
  outDegree: number;
}

interface SnapshotEdge {
  source: string;
  target: string;
}

interface Snapshot {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    hubs: number;
    lobes: number;
  };
}

const LOBE_COLORS: Record<string, string> = {
  "ai-research":   "#60a5fa",
  "engineering":   "#ff4713",
  "business":      "#f59e0b",
  "design":        "#a78bfa",
  "knowledge":     "#ff4713",
  "memory":        "#f59e0b",
  "skills":        "#a78bfa",
  "agentic":       "#60a5fa",
  "upgrades":      "#4ade80",
  "data":          "#c084fc",
  "credit":        "#4ade80",
  "legal":         "#c084fc",
  "marketing":     "#f59e0b",
  "operations":    "#60a5fa",
  "finance":       "#4ade80",
};

function lobeColor(lobe: string): string {
  if (LOBE_COLORS[lobe]) return LOBE_COLORS[lobe];
  // deterministic hue from lobe name
  let h = 0;
  for (let i = 0; i < lobe.length; i++) h = (h * 31 + lobe.charCodeAt(i)) & 0xffff;
  const hue = (h % 360);
  return `hsl(${hue}, 70%, 65%)`;
}

interface D3Node extends SimulationNodeDatum {
  id: string;
  lobe: string;
  r: number;
  color: string;
}

interface D3Link extends SimulationLinkDatum<D3Node> {
  source: D3Node | string;
  target: D3Node | string;
}

interface SynapseOrb {
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  speed: number;
  color: string;
  startTime: number;
}

export default function BrainHero({ stats }: { stats?: Snapshot["stats"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Try live endpoint first; fall back to static JSON if it fails
    fetch("/brain/api/snapshot")
      .then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.json(); })
      .then(d => { if (!cancelled) { setSnapshot(d); setLoading(false); } })
      .catch(() => {
        fetch("/brain-snapshot.json")
          .then(r => r.json())
          .then(d => { if (!cancelled) { setSnapshot(d); setLoading(false); } })
          .catch(() => { if (!cancelled) setLoading(false); });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!snapshot || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext("2d")!;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width || 520;
      const h = w; // square
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.scale(dpr, dpr);
      return { w, h };
    };

    let { w, h } = resize();

    const nodes: D3Node[] = snapshot.nodes.map(n => ({
      id: n.id,
      lobe: n.lobe,
      r: Math.max(3, Math.min(10, 2 + n.inDegree * 0.08)),
      color: lobeColor(n.lobe),
    }));

    const nodeById = new Map(nodes.map(n => [n.id, n]));

    const links: D3Link[] = snapshot.edges
      .map(e => ({
        source: e.source,
        target: e.target,
      }))
      .filter(e => nodeById.has(e.source as string) && nodeById.has(e.target as string));

    const sim = forceSimulation<D3Node>(nodes)
      .force("link", forceLink<D3Node, D3Link>(links).id(d => d.id).distance(50).strength(0.4))
      .force("charge", forceManyBody<D3Node>().strength(-60))
      .force("center", forceCenter<D3Node>(w / 2, h / 2))
      .force("collide", forceCollide<D3Node>().radius(d => d.r + 2))
      .alphaDecay(0.025);

    let rafId: number;
    let simDone = false;
    const orbs: SynapseOrb[] = [];
    let lastOrbAt = 0;

    const resolvedLinks = links.map(l => ({
      s: nodeById.get(l.source as string)!,
      t: nodeById.get(l.target as string)!,
    })).filter(l => l.s && l.t);

    function spawnOrb() {
      if (prefersReduced || resolvedLinks.length === 0) return;
      const link = resolvedLinks[Math.floor(Math.random() * resolvedLinks.length)];
      if (!link.s || !link.t) return;
      orbs.push({
        from: { x: link.s.x!, y: link.s.y! },
        to: { x: link.t.x!, y: link.t.y! },
        t: 0,
        speed: 0.006 + Math.random() * 0.004,
        color: link.s.color,
        startTime: performance.now(),
      });
    }

    function draw() {
      const cw = canvas.width / (window.devicePixelRatio || 1);
      const ch = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, cw, ch);

      // edges
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.7;
      for (const l of resolvedLinks) {
        if (l.s.x == null || l.s.y == null || l.t.x == null || l.t.y == null) continue;
        const mx = (l.s.x + l.t.x) / 2;
        const my = (l.s.y + l.t.y) / 2;
        ctx.beginPath();
        ctx.moveTo(l.s.x, l.s.y);
        ctx.quadraticCurveTo(mx, my, l.t.x, l.t.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // nodes
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // synapse orbs
      const now = performance.now();
      for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        orb.t = Math.min(1, (now - orb.startTime) / 1000);
        if (orb.t >= 1) { orbs.splice(i, 1); continue; }
        const ease = orb.t < 0.5 ? 2 * orb.t * orb.t : -1 + (4 - 2 * orb.t) * orb.t;
        const x = orb.from.x + (orb.to.x - orb.from.x) * ease;
        const y = orb.from.y + (orb.to.y - orb.from.y) * ease;
        const alpha = orb.t < 0.2 ? orb.t / 0.2 : orb.t > 0.7 ? (1 - orb.t) / 0.3 : 1;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = orb.color;
        ctx.globalAlpha = alpha * 0.9;
        ctx.fill();
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, orb.color + "80");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (simDone && !prefersReduced && now - lastOrbAt > 800) {
        spawnOrb();
        lastOrbAt = now;
      }
    }

    function tick() {
      draw();
      rafId = requestAnimationFrame(tick);
    }

    sim.on("tick", () => { /* handled by rAF */ });
    sim.on("end", () => { simDone = true; });

    // stop simulation after ~3 seconds
    setTimeout(() => { sim.alphaTarget(0); }, 3000);

    rafId = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const nw = rect.width || 520;
      const nh = nw;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = nw * dpr;
      canvas.height = nh * dpr;
      canvas.style.width = nw + "px";
      canvas.style.height = nh + "px";
      ctx.scale(dpr, dpr);
      w = nw; h = nh;
      sim.force("center", forceCenter<D3Node>(nw / 2, nh / 2));
      sim.alpha(0.3).restart();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      sim.stop();
      ro.disconnect();
    };
  }, [snapshot]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          maxWidth: 520,
          aspectRatio: "1 / 1",
          position: "relative",
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--glass-border)",
          background: "rgba(255, 255, 255, 0.20)",
          backdropFilter: "blur(24px) saturate(1.5)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        {loading && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span
              className="mono-label skeleton"
              style={{ padding: "6px 16px", fontSize: 11 }}
            >
              mapping cortex…
            </span>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>

      {stats && (
        <div className="brain-stats">
          <div className="stat">
            <span className="sv">{stats.total_nodes.toLocaleString()}</span>
            <span className="sl">nodes</span>
          </div>
          <div className="stat">
            <span className="sv">{stats.total_edges.toLocaleString()}</span>
            <span className="sl">edges</span>
          </div>
          <div className="stat">
            <span className="sv">{stats.hubs}</span>
            <span className="sl">hubs</span>
          </div>
          <div className="stat">
            <span className="sv">{stats.lobes}</span>
            <span className="sl">lobes</span>
          </div>
        </div>
      )}
    </div>
  );
}
