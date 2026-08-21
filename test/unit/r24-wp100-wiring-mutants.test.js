'use strict';

// R2.4 WP-100 wiring mutants: each mutation weakens exactly one foundation
// law in the live main.js wiring, and the wiring matrix must flag it.
// Baseline (unmutated source) is proven clean first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const { scanWiringLaws } = require('./r24-wp100-wiring-matrix.test.js');

const MAIN_PATH = path.join(ROOT, 'src', 'main.js');
const PRELOAD_PATH = path.join(ROOT, 'src', 'preload.js');

const MUTANTS = [
  {
    id: 'raw-handle-reintroduced',
    law: 'S0_CALLER_IDENTITY',
    mutate: (source) => source.replace(
      "guardedHandle('file:open',",
      "ipcMain.handle('file:debug-open', async () => ({ ok: true }));\nguardedHandle('file:open',",
    ),
  },
  {
    id: 'envelope-refusal-gate-removed',
    law: 'S1_ENVELOPE_BUDGETS',
    mutate: (source) => source.replace(
      "  if (!envelopeVerdict.ok) {\n    return { ok: false, reason: envelopeVerdict.code };\n  }",
      "  if (false) {\n    return { ok: false, reason: envelopeVerdict.code };\n  }",
    ),
  },
  {
    id: 'bridge-allowlist-removed',
    law: 'K0_COMMAND_PROTOCOL',
    mutate: (source) => source.replace(
      '  if (!UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS.has(commandId)) {',
      '  if (false) {',
    ),
  },
  {
    id: 'entitlement-refusal-gate-removed',
    law: 'ENT0_ENTITLEMENT',
    mutate: (source) => source.replace(
      '  if (!entitlement.available) {',
      '  if (false) {',
    ),
  },
  {
    id: 'renderer-generation-assigned-directly',
    law: 'P0_GENERATION',
    mutate: (source) => source.replace(
      'lastSignaledEditGeneration = mergeSignaledGeneration(lastSignaledEditGeneration, payload.generation);',
      'lastSignaledEditGeneration = payload.generation;',
    ),
  },
];

test('WP-100 wiring mutants: every law-weakening mutation is flagged by the matrix', () => {
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const preloadSource = fs.readFileSync(PRELOAD_PATH, 'utf8');

  const baseline = scanWiringLaws(mainSource, preloadSource);
  assert.deepEqual(baseline.violations, [], 'baseline wiring must be clean before mutation');

  const results = [];
  for (const mutant of MUTANTS) {
    const mutated = mutant.mutate(mainSource);
    assert.notEqual(mutated, mainSource, `mutant must change the source: ${mutant.id}`);
    const verdict = scanWiringLaws(mutated, preloadSource);
    const flagged = verdict.violations.some((violation) => violation.law === mutant.law);
    results.push({ id: mutant.id, law: mutant.law, killed: flagged, detail: JSON.stringify(verdict.violations.map((v) => v.detail)) });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_WP100_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
