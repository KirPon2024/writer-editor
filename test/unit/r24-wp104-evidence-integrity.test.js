'use strict';

// R2.4 WP-104 evidence integrity: the meta proof. Every contour's mutation
// suite is re-executed and its receipt verified — score exactly 1, zero
// survivors, closed denominator — and the receipt verifier itself is
// mutant-tested by defection.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE = process.execPath;

// The closed contour inventory: every r24 gate must carry mutant evidence.
const MUTANT_SUITE_FILES = [
  'r24-p0-autosave-mutants.test.js',
  'r24-p1-ack-mutants.test.js',
  'r24-p2-save-mutants.test.js',
  'r24-p3-commit-mutants.test.js',
  'r24-s0-ipc-mutants.test.js',
  'r24-s1-envelope-mutants.test.js',
  'r24-k0-protocol-mutants.test.js',
  'r24-k1-allowlist-mutants.test.js',
  'r24-r0-revision-mutants.test.js',
  'r24-r1-shadow-mutants.test.js',
  'r24-sec0-path-mutants.test.js',
  'r24-ent0-law-mutants.test.js',
  'r24-t0-fold-mutants.test.js',
  'r24-t1-lineage-mutants.test.js',
  'r24-wp100-wiring-mutants.test.js',
  'r24-wp101-admission-mutants.test.js',
  'r24-wp102-protocol-mutants.test.js',
  'r24-wp103-order-mutants.test.js',
  'r24-r2-bakeoff-mutants.test.js',
];
const LANE_SCRIPTS = ['test:r24-e0', 'test:r24-q0'];

class ReceiptIntegrityError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

// The verifier law: a mutation receipt is proof only with a closed nonzero
// denominator, every mutant killed, zero survivors and score exactly 1.
function verifyMutationReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new ReceiptIntegrityError('E_RECEIPT_SHAPE');
  }
  const total = Number.isInteger(receipt.total)
    ? receipt.total
    : (Number.isInteger(receipt.moduleMutants) && Number.isInteger(receipt.wiringMutants)
      ? receipt.moduleMutants + receipt.wiringMutants
      : null);
  if (total === null) throw new ReceiptIntegrityError('E_RECEIPT_TOTAL_MISSING');
  if (total < 1) throw new ReceiptIntegrityError('E_ZERO_DENOMINATOR');
  if (receipt.killed !== total) throw new ReceiptIntegrityError('E_MUTANT_SURVIVOR_PRESENT', `killed=${receipt.killed} total=${total}`);
  if (!Array.isArray(receipt.survived) || receipt.survived.length !== 0) {
    throw new ReceiptIntegrityError('E_MUTANT_SURVIVOR_LIST', JSON.stringify(receipt.survived));
  }
  if (receipt.score !== 1) throw new ReceiptIntegrityError('E_RECEIPT_SCORE_NOT_ONE', String(receipt.score));
  return true;
}

function extractReceipts(output) {
  const receipts = [];
  for (const line of output.split('\n')) {
    const match = line.match(/R24_[A-Z0-9_]*MUTATION_RECEIPT=(\{.*\})/u);
    if (match) {
      receipts.push(JSON.parse(match[1]));
    }
  }
  return receipts;
}

test('verifier law: valid receipts pass, every defect class is refused', () => {
  assert.equal(verifyMutationReceipt({ total: 5, killed: 5, survived: [], score: 1 }), true);
  assert.equal(verifyMutationReceipt({ moduleMutants: 3, wiringMutants: 3, killed: 6, survived: [], score: 1 }), true);
  const invalid = [
    [{ total: 0, killed: 0, survived: [], score: 1 }, 'E_ZERO_DENOMINATOR'],
    [{ total: 5, killed: 4, survived: ['x'], score: 0.8 }, 'E_MUTANT_SURVIVOR_PRESENT'],
    [{ total: 5, killed: 5, survived: ['x'], score: 1 }, 'E_MUTANT_SURVIVOR_LIST'],
    [{ total: 5, killed: 5, survived: [], score: 0.99 }, 'E_RECEIPT_SCORE_NOT_ONE'],
    [{ killed: 5, survived: [], score: 1 }, 'E_RECEIPT_TOTAL_MISSING'],
    [null, 'E_RECEIPT_SHAPE'],
  ];
  for (const [receipt, code] of invalid) {
    assert.throws(() => verifyMutationReceipt(receipt), (e) => e instanceof ReceiptIntegrityError && e.code === code, code);
  }
});

test('verifier defections: every seeded mutant verifier is distinguished by the corpus', () => {
  const corpus = [
    { receipt: { total: 5, killed: 5, survived: [], score: 1 }, valid: true },
    { receipt: { total: 0, killed: 0, survived: [], score: 1 }, valid: false },
    { receipt: { total: 5, killed: 4, survived: ['m1'], score: 0.8 }, valid: false },
    { receipt: { total: 5, killed: 5, survived: ['m1'], score: 1 }, valid: false },
    { receipt: { total: 5, killed: 5, survived: [], score: 0.5 }, valid: false },
  ];
  const defections = {
    'accept-zero-total': (r) => r.total > 0 || true,
    'accept-survivor': (r) => r.killed === r.total,
    'accept-fractional-score': (r) => r.killed === r.total && r.survived.length === 0,
    'accept-everything': () => true,
  };
  for (const [id, defective] of Object.entries(defections)) {
    const distinguishes = corpus.some(({ receipt, valid }) => {
      let genuine = true;
      try { verifyMutationReceipt(receipt); } catch { genuine = false; }
      let defectiveVerdict = true;
      try { if (!defective(receipt)) defectiveVerdict = false; } catch { defectiveVerdict = false; }
      return genuine === valid && defectiveVerdict !== genuine;
    });
    assert.equal(distinguishes, true, `defective verifier must be killed by the corpus: ${id}`);
  }
});

test('meta proof: every contour mutant suite re-executes with a verified receipt', { timeout: 480000 }, () => {
  const receipts = [];
  // A nested node --test is refused via the parent's test-context env
  // marker, so the child environment strips it.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  for (const file of MUTANT_SUITE_FILES) {
    const filePath = path.join(ROOT, 'test', 'unit', file);
    assert.equal(fs.existsSync(filePath), true, `mutant suite missing: ${file}`);
    const run = spawnSync(NODE, ['--test', filePath], { encoding: 'utf8', timeout: 240000, cwd: ROOT, env: childEnv });
    assert.equal(run.status, 0, `mutant suite must exit 0: ${file}\n${(run.stderr || '').slice(0, 400)}`);
    const found = extractReceipts(run.stdout || '');
    assert.equal(found.length >= 1, true, `no mutation receipt emitted by ${file}`);
    for (const receipt of found) {
      verifyMutationReceipt(receipt);
      receipts.push({ suite: file, total: Number.isInteger(receipt.total) ? receipt.total : receipt.moduleMutants + receipt.wiringMutants });
    }
  }
  for (const script of LANE_SCRIPTS) {
    const run = spawnSync('npm', ['run', '-s', script], { encoding: 'utf8', timeout: 300000, cwd: ROOT, env: childEnv });
    assert.equal(run.status, 0, `lane must exit 0: ${script}`);
    const laneMatch = (run.stdout || '').match(/R24_(?:E0|Q0)_LANE_RECEIPT=(\{.*\})/u);
    assert.ok(laneMatch, `lane receipt missing for ${script}`);
    const lane = JSON.parse(laneMatch[1]);
    assert.equal(lane.mutants, 'PASS', `${script} mutant phase must pass`);
    receipts.push({ suite: script, total: 'lane' });
  }
  const mutantTotal = receipts.reduce((acc, r) => acc + (typeof r.total === 'number' ? r.total : 0), 0);
  console.log(`R24_WP104_META_RECEIPT=${JSON.stringify({ suites: receipts.length, mutantTotal, allScoreOne: true })}`);
  assert.equal(receipts.length, MUTANT_SUITE_FILES.length + LANE_SCRIPTS.length, 'closed contour denominator');
  assert.equal(mutantTotal > 50, true, `aggregate mutant denominator must be meaningful, got ${mutantTotal}`);
});
