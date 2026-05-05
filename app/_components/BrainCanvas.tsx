"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

interface Utilization {
  counts: Record<string, number>;
  max: number;
  lastUpdated: string;
}

interface GraphNode {
  id: string;
  label: string;
  lobe: string;
  inDegree: number;
  outDegree: number;
  sizeBytes: number;
  crossLobeDegree: number;
  isHub: boolean;
  // d3 mutable fields
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  _r?: number;
}

interface GraphEdge {
  source: GraphNode | string;
  target: GraphNode | string;
  weight: number;
  kind: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lobes: Record<string, string>;
  stats: { nodes: number; edges: number; hubs: number; lobes: number };
}

interface SimPulse {
  hubId: string;
  targetId: string;
  startTime: number;
  lobeColor: string;
  orbSize: number;
}

const VIRIDIS: [number, number, number][] = [
  [68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],
  [31,158,137],[53,183,121],[109,205,89],[180,222,44],[253,231,37],
];

function viridis(t: number): [number, number, number] {
  const idx = Math.min(VIRIDIS.length - 2, Math.floor(t * (VIRIDIS.length - 1)));
  const f = t * (VIRIDIS.length - 1) - idx;
  const a = VIRIDIS[idx], b = VIRIDIS[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith('hsl')) {
    // convert hsl to rgb inline
    const m = hex.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (m) {
      const h = parseInt(m[1]) / 360, s = parseInt(m[2]) / 100, l = parseInt(m[3]) / 100;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const t2rgb = (t: number) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      return [Math.round(t2rgb(h + 1/3) * 255), Math.round(t2rgb(h) * 255), Math.round(t2rgb(h - 1/3) * 255)];
    }
  }
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbStr(r: number, g: number, b: number, a: number) {
  return `rgba(${r},${g},${b},${a})`;
}

function nodeR(n: GraphNode) {
  return Math.sqrt(n.inDegree + 4) * 2;
}

interface Props {
  source: '/brain-graph-full.json' | '/brain-snapshot.json' | '/brain/api/graph-full' | '/brain/api/snapshot';
  fullscreen?: boolean;
}

export default function BrainCanvas({ source, fullscreen = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [heatMode, setHeatMode] = useState(false);
  const [synapseOn, setSynapseOn] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchCount, setSearchCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hiddenLobes, setHiddenLobes] = useState<Set<string>>(new Set());

  // File content state
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const fileBodiesRef = useRef<Record<string, string> | null>(null);
  const fileBodiesLoadingRef = useRef(false);

  // Utilization state
  const utilizationRef = useRef<Utilization | null>(null);
  const [synapseLabel, setSynapseLabel] = useState<{ text: string; color: string } | null>(null);
  const synapseLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [synapseStats, setSynapseStats] = useState<{ tracked: number; total: number } | null>(null);

  // Refs to avoid stale closure in render loop
  const gsRef = useRef<{
    sim: d3.Simulation<GraphNode, GraphEdge>;
    nodes: GraphNode[];
    simEdges: GraphEdge[];
    adjOut: Map<string, Set<string>>;
    adjIn: Map<string, Set<string>>;
    neighbors1: (id: string) => Set<string>;
    nodeById: Map<string, GraphNode>;
    lobeColors: Record<string, string>;
    maxCross: number;
    lobeHulls: Record<string, [number, number][]>;
    pulses: SimPulse[];
    lobeCounts: Record<string, number>;
  } | null>(null);

  const stateRef = useRef({
    heatMode: false,
    synapseOn: false,
    searchIds: null as Set<string> | null,
    hiddenLobes: new Set<string>(),
    hoveredId: null as string | null,
    selectedId: null as string | null,
    transform: d3.zoomIdentity as d3.ZoomTransform,
  });
  const rafRef = useRef<number>(0);
  const synapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReduced = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Sync state to ref
  useEffect(() => { stateRef.current.heatMode = heatMode; }, [heatMode]);
  useEffect(() => { stateRef.current.synapseOn = synapseOn; }, [synapseOn]);
  useEffect(() => { stateRef.current.hiddenLobes = hiddenLobes; }, [hiddenLobes]);

  // Load data — try live endpoint first, fall back to static JSON
  useEffect(() => {
    let cancelled = false;
    const liveUrl = source === '/brain-graph-full.json' ? '/brain/api/graph-full'
      : source === '/brain-snapshot.json' ? '/brain/api/snapshot'
      : source;
    const staticUrl = source === '/brain/api/graph-full' ? '/brain-graph-full.json'
      : source === '/brain/api/snapshot' ? '/brain-snapshot.json'
      : null;
    async function load() {
      try {
        const r = await fetch(liveUrl);
        if (!r.ok) throw new Error(`status ${r.status}`);
        const d: GraphData = await r.json();
        if (!cancelled) { setData(d); setLoading(false); }
      } catch {
        if (staticUrl) {
          try {
            const r2 = await fetch(staticUrl);
            const d: GraphData = await r2.json();
            if (!cancelled) { setData(d); setLoading(false); }
          } catch (e2) {
            if (!cancelled) { setError(String(e2)); setLoading(false); }
          }
        } else {
          if (!cancelled) { setLoading(false); }
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [source]);

  // Main canvas effect
  useEffect(() => {
    if (!data || !canvasRef.current || !wrapRef.current) return;

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d')!;
    const st = stateRef.current;

    function getSize() {
      const rect = wrap.getBoundingClientRect();
      return { W: rect.width || 800, H: rect.height || 600 };
    }

    function sizeCanvas() {
      const { W, H } = getSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { W, H };
    }

    let { W, H } = sizeCanvas();

    // Build nodes
    const nodes: GraphNode[] = data.nodes.map(n => ({ ...n, _r: nodeR(n) }));
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Build adjacency
    const adjOut = new Map<string, Set<string>>();
    const adjIn = new Map<string, Set<string>>();
    for (const n of nodes) { adjOut.set(n.id, new Set()); adjIn.set(n.id, new Set()); }

    const simEdges: GraphEdge[] = [];
    for (const e of data.edges) {
      const sid = typeof e.source === 'string' ? e.source : e.source.id;
      const tid = typeof e.target === 'string' ? e.target : e.target.id;
      const s = nodeById.get(sid), t = nodeById.get(tid);
      if (!s || !t) continue;
      simEdges.push({ source: s, target: t, weight: e.weight, kind: e.kind });
      adjOut.get(sid)!.add(tid);
      adjIn.get(tid)!.add(sid);
    }

    function neighbors1(id: string) {
      const s = new Set<string>();
      (adjOut.get(id) || new Set()).forEach(x => s.add(x));
      (adjIn.get(id) || new Set()).forEach(x => s.add(x));
      return s;
    }

    const lobeCounts: Record<string, number> = {};
    for (const n of nodes) lobeCounts[n.lobe] = (lobeCounts[n.lobe] || 0) + 1;

    const maxCross = Math.max(1, ...nodes.map(n => n.crossLobeDegree || n.inDegree));
    const pulses: SimPulse[] = [];
    let lobeHulls: Record<string, [number, number][]> = {};

    // Simulation
    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
        .id(d => d.id).distance(60)
        .strength(d => {
          const s = d.source as GraphNode;
          return 1 / Math.max(1, s.inDegree || 1);
        }))
      .force('charge', d3.forceManyBody<GraphNode>().strength(d => d.isHub ? -300 : -80))
      .force('collide', d3.forceCollide<GraphNode>().radius(d => (d._r || 4) + 2))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .alphaDecay(0.02);

    setTimeout(() => { sim.alphaTarget(0); }, 3500);

    // Compute hulls after settle
    setTimeout(() => {
      const byLobe: Record<string, [number, number][]> = {};
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        if (!byLobe[n.lobe]) byLobe[n.lobe] = [];
        byLobe[n.lobe].push([n.x, n.y]);
      }
      const newHulls: Record<string, [number, number][]> = {};
      for (const [lobe, pts] of Object.entries(byLobe)) {
        if (pts.length >= 3) {
          const h = d3.polygonHull(pts);
          if (h) newHulls[lobe] = h;
        }
      }
      lobeHulls = newHulls;
      if (gsRef.current) gsRef.current.lobeHulls = lobeHulls;
    }, 3600);

    gsRef.current = { sim, nodes, simEdges, adjOut, adjIn, neighbors1, nodeById, lobeColors: data.lobes, maxCross, lobeHulls, pulses, lobeCounts };

    // d3 zoom
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.04, 14])
      .on('zoom', ev => {
        st.transform = ev.transform;
        render();
      });
    d3.select(canvas).call(zoom);

    // Zoom-to-fit helper
    function zoomFit() {
      const xs = nodes.filter(n => n.x != null).map(n => n.x!);
      const ys = nodes.filter(n => n.y != null).map(n => n.y!);
      if (!xs.length) return;
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      const y0 = Math.min(...ys), y1 = Math.max(...ys);
      const pw = x1 - x0 + 60, ph = y1 - y0 + 60;
      const k = Math.min(W / pw, H / ph, 1.2);
      const tx = (W - k * (x0 + x1)) / 2;
      const ty = (H - k * (y0 + y1)) / 2;
      d3.select(canvas).transition().duration(600)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    }
    (canvas as unknown as { _zoomFit: () => void })._zoomFit = zoomFit;

    // d3 drag (node drag)
    d3.select(canvas).call(
      d3.drag<HTMLCanvasElement, unknown>()
        .filter(ev => {
          const found = findNode(ev as MouseEvent);
          return !!found;
        })
        .subject((ev: Event) => findNode(ev as MouseEvent) as unknown as d3.SubjectPosition)
        .on('start', (ev) => {
          const subj = ev.subject as GraphNode;
          if (!ev.active) sim.alphaTarget(0.3).restart();
          subj.fx = subj.x; subj.fy = subj.y;
        })
        .on('drag', (ev) => {
          const subj = ev.subject as GraphNode;
          subj.fx = (ev.x - st.transform.x) / st.transform.k;
          subj.fy = (ev.y - st.transform.y) / st.transform.k;
          render();
        })
        .on('end', (ev) => {
          const subj = ev.subject as GraphNode;
          if (!ev.active) sim.alphaTarget(0);
          subj.fx = null; subj.fy = null;
        })
    );

    function findNode(ev: MouseEvent): GraphNode | null {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const sx = (mx - st.transform.x) / st.transform.k;
      const sy = (my - st.transform.y) / st.transform.k;
      let best: GraphNode | null = null, bestD2 = Infinity;
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const dx = n.x - sx, dy = n.y - sy;
        const d2 = dx * dx + dy * dy;
        const r = (n._r || 4) + 4;
        if (d2 < r * r && d2 < bestD2) { best = n; bestD2 = d2; }
      }
      return best;
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mouseleave', onMouseLeave);

    function onMouseLeave() {
      st.hoveredId = null;
      const tip = document.getElementById('bc-tooltip');
      if (tip) tip.style.opacity = '0';
      render();
    }

    function onMouseMove(ev: MouseEvent) {
      const found = findNode(ev);
      const tip = document.getElementById('bc-tooltip');
      if (found) {
        st.hoveredId = found.id;
        if (tip) {
          tip.style.opacity = '1';
          const rect = canvas.getBoundingClientRect();
          tip.style.left = (ev.clientX - rect.left + 16) + 'px';
          tip.style.top = (ev.clientY - rect.top + 8) + 'px';
          const kb = found.sizeBytes ? (found.sizeBytes / 1024).toFixed(1) + ' KB' : '';
          const col = gsRef.current?.lobeColors[found.lobe] || '#8892a4';
          tip.innerHTML = `<b style="color:${col}">${found.label}</b><div class="bc-tip-meta">${found.lobe}</div><div class="bc-tip-meta">in ${found.inDegree} · out ${found.outDegree}${found.crossLobeDegree ? ' · cross ' + found.crossLobeDegree : ''}${kb ? ' · ' + kb : ''}</div>`;
        }
      } else {
        st.hoveredId = null;
        if (tip) tip.style.opacity = '0';
      }
      render();
    }

    function onCanvasClick(ev: MouseEvent) {
      const found = findNode(ev);
      if (!found) {
        st.selectedId = null;
        setSelected(null);
        render();
        return;
      }
      if (st.selectedId === found.id) {
        st.selectedId = null;
        setSelected(null);
      } else {
        st.selectedId = found.id;
        setSelected(found);
      }
      render();
    }

    // Render
    function render() {
      const { transform, heatMode, searchIds, hiddenLobes, hoveredId, selectedId } = stateRef.current;
      const gs = gsRef.current;
      if (!gs) return;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Lobe hulls
      for (const [lobe, hull] of Object.entries(gs.lobeHulls)) {
        if (!hull || hiddenLobes.has(lobe)) continue;
        const [r, g, b] = hexToRgb(gs.lobeColors[lobe] || '#8892a4');
        ctx.beginPath();
        ctx.moveTo(hull[0][0], hull[0][1]);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
        ctx.closePath();
        ctx.fillStyle = rgbStr(r, g, b, 0.05); ctx.fill();
        ctx.strokeStyle = rgbStr(r, g, b, 0.25); ctx.lineWidth = 0.8 / transform.k; ctx.stroke();
      }

      const focusId = hoveredId || selectedId;
      let focusNbrs: Set<string> | null = null;
      if (focusId) { focusNbrs = gs.neighbors1(focusId); focusNbrs.add(focusId); }

      // Edges
      for (const e of gs.simEdges) {
        const s = e.source as GraphNode, t = e.target as GraphNode;
        if (hiddenLobes.has(s.lobe) || hiddenLobes.has(t.lobe)) continue;
        if (searchIds && !searchIds.has(s.id) && !searchIds.has(t.id)) continue;
        if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
        const isHl = focusNbrs && focusNbrs.has(s.id) && focusNbrs.has(t.id) && (s.id === focusId || t.id === focusId);
        const alpha = searchIds ? 0.08 : isHl ? 0.85 : focusNbrs ? 0.02 : 0.07;
        const mx = (s.x + t.x) / 2 + (t.y - s.y) * 0.12;
        const my = (s.y + t.y) / 2 - (t.x - s.x) * 0.12;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(mx, my, t.x, t.y);
        ctx.strokeStyle = isHl ? rgbStr(255, 255, 255, alpha) : rgbStr(58, 66, 80, alpha);
        ctx.lineWidth = (isHl ? 1.2 : 0.6) / transform.k; ctx.stroke();
      }

      // Synapse pulses
      if (!prefersReduced) {
        const now = Date.now();
        for (let i = gs.pulses.length - 1; i >= 0; i--) {
          const p = gs.pulses[i];
          const elapsed = (now - p.startTime) / 1200;
          if (elapsed > 1) { gs.pulses.splice(i, 1); continue; }
          const hub = gs.nodeById.get(p.hubId), tgt = gs.nodeById.get(p.targetId);
          if (!hub || !tgt || hub.x == null || hub.y == null || tgt.x == null || tgt.y == null) { gs.pulses.splice(i, 1); continue; }
          // ease-out: fast start, slow finish
          const t01 = 1 - Math.pow(1 - Math.min(1, elapsed), 2);
          const alpha = Math.sin(elapsed * Math.PI) * 0.9;
          const px = hub.x + (tgt.x - hub.x) * t01;
          const py = hub.y + (tgt.y - hub.y) * t01;
          const orbR = (p.orbSize || 3) / transform.k;
          // hub node glow burst at start
          if (elapsed < 0.2) {
            const [pr, pg, pb] = hexToRgb(p.lobeColor || '#8892a4');
            const burstAlpha = (1 - elapsed / 0.2) * 0.5;
            const burstR = (hub._r || 4) * (1 + elapsed * 3) / transform.k;
            ctx.beginPath(); ctx.arc(hub.x, hub.y, burstR, 0, Math.PI * 2);
            ctx.fillStyle = rgbStr(pr, pg, pb, burstAlpha); ctx.fill();
          }
          const [cr, cg, cb] = hexToRgb(p.lobeColor || '#8892a4');
          ctx.beginPath(); ctx.arc(px, py, orbR, 0, Math.PI * 2);
          ctx.fillStyle = rgbStr(cr, cg, cb, alpha); ctx.fill();
        }
      }

      // Hub glows
      for (const n of gs.nodes) {
        if (!n.isHub || hiddenLobes.has(n.lobe) || n.x == null || n.y == null) continue;
        const dimmed = (focusNbrs && !focusNbrs.has(n.id)) || (searchIds && !searchIds.has(n.id));
        if (dimmed) continue;
        const [r, g, b] = heatMode
          ? viridis(Math.min(1, (n.crossLobeDegree || n.inDegree) / gs.maxCross))
          : hexToRgb(gs.lobeColors[n.lobe] || '#8892a4');
        const nr = n._r || 4;
        const grd = ctx.createRadialGradient(n.x, n.y, nr * 0.5, n.x, n.y, nr * 2.8);
        grd.addColorStop(0, rgbStr(r, g, b, 0.25)); grd.addColorStop(1, rgbStr(r, g, b, 0));
        ctx.beginPath(); ctx.arc(n.x, n.y, nr * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
      }

      // Nodes
      for (const n of gs.nodes) {
        if (hiddenLobes.has(n.lobe) || n.x == null || n.y == null) continue;
        const [r, g, b] = heatMode
          ? viridis(Math.min(1, (n.crossLobeDegree || n.inDegree) / gs.maxCross))
          : hexToRgb(gs.lobeColors[n.lobe] || '#8892a4');
        const isHov = n.id === hoveredId, isSel = n.id === selectedId;
        const dimmed = (focusNbrs && !focusNbrs.has(n.id)) || (searchIds && !searchIds.has(n.id));
        const nodeAlpha = dimmed ? 0.18 : 1;
        const nr = n._r || 4;
        const rr = (isHov || isSel) ? nr * 1.25 : nr;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = rgbStr(r, g, b, nodeAlpha); ctx.fill();
        if (isSel) {
          ctx.strokeStyle = rgbStr(255, 255, 255, 0.9); ctx.lineWidth = 1.5 / transform.k; ctx.stroke();
        } else if (isHov) {
          ctx.strokeStyle = rgbStr(r, g, b, 0.6); ctx.lineWidth = 1 / transform.k; ctx.stroke();
        }
      }

      ctx.restore();
    }

    // rAF loop
    function tick() {
      render();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    sim.on('tick', () => { /* rAF handles it */ });

    // Resize observer
    const ro = new ResizeObserver(() => {
      const { W: nW, H: nH } = sizeCanvas();
      W = nW; H = nH;
      sim.force('center', d3.forceCenter(nW / 2, nH / 2));
      sim.alpha(0.3).restart();
    });
    ro.observe(wrap);

    // Expose jumpTo for detail panel neighbor clicks
    (canvas as unknown as { _jumpTo: (id: string) => void })._jumpTo = (id: string) => {
      const n = gsRef.current?.nodeById.get(id);
      if (!n) return;
      stateRef.current.selectedId = id;
      setSelected(n);
      const scale = Math.max(st.transform.k, 2);
      d3.select(canvas).transition().duration(500)
        .call(zoom.transform, d3.zoomIdentity.translate(W / 2 - (n.x || 0) * scale, H / 2 - (n.y || 0) * scale).scale(scale));
      render();
    };

    (canvas as unknown as { _resetView: () => void })._resetView = () => {
      d3.select(canvas).transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    };

    return () => {
      cancelAnimationFrame(rafRef.current);
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [data, prefersReduced]);

  // Synapse engine — utilization-weighted
  useEffect(() => {
    if (!synapseOn || !gsRef.current) return;

    let cancelled = false;

    async function loadUtilization() {
      if (utilizationRef.current) return utilizationRef.current;
      try {
        // Try live endpoint first; fall back to static JSON
        let r = await fetch('/brain/api/utilization');
        if (!r.ok) r = await fetch('/brain-utilization.json');
        if (!r.ok) throw new Error(`status ${r.status}`);
        const u: Utilization = await r.json();
        utilizationRef.current = u;
        // compute stats
        const tracked = Object.keys(u.counts).length;
        const total = Object.values(u.counts).reduce((a, b) => a + b, 0);
        setSynapseStats({ tracked, total });
        return u;
      } catch (err) {
        console.warn('[synapse] failed to load utilization, falling back to inDegree weights', err);
        return null;
      }
    }

    function pickWeightedNode(util: Utilization | null): GraphNode | null {
      const gs = gsRef.current;
      if (!gs) return null;

      if (util) {
        // Build cumulative distribution from utilization counts, filtered to nodes in graph
        const entries: Array<{ node: GraphNode; count: number }> = [];
        for (const [path, count] of Object.entries(util.counts)) {
          const n = gs.nodeById.get(path);
          if (n) entries.push({ node: n, count });
        }
        if (entries.length === 0) return null;
        const total = entries.reduce((s, e) => s + e.count, 0);
        const rnd = Math.random() * total;
        let cum = 0;
        for (const e of entries) {
          cum += e.count;
          if (rnd <= cum) return e.node;
        }
        return entries[entries.length - 1].node;
      } else {
        // fallback: inDegree-weighted
        const nodes = gs.nodes;
        const totalDeg = nodes.reduce((s, n) => s + (n.inDegree || 1), 0);
        const rnd = Math.random() * totalDeg;
        let cum = 0;
        for (const n of nodes) {
          cum += n.inDegree || 1;
          if (rnd <= cum) return n;
        }
        return nodes[nodes.length - 1];
      }
    }

    function fireSynapse(util: Utilization | null) {
      const gs = gsRef.current;
      if (!gs || cancelled) return;

      let node: GraphNode | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = pickWeightedNode(util);
        if (candidate && gs.adjOut.get(candidate.id)?.size) {
          node = candidate;
          break;
        }
      }
      if (!node) {
        synapseTimerRef.current = setTimeout(() => fireSynapse(util), 1100);
        return;
      }

      const outs = Array.from(gs.adjOut.get(node.id) || []);
      const now = Date.now();
      const lobeColor = gs.lobeColors[node.lobe] || '#8892a4';
      const count = util?.counts[node.id] ?? node.inDegree;
      const orbSize = Math.max(2, Math.log(count + 1) * 1.4);

      for (const targetId of outs) {
        gs.pulses.push({ hubId: node.id, targetId, startTime: now, lobeColor, orbSize });
      }

      // Show floating label
      const filename = node.id.split('/').pop() || node.id;
      setSynapseLabel({ text: `firing · ${filename} · ${count} retrievals`, color: lobeColor });
      if (synapseLabelTimerRef.current) clearTimeout(synapseLabelTimerRef.current);
      synapseLabelTimerRef.current = setTimeout(() => setSynapseLabel(null), 1050);

      if (!cancelled) {
        synapseTimerRef.current = setTimeout(() => fireSynapse(util), 1100);
      }
    }

    loadUtilization().then(util => {
      if (!cancelled) fireSynapse(util);
    });

    return () => {
      cancelled = true;
      if (synapseTimerRef.current) clearTimeout(synapseTimerRef.current);
      if (synapseLabelTimerRef.current) clearTimeout(synapseLabelTimerRef.current);
      if (gsRef.current) gsRef.current.pulses.length = 0;
      setSynapseLabel(null);
    };
  }, [synapseOn]);

  // File content lazy-load
  useEffect(() => {
    if (!selected) { setFileContent(null); return; }

    const lookup = (bodies: Record<string, string>) => {
      const body = bodies[selected.id];
      setFileContent(body !== undefined ? body : '__not_found__');
      setContentLoading(false);
    };

    if (fileBodiesRef.current) {
      lookup(fileBodiesRef.current);
      return;
    }

    if (fileBodiesLoadingRef.current) {
      // poll until loaded
      const poll = setInterval(() => {
        if (fileBodiesRef.current) {
          clearInterval(poll);
          lookup(fileBodiesRef.current);
        }
      }, 100);
      return () => clearInterval(poll);
    }

    setContentLoading(true);
    fileBodiesLoadingRef.current = true;

    // Try live endpoint first; fall back to static JSON
    fetch('/brain/api/files')
      .then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.json() as Promise<Record<string, string>>; })
      .catch(() => fetch('/brain-files.json').then(r => r.json() as Promise<Record<string, string>>))
      .then(bodies => {
        fileBodiesRef.current = bodies;
        fileBodiesLoadingRef.current = false;
        lookup(bodies);
      })
      .catch(err => {
        console.warn('[brain] failed to load files, falling back to empty', err);
        fileBodiesRef.current = {};
        fileBodiesLoadingRef.current = false;
        setFileContent('__not_found__');
        setContentLoading(false);
      });
  }, [selected]);

  // Search
  const handleSearch = useCallback((q: string) => {
    setSearchQ(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const gs = gsRef.current;
      if (!gs) return;
      if (!q.trim()) {
        stateRef.current.searchIds = null;
        setSearchCount(null);
        return;
      }
      const ql = q.toLowerCase();
      const matches = gs.nodes.filter(n =>
        n.label.toLowerCase().includes(ql) || n.id.toLowerCase().includes(ql) || n.lobe.toLowerCase().includes(ql)
      );
      stateRef.current.searchIds = new Set(matches.map(n => n.id));
      setSearchCount(matches.length);
      if (matches.length === 1) {
        const n = matches[0];
        const canvas = canvasRef.current as unknown as { _jumpTo: (id: string) => void };
        if (canvas._jumpTo) canvas._jumpTo(n.id);
      }
    }, 80);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        ev.preventDefault();
        document.getElementById('bc-search')?.focus();
      } else if (ev.key === 'Escape') {
        const si = document.getElementById('bc-search') as HTMLInputElement | null;
        if (si) { si.value = ''; handleSearch(''); si.blur(); }
        stateRef.current.selectedId = null;
        stateRef.current.hoveredId = null;
        stateRef.current.searchIds = null;
        setSelected(null);
        setSearchCount(null);
        const canvas = canvasRef.current as unknown as { _resetView: () => void };
        if (canvas?._resetView) canvas._resetView();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSearch]);

  const gs = gsRef.current;
  const lobeEntries = gs ? Object.entries(gs.lobeColors).filter(([l]) => (gs.lobeCounts[l] || 0) > 0) : [];

  const selectedNeighbors = selected && gs
    ? Array.from(gs.neighbors1(selected.id)).map(id => gs.nodeById.get(id)).filter(Boolean) as GraphNode[]
    : [];
  selectedNeighbors.sort((a, b) => b.inDegree - a.inDegree);

  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: 'relative', width: '100%', height: 'calc(100vh - 57px)', overflow: 'hidden', background: 'var(--bg)' }
    : { position: 'relative', width: '100%', height: '600px', overflow: 'hidden', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' };

  return (
    <div ref={wrapRef} style={wrapStyle}>
      {/* Tooltip */}
      <div id="bc-tooltip" style={{
        position: 'absolute', pointerEvents: 'none', zIndex: 20,
        background: 'rgba(19,22,27,0.95)', border: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 14px', borderRadius: 8,
        fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)', fontSize: 11,
        color: 'var(--text)', maxWidth: 280, backdropFilter: 'blur(12px)',
        opacity: 0, transition: 'opacity 0.1s', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)',
        top: 0, left: 0,
      }} />

      {/* Controls */}
      <div style={{
        position: 'absolute', top: fullscreen ? 16 : 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: 13, pointerEvents: 'none' }}>⌕</span>
          <input
            id="bc-search"
            aria-label="Search knowledge graph nodes"
            value={searchQ}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search nodes… (press /)"
            autoComplete="off"
            style={{
              width: 220, padding: '7px 38px 7px 34px',
              background: 'rgba(19,22,27,0.9)', border: '1px solid var(--border-strong)',
              color: 'var(--text)', borderRadius: 8,
              fontFamily: 'var(--font-inter, Inter, sans-serif)', fontSize: 12.5,
              outline: 'none', backdropFilter: 'blur(14px)',
            }}
          />
          {searchCount !== null && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10 }}>
              {searchCount}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            const c = canvasRef.current as unknown as { _resetView: () => void };
            if (c?._resetView) c._resetView();
          }}
          style={ctrlStyle(false)}
        >reset view</button>
        <button onClick={() => setHeatMode(h => !h)} style={ctrlStyle(heatMode)}>
          heat: {heatMode ? 'on' : 'off'}
        </button>
        {!prefersReduced && (
          <button onClick={() => setSynapseOn(s => !s)} style={ctrlStyle(synapseOn)}>
            synapse: {synapseOn ? 'on' : 'off'}
          </button>
        )}
      </div>

      {/* Synapse floating label */}
      {synapseLabel && !prefersReduced && (
        <div style={{
          position: 'absolute', top: fullscreen ? 60 : 52, left: '50%', transform: 'translateX(-50%)',
          zIndex: 12, pointerEvents: 'none',
          fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)', fontSize: 11,
          color: synapseLabel.color, opacity: 0.85,
          background: 'rgba(19,22,27,0.7)', backdropFilter: 'blur(8px)',
          padding: '4px 10px', borderRadius: 5,
          border: `1px solid ${synapseLabel.color}40`,
          animation: 'bc-synapse-fade 1.05s ease forwards',
          whiteSpace: 'nowrap',
        }}>
          {synapseLabel.text}
        </div>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab', position: 'absolute', top: 0, left: 0 }} />

      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, color: 'var(--text-dim)',
          fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 12, letterSpacing: '0.08em',
        }}>
          <span>mapping cortex…</span>
          <div style={{ width: 200, height: 2, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, animation: 'bc-shimmer 1.4s ease-in-out infinite', width: '60%' }} />
          </div>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 12 }}>
          couldn't load graph — {error}
        </div>
      )}

      {/* Lobe Legend (fullscreen only) */}
      {fullscreen && !loading && gs && lobeEntries.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 24, left: 24, zIndex: 10,
          background: 'rgba(19,22,27,0.75)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '14px 16px', backdropFilter: 'blur(14px)',
          fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 11.5,
          maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
        }}>
          <div
            style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setHiddenLobes(new Set())}
          >
            Lobes · click to solo
          </div>
          {lobeEntries.map(([lobe, color]) => {
            const count = gs.lobeCounts[lobe] || 0;
            if (!count) return null;
            const hidden = hiddenLobes.has(lobe);
            return (
              <div
                key={lobe}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setHiddenLobes(prev => {
                    const all = Object.keys(gs.lobeColors).filter(l => (gs.lobeCounts[l] || 0) > 0);
                    const wasSolo = prev.size === all.length - 1 && !prev.has(lobe);
                    if (ev.shiftKey) {
                      const next = new Set(prev);
                      if (next.has(lobe)) next.delete(lobe); else next.add(lobe);
                      return next;
                    }
                    if (wasSolo) return new Set();
                    const next = new Set(all.filter(l => l !== lobe));
                    return next;
                  });
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0',
                  color: 'var(--text)', cursor: 'pointer', userSelect: 'none',
                  opacity: hidden ? 0.3 : 1, transition: 'opacity 0.15s',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80`, flexShrink: 0 }} />
                <span>{lobe}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 10.5, paddingLeft: 12 }}>{count}</span>
              </div>
            );
          })}
          <div style={{ color: 'var(--text-faint)', fontSize: 9.5, marginTop: 10, letterSpacing: '0.05em' }}>shift+click multi · click header to reset</div>
        </div>
      )}

      {/* Stats panel (bottom right) */}
      {!loading && data && (
        <div style={{
          position: 'absolute', bottom: 24, right: selected ? 412 : 24, zIndex: 10,
          background: 'rgba(19,22,27,0.75)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', backdropFilter: 'blur(14px)',
          fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 11.5,
          color: 'var(--text-dim)', transition: 'right 0.25s',
        }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.stats.nodes.toLocaleString()}</span> nodes ·{' '}
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.stats.edges.toLocaleString()}</span> edges ·{' '}
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.stats.hubs}</span> hubs
          {synapseOn && synapseStats && (
            <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 5, letterSpacing: '0.05em' }}>
              synapse · <strong style={{ color: 'var(--text)' }}>{synapseStats.tracked}</strong> tracked files · <strong style={{ color: 'var(--text)' }}>{synapseStats.total.toLocaleString()}</strong> retrievals
            </div>
          )}
          <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>drag · scroll · click</div>
        </div>
      )}

      {/* Detail panel */}
      {selected && gs && (
        <div style={{
          position: 'absolute', top: fullscreen ? 72 : 60, right: 24, width: 360,
          maxHeight: 'calc(100% - 110px)', overflowY: 'auto',
          background: 'rgba(19,22,27,0.92)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 20, zIndex: 15,
          backdropFilter: 'blur(14px)', boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
              background: gs.lobeColors[selected.lobe] || '#8892a4',
              boxShadow: `0 0 8px ${gs.lobeColors[selected.lobe] || '#8892a4'}80`,
            }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              {selected.label}
            </span>
            <button
              onClick={() => { stateRef.current.selectedId = null; setSelected(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
            >✕</button>
          </div>
          <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5, color: 'var(--text-dim)', marginBottom: 12, wordBreak: 'break-all', lineHeight: 1.5 }}>
            {selected.id}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5, color: 'var(--text-dim)' }}>
            <span>in <strong style={{ color: 'var(--text)' }}>{selected.inDegree}</strong></span>
            <span>out <strong style={{ color: 'var(--text)' }}>{selected.outDegree}</strong></span>
            <span>cross <strong style={{ color: 'var(--text)' }}>{selected.crossLobeDegree}</strong></span>
            {selected.sizeBytes > 0 && <span><strong style={{ color: 'var(--text)' }}>{(selected.sizeBytes / 1024).toFixed(1)} KB</strong></span>}
          </div>
          {selectedNeighbors.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
                Neighbors ({selectedNeighbors.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                {selectedNeighbors.slice(0, 20).map(nb => {
                  const nc = gs.lobeColors[nb.lobe] || '#8892a4';
                  return (
                    <div
                      key={nb.id}
                      onClick={() => {
                        const c = canvasRef.current as unknown as { _jumpTo: (id: string) => void };
                        if (c?._jumpTo) c._jumpTo(nb.id);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5, color: 'var(--text-dim)', cursor: 'pointer', padding: '3px 6px', borderRadius: 5, transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: nc, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nb.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Content section */}
          <div style={{ marginTop: selectedNeighbors.length > 0 ? 16 : 4 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
              content
            </div>
            {contentLoading && (
              <div className="bc-tip-meta" style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5 }}>
                loading content…
              </div>
            )}
            {!contentLoading && fileContent === '__not_found__' && (
              <div className="bc-tip-meta" style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10.5 }}>
                no body cached
              </div>
            )}
            {!contentLoading && fileContent && fileContent !== '__not_found__' && (
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)', fontSize: 10,
                color: 'var(--text-dim)', maxHeight: 280, overflowY: 'auto',
                lineHeight: 1.6, padding: '8px 10px',
                background: 'rgba(0,0,0,0.25)', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                {fileContent}
              </pre>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bc-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(280%); } }
        @keyframes bc-synapse-fade { 0% { opacity: 0; } 15% { opacity: 0.85; } 75% { opacity: 0.85; } 100% { opacity: 0; } }
        #bc-search:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-soft); }
        .bc-tip-meta { color: var(--text-dim); margin-top: 3px; font-size: 10.5px; }
      `}</style>
    </div>
  );
}

function ctrlStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 7,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
    background: active ? 'var(--accent-soft)' : 'rgba(19,22,27,0.8)',
    color: active ? 'var(--accent)' : 'var(--text-dim)',
    fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)', fontSize: 11,
    cursor: 'pointer', backdropFilter: 'blur(14px)', transition: 'all 0.15s',
    letterSpacing: 0, whiteSpace: 'nowrap',
  };
}
