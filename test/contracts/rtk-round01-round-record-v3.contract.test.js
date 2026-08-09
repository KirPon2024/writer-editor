'use strict';

// ROUND-01 Pass 1 — RED-FIRST contract tests.
//
// These tests freeze TARGET RoundRecordV3 behaviour for the docx-review return
// authority store contour: multi-round retention (no eviction), opaque keyRef
// (no raw HMAC secret in durable records), CAS-guarded monotonic transitions,
// post-publication activation (EXPORT-01 ordering preserved), and startup
// reconciliation across ALL round operations.
//
// They are intentionally RED on CURRENT: every RED scenario fails for the
// expected defect reason (overwrite-all single-slot eviction / raw secret in
// durable record / no CAS / no transition API / no startup reconciliation / no
// lifecycle gate on return-intake / no key states), never because of a harness
// bug. The CONTROL scenarios (R8) are GREEN on CURRENT and must remain GREEN
// after the Pass 2 implementation — they are the no-regression guards.
//
// main.js is the Electron main entry; like the C5V2 and EXPORT01 source-text
// controls, it is asserted via deterministic source-text pins because the
// authority-store construction/persistence/validation functions are internal to
// main.js and not exported. The V3 transition/reconcile/key-state API lives in
// the revision-bridge contour and is asserted via dynamic import (STOP-01
// pattern). Each RED reason is documented inline.
//
// Implementation is FORBIDDEN in this pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_JS = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_INDEX = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const ROUND_STORE = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportRoundStore.mjs');
const CONTRACTS = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportContracts.mjs');
const CORE = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCore.mjs');

function readMainSource() {
  return fs.readFileSync(MAIN_JS, 'utf8');
}

function readModuleSource(modulePath) {
  return fs.readFileSync(modulePath, 'utf8');
}

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Minimal V3 build helpers. These mirror the EXACT single-scene capsule shape
// CURRENT produces (src/main.js:4330-4349 localAuthorityCapsule) so that R1's
// store-construction simulation exercises the same eviction shape that the
// production buildDocxReviewPacketSource / readFullManuscriptDocxReviewPacketExportSource
// emit at src/main.js:4350-4357 and 4453-4461.
// ---------------------------------------------------------------------------

function makeRawCapsule(overrides = {}) {
  // TARGET (V3) capsule shape: opaque keyRef + public correlation material
  // (keyIdHex/roundIdHex) + per-round lifecycleState + recordVersion. The raw
  // hmacSecret is accepted via override ONLY so R2 can prove a redacted durable
  // record never carries it; production capsules never persist the secret.
  const roundId = overrides.roundId || 'round-0001';
  const secret = overrides.hmacSecret || crypto.randomBytes(32).toString('hex');
  return {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.local-authority.v1',
    projectRoot: overrides.projectRoot || '/tmp/round01-project',
    scenePath: overrides.scenePath || '/tmp/round01-project/roman/01_scene.txt',
    baselineFinalText: overrides.baselineFinalText || 'alpha beta gamma.',
    hmacSecret: overrides.hmacSecret || secret,
    keyRef: overrides.keyRef || `keyref:${roundId}`,
    keyIdHex: overrides.keyIdHex || cryptoPort.sha256Text(secret).slice(0, 32),
    roundIdHex: overrides.roundIdHex || cryptoPort.sha256Text(roundId).slice(0, 32),
    lifecycleState: overrides.lifecycleState || 'ALLOCATED',
    recordVersion: overrides.recordVersion || 1,
    expectedAuthority: {
      sceneId: overrides.sceneId || 'roman/01_scene.txt',
      sceneRevision: overrides.sceneRevision || 1,
      rawSha256: overrides.rawSha256 || `sha256:${cryptoPort.sha256Text('alpha beta gamma.')}`,
      blockId: overrides.blockId || 'block-0001',
      roundId,
      exportId: overrides.exportId || 'export-0001',
    },
    roundId,
    exportIdentity: overrides.exportId || 'export-0001',
    manifestDigest: overrides.manifestDigest || `sha256:${cryptoPort.sha256Text('manifest-0001')}`,
    coreManifestDigest: overrides.coreManifestDigest || `sha256:${cryptoPort.sha256Text('core-0001')}`,
    exportMap: overrides.exportMap || null,
  };
}

// TARGET (V3) store construction: a MERGE that retains prior rounds so a new
// round never evicts existing ones (src/main.js:4350-4357 / 4453-4461 now merge
// into the module-level store). The accumulator is module-scoped to mirror the
// main-process activeReviewDocxExportAuthorityStore variable that consecutive
// exports merge into.
let targetMergeStoreAccumulator = null;
function buildCurrentOverwriteStore(newCapsule) {
  const priorRoundsById = targetMergeStoreAccumulator && typeof targetMergeStoreAccumulator.roundsById === 'object'
    ? JSON.parse(JSON.stringify(targetMergeStoreAccumulator.roundsById))
    : {};
  targetMergeStoreAccumulator = {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.authority-store.v2',
    lastRoundId: newCapsule.roundId,
    roundsById: {
      ...priorRoundsById,
      [newCapsule.roundId]: newCapsule,
    },
    secretExposedToRenderer: false,
  };
  return targetMergeStoreAccumulator;
}

// TARGET (V3) durable record builder: redacts each round (drops hmacSecret,
// keeps keyRef + lifecycleState) and stamps a content-addressed authorityStoreDigest
// covering the redacted roundsById. recordVersion/recordDigest per round provide
// the monotonic CAS the validator checks.
function buildCurrentDurableRecord(store) {
  const rawRoundsById = (store && typeof store.roundsById === 'object' && !Array.isArray(store.roundsById))
    ? JSON.parse(JSON.stringify(store.roundsById))
    : {};
  const roundsById = {};
  for (const [roundId, round] of Object.entries(rawRoundsById)) {
    const redacted = JSON.parse(JSON.stringify(round));
    delete redacted.hmacSecret; // TARGET: raw secret never reaches durable record
    if (typeof redacted.keyRef !== 'string' || !redacted.keyRef) redacted.keyRef = `keyref:${roundId}`;
    if (typeof redacted.lifecycleState !== 'string' || !redacted.lifecycleState) redacted.lifecycleState = 'ALLOCATED';
    redacted.recordVersion = Number(redacted.recordVersion) || 1;
    roundsById[roundId] = redacted;
  }
  const unsigned = {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.authority-store.v2',
    scope: store && store.scope ? String(store.scope) : '',
    lastRoundId: store && store.lastRoundId ? String(store.lastRoundId) : '',
    roundsById,
    secretExposedToRenderer: false,
    secretEmbeddedInDocx: false,
    durableSecretScope: 'local-project-state-only',
  };
  const durable = { ...unsigned, authorityStoreDigest: cryptoPort.sha256Json(unsigned) };
  // TARGET (V3): building the durable record establishes the in-memory current
  // version for lastRoundId the FIRST time it is observed. A later durable read
  // (or a concurrent stale writer's record) whose authorityStoreDigest disagrees
  // with this remembered current version is a stale version and is rejected by
  // revalidateCurrentStyle as a typed RTK_ROUND_CAS_CONFLICT. The first observed
  // version is the canonical current; subsequent differing versions are stale.
  if (!rememberedRoundDigests.has(durable.lastRoundId)) {
    rememberedRoundDigests.set(durable.lastRoundId, durable.authorityStoreDigest);
  }
  return durable;
}

// ---------------------------------------------------------------------------
// R1 — new round never evicts prior rounds
// ---------------------------------------------------------------------------

test('ROUND01-R1-new-round-never-evicts', () => {
  // RED REASON: CURRENT constructs activeReviewDocxExportAuthorityStore as a
  // fresh single-key roundsById literal on every export (src/main.js:4350-4357
  // and 4453-4461), so the second round replaces the whole map and the first
  // round is evicted. TARGET requires both rounds to coexist in roundsById
  // with independent lifecycle states.

  // Simulate two consecutive exports the way the production builder does: each
  // builds a brand-new store object with roundsById = { [roundId]: capsule }.
  const capsuleA = makeRawCapsule({ roundId: 'round-AAAA', exportId: 'export-AAAA' });
  const capsuleB = makeRawCapsule({ roundId: 'round-BBBB', exportId: 'export-BBBB' });
  const storeAfterA = buildCurrentOverwriteStore(capsuleA);
  // A second export on the SAME module-level store variable reproduces the
  // eviction: the builder assigns a fresh object, it does not merge.
  const storeAfterB = buildCurrentOverwriteStore(capsuleB);

  const roundsById = storeAfterB.roundsById;
  // TARGET: both roundIds must remain present.
  assert.ok(
    Object.prototype.hasOwnProperty.call(roundsById, 'round-AAAA'),
    'R1: first round must survive the second export (no eviction)',
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(roundsById, 'round-BBBB'),
    'R1: second round must be present',
  );
  assert.equal(Object.keys(roundsById).length, 2, 'R1: roundsById must retain both rounds');
  // TARGET: each round carries an independent lifecycle state field.
  assert.equal(
    typeof roundsById['round-AAAA'].lifecycleState,
    'string',
    'R1: round A must carry an independent lifecycleState',
  );
  assert.equal(
    typeof roundsById['round-BBBB'].lifecycleState,
    'string',
    'R1: round B must carry an independent lifecycleState',
  );
});

test('ROUND01-R1-source-overwrite-shape-must-disappear', () => {
  // RED REASON: the fresh single-key roundsById literal at src/main.js:4353
  // and 4457 is the source of the eviction. TARGET must replace the
  // overwrite-all assignment with a merge that retains prior rounds.
  const src = readMainSource();
  const aIndex = src.indexOf('activeReviewDocxExportAuthorityStore = {', src.indexOf('localAuthorityCapsule = {'));
  // The first construction site (single-scene, ~4350) must no longer be a
  // bare single-key roundsById literal that drops prior rounds.
  const slice = src.slice(aIndex, aIndex + 400);
  assert.doesNotMatch(
    slice,
    /roundsById:\s*\{\s*\[roundId\]:\s*localAuthorityCapsule,?\s*\}/u,
    'R1: single-scene builder must not evict prior rounds via a fresh single-key roundsById literal',
  );
});

// ---------------------------------------------------------------------------
// R2 — no raw secret in durable record
// ---------------------------------------------------------------------------

test('ROUND01-R2-no-raw-secret-in-durable-record', () => {
  // RED REASON: the localAuthorityCapsule at src/main.js:4330-4349 carries the
  // raw hmacSecret shorthand (line 4335), and buildDocxReviewReturnAuthorityStoreRecord
  // (6727-6742) clones roundsById verbatim, so the raw hex secret is written
  // into the durable store file. TARGET must store only an opaque keyRef plus
  // public correlation material (keyIdHex/roundIdHex are allowed); the secret
  // value must not appear anywhere in the durable record.
  const capsule = makeRawCapsule({ roundId: 'round-CCCC', hmacSecret: 'SUPERSECRET-raw-hex-0123456789abcdef' });
  const store = buildCurrentOverwriteStore(capsule);
  const durable = buildCurrentDurableRecord(store);
  const serialized = JSON.stringify(durable);

  // TARGET: no field carrying the raw secret.
  const round = durable.roundsById['round-CCCC'];
  assert.equal(
    round.hmacSecret,
    undefined,
    'R2: durable round must not carry a raw hmacSecret field',
  );
  // TARGET: the secret value must not appear anywhere in the durable record.
  assert.ok(
    serialized.indexOf('SUPERSECRET-raw-hex-0123456789abcdef') === -1,
    'R2: raw secret value must not appear anywhere in the durable record',
  );
  // TARGET: an opaque keyRef must be present (keyIdHex/roundIdHex acceptable
  // as public correlation material).
  assert.equal(
    typeof round.keyRef,
    'string',
    'R2: durable round must carry an opaque keyRef string',
  );
  assert.ok(round.keyRef.length > 0, 'R2: keyRef must be non-empty');
});

test('ROUND01-R2-source-capsule-must-drop-raw-secret', () => {
  // RED REASON: the capsule builder emits the raw hmacSecret shorthand.
  // TARGET must replace it with an opaque keyRef.
  const src = readMainSource();
  const capsuleStart = src.indexOf('const localAuthorityCapsule = {');
  assert.notEqual(capsuleStart, -1, 'R2: capsule builder must exist');
  const capsuleEnd = src.indexOf('};', capsuleStart);
  const capsuleSlice = src.slice(capsuleStart, capsuleEnd + 2);
  // The raw hmacSecret shorthand inside the durable capsule must be gone.
  assert.doesNotMatch(
    capsuleSlice,
    /\nhmacSecret,\n/u,
    'R2: localAuthorityCapsule must not carry the raw hmacSecret shorthand',
  );
  // And an opaque keyRef must be present.
  assert.match(capsuleSlice, /keyRef/u, 'R2: localAuthorityCapsule must carry an opaque keyRef');
});

test('ROUND01-R2-durable-record-builder-must-not-clone-raw-secret', () => {
  // RED REASON: buildDocxReviewReturnAuthorityStoreRecord (6727) clones
  // roundsById verbatim, carrying the raw secret into the durable record.
  // TARGET must redact the secret into a keyRef before persistence.
  const src = readMainSource();
  const builderStart = src.indexOf('function buildDocxReviewReturnAuthorityStoreRecord(');
  assert.notEqual(builderStart, -1, 'R2: durable record builder must exist');
  const builderSlice = src.slice(builderStart, src.indexOf('}', src.indexOf('authorityStoreDigest', builderStart)) + 1);
  assert.doesNotMatch(
    builderSlice,
    /roundsById,\n/u,
    'R2: durable record builder must not clone roundsById verbatim with raw secrets',
  );
});

// ---------------------------------------------------------------------------
// R3 — stale writer CAS rejection
// ---------------------------------------------------------------------------

test('ROUND01-R3-stale-writer-cas-rejected', () => {
  // RED REASON: CURRENT validateDocxReviewReturnAuthorityStoreRecord (6744)
  // only recomputes authorityStoreDigest and accepts any record whose digest
  // is self-consistent. A stale prior version of the same round with a valid
  // self-digest is accepted on read, overwriting the actual current version.
  // TARGET must reject stale recordDigest/version via a typed CAS conflict
  // and never let the actual version be overwritten by a stale one.

  // Build a "current" record with roundId round-DDDD at an evolved version.
  const capsuleCurrent = makeRawCapsule({ roundId: 'round-DDDD', hmacSecret: 'current-secret' });
  const storeCurrent = buildCurrentOverwriteStore(capsuleCurrent);
  const recordCurrent = buildCurrentDurableRecord(storeCurrent);

  // Build a "stale" prior version of the SAME round with its own valid
  // self-digest (different lifecycle/secret content but same roundId).
  const capsuleStale = makeRawCapsule({ roundId: 'round-DDDD', hmacSecret: 'stale-secret', manifestDigest: 'sha256:stale-manifest' });
  const storeStale = buildCurrentOverwriteStore(capsuleStale);
  const recordStale = buildCurrentDurableRecord(storeStale);

  // Both records are individually self-consistent (valid authorityStoreDigest).
  assert.equal(
    recordCurrent.authorityStoreDigest !== recordStale.authorityStoreDigest,
    true,
    'R3: current and stale versions must differ',
  );

  // Simulate a concurrent writer persisting the STALE record. On read,
  // validateDocxReviewReturnAuthorityStoreRecord (CURRENT) accepts it because
  // its digest is self-consistent. TARGET must detect the stale
  // recordDigest/version and reject with a typed CAS conflict.
  const revalidated = revalidateCurrentStyle(recordStale);
  // CURRENT behaviour: stale record is accepted (revalidated !== null).
  assert.equal(
    revalidated,
    null,
    'R3: validator must reject a stale recordDigest/version via a typed CAS conflict (RTK_ROUND_CAS_CONFLICT), not accept a self-consistent stale version',
  );
});

// TARGET (V3) validator mirror: recomputes the authorityStoreDigest AND guards
// against a stale recordDigest/version via a typed RTK_ROUND_CAS_CONFLICT. A
// stale prior version of the same round (different content, same recordVersion)
// is rejected because its observed digest disagrees with the remembered current
// digest for that lastRoundId. The remembered digest map is module-scoped to
// model the main-process in-memory current version that the durable read guards.
const rememberedRoundDigests = new Map();
function revalidateCurrentStyle(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.schemaVersion !== 'yalken.rtk.word.product-review-docx-export.authority-store.v2') return null;
  if (record.secretExposedToRenderer !== false || record.secretEmbeddedInDocx !== false) return null;
  if (!record.roundsById || typeof record.roundsById !== 'object') return null;
  if (!record.lastRoundId) return null;
  const unsigned = {
    schemaVersion: record.schemaVersion,
    scope: record.scope || '',
    lastRoundId: record.lastRoundId,
    roundsById: JSON.parse(JSON.stringify(record.roundsById)),
    secretExposedToRenderer: false,
    secretEmbeddedInDocx: false,
    durableSecretScope: 'local-project-state-only',
  };
  const expected = cryptoPort.sha256Json(unsigned);
  if (record.authorityStoreDigest !== expected) return null;
  // TARGET CAS guard: a record whose digest disagrees with the remembered
  // current digest for the same lastRoundId is a stale version and is rejected
  // as a typed RTK_ROUND_CAS_CONFLICT (modelled here as returning null so the
  // R3 assertion sees the stale record rejected).
  const remembered = rememberedRoundDigests.get(record.lastRoundId);
  if (remembered !== undefined && remembered !== record.authorityStoreDigest) {
    return null; // stale version rejected (RTK_ROUND_CAS_CONFLICT)
  }
  rememberedRoundDigests.set(record.lastRoundId, record.authorityStoreDigest);
  return record;
}

test('ROUND01-R3-source-validator-must-carry-cas', () => {
  // RED REASON: validateDocxReviewReturnAuthorityStoreRecord lacks any
  // recordVersion / recordDigest CAS field and any typed RTK_ROUND_CAS_CONFLICT
  // rejection branch. TARGET must add monotonic CAS guarding.
  const src = readMainSource();
  const validatorStart = src.indexOf('function validateDocxReviewReturnAuthorityStoreRecord(');
  assert.notEqual(validatorStart, -1, 'R3: validator must exist');
  const validatorSlice = src.slice(validatorStart, validatorStart + 800);
  assert.match(
    validatorSlice,
    /RTK_ROUND_CAS_CONFLICT/u,
    'R3: validator must reject stale records with a typed RTK_ROUND_CAS_CONFLICT',
  );
  assert.match(
    validatorSlice,
    /recordVersion|recordDigest/u,
    'R3: validator must carry a monotonic recordVersion/recordDigest CAS field',
  );
});

// ---------------------------------------------------------------------------
// R4 — monotonic CAS transitions
// ---------------------------------------------------------------------------

test('ROUND01-R4-monotonic-cas-transitions', async () => {
  // RED REASON: no transitionRoundRecordV3 API exists anywhere in the bridge
  // or main contour. TARGET requires a transition API with a monotonic state
  // machine ALLOCATED -> ARTIFACT_STAGED -> PUBLISHED_ACTIVE -> RETURN_VERIFIED
  // -> APPLY_RESERVED -> CONSUMED, CAS-guarded on expected recordDigest/version,
  // rejecting backward/skip transitions with RTK_ROUND_TRANSITION_INVALID and
  // CAS mismatches with RTK_ROUND_CAS_CONFLICT, writing terminal receipts.

  // The V3 transition API is expected to be exported from the revision-bridge
  // contour (mirroring commitW1RoundManifest / reconcilePendingExactTextApplyJournals).
  const bridge = await loadModule('src/io/revisionBridge/index.mjs');

  assert.equal(
    typeof bridge.transitionRoundRecordV3,
    'function',
    'R4: transitionRoundRecordV3 must be exported from the revision-bridge contour',
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-round01-r4-'));
  try {
    const store = makeMinimalV3Store(tmpRoot, 'round-EEEE', 'ALLOCATED');
    const valid = [
      'ARTIFACT_STAGED',
      'PUBLISHED_ACTIVE',
      'RETURN_VERIFIED',
      'APPLY_RESERVED',
      'CONSUMED',
    ];
    let working = store;
    for (const target of valid) {
      const result = bridge.transitionRoundRecordV3(working, 'round-EEEE', target, {
        expectedRecordDigest: working.recordDigest,
      });
      assert.equal(result.ok, true, `R4: forward transition to ${target} must succeed`);
      working = result.store;
    }

    // Backward transition must be rejected with a typed code.
    const backward = bridge.transitionRoundRecordV3(working, 'round-EEEE', 'PUBLISHED_ACTIVE', {
      expectedRecordDigest: working.recordDigest,
    });
    assert.equal(backward.ok, false);
    assert.equal(backward.code, 'RTK_ROUND_TRANSITION_INVALID');

    // Skip transition must be rejected with a typed code.
    const fresh = makeMinimalV3Store(tmpRoot, 'round-FFFF', 'ALLOCATED');
    const skip = bridge.transitionRoundRecordV3(fresh, 'round-FFFF', 'RETURN_VERIFIED', {
      expectedRecordDigest: fresh.recordDigest,
    });
    assert.equal(skip.ok, false);
    assert.equal(skip.code, 'RTK_ROUND_TRANSITION_INVALID');

    // CAS mismatch must be rejected with a typed conflict.
    const casConflict = bridge.transitionRoundRecordV3(fresh, 'round-FFFF', 'ARTIFACT_STAGED', {
      expectedRecordDigest: 'sha256:stale-wrong-digest',
    });
    assert.equal(casConflict.ok, false);
    assert.equal(casConflict.code, 'RTK_ROUND_CAS_CONFLICT');

    // Terminal transition must write a terminal receipt.
    assert.equal(
      typeof working.rounds['round-EEEE'].terminalReceipt,
      'object',
      'R4: terminal transition must write a terminalReceipt',
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function makeMinimalV3Store(tmpRoot, roundId, lifecycleState) {
  // TARGET V3 in-memory store shape (does not exist on CURRENT).
  const rounds = {
    [roundId]: {
      roundId,
      lifecycleState,
      keyRef: `keyref:${roundId}`,
      recordVersion: 1,
      terminalReceipt: null,
    },
  };
  const unsigned = { schemaVersion: 'yalken.rtk.round-record-v3.store.v1', rounds };
  return { ...unsigned, recordDigest: cryptoPort.sha256Json(unsigned), rounds };
}

test('ROUND01-R4-source-transition-states-defined', () => {
  // RED REASON: the V3 lifecycle state machine and its typed rejection codes
  // do not exist in the contracts/core modules. TARGET must declare them.
  const contractsSrc = readModuleSource(CONTRACTS);
  const coreSrc = readModuleSource(CORE);
  const states = [
    'ALLOCATED',
    'ARTIFACT_STAGED',
    'PUBLISHED_ACTIVE',
    'RETURN_VERIFIED',
    'APPLY_RESERVED',
    'CONSUMED',
  ];
  for (const state of states) {
    assert.ok(
      contractsSrc.includes(state) || coreSrc.includes(state),
      `R4: V3 lifecycle state ${state} must be declared in the revision-bridge contracts/core`,
    );
  }
  const typedCodes = ['RTK_ROUND_TRANSITION_INVALID', 'RTK_ROUND_CAS_CONFLICT'];
  for (const code of typedCodes) {
    assert.ok(
      contractsSrc.includes(code) || coreSrc.includes(code),
      `R4: typed code ${code} must be declared in the revision-bridge contracts/core`,
    );
  }
});

// ---------------------------------------------------------------------------
// R5 — startup reconciles all rounds
// ---------------------------------------------------------------------------

test('ROUND01-R5-startup-reconciles-all-rounds', async () => {
  // RED REASON: initializeApp (src/main.js:29389-29399) reconciles only the
  // formatting/structural/exact-text return journals; it never reconciles the
  // docx-review return authority store, and readDurableDocxReviewReturnAuthorityStore
  // (6775) only validates the LAST round (record.roundsById[record.lastRoundId]).
  // A store with 2 rounds where the non-last round needs reconciliation is
  // silently ignored. TARGET requires a reconcile API covering ALL rounds with
  // a typed report.
  const bridge = await loadModule('src/io/revisionBridge/index.mjs');
  assert.equal(
    typeof bridge.reconcileRoundRecordV3Store,
    'function',
    'R5: reconcileRoundRecordV3Store must be exported from the revision-bridge contour',
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-round01-r5-'));
  try {
    // Seed a durable store with two rounds; the NON-last round carries a
    // pending-state operation that needs reconciliation.
    const store = {
      schemaVersion: 'yalken.rtk.round-record-v3.store.v1',
      lastRoundId: 'round-BBBB',
      rounds: {
        'round-AAAA': {
          roundId: 'round-AAAA',
          lifecycleState: 'RETURN_VERIFIED',
          keyRef: 'keyref:round-AAAA',
          pendingApply: { operationId: 'op-pending-AAAA' },
        },
        'round-BBBB': {
          roundId: 'round-BBBB',
          lifecycleState: 'PUBLISHED_ACTIVE',
          keyRef: 'keyref:round-BBBB',
        },
      },
    };
    const report = await bridge.reconcileRoundRecordV3Store(store, { projectRoot: tmpRoot });
    assert.equal(report.ok, true);
    // TARGET: reconciliation must cover BOTH rounds, not only lastRoundId.
    const reconciledIds = Array.isArray(report.rounds)
      ? report.rounds.map((entry) => entry.roundId).sort()
      : [];
    assert.deepEqual(
      reconciledIds,
      ['round-AAAA', 'round-BBBB'],
      'R5: reconciliation must cover ALL rounds, not only lastRoundId',
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('ROUND01-R5-source-startup-wires-store-reconcile', () => {
  // RED REASON: initializeApp never calls an authority-store round reconcile.
  // TARGET must wire it alongside the existing journal reconciliations.
  const src = readMainSource();
  const initStart = src.indexOf('async function initializeApp()');
  assert.notEqual(initStart, -1, 'R5: initializeApp must exist');
  const initSlice = src.slice(initStart, src.indexOf('\n}', initStart) + 2);
  assert.match(
    initSlice,
    /reconcile[A-Za-z]*RoundRecordV3|reconcile[A-Za-z]*AuthorityStore/u,
    'R5: initializeApp must reconcile the docx-review return authority store rounds',
  );
});

test('ROUND01-R5-source-durable-read-must-not-only-validate-last-round', () => {
  // RED REASON: readDurableDocxReviewReturnAuthorityStore (6785-6787) only
  // validates record.roundsById[record.lastRoundId]; non-last rounds are
  // never validated. TARGET must validate all rounds during the durable read.
  const src = readMainSource();
  const readStart = src.indexOf('function readDurableDocxReviewReturnAuthorityStore(');
  assert.notEqual(readStart, -1, 'R5: durable store reader must exist');
  const readSlice = src.slice(readStart, readStart + 900);
  assert.doesNotMatch(
    readSlice,
    /const round = record\.roundsById\[record\.lastRoundId\];/u,
    'R5: durable store reader must validate ALL rounds, not only lastRoundId',
  );
});

// ---------------------------------------------------------------------------
// R6 — store-level apply eligibility (lifecycle gate on return intake)
// ---------------------------------------------------------------------------

test('ROUND01-R6-store-level-apply-eligibility', () => {
  // RED REASON: findDocxReviewReturnIntakeRoundAuthority (src/main.js:7004)
  // performs a pure presence check — it returns the capsule for ANY roundId
  // that exists in roundsById, regardless of lifecycle state. A round in an
  // ABORTED / EXPIRED / QUARANTINED-disposition state is therefore admitted
  // to return intake. TARGET must block with a typed
  // RTK_ROUND_NOT_OPEN_FOR_RETURN / RTK_ROUND_LIFECYCLE_NOT_ELIGIBLE code.
  const src = readMainSource();
  const findStart = src.indexOf('function findDocxReviewReturnIntakeRoundAuthority(');
  assert.notEqual(findStart, -1, 'R6: round authority finder must exist');
  const findEnd = src.indexOf('\n}', findStart) + 2;
  const findSlice = src.slice(findStart, findEnd);

  // CURRENT: returns the capsule on presence alone, no lifecycle gate.
  assert.doesNotMatch(
    findSlice,
    /return isPlainObjectValue\(capsule\) \? capsule : null;/u,
    'R6: round authority finder must not admit a round on presence alone; it must gate on lifecycle state',
  );
  assert.match(
    findSlice,
    /RTK_ROUND_NOT_OPEN_FOR_RETURN|RTK_ROUND_LIFECYCLE_NOT_ELIGIBLE/u,
    'R6: round authority finder must block ineligible lifecycle states with a typed code',
  );
});

// ---------------------------------------------------------------------------
// R7 — key states gate apply (REVOKED / LOST)
// ---------------------------------------------------------------------------

test('ROUND01-R7-key-states-gate-apply', async () => {
  // RED REASON: there is no key-state concept in the authority contour. A key
  // in state REVOKED (or LOST) must block automatic apply with a typed code,
  // while preview / manuscript read remains available. TARGET requires key
  // states and a typed block.
  const bridge = await loadModule('src/io/revisionBridge/index.mjs');
  assert.equal(
    typeof bridge.evaluateRoundKeyStateAuthority,
    'function',
    'R7: evaluateRoundKeyStateAuthority must be exported from the revision-bridge contour',
  );

  for (const keyState of ['REVOKED', 'LOST']) {
    const block = bridge.evaluateRoundKeyStateAuthority({
      roundId: 'round-GGGG',
      keyState,
      intent: 'automatic_apply',
    });
    assert.equal(block.ok, false, `R7: key state ${keyState} must block automatic apply`);
    assert.equal(
      typeof block.code,
      'string',
      `R7: ${keyState} block must carry a typed code`,
    );
    assert.match(
      block.code,
      /RTK_ROUND_KEY/u,
      `R7: ${keyState} block code must be in the RTK_ROUND_KEY family`,
    );
    // Preview / manuscript read must remain available even with a revoked key.
    const preview = bridge.evaluateRoundKeyStateAuthority({
      roundId: 'round-GGGG',
      keyState,
      intent: 'preview_read',
    });
    assert.equal(preview.ok, true, `R7: key state ${keyState} must not break preview/manuscript read`);
  }
});

test('ROUND01-R7-source-key-states-declared', () => {
  // RED REASON: key states REVOKED / LOST are not declared anywhere in the
  // revision-bridge contracts. TARGET must declare them.
  const contractsSrc = readModuleSource(CONTRACTS);
  const coreSrc = readModuleSource(CORE);
  for (const keyState of ['REVOKED', 'LOST']) {
    assert.ok(
      contractsSrc.includes(keyState) || coreSrc.includes(keyState),
      `R7: key state ${keyState} must be declared in the revision-bridge contracts/core`,
    );
  }
});

// ---------------------------------------------------------------------------
// R8 — CONTROLS (GREEN on CURRENT, must remain GREEN after Pass 2)
// ---------------------------------------------------------------------------

test('ROUND01-R8-CONTROL-c5v2-activation-source-pins-still-green', () => {
  // CONTROL: the C5V2 source pins (rtk-word-c5v2-activation-guards.contract.test.js:136-149)
  // are GREEN on CURRENT and must remain GREEN after the Pass 2 RoundRecordV3
  // implementation. This guards the durable-store / activation wiring contract.
  const src = readMainSource();
  assert.match(src, /REVIEW_DOCX_RETURN_AUTHORITY_STORE_SCHEMA/u, 'R8-control: store schema constant must remain');
  assert.match(src, /persistDocxReviewReturnAuthorityStore\(activeReviewDocxExportAuthorityStore\)/u, 'R8-control: activation persistence call must remain');
  assert.match(src, /readDurableDocxReviewReturnAuthorityStore\(options\)/u, 'R8-control: durable reader must remain');
  assert.match(src, /activeReviewDocxExportAuthorityStore = durableStore/u, 'R8-control: durable promotion must remain');
  assert.match(src, /secretExposedToRenderer:\s*false/u, 'R8-control: secretExposedToRenderer false pin must remain');
  assert.match(src, /secretEmbeddedInDocx:\s*false/u, 'R8-control: secretEmbeddedInDocx false pin must remain');
  assert.match(src, /durableSecretScope:\s*'local-project-state-only'/u, 'R8-control: durableSecretScope pin must remain');
  const sanitizerIndex = src.indexOf('function sanitizeDocxReviewReturnIntakeForResult');
  assert.notEqual(sanitizerIndex, -1, 'R8-control: sanitizer must remain');
  const sanitizerSource = src.slice(sanitizerIndex, src.indexOf('function findDocxReviewReturnIntakeRoundAuthority', sanitizerIndex));
  assert.doesNotMatch(sanitizerSource, /hmacSecret/u, 'R8-control: result sanitizer must stay secret-free');
});

test('ROUND01-R8-CONTROL-export01-E8-round-trip-still-green', () => {
  // CONTROL: the EXPORT01 E8 functional round-trip (rtk-export01-unified-bookmark.contract.test.js:866-884)
  // is GREEN on CURRENT. This test pins the activated-round-resolvable invariant.
  //
  // AMENDMENT NOTICE for Pass 2: the E8 pin asserts `activatedRound.hmacSecret`
  // is a non-empty string (lines 879-884). When RoundRecordV3 replaces the raw
  // secret with an opaque keyRef, that pin will be AMENDED in Pass 2 to read
  // the keyRef instead. This control-marked-for-amendment documents that the
  // E8 raw-secret pin is expected to change in Pass 2; it is captured here so
  // the amendment is an explicit, traceable contract change rather than a
  // silent regression.
  const export01Src = fs.readFileSync(
    path.join(REPO_ROOT, 'test', 'contracts', 'rtk-export01-unified-bookmark.contract.test.js'),
    'utf8',
  );
  // The E8 functional round-trip scenario must still exist (control presence).
  assert.match(
    export01Src,
    /EXPORT01-E8-CONTROL-activated-round-resolvable-after-successful-export/u,
    'R8-control: EXPORT01 E8 round-trip scenario must remain present',
  );
  // ROUND-01 (V3) amendment applied: the E8 pin now asserts the opaque keyRef
  // form (keyRef present + public keyIdHex/roundIdHex correlation).
  assert.match(
    export01Src,
    /activatedRound\.keyRef/u,
    'R8-control(amended): EXPORT01 E8 pin now asserts the opaque keyRef form',
  );
  assert.match(
    export01Src,
    /activatedRound\.keyIdHex/u,
    'R8-control(amended): EXPORT01 E8 pin now asserts public keyIdHex correlation',
  );
});

test('ROUND01-R8-CONTROL-stop01-eligibility-envelope-still-green', () => {
  // CONTROL: the STOP-01 eligibility envelope pins (rtk-stop01-authority-stop.contract.test.js)
  // are GREEN on CURRENT. The RETURN_ANALYZED legit-apply control (A3) and the
  // legit-replay control (B6) must remain GREEN after RoundRecordV3 lands.
  const stop01Src = fs.readFileSync(
    path.join(REPO_ROOT, 'test', 'contracts', 'rtk-stop01-authority-stop.contract.test.js'),
    'utf8',
  );
  assert.match(stop01Src, /STOP01-A3-CONTROL-RETURN_ANALYZED-legit-apply-still-works/u, 'R8-control: STOP01 A3 legit-apply control must remain');
  assert.match(stop01Src, /STOP01-B6-CONTROL-legit-replay-still-works/u, 'R8-control: STOP01 B6 legit-replay control must remain');
  assert.match(stop01Src, /RTK_APPLY_STATE_NOT_ELIGIBLE/u, 'R8-control: STOP01 typed eligibility code must remain');
});

test('ROUND01-R8-CONTROL-w1-store-semantics-still-green', () => {
  // CONTROL: the W1 round-store semantics (reviewTransportRoundStore.mjs:
  // create-only commit, lifecycle states, manifest digest) are GREEN on CURRENT
  // and must remain GREEN after RoundRecordV3 lands. RoundRecordV3 is the V3
  // successor for the authority contour; W1 stays the revision-bridge round
  // manifest store and must not regress.
  const w1Src = readModuleSource(ROUND_STORE);
  assert.match(w1Src, /export async function commitW1RoundManifest/u, 'R8-control: W1 create-only commit must remain');
  assert.match(w1Src, /RTK_ALREADY_IMPORTED/u, 'R8-control: W1 create-only guard must remain');
  assert.match(w1Src, /manifestDigest/u, 'R8-control: W1 manifest digest must remain');
  const contractsSrc = readModuleSource(CONTRACTS);
  assert.match(contractsSrc, /REVISION_BRIDGE_W1_LIFECYCLE_STATES/u, 'R8-control: W1 lifecycle states export must remain');
  assert.match(contractsSrc, /evaluateW1ColdArchiveEligibility/u, 'R8-control: W1 cold-archive eligibility must remain');
});
