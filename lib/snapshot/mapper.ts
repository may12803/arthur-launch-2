// Column mapper for messy price exports. Deterministic first (header synonyms + value shapes), then an optional
// LLM fallback (Cerebras gpt-oss-120b) for what is still unmapped. The result always carries a confidence and a
// reason per column; the person confirms or corrects it before any rule runs. With no LLM the heuristic result stands.
import { isBlank, parseDate, parseMoney } from './values.ts';

export type FieldId =
  | 'item' | 'customer' | 'price' | 'cost' | 'last_sale_date' | 'on_hand' | 'price_date' | 'units_12m'
  | 'description' | 'category' | 'customer_status' | 'address' | 'zip';

type Shape = 'text' | 'number' | 'date' | 'status';

export interface FieldSpec {
  id: FieldId;
  label: string;
  shape: Shape;
  required?: boolean;
  /** Normalized header phrases. An exact match scores highest; containing the phrase scores lower. */
  synonyms: string[];
}

export const FIELDS: FieldSpec[] = [
  { id: 'item', label: 'Item or SKU', shape: 'text', required: true, synonyms: ['item', 'itemnumber', 'itemno', 'itemcode', 'itemid', 'sku', 'partnumber', 'partno', 'part', 'product', 'productcode', 'productid', 'material', 'upc', 'article', 'stockcode', 'catalognumber'] },
  { id: 'price', label: 'Price', shape: 'number', required: true, synonyms: ['price', 'unitprice', 'sellprice', 'sellingprice', 'saleprice', 'salesprice', 'listprice', 'netprice', 'contractprice', 'customerprice', 'rate', 'unitsell', 'sell'] },
  { id: 'customer', label: 'Customer', shape: 'text', synonyms: ['customer', 'customername', 'cust', 'custname', 'client', 'clientname', 'account', 'accountname', 'soldto', 'billto', 'buyer', 'company'] },
  { id: 'cost', label: 'Cost', shape: 'number', synonyms: ['cost', 'costprice', 'unitcostprice', 'costeach', 'cost1', 'unitcost', 'stdcost', 'standardcost', 'avgcost', 'averagecost', 'landedcost', 'replacementcost', 'lastcost', 'itemcost', 'cogs', 'buycost'] },
  { id: 'last_sale_date', label: 'Last sale date', shape: 'date', synonyms: ['lastsale', 'lastsaledate', 'lastsold', 'lastsolddate', 'lastinvoice', 'lastinvoicedate', 'lastinv', 'lastorder', 'lastorderdate', 'lastship', 'lastshipdate', 'lastpurchase', 'lastactivity', 'lastbilled'] },
  { id: 'on_hand', label: 'Quantity on hand', shape: 'number', synonyms: ['onhand', 'qtyonhand', 'quantityonhand', 'stock', 'instock', 'inventory', 'qoh', 'onhandqty', 'stockqty', 'available', 'balance'] },
  { id: 'price_date', label: 'Price effective date', shape: 'date', synonyms: ['pricedate', 'priceeffective', 'priceeffectivedate', 'effectivedate', 'effdate', 'effective', 'pricechanged', 'pricechangedate', 'lastpricechange', 'priceupdated', 'priceupdate', 'pricestart', 'startdate', 'validfrom'] },
  { id: 'units_12m', label: 'Units sold, trailing 12 months', shape: 'number', synonyms: ['units12m', 'unitssold', 'unitssold12m', 'qtysold', 'qtysold12m', 'ttmunits', 'ttmqty', 'annualunits', 'annualqty', 'volume', 'annualvolume', 'unitsl12m', 'trailing12munits', 'units'] },
  { id: 'description', label: 'Description', shape: 'text', synonyms: ['description', 'desc', 'itemdescription', 'productdescription', 'productname', 'itemname', 'name'] },
  { id: 'category', label: 'Category', shape: 'text', synonyms: ['category', 'productcategory', 'itemcategory', 'productline', 'productgroup', 'group', 'class', 'family', 'department', 'commodity', 'material'] },
  { id: 'customer_status', label: 'Customer status', shape: 'status', synonyms: ['customerstatus', 'custstatus', 'status', 'accountstatus', 'active', 'isactive'] },
  { id: 'address', label: 'Customer address', shape: 'text', synonyms: ['address', 'address1', 'street', 'streetaddress', 'customeraddress', 'custaddress', 'billingaddress', 'shiptoaddress'] },
  { id: 'zip', label: 'Customer postal code', shape: 'text', synonyms: ['zip', 'zipcode', 'postal', 'postalcode', 'postcode'] },
];
const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

export interface MappedColumn {
  column: string;
  confidence: number;
  source: 'header' | 'shape' | 'llm' | 'user';
  reason: string;
}
export type Mapping = Partial<Record<FieldId, MappedColumn>>;

export interface MapSuggestion {
  mapping: Mapping;
  unmapped_columns: string[];
  missing_required: FieldId[];
  llm: { used: boolean; model?: string; error?: string; sent_columns?: number };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface ColStats { n: number; numeric: number; money: number; date: number; statusLike: number; unique: number; avgLen: number; negative: number; integers: number; zipLike: number }

const STATUS_WORDS = new Set(['active', 'inactive', 'a', 'i', 'y', 'n', 'yes', 'no', 'closed', 'open', 'disabled', 'enabled', 'true', 'false', 'on hold', 'hold', 'terminated', 'suspended']);

function stats(values: string[]): ColStats {
  const v = values.filter((x) => !isBlank(x)).slice(0, 400);
  const n = v.length;
  let numeric = 0, money = 0, date = 0, statusLike = 0, len = 0, negative = 0, integers = 0, zipLike = 0;
  const uniq = new Set<string>();
  for (const x of v) {
    const t = x.trim();
    uniq.add(t.toLowerCase());
    len += t.length;
    const m = parseMoney(t);
    if (m !== null) { numeric++; if (m < 0) negative++; if (Number.isInteger(m)) integers++; if (/[$.]/.test(t)) money++; }
    if (parseDate(t) !== null && !/^\d{1,6}(\.\d+)?$/.test(t)) date++;
    if (STATUS_WORDS.has(t.toLowerCase())) statusLike++;
    if (/^\d{5}(-\d{4})?$/.test(t)) zipLike++;
  }
  return { n, numeric, money, date, statusLike, unique: uniq.size, avgLen: n ? len / n : 0, negative, integers, zipLike };
}

/** 0..1 compatibility of a column's values with a field's expected shape. */
function shapeFit(f: FieldSpec, s: ColStats): number {
  if (s.n === 0) return 0;
  const frac = (k: number) => k / s.n;
  switch (f.shape) {
    case 'number': return frac(s.numeric) - (frac(s.date) > 0.5 ? 0.6 : 0);
    case 'date': return frac(s.date);
    case 'status': return s.unique <= 6 ? frac(s.statusLike) : 0;
    case 'text': return frac(s.numeric) > 0.95 && f.id !== 'item' && f.id !== 'zip' ? 0.2 : 1 - frac(s.date) * 0.8;
  }
}

function headerScore(f: FieldSpec, header: string): { score: number; reason: string } {
  const h = norm(header);
  if (!h) return { score: 0, reason: '' };
  if (f.synonyms.includes(h)) return { score: 0.95, reason: `header "${header}" matches ${f.label}` };
  let best = 0;
  let hit = '';
  for (const syn of f.synonyms) {
    if (syn.length < 4) continue;
    if (h.includes(syn) && syn.length / h.length >= 0.45) {
      const sc = 0.55 + 0.25 * (syn.length / h.length);
      if (sc > best) { best = sc; hit = syn; }
    }
  }
  return best ? { score: best, reason: `header "${header}" contains "${hit}"` } : { score: 0, reason: '' };
}

/** Header words that rule a field out regardless of synonym hits ("Cost Price" is cost, "Last Price Change" is a date). */
function vetoed(f: FieldSpec, header: string): boolean {
  const h = norm(header);
  if (f.id === 'price') return /cost|cogs|qty|quantity|units|date|margin|pct|percent|change|updated/.test(h);
  if (f.id === 'cost') return /date|change|updated|qty|quantity|units/.test(h);
  if (f.id === 'item') return /desc|name$|date|price|cost|qty|status|customer|cust/.test(h) && !/^(itemname|partname)$/.test(h) && !/^(item|part|sku)/.test(h);
  if (f.id === 'description') return /customer|cust|account|client/.test(h);
  if (f.id === 'customer') return /status|date|address|zip|id$|number$|no$|code$/.test(h);
  if (f.id === 'units_12m') return /price|cost|date/.test(h);
  if (f.id === 'category') return /customer|cust/.test(h) && !/categor/.test(h);
  if (f.id === 'customer_status') return /item|part|sku|product|price/.test(h);
  return false;
}

export function heuristicMapping(header: string[], rows: string[][]): Mapping {
  const cols = header.map((h, i) => ({ h, i, s: stats(rows.slice(0, 600).map((r) => r[i] ?? '')) }));
  type Cand = { f: FieldSpec; col: (typeof cols)[number]; score: number; source: MappedColumn['source']; reason: string };
  const cands: Cand[] = [];
  for (const f of FIELDS) {
    for (const col of cols) {
      if (isBlank(col.h) || vetoed(f, col.h)) continue;
      const fit = shapeFit(f, col.s);
      const hs = headerScore(f, col.h);
      if (hs.score > 0) {
        if (fit < 0.5) continue; // the header says one thing and the values say another: do not trust the header
        cands.push({ f, col, score: Math.min(0.99, hs.score * (0.6 + 0.4 * fit)), source: 'header', reason: `${hs.reason}; ${Math.round(fit * 100)}% of values fit` });
      } else if (f.shape === 'date' && fit >= 0.9 && (f.id === 'last_sale_date' || f.id === 'price_date') && /date|dt$|day/.test(norm(col.h))) {
        cands.push({ f, col, score: 0.4, source: 'shape', reason: 'values are dates, header does not say which kind' });
      } else if (f.id === 'zip' && col.s.zipLike / Math.max(1, col.s.n) > 0.9) {
        cands.push({ f, col, score: 0.6, source: 'shape', reason: 'values look like postal codes' });
      } else if (f.id === 'customer_status' && fit >= 0.95 && col.s.n >= 3) {
        cands.push({ f, col, score: 0.55, source: 'shape', reason: 'few distinct values, all status words' });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score || FIELDS.indexOf(a.f) - FIELDS.indexOf(b.f));
  const mapping: Mapping = {};
  const usedCols = new Set<number>();
  for (const c of cands) {
    if (mapping[c.f.id] || usedCols.has(c.col.i)) continue;
    // a generic date column cannot be both kinds; assign it to the first kind only if no header said otherwise
    mapping[c.f.id] = { column: c.col.h, confidence: Math.round(c.score * 100) / 100, source: c.source, reason: c.reason };
    usedCols.add(c.col.i);
  }
  return mapping;
}

// ---- LLM fallback ---------------------------------------------------------------------------------------------

export interface LlmOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  model?: string;
  timeoutMs?: number;
}

const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const UA = 'Mozilla/5.0 (compatible; LOVELEEDAY-snapshot/1.0)';

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model reply');
  return JSON.parse(text.slice(start, end + 1));
}

export async function llmMapping(
  header: string[], rows: string[][], already: Mapping, opts: LlmOptions,
): Promise<{ mapping: Mapping; model: string; sent: number }> {
  const key = opts.apiKey;
  if (!key) throw new Error('no LLM key configured');
  const doFetch = opts.fetch ?? fetch;
  const model = opts.model ?? 'gpt-oss-120b';
  const usedCols = new Set(Object.values(already).map((m) => m!.column));
  const openFields = FIELDS.filter((f) => !already[f.id]);
  const columns = header.map((h, i) => ({ h, i })).filter((c) => !isBlank(c.h) && !usedCols.has(c.h)).slice(0, 40);
  if (!columns.length || !openFields.length) return { mapping: {}, model, sent: 0 };
  const payload = columns.map((c) => ({
    column: c.h.slice(0, 80),
    samples: rows.slice(0, 200).map((r) => r[c.i] ?? '').filter((v) => !isBlank(v)).slice(0, 3).map((v) => v.trim().slice(0, 40)),
  }));
  const prompt = [
    'You map columns of a price list export to canonical fields. Reply with ONE JSON object and nothing else:',
    '{"mappings":[{"column":"<exact column name>","field":"<field id>","confidence":<0..1>}]}',
    'Use only field ids from the list below, each at most once, each column at most once. Omit a column when no field clearly fits. Never invent columns.',
    'Fields: ' + openFields.map((f) => `${f.id} (${f.label})`).join('; '),
    'Columns with sample values:',
    JSON.stringify(payload),
  ].join('\n');
  const res = await doFetch(CEREBRAS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1600, temperature: 0, reasoning_effort: 'low' }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) throw new Error('LLM returned empty content');
  const parsed = extractJson(content) as { mappings?: { column?: unknown; field?: unknown; confidence?: unknown }[] };
  const out: Mapping = {};
  const colNames = new Set(columns.map((c) => c.h));
  const open = new Set(openFields.map((f) => f.id));
  const usedHere = new Set<string>();
  for (const m of parsed.mappings ?? []) {
    const column = String(m.column ?? '');
    const field = String(m.field ?? '') as FieldId;
    const conf = Number(m.confidence);
    if (!colNames.has(column) || !open.has(field) || out[field] || usedHere.has(column) || !Number.isFinite(conf)) continue;
    out[field] = { column, confidence: Math.round(Math.max(0, Math.min(0.85, conf)) * 100) / 100, source: 'llm', reason: 'suggested by the language model from the header and sample values' };
    usedHere.add(column);
  }
  return { mapping: out, model, sent: columns.length };
}

/** Value sanity for an LLM suggestion: a numeric field must hold numbers, a date field dates. Rejects hallucinated fits. */
function llmFitsData(field: FieldId, column: string, header: string[], rows: string[][]): boolean {
  const spec = FIELD_BY_ID.get(field)!;
  const i = header.indexOf(column);
  if (i < 0) return false;
  const s = stats(rows.slice(0, 600).map((r) => r[i] ?? ''));
  return shapeFit(spec, s) >= 0.6;
}

export async function suggestMapping(header: string[], rows: string[][], llm?: LlmOptions): Promise<MapSuggestion> {
  const mapping = heuristicMapping(header, rows);
  const llmInfo: MapSuggestion['llm'] = { used: false };
  const weak = FIELDS.some((f) => f.required && !mapping[f.id]);
  const leftover = header.some((h) => !isBlank(h) && !Object.values(mapping).some((m) => m!.column === h));
  if (llm?.apiKey && (weak || leftover)) {
    try {
      const r = await llmMapping(header, rows, mapping, llm);
      llmInfo.used = true;
      llmInfo.model = r.model;
      llmInfo.sent_columns = r.sent;
      for (const [f, m] of Object.entries(r.mapping) as [FieldId, MappedColumn][]) {
        if (mapping[f]) continue;
        if (llmFitsData(f, m.column, header, rows)) mapping[f] = m;
      }
    } catch (e) {
      llmInfo.error = e instanceof Error ? e.message : 'LLM unavailable';
    }
  } else if (!llm?.apiKey && (weak || leftover)) {
    llmInfo.error = 'LLM not configured; heuristic mapping only';
  }
  const used = new Set(Object.values(mapping).map((m) => m!.column));
  return {
    mapping,
    unmapped_columns: header.filter((h) => !isBlank(h) && !used.has(h)),
    missing_required: FIELDS.filter((f) => f.required && !mapping[f.id]).map((f) => f.id),
    llm: llmInfo,
  };
}

/** Validate a user-confirmed mapping (field id -> column name) against the file's header. */
export function normalizeUserMapping(input: unknown, header: string[]): { mapping: Mapping; errors: string[] } {
  const errors: string[] = [];
  const mapping: Mapping = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { mapping, errors: ['mapping must be an object of field to column'] };
  const used = new Set<string>();
  for (const [field, raw] of Object.entries(input as Record<string, unknown>)) {
    const column = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? String((raw as { column?: unknown }).column ?? '') : '';
    if (!FIELD_BY_ID.has(field as FieldId)) { errors.push(`unknown field "${field.slice(0, 40)}"`); continue; }
    if (!column) continue;
    if (!header.includes(column)) { errors.push(`column "${column.slice(0, 60)}" is not in the file`); continue; }
    if (used.has(column)) { errors.push(`column "${column.slice(0, 60)}" is mapped to two fields`); continue; }
    used.add(column);
    mapping[field as FieldId] = { column, confidence: 1, source: 'user', reason: 'confirmed by you' };
  }
  for (const f of FIELDS) if (f.required && !mapping[f.id]) errors.push(`${f.label} must be mapped`);
  return { mapping, errors };
}
