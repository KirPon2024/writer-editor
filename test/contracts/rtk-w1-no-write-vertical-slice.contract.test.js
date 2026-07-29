const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CONTRACTS_PATH = 'src/io/revisionBridge/reviewTransportContracts.mjs';
const CORE_PATH = 'src/io/revisionBridge/reviewTransportCore.mjs';
const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';
const ORACLE_PATH = 'src/io/revisionBridge/reviewTransportOracle.mjs';
const ROUND_STORE_PATH = 'src/io/revisionBridge/reviewTransportRoundStore.mjs';
const TEST_PATH = 'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js';
const G0B_TEST_PATH = 'test/contracts/rtk-g0b-feasibility.contract.test.js';
const W2_TEST_PATH = 'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js';
const DOCX_PREFLIGHT_RUNTIME_REPAIR_PATH = 'src/io/revisionBridge/index.mjs';
const ALLOWLIST = [
  CONTRACTS_PATH,
  CORE_PATH,
  IR_PATH,
  ORACLE_PATH,
  ROUND_STORE_PATH,
  G0B_TEST_PATH,
  TEST_PATH,
  W2_TEST_PATH,
  DOCX_PREFLIGHT_RUNTIME_REPAIR_PATH,
  'scripts/ops/sector-m-scope-map.json',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
];

async function loadContracts() {
  return import(pathToFileURL(path.join(process.cwd(), CONTRACTS_PATH)).href);
}

async function loadOracle() {
  return import(pathToFileURL(path.join(process.cwd(), ORACLE_PATH)).href);
}

async function loadRoundStore() {
  return import(pathToFileURL(path.join(process.cwd(), ROUND_STORE_PATH)).href);
}

function baseTransport(overrides = {}) {
  return {
    roundId: 'round-w1',
    returnMode: 'TRACKED',
    secretKey: 'private-secret',
    blocks: [{ blockId: 'block-1', text: 'Alpha beta gamma.' }],
    changes: [],
    comments: [{ commentId: 'comment-1', body: 'Comment survives.' }],
    ...overrides,
  };
}

function makeTempStore() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-w1-round-store-'));
}

test('W1 exports versioned no-write contracts and a read-only feature flag', async () => {
  const contracts = await loadContracts();
  const disabled = contracts.resolveW1NoWriteFeatureFlag({});
  const enabled = contracts.resolveW1NoWriteFeatureFlag({
    [contracts.REVISION_BRIDGE_W1_FEATURE_FLAG]: true,
  });

  assert.equal(contracts.REVISION_BRIDGE_W1_NO_WRITE_ANALYSIS_SCHEMA, 'yalken.rtk.returned-review-analysis.v2');
  assert.equal(contracts.REVISION_BRIDGE_W1_TERMINAL_LIFECYCLE_STATES.includes('CLOSED'), false);
  assert.equal(disabled.enabled, false);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.mutationSurfaceEnabled, false);
  assert.equal(enabled.canWriteManuscript, false);
  assert.equal(enabled.canApply, false);
});

test('W1 export intent requires main authority but never carries writer authority', async () => {
  const contracts = await loadContracts();
  const blocked = contracts.buildW1ExportIntent({ roundId: 'round-w1' });
  const ready = contracts.buildW1ExportIntent({
    roundId: 'round-w1',
    title: 'Chapter One',
    authorityToken: {
      kind: 'main-process-export-authority',
      requestId: 'request-1',
      canWriteManuscript: false,
    },
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'RTK_BLOCKED_RECONCILING');
  assert.equal(ready.ok, true);
  assert.equal(ready.lifecycleState, 'OPEN_FOR_RETURN');
  assert.equal(ready.canWriteManuscript, false);
  assert.equal(ready.canApply, false);
  assert.equal(ready.filenameHint.participatesInAuthority, false);
});

test('W1 external transport artifact excludes private manifest material', async () => {
  const contracts = await loadContracts();
  const bundle = contracts.buildW1NeutralTransportArtifact({
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
    title: 'Review',
    privateKeyRef: 'local-private-key-ref',
    sourceProjectDigest: 'sha256:project',
    transport: baseTransport({ privateKey: 'must-not-leak', hmacKey: 'must-not-leak' }),
  });
  const publicText = JSON.stringify(bundle.publicManifest);

  assert.equal(bundle.ok, true);
  assert.equal(bundle.code, 'RTK_PRIVATE_MANIFEST_BOUNDARY_OK');
  assert.equal(publicText.includes('must-not-leak'), false);
  assert.equal(publicText.includes('local-private-key-ref'), false);
  assert.equal(bundle.privateManifest.privateKeyRef, 'local-private-key-ref');
  assert.equal(bundle.publicManifest.canWriteManuscript, false);
  assert.equal(bundle.publicManifest.canApply, false);
});

test('W1 returned artifact no-edit analysis produces zero changes and no write authority', async () => {
  const contracts = await loadContracts();
  const result = contracts.analyzeW1ReturnedArtifact({
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
    transport: baseTransport({
      changes: [{ changeId: 'no-edit-1', blockId: 'block-1', kind: 'noEdit' }],
    }),
  });
  const closed = contracts.analyzeW1ReturnedArtifact({
    lifecycleState: 'TERMINAL',
    transport: baseTransport(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'analyzed-no-write');
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
  assert.deepEqual(result.exactOperations, []);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_NO_TEXT_CANDIDATE'), true);
  assert.equal(closed.ok, false);
  assert.equal(closed.code, 'RTK_ROUND_NOT_OPEN_FOR_RETURN');
});

test('W1 round store commits old-or-complete-new and blocks overwrite', async () => {
  const store = await loadRoundStore();
  const storeRoot = makeTempStore();
  const first = await store.commitW1RoundManifest(storeRoot, {
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
    sourceProjectDigest: 'sha256:source',
    publicArtifactDigest: 'sha256:artifact',
  });
  const second = await store.commitW1RoundManifest(storeRoot, {
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
  });
  const read = await store.readW1RoundManifest(storeRoot, 'round-w1');

  assert.equal(first.ok, true);
  assert.equal(fs.existsSync(first.manifestPath), true);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'RTK_ALREADY_IMPORTED');
  assert.equal(read.manifest.lifecycleState, 'OPEN_FOR_RETURN');
  assert.equal(read.manifest.canWriteManuscript, false);
  assert.equal(read.manifest.canApply, false);
});

test('W1 external copy failure preserves round and recovery index is rebuildable', async () => {
  const store = await loadRoundStore();
  const contracts = await loadContracts();
  const storeRoot = makeTempStore();
  const committed = await store.commitW1RoundManifest(storeRoot, {
    roundId: 'round-w1-copy',
    lifecycleState: 'RETURN_ANALYZED',
  });
  const failure = store.recordW1ExternalCopyFailure(committed.manifest, { code: 'E_COPY_FAILED' });
  const index = store.buildW1ReconciliationIndex([committed.manifest]);

  assert.equal(failure.code, 'RTK_WRITE_PRECONDITION_FAILED');
  assert.equal(failure.preservedManifestDigest, committed.manifest.manifestDigest);
  assert.equal(index.rebuildable, true);
  assert.equal(index.rounds[0].archiveEligible, true);
  assert.equal(contracts.evaluateW1ColdArchiveEligibility({ lifecycleState: 'OPEN_FOR_RETURN' }).ok, false);
  assert.equal(contracts.evaluateW1ColdArchiveEligibility({ lifecycleState: 'RECOVERY_REQUIRED' }).ok, false);
  assert.equal(contracts.evaluateW1ColdArchiveEligibility({ lifecycleState: 'TERMINAL' }).ok, true);
});

test('W1 oracle separates local PASS from unsupported durability claims', async () => {
  const oracle = await loadOracle();
  const contracts = await loadContracts();
  const result = oracle.runW1NoWriteOracle({
    flags: { [contracts.REVISION_BRIDGE_W1_FEATURE_FLAG]: true },
    exportIntent: {
      roundId: 'round-w1',
      authorityToken: {
        kind: 'main-process-export-authority',
        requestId: 'request-1',
        canWriteManuscript: false,
      },
    },
    artifact: {
      roundId: 'round-w1',
      lifecycleState: 'OPEN_FOR_RETURN',
      transport: baseTransport(),
    },
    directorySyncCapabilities: { directoryFsync: false },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
  assert.equal(result.directorySync.supported, false);
  assert.equal(result.directorySync.durabilityClaim, 'DIAGNOSTIC_ONLY_UNSUPPORTED');
});

test('W1 stage scope stays inside the frozen allowlist', () => {
  const status = require('node:child_process').execFileSync('git', ['status', '--short'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const changed = status.split('\n').filter(Boolean).map((line) => line.slice(3));
  for (const file of changed) {
    assert.equal(ALLOWLIST.includes(file), true, file);
  }
});
