'use strict';

// R2.4 W0 mutation proof: invert the caller-routing and overclaim guards in
// isolated module copies. The oracle must kill every mutant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'word-physical-recertification-w0.mjs');
const CANONICAL_JSON_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'canonical-json.mjs');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const RECEIPT_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json');
const MATRIX_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_CHAIN_MATRIX_V1.json');
const W0_RECEIPT_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1.json');
const HEAD = '1'.repeat(40);
const ORIGIN = '2'.repeat(40);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validInput(overrides = {}) {
  return {
    programDag: overrides.programDag || loadJson(DAG_PATH),
    c1Receipt: overrides.c1Receipt || loadJson(RECEIPT_PATH),
    chainMatrix: overrides.chainMatrix || loadJson(MATRIX_PATH),
    physicalReceipt: overrides.physicalReceipt || loadJson(W0_RECEIPT_PATH),
    repoState: overrides.repoState || { headSha: HEAD, originMainSha: ORIGIN, treeSha: '3'.repeat(40), dirty: false },
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    claimRequest: overrides.claimRequest,
  };
}

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
}

const MUTANTS = Object.freeze([
  {
    id: 'exact-head-mismatch-admitted',
    find: "  if (repoState.headSha !== expectedHeadSha) {",
    replace: "  if (false) {",
    oracle: async (w0) => {
      const result = w0.evaluateWordPhysicalRecertification(validInput({
        repoState: { headSha: '4'.repeat(40), originMainSha: ORIGIN, treeSha: '3'.repeat(40), dirty: false },
      }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_EXACT_HEAD_MISMATCH');
    },
  },
  {
    id: 'hammerspoon-disabled-admitted',
    find: "  if (precondition.hammerspoonAccessibilityState !== true) {",
    replace: "  if (false) {",
    oracle: async (w0) => {
      const receipt = loadJson(RECEIPT_PATH);
      receipt.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.hammerspoonAccessibilityState = false;
      const result = w0.evaluateWordPhysicalRecertification(validInput({ c1Receipt: receipt }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_PRECONDITION_HAMMERSPOON_ACCESSIBILITY_STATE');
    },
  },
  {
    id: 'replay-authority-launder-admitted',
    find: "  if (precondition.freshPhysicalReplayAuthority !== W0_REPLAY_AUTHORITY) {",
    replace: "  if (false) {",
    oracle: async (w0) => {
      const receipt = loadJson(RECEIPT_PATH);
      receipt.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.freshPhysicalReplayAuthority = 'DENY_UNTIL_MACOS_ACCESSIBILITY_PERMISSION_RESTORED';
      const result = w0.evaluateWordPhysicalRecertification(validInput({ c1Receipt: receipt }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_PRECONDITION_REPLAY_AUTHORITY');
    },
  },
  {
    id: 'legacy-blocker-active-admitted',
    find: "  if (byId.get(LEGACY_PERMISSION_BLOCKER_ID)?.disposition !== 'RECLASSIFIED_CALLER_IDENTITY_PROBE_ROUTING_NOT_PERMISSION_BLOCKER') {",
    replace: "  if (false) {",
    oracle: async (w0) => {
      const receipt = loadJson(RECEIPT_PATH);
      receipt.failureClassification.find((row) => row.id === 'C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER').disposition = 'ACTIVE_RUNTIME_PRECONDITION_BLOCKER_NOT_ROUTE_PASS';
      const result = w0.evaluateWordPhysicalRecertification(validInput({ c1Receipt: receipt }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_LEGACY_PERMISSION_BLOCKER_NOT_RECLASSIFIED');
    },
  },
  {
    id: 'route-pass-admitted',
    find: "  if (receipt.route?.routeVerdict !== 'BLOCKED') return fail('E_R24_W0_C1_ROUTE_PASS_FORBIDDEN', String(receipt.route?.routeVerdict || ''));",
    replace: "  if (false) return fail('E_R24_W0_C1_ROUTE_PASS_FORBIDDEN', String(receipt.route?.routeVerdict || ''));",
    oracle: async (w0) => {
      const receipt = loadJson(RECEIPT_PATH);
      receipt.route.routeVerdict = 'PASS';
      const result = w0.evaluateWordPhysicalRecertification(validInput({ c1Receipt: receipt }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_C1_ROUTE_PASS_FORBIDDEN');
    },
  },
  {
    id: 'physical-user-doc-launder-admitted',
    find: "  if (artifact.syntheticDisposableDocxOnly !== true || artifact.userDocumentsTouched !== false) {",
    replace: "  if (false) {",
    oracle: async (w0) => {
      const physicalReceipt = loadJson(W0_RECEIPT_PATH);
      physicalReceipt.disposableArtifact.userDocumentsTouched = true;
      const result = w0.evaluateWordPhysicalRecertification(validInput({ physicalReceipt }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_PHYSICAL_RECEIPT_USER_DOC_BOUNDARY');
    },
  },
  {
    id: 'legacy-matrix-blocker-active-admitted',
    find: "  if (Array.isArray(c1.blockerEvidenceRefs) && c1.blockerEvidenceRefs.includes(LEGACY_PERMISSION_BLOCKER_ID)) {",
    replace: "  if (false) {",
    oracle: async (w0) => {
      const matrix = loadJson(MATRIX_PATH);
      matrix.routeDenominator.find((row) => row.routeId === 'C1').blockerEvidenceRefs.push('C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER');
      const result = w0.evaluateWordPhysicalRecertification(validInput({ chainMatrix: matrix }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_MATRIX_LEGACY_PERMISSION_BLOCKER_STILL_ACTIVE');
    },
  },
  {
    id: 'safe-apply-overclaim-admitted',
    find: "    if (claims[field] === true) return fail(code, field);",
    replace: "    if (false) return fail(code, field);",
    oracle: async (w0) => {
      const result = w0.evaluateWordPhysicalRecertification(validInput({ claimRequest: { safeApplyExpansion: true } }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_W0_SAFE_APPLY_EXPANSION_FORBIDDEN');
    },
  },
]);

test('W0 verifier mutants are all killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const baseline = await importModule(MODULE_PATH);
  for (const mutant of MUTANTS) await mutant.oracle(baseline);

  const results = [];

  for (const mutant of MUTANTS) {
    assert.ok(source.includes(mutant.find), `mutation target missing: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `r24-w0-mutant-${mutant.id}-`));
    const modulePath = path.join(dir, 'word-physical-recertification-w0.mjs');
    fs.copyFileSync(CANONICAL_JSON_PATH, path.join(dir, 'canonical-json.mjs'));
    fs.writeFileSync(modulePath, source.replace(mutant.find, mutant.replace), 'utf8');
    let killed = false;
    let detail = '';
    try {
      await mutant.oracle(await importModule(modulePath));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message || String(error);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }

  const survivors = results.filter((result) => !result.killed);
  console.log(`R24_W0_MUTANTS=${JSON.stringify({
    total: results.length,
    killed: results.length - survivors.length,
    survivors: survivors.map((result) => result.id),
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survivors, []);
});
