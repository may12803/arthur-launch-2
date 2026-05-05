#!/usr/bin/env node
// Generates public/brain-index.json from ~/arthur/knowledge/ — keeps the brain page numbers
// in sync with the actual corpus. Wired into ~/arthur/scripts/manifest-watch.js so every
// knowledge change regenerates this file.

const fs = require('fs');
const path = require('path');
const os = require('os');

const KNOWLEDGE_ROOT = path.join(os.homedir(), 'arthur', 'knowledge');
const OUT = path.join(__dirname, '..', 'public', 'brain-index.json');

const ROOT_LABELS = {
  'ai-research': 'ai · research',
  'engineering': 'engineering',
  'business': 'business',
  'finance': 'finance',
  'design': 'design',
  'restaurant': 'restaurant',
  'sales': 'sales',
  'legal': 'legal',
  'meta': 'meta',
  'platforms': 'platforms',
  'algorithms': 'algorithms',
  'mathematics': 'mathematics',
  'languages': 'languages',
  'credit': 'credit',
  'email': 'email',
  'gliner': 'gliner',
  'essex': 'essex',
  'experiments-25x': 'experiments',
  'news': 'news',
  'research': 'research',
};

function listMd(dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMd(full));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function build() {
  const rootEntries = fs.readdirSync(KNOWLEDGE_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'));

  const roots = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const entry of rootEntries) {
    const rootDir = path.join(KNOWLEDGE_ROOT, entry.name);
    const files = listMd(rootDir);
    if (files.length === 0) continue;

    // Group by direct subdirectory under root → "category"
    const byCat = new Map();
    let rootBytes = 0;
    for (const f of files) {
      const rel = path.relative(rootDir, f);
      const parts = rel.split(path.sep);
      const cat = parts.length > 1 ? parts[0] : '_loose';
      if (!byCat.has(cat)) byCat.set(cat, []);
      const stat = fs.statSync(f);
      rootBytes += stat.size;
      byCat.get(cat).push({
        name: path.basename(f),
        relativePath: path.relative(KNOWLEDGE_ROOT, f),
        sizeBytes: stat.size,
      });
    }

    const categories = Array.from(byCat.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, list]) => ({ name, files: list.sort((a, b) => a.name.localeCompare(b.name)) }));

    roots.push({
      name: entry.name,
      label: ROOT_LABELS[entry.name] ?? entry.name,
      categories,
      files: files.length,
      sizeBytes: rootBytes,
    });
    totalFiles += files.length;
    totalBytes += rootBytes;
  }

  roots.sort((a, b) => b.files - a.files);

  const out = {
    totals: { files: totalFiles, sizeBytes: totalBytes },
    generated_at: new Date().toISOString(),
    roots,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  return { files: totalFiles, mb: (totalBytes / 1024 / 1024).toFixed(1), domains: roots.length };
}

if (require.main === module) {
  const r = build();
  console.log(`[brain-index] ${r.files} files · ${r.mb} MB · ${r.domains} domains → ${OUT}`);
}

module.exports = { build };
