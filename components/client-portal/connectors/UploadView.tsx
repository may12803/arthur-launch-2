"use client";

import { useMemo, useRef, useState } from "react";
import { UPLOAD_TARGETS, autoMap, parseCsv, parseDateValue, parseNumberValue, type ColumnMap } from "@/lib/client-portal/connector-ui";
import { LocalTime } from "../LocalTime";
import { Notice, Panel, PanelHead, Pill, TableWrap } from "../cp";

export type UploadHistoryRow = { id: string; target_object: string; row_count: number | null; status: string; created_at: string };
type Parsed = { file: File; fileName: string; size: number; sheet?: string; headers: string[]; rows: string[][] };
type Result = { imported: number; unchanged: number; skipped: number; row_count: number; errors: { row: number; field: string; message: string }[]; more_errors: number };

const MAX_BYTES = 20 * 1024 * 1024;
const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

async function readFile(file: File): Promise<Parsed> {
  if (file.size > MAX_BYTES) throw new Error("That file is larger than 20 MB. Split it by month and upload each part.");
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const { headers, rows } = parseCsv(await file.text());
    return { file, fileName: file.name, size: file.size, headers, rows };
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const name = wb.SheetNames[0];
    if (!name) throw new Error("That workbook has no sheets.");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false });
    const rows = grid.map((r) => (r as unknown[]).map((c) => String(c ?? "")));
    const headers = (rows.shift() ?? []).map((h) => h.trim());
    return { file, fileName: file.name, size: file.size, sheet: name, headers, rows };
  }
  throw new Error("Upload a CSV or XLSX file.");
}

export function UploadView({ history, historyError, canUpload, now }: { history: UploadHistoryRow[]; historyError?: string | null; canUpload: boolean; now?: number }) {
  void now;
  const [targetId, setTargetId] = useState(UPLOAD_TARGETS[0].id);
  const target = UPLOAD_TARGETS.find((t) => t.id === targetId)!;
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [maps, setMaps] = useState<ColumnMap[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [onlyReview, setOnlyReview] = useState(false);

  async function load(file: File | undefined) {
    if (!file) return;
    setErr(null); setResult(null); setBusy(true);
    try {
      const p = await readFile(file);
      if (!p.headers.length || !p.rows.length) throw new Error("That file has no data rows.");
      setParsed(p);
      setMaps(autoMap(p.headers, p.rows, target));
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That file could not be read.");
    }
    setBusy(false);
  }

  function changeTarget(id: string) {
    setTargetId(id);
    const t = UPLOAD_TARGETS.find((x) => x.id === id)!;
    if (parsed) setMaps(autoMap(parsed.headers, parsed.rows, t));
  }

  function setField(index: number, field: string | null) {
    setMaps((prev) => prev.map((m) => (m.index === index ? { ...m, field, confidence: field ? Math.max(m.confidence, 100) : m.confidence } : field && m.field === field ? { ...m, field: null } : m)));
  }

  const missing = target.fields.filter((f) => f.required && !maps.some((m) => m.field === f.key));
  const mapping = useMemo(() => Object.fromEntries(maps.filter((m) => m.field).map((m) => [m.field as string, m.column])), [maps]);

  // Per-row check on the first 20 rows, mirroring the server's own validation (which is what actually decides).
  const preview = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.slice(0, 20).map((r, i) => {
      const cells = target.fields.filter((f) => mapping[f.key]).map((f) => {
        const idx = parsed.headers.indexOf(mapping[f.key]);
        const v = (r[idx] ?? "").trim();
        let problem: string | null = null;
        if (!v && f.required) problem = "Required";
        else if (v && f.type === "date" && !parseDateValue(v)) problem = "Invalid date";
        else if (v && f.type === "number" && parseNumberValue(v) == null) problem = "Not a number";
        return { f, v, problem };
      });
      return { n: i + 2, cells, bad: cells.some((c) => c.problem) };
    });
  }, [parsed, mapping, target]);

  const needReview = maps.filter((m) => m.field && m.confidence < 80).length + maps.filter((m) => !m.field && m.confidence >= 40).length;
  const warnRows = preview.filter((p) => p.bad).length;

  async function submit() {
    if (!parsed) return;
    setBusy(true); setErr(null);
    try {
      const body = new FormData();
      body.set("file", parsed.file);
      body.set("target_object", targetId);
      body.set("mapping", JSON.stringify(mapping));
      const r = await fetch("/api/client/uploads", { method: "POST", body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "The import did not complete.");
      else { setResult(j as Result); setStep(4); }
    } catch (e) { setErr(e instanceof Error ? e.message : "The import did not complete."); }
    setBusy(false);
  }

  function reset() { setParsed(null); setMaps([]); setResult(null); setStep(1); setErr(null); if (input.current) input.current.value = ""; }

  const steps = ["Upload", "Map fields", "Review", "Import"];
  const shownMaps = onlyReview ? maps.filter((m) => !m.field || m.confidence < 80) : maps;

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--muted)]" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={step === i + 1 ? "step" : undefined}>
            <span className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] ${step === i + 1 ? "border-[var(--ink)] bg-[var(--ink)] text-white" : step > i + 1 ? "border-[#cfe3d8] bg-[#f3faf6] text-[#2f6b4f]" : "border-[var(--line)]"}`}>{i + 1}</span>
            <span className={step === i + 1 ? "font-medium text-[var(--ink)]" : ""}>{s}</span>
          </li>
        ))}
      </ol>

      {err ? <div className="cp-banner bad" role="alert"><div><b>That did not work.</b> {err}</div></div> : null}

      {step === 1 && (
        <Panel>
          <PanelHead title="Choose a file" sub="CSV or XLSX, up to 20 MB and 50,000 rows. The first row must be the column names." />
          <div className="cp-panel-b grid gap-5">
            <label className="ll-field max-w-[420px]">
              <span>What does this file contain?</span>
              <select className="ll-input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {UPLOAD_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (canUpload) load(e.dataTransfer.files?.[0]); }}
              className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center ${drag ? "border-[#82b6ed] bg-[#f0f5fc]" : "border-[#cfd6e0] bg-[#fafbfd]"}`}
            >
              <p className="text-[16px] font-medium tracking-[-0.02em] text-[var(--ink)]">Drag a file here</p>
              <p className="max-w-[46ch] text-[13px] leading-[1.65] text-[var(--muted)]">Export a report from your system as CSV or Excel and drop it here. You will map the columns once and see a preview before anything is imported.</p>
              <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="sr-only" id="file" disabled={!canUpload || busy} onChange={(e) => load(e.target.files?.[0])} />
              <label htmlFor="file" className={`ll-primary ${!canUpload || busy ? "opacity-55" : "cursor-pointer"}`}>{busy ? "Reading..." : "Choose a file"}</label>
              {!canUpload ? <p className="text-[12px] text-[#a1291f]">Viewers cannot upload data. Ask an owner or admin for member access.</p> : null}
            </div>
            <p className="text-[12px] leading-[1.7] text-[var(--muted)]">Files are read in your browser first and checked again on our side. Cells that start with a formula character are neutralized, so a spreadsheet opened later cannot run them.</p>
          </div>
        </Panel>
      )}

      {parsed && step >= 2 && step < 4 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#d8e6f8] bg-[#f0f5fc] px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-[var(--ink)]">{parsed.fileName}</p>
            <p className="text-[12px] text-[var(--muted)]">{fmtBytes(parsed.size)}{parsed.sheet ? ` · Sheet "${parsed.sheet}"` : ""} · {parsed.rows.length.toLocaleString("en-US")} rows · {parsed.headers.length} columns</p>
          </div>
          <div className="flex items-center gap-3"><Pill tone="good">Read successfully</Pill><button type="button" className="ll-secondary" onClick={reset}>Replace file</button></div>
        </div>
      )}

      {parsed && step === 2 && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel className="overflow-hidden">
            <PanelHead
              title="Map columns to fields"
              sub={<>Treating this file as <select className="cp-select !py-0.5 text-[12px]" value={targetId} onChange={(e) => changeTarget(e.target.value)} aria-label="File contents">{UPLOAD_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></>}
              right={<div className="flex gap-2"><button type="button" className="cp-tab" aria-pressed={!onlyReview} onClick={() => setOnlyReview(false)}>All {maps.length}</button><button type="button" className="cp-tab" aria-pressed={onlyReview} onClick={() => setOnlyReview(true)}>Needs review<small>{needReview}</small></button></div>}
            />
            <TableWrap>
              <table className="cp-table">
                <thead><tr><th>Your column</th><th>Sample</th><th>Detected</th><th>Maps to</th><th>Confidence</th></tr></thead>
                <tbody>
                  {shownMaps.map((m) => (
                    <tr key={m.index}>
                      <td className="cp-mono whitespace-nowrap text-[12px]">{m.column || `Column ${m.index + 1}`}</td>
                      <td className="max-w-[160px] truncate text-[12px]">{m.sample || <span className="text-[var(--muted)]">empty</span>}</td>
                      <td className="whitespace-nowrap text-[12px] text-[var(--muted)]">{m.detected}</td>
                      <td>
                        <select className={`cp-select min-w-[170px] ${!m.field && m.confidence >= 40 ? "!border-[#eedcc8] !bg-[#fdf8f2]" : ""}`} value={m.field ?? ""} aria-label={`Field for ${m.column}`} onChange={(e) => setField(m.index, e.target.value || null)}>
                          <option value="">{m.confidence >= 40 ? "Choose a field" : "Do not import"}</option>
                          {target.fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                        </select>
                      </td>
                      <td className="min-w-[120px]">
                        {m.field ? <div className="flex items-center gap-2"><div className={`cp-bar w-[70px] ${m.confidence >= 90 ? "" : m.confidence >= 70 ? "info" : "wait"}`}><i style={{ width: `${Math.min(100, m.confidence)}%` }} /></div><span className="text-[11.5px] tabular-nums">{m.confidence}%</span></div> : <span className="text-[11.5px] text-[var(--muted)]">Not mapped</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Panel>
          <div className="grid gap-4">
            <Panel>
              <PanelHead title="Before you import" />
              <ul className="cp-panel-b grid gap-3 text-[13px] leading-[1.6] text-[#303238]">
                <li>Fields marked * are required. A row missing one is skipped and listed.</li>
                <li>Dates and numbers that cannot be read are skipped, never guessed.</li>
                <li>Formula-style cells are neutralized.</li>
              </ul>
            </Panel>
            {missing.length ? <Notice tone="bad"><div><b>Map {missing.map((f) => f.label).join(", ")}</b> before continuing.</div></Notice> : warnRows ? <Notice><div><b>{warnRows} of the first 20 rows</b> have a problem. They are skipped on import and listed afterwards.</div></Notice> : <Notice tone="good"><div>The first 20 rows read cleanly.</div></Notice>}
            <button type="button" className="ll-primary w-full" disabled={!!missing.length} onClick={() => setStep(3)}>Continue to review</button>
          </div>
        </div>
      )}

      {parsed && (step === 2 || step === 3) && (
        <Panel className="overflow-hidden">
          <PanelHead title={`Preview, first ${preview.length} of ${parsed.rows.length.toLocaleString("en-US")} rows`} sub="Shown as they will be read after mapping." right={warnRows ? <Pill tone="wait">{warnRows} rows with problems</Pill> : <Pill tone="good">No problems in this preview</Pill>} />
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>Row</th>{target.fields.filter((f) => mapping[f.key]).map((f) => <th key={f.key}>{f.label}</th>)}<th>Status</th></tr></thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.n}>
                    <td className="text-[var(--muted)]">{p.n}</td>
                    {p.cells.map((c) => <td key={c.f.key} className={c.problem ? "bg-[#fdf4f3] text-[#b3261e]" : ""}>{c.v || <span className="text-[var(--muted)]">empty</span>}</td>)}
                    <td>{p.bad ? <Pill tone="bad">{p.cells.find((c) => c.problem)?.problem}</Pill> : <Pill tone="good">Ready</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      )}

      {parsed && step === 3 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="ll-secondary" onClick={() => setStep(2)}>Back to mapping</button>
          <button type="button" className="ll-primary" disabled={busy || !canUpload} onClick={submit}>{busy ? "Importing..." : `Import ${parsed.rows.length.toLocaleString("en-US")} rows`}</button>
        </div>
      )}

      {step === 4 && result && (
        <Panel>
          <PanelHead title="Import finished" sub={parsed?.fileName} right={<button type="button" className="ll-secondary" onClick={reset}>Upload another file</button>} />
          <div className="cp-panel-b grid gap-5">
            <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
              <div className="cp-stat"><span className="cp-cap">Rows in file</span><div className="n">{result.row_count.toLocaleString("en-US")}</div></div>
              <div className="cp-stat"><span className="cp-cap">New rows</span><div className="n">{result.imported.toLocaleString("en-US")}</div><div className="d good">{result.unchanged ? `${result.unchanged.toLocaleString("en-US")} already present, unchanged` : "Recorded with this file as the source"}</div></div>
              <div className="cp-stat"><span className="cp-cap">Skipped</span><div className="n">{result.skipped.toLocaleString("en-US")}</div>{result.skipped ? <div className="d wait">Listed below</div> : null}</div>
            </div>
            {result.errors.length ? (
              <TableWrap>
                <table className="cp-table">
                  <thead><tr><th>Row</th><th>Field</th><th>Problem</th></tr></thead>
                  <tbody>{result.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.field}</td><td>{e.message}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            ) : null}
            {result.more_errors > 0 ? <p className="text-[12px] text-[var(--muted)]">{result.more_errors.toLocaleString("en-US")} more skipped rows are not listed. Fix the source file and upload it again.</p> : null}
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <PanelHead title="Import history" sub="Every import is recorded in your audit trail." />
        {historyError ? <div className="cp-panel-b"><div className="cp-banner bad" role="alert"><div>Import history did not load: {historyError}</div></div></div> : history.length ? (
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>Contents</th><th>When</th><th className="num">Rows</th><th>Status</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><b>{UPLOAD_TARGETS.find((t) => t.id === h.target_object)?.label ?? h.target_object}</b></td>
                    <td className="whitespace-nowrap"><LocalTime iso={h.created_at} /></td>
                    <td className="num">{(h.row_count ?? 0).toLocaleString("en-US")}</td>
                    <td><Pill tone={h.status === "imported" || h.status === "complete" ? "good" : h.status === "failed" ? "bad" : "wait"}>{h.status.charAt(0).toUpperCase() + h.status.slice(1)}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <div className="cp-panel-b text-[14px] text-[var(--muted)]">Nothing has been uploaded yet.</div>}
      </Panel>
    </div>
  );
}
