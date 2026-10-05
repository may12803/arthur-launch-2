import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sandbox evidence stores a count and source reference digest prefix, never the raw reference', () => {
  const source = readFileSync(new URL('../../../scripts/connector-sandbox-probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /record_count: page\.records\.length/);
  assert.match(source, /source_ref_sha256_prefix: createHash\("sha256"\)\.update\(String\(page\.records\[0\]\.source_ref\)\)\.digest\("hex"\)\.slice\(0, 12\)/);
  assert.doesNotMatch(source, /evidence\s*=\s*\{[^}]*\bsource_ref\s*:/);
});
