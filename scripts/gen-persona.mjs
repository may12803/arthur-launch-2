#!/usr/bin/env node
// Regenerates lib/persona/arthur-system-prompt.ts from the ONE canonical source,
// ~/arthur-core/src/persona.ts. The Fly/Next build box cannot see ~/arthur-core,
// so this runs LOCALLY (pre-commit / pre-deploy) and the generated file is
// committed. Kills the "hand-copied persona drifts" class (jumbo audit / Phase 4).
//
//   node scripts/gen-persona.mjs          # regenerate (no-op if already in sync)
//   node scripts/gen-persona.mjs --check  # exit 1 if the committed copy has drifted
//
// Parity gate (both wrappers): node ~/arthur/scripts/persona-parity-check.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SRC = path.join(os.homedir(), "arthur-core/src/persona.ts");
const DEST = path.join(process.cwd(), "lib/persona/arthur-system-prompt.ts");
const checkOnly = process.argv.includes("--check");

if (!fs.existsSync(SRC)) {
  console.error(`gen-persona: canonical source missing at ${SRC} — run on the Mac that has ~/arthur-core.`);
  process.exit(2);
}
const canonical = fs.readFileSync(SRC, "utf8");
const current = fs.existsSync(DEST) ? fs.readFileSync(DEST, "utf8") : "";

if (current === canonical) {
  console.log("gen-persona: in sync (no-op).");
  process.exit(0);
}
if (checkOnly) {
  console.error("gen-persona: DRIFT — lib/persona/arthur-system-prompt.ts differs from ~/arthur-core/src/persona.ts. Run `node scripts/gen-persona.mjs` and commit.");
  process.exit(1);
}
fs.writeFileSync(DEST, canonical);
console.log(`gen-persona: regenerated ${DEST} from canonical (${canonical.length} bytes).`);
