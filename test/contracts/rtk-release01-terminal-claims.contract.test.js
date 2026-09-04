'use strict';

/*
 * RELEASE-01 — RED-FIRST contract tests (Pass 1).
 *
 * These tests freeze the TARGET Proof-Carrying Interop V2 §38 contract:
 * a TERMINAL CLAIM COMPILER that binds every public Word / Google / DOCX
 * product wording string to a typed claim, a profile class and committed
 * evidence, and fail-closes on overclaim, unmapped wording, wording drift,
 * dropped nonClaim and Google wording.
 *
 * 15 interop contours are complete. Their claims live in five heterogeneous
 * vocabularies (WORD_BUILD_PROFILE_REGISTRY_V1.json, GOOGLE_BUILD_PROFILE_
 * REGISTRY_V1.json, CAPABILITY_MATRIX.json nonClaims, and the user-visible
 * Word/DOCX wording surfaces README.md, package.json description,
 * src/menu/menu-config.v2.json labels, src/renderer/editor.js formatting
 * strings). None of those product wording strings is bound to typed evidence
 * state by a single machine-check today. RELEASE-01 is that check: one
 * machine-verifiable binding "every public Word/Google/DOCX string -> claim
 * -> profile class + evidence", fail-closed on every drift.
 *
 * RELEASE-01 introduces (in Pass 2):
 *   1. a machine-readable terminal-claim registry
 *      (docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json);
 *   2. a fail-closed wording-surface scanner that extracts every
 *      /word|docx|google/i line from a committed product file and binds it to
 *      a registered claim wording, with GOOGLE_WORDING_PRESENT enforced
 *      before UNMAPPED_WORDING (a Google wording line is ALWAYS a Google
 *      violation, never merely an unmapped one);
 *   3. a claim/evidence binding evaluator with typed codes, including
 *      CLAIM_EXCEEDS_EVIDENCE (USER_FACING_* classes require a profile class
 *      in {COMPETING_NOT_SATURATED, SATURATED, HISTORICAL_BUILD_BOUND} with at
 *      least one evidence head) and CLAIM_ON_BLOCKED_ROW (a claim that carries
 *      a blockedRowRef must be NOT_CLAIMED_BLOCKED);
 *   4. a nonClaim-union evaluator (every source nonClaim must be present in the
 *      terminal inventory) and an anti-overclaim terminal roll-up that keeps
 *      the product's terminal claim at NOT_MADE_WORD_TERMINAL_PASS_REQUIRED
 *      until every Word profile is SATURATED, no Google profile is
 *      DECLARED/NOT_PROVEN, no matrix row is blocked and no veto counter is
 *      non-zero.
 *
 * The contract module under test is
 * scripts/ops/rtk-interop-terminal-claims-v1.mjs. It does NOT exist on
 * CURRENT, so every scenario below is RED on CURRENT with ERR_MODULE_NOT_FOUND
 * (or an equivalent module-load failure). That is the intended Pass 1 RED
 * state. Each scenario documents its TARGET expectation so Pass 2 can flip it
 * green by implementing the documented API.
 *
 * Implementation is FORBIDDEN in this pass.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-interop-terminal-claims-v1.mjs');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json');
const WORDING_PREDECESSOR_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'R24', 'CORRECTIVE', 'WP801_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json');
const WORDING_SUCCESSOR_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'R24', 'CORRECTIVE', 'WP802_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json');
const WORD_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_BUILD_PROFILE_REGISTRY_V1.json');
const GOOGLE_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_BUILD_PROFILE_REGISTRY_V1.json');
const CAPABILITY_MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'CAPABILITY_MATRIX.json');
const SATURATION_LIMITATION_AUDIT_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_SATURATION_LIMITATION_AUDIT_RECEIPT.json';
const TYPED_ADVERSE_SCHEDULES_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_TYPED_ADVERSE_SCHEDULES_RECEIPT.json';
const CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300 = Object.freeze([
  'CARRIER_SURVIVAL_SMOKE',
  'SEMANTIC_DIFFERENTIAL_SUBSET',
  'NEGATIVE_REPLAY_CRASH_SUBSET',
  'WAVE_10',
  'WAVE_40',
  'WAVE_100',
  'WAVE_300',
]);
const CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300 = 7;
const CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT = Object.freeze([
  'CARRIER_SURVIVAL_SMOKE',
  'SEMANTIC_DIFFERENTIAL_SUBSET',
  'NEGATIVE_REPLAY_CRASH_SUBSET',
  'WAVE_10',
  'WAVE_40',
  'WAVE_100',
  'WAVE_300',
  'WAVE_300_REPEAT',
]);
const CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT = 8;

// ---------------------------------------------------------------------------
// Shared helpers (mirror the rtk-lab01 / rtk-google01 harness style).
// ---------------------------------------------------------------------------

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')}`;
}

function sha256File(absPath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')}`;
}

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

// ---------------------------------------------------------------------------
// TARGET (Pass 2) typed codes. These are the exact string constants the future
// module must export via the RELEASE01_CODES object. Pinning them by name
// keeps the contract stable across Pass 2.
// ---------------------------------------------------------------------------

const RELEASE01_CODES = {
  REGISTRY_SCHEMA_INVALID: 'RTK_RELEASE01_REGISTRY_SCHEMA_INVALID',
  CLAIM_DIGEST_MISMATCH: 'RTK_RELEASE01_CLAIM_DIGEST_MISMATCH',
  PROFILE_UNKNOWN: 'RTK_RELEASE01_PROFILE_UNKNOWN',
  CLAIM_EXCEEDS_EVIDENCE: 'RTK_RELEASE01_CLAIM_EXCEEDS_EVIDENCE',
  OVERCLAIM_WORDING: 'RTK_RELEASE01_OVERCLAIM_WORDING',
  UNMAPPED_WORDING: 'RTK_RELEASE01_UNMAPPED_WORDING',
  CLAIM_WORDING_DRIFT: 'RTK_RELEASE01_CLAIM_WORDING_DRIFT',
  WORDING_SURFACE_DRIFT: 'RTK_RELEASE01_WORDING_SURFACE_DRIFT',
  GOOGLE_WORDING_PRESENT: 'RTK_RELEASE01_GOOGLE_WORDING_PRESENT',
  NONCLAIM_DROPPED: 'RTK_RELEASE01_NONCLAIM_DROPPED',
  CLAIM_ON_BLOCKED_ROW: 'RTK_RELEASE01_CLAIM_ON_BLOCKED_ROW',
  COMPILED_OK: 'RTK_RELEASE01_COMPILED_OK',
};

const TERMINAL_CLAIM_REGISTRY_SCHEMA = 'yalken.rtk.interop-terminal-claim-registry.v1';

const CLAIM_CLASSES = [
  'NOT_CLAIMED_BLOCKED',
  'DECLARED_ONLY',
  'USER_FACING_MANUAL_ONLY',
  'USER_FACING_BOUNDED_SUPPORTED',
];

// ---------------------------------------------------------------------------
// Fixtures. Claims are built WITHOUT a claimDigest field; the digest is
// stamped in withDigest() via the TARGET computeClaimDigest from the module
// under test. On CURRENT (module absent) every fixture build fails at the
// dynamic import, which is the intended RED.
//
// The fixture shape mirrors the registry model documented in the contract:
//   claim = { claimId, claimClass, surfaceId?, wording?, evidenceBinding:
//     { profileId }, blockedRowRef?, claimDigest }
//   registry = { schemaVersion, registryId,
//     wordingSurfaces:[{surfaceId, path, sha256}], claims:[...],
//     bannedWordingPatterns:[...], terminalNonClaimInventory:[...],
//     terminalRollup:{state, blockers:[...]} }
// ---------------------------------------------------------------------------

function baseClaim(overrides = {}) {
  return {
    claimId: overrides.claimId || 'claim-docx-export-minimal',
    claimClass: overrides.claimClass || 'USER_FACING_BOUNDED_SUPPORTED',
    surfaceId: overrides.surfaceId === undefined ? 'surface-menu-config' : overrides.surfaceId,
    wording: overrides.wording === undefined ? 'Export DOCX (Minimal)...' : overrides.wording,
    evidenceBinding: overrides.evidenceBinding || { profileId: 'word-mac-16.111.2-d1' },
    // LAB-02: every claim carries an evidence scope. Build-independent product
    // functions may be backed by HISTORICAL evidence; CURRENT_BUILD_COMPATIBILITY
    // claims may bind only to the current build's COMPETING/SATURATED profile.
    evidenceScope: overrides.evidenceScope === undefined ? 'BUILD_INDEPENDENT_PRODUCT_FUNCTION' : overrides.evidenceScope,
    blockedRowRef: overrides.blockedRowRef === undefined ? null : overrides.blockedRowRef,
  };
}

async function withDigest(claim) {
  const module = await loadModule();
  const digest = module.computeClaimDigest(claim);
  return { ...claim, claimDigest: digest };
}

function stripDigest(claim) {
  const { claimDigest, ...rest } = claim;
  return rest;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstCode(result) {
  if (!result) return undefined;
  if (Array.isArray(result.reasons) && result.reasons.length > 0) {
    return result.reasons[0].code || result.reasons[0];
  }
  return result.code;
}

// A canonical two-claim registry used across scenarios:
//   claim A — USER_FACING_BOUNDED_SUPPORTED on the 16.111.2 Word profile, with
//             a registered wording bound to surface-menu-config and a matching
//             surface sha256 (overridden per scenario);
//   claim B — NOT_CLAIMED_BLOCKED for the multi-scene coordinator blocked row,
//             no wording, no surface (surfaceId null).
async function validTwoClaimRegistry() {
  const module = await loadModule();

  const claimA = await withDigest(baseClaim({
    claimId: 'claim-docx-export-minimal',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    surfaceId: 'surface-menu-config',
    wording: 'Export DOCX (Minimal)...',
    evidenceBinding: { profileId: 'word-mac-16.111.2-d1' },
    blockedRowRef: null,
  }));

  const claimB = await withDigest(baseClaim({
    claimId: 'claim-multi-scene-coordinator-blocked',
    claimClass: 'NOT_CLAIMED_BLOCKED',
    surfaceId: null,
    wording: null,
    evidenceBinding: { profileId: 'word-mac-16.111.2-d1' },
    blockedRowRef: 'MULTI_SCENE_COORDINATOR',
  }));

  return {
    schemaVersion: module.TERMINAL_CLAIM_REGISTRY_SCHEMA,
    registryId: 'yalken-interop-terminal-claim-registry-v1',
    wordingSurfaces: [
      {
        surfaceId: 'surface-menu-config',
        path: 'src/menu/menu-config.v2.json',
        sha256: sha256Text('surface:menu-config:fixture'),
      },
    ],
    claims: [claimA, claimB],
    bannedWordingPatterns: [
      'fully supports',
      'seamless',
      'production-ready',
      'SATURATED',
      'complete Word support',
      'полная поддержка',
      'гарантирован*',
    ],
    terminalNonClaimInventory: [
      'GOOGLE_DOCS_GREEN_NEVER_CARRIES_ACROSS_MODES_OR_PROVIDERS',
      'WORD_MAC_16_111_2_COMPLETE_NOT_SATURATED',
    ],
    terminalRollup: {
      state: 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED',
      blockers: [
        'WORD_MAC_16_111_2_NOT_SATURATED',
        'GOOGLE_DOCS_BOTH_MODES_DECLARED',
      ],
    },
  };
}

// ===========================================================================
// RELEASE01-01 — loadTerminalClaimRegistry accepts a valid two-claim fixture
// ===========================================================================

test('RELEASE01-01-loadTerminalClaimRegistry-accepts-valid-fixture', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  // TARGET: the valid fixture loads as ok=true and returns both claims.
  // RED REASON: the module does not exist yet.
  const result = module.loadTerminalClaimRegistry(registry);
  assert.equal(result.ok, true, 'valid registry must load');
  assert.ok(Array.isArray(result.claims) || Array.isArray(result.registry && result.registry.claims),
    'loaded registry must expose claims');
  const claims = Array.isArray(result.claims) ? result.claims : result.registry.claims;
  assert.equal(claims.length, 2, 'both claims must survive loading');

  // Digests must recompute to the recorded claimDigest via computeClaimDigest.
  for (const claim of claims) {
    const recomputed = module.computeClaimDigest(stripDigest(claim));
    assert.equal(recomputed, claim.claimDigest, 'recorded claimDigest must recompute');
  }

  // The frozen CLAIM_CLASSES vocabulary and the schema constant are pinned.
  assert.deepEqual([...module.CLAIM_CLASSES], CLAIM_CLASSES,
    'CLAIM_CLASSES must be the frozen ascending-authority four-class list');
  assert.equal(Object.isFrozen(module.CLAIM_CLASSES), true, 'CLAIM_CLASSES must be frozen');
  assert.equal(Object.isFrozen(module.RELEASE01_CODES), true, 'RELEASE01_CODES must be frozen');
  assert.equal(module.TERMINAL_CLAIM_REGISTRY_SCHEMA, TERMINAL_CLAIM_REGISTRY_SCHEMA,
    'TERMINAL_CLAIM_REGISTRY_SCHEMA must equal the pinned constant');
});

// ===========================================================================
// RELEASE01-02 — schema invalid (missing schemaVersion / unknown claimClass /
// claim missing mandatory field) -> REGISTRY_SCHEMA_INVALID (schema before digest)
// ===========================================================================

test('RELEASE01-02-schema-invalid-typed-code', async () => {
  const module = await loadModule();
  const good = await validTwoClaimRegistry();

  // Missing schemaVersion.
  const noSchema = clone(good);
  delete noSchema.schemaVersion;
  const noSchemaResult = module.loadTerminalClaimRegistry(noSchema);
  assert.equal(noSchemaResult.ok, false, 'missing schemaVersion must fail');
  assert.equal(firstCode(noSchemaResult), RELEASE01_CODES.REGISTRY_SCHEMA_INVALID);

  // Unknown claimClass.
  const unknownClass = clone(good);
  unknownClass.claims[0].claimClass = 'MYSTERY_CLASS';
  const unknownClassResult = module.loadTerminalClaimRegistry(unknownClass);
  assert.equal(unknownClassResult.ok, false, 'unknown claimClass must fail');
  assert.equal(firstCode(unknownClassResult), RELEASE01_CODES.REGISTRY_SCHEMA_INVALID);

  // Claim missing a mandatory field (evidenceBinding).
  const missingField = clone(good);
  delete missingField.claims[0].evidenceBinding;
  const missingFieldResult = module.loadTerminalClaimRegistry(missingField);
  assert.equal(missingFieldResult.ok, false, 'claim missing mandatory field must fail');
  assert.equal(firstCode(missingFieldResult), RELEASE01_CODES.REGISTRY_SCHEMA_INVALID);
});

// ===========================================================================
// RELEASE01-03 — claim digest tamper (wording changed after digest computed)
// ===========================================================================

test('RELEASE01-03-claim-digest-mismatch', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  // Tamper: change wording AFTER the digest was recorded.
  const tampered = clone(registry);
  tampered.claims[0].wording = 'Export DOCX (Tampered)...';

  const result = module.loadTerminalClaimRegistry(tampered);
  assert.equal(result.ok, false, 'tampered claimDigest must fail');
  assert.equal(firstCode(result), RELEASE01_CODES.CLAIM_DIGEST_MISMATCH);
});

// ===========================================================================
// RELEASE01-04 — CLAIM_EXCEEDS_EVIDENCE: USER_FACING_BOUNDED_SUPPORTED claim
// bound to a DECLARED profile (Google office-mode).
// ===========================================================================

test('RELEASE01-04-claim-exceeds-evidence-bounded-on-declared', async () => {
  const module = await loadModule();

  // A real-shaped Google office-mode profile: DECLARED, no evidence heads.
  const profile = {
    profileId: 'google-docs-office-mode-post-d1-v1',
    class: 'DECLARED',
    evidenceHeads: [],
  };

  const claim = baseClaim({
    claimId: 'claim-google-export-bounded',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceBinding: { profileId: 'google-docs-office-mode-post-d1-v1' },
  });

  const result = module.evaluateClaimEvidenceBinding({ claim, profile });
  assert.equal(result.ok, false, 'BOUNDED_SUPPORTED on a DECLARED profile must be blocked');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);
});

// ===========================================================================
// RELEASE01-05 — CLAIM_EXCEEDS_EVIDENCE: USER_FACING_MANUAL_ONLY on DECLARED;
// and BOUNDED_SUPPORTED on COMPETING_NOT_SATURATED with evidenceHeads: []
// (no heads -> insufficient even for a competing profile).
// ===========================================================================

test('RELEASE01-05-claim-exceeds-evidence-manual-on-declared-and-empty-heads', async () => {
  const module = await loadModule();

  // (a) USER_FACING_MANUAL_ONLY on a DECLARED profile.
  const declaredProfile = {
    profileId: 'google-docs-office-mode-post-d1-v1',
    class: 'DECLARED',
    evidenceHeads: [],
  };
  const manualClaim = baseClaim({
    claimId: 'claim-google-manual-only',
    claimClass: 'USER_FACING_MANUAL_ONLY',
    evidenceBinding: { profileId: 'google-docs-office-mode-post-d1-v1' },
  });
  const manualResult = module.evaluateClaimEvidenceBinding({ claim: manualClaim, profile: declaredProfile });
  assert.equal(manualResult.ok, false, 'MANUAL_ONLY on a DECLARED profile must be blocked');
  assert.equal(manualResult.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);

  // (b) USER_FACING_BOUNDED_SUPPORTED on COMPETING_NOT_SATURATED but with NO
  // evidence heads: even a competing profile must have at least one head.
  const competingEmptyHeads = {
    profileId: 'word-mac-16.111.2-d1',
    class: 'COMPETING_NOT_SATURATED',
    evidenceHeads: [],
  };
  const boundedClaim = baseClaim({
    claimId: 'claim-docx-export-bounded-empty-heads',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceBinding: { profileId: 'word-mac-16.111.2-d1' },
  });
  const boundedResult = module.evaluateClaimEvidenceBinding({ claim: boundedClaim, profile: competingEmptyHeads });
  assert.equal(boundedResult.ok, false, 'BOUNDED_SUPPORTED on a competing profile with no heads must be blocked');
  assert.equal(boundedResult.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);
});

// ===========================================================================
// RELEASE01-06 — PROFILE_UNKNOWN: evidenceBinding.profileId not among the
// passed profiles (evaluateClaimEvidenceBinding with profile null).
// ===========================================================================

test('RELEASE01-06-profile-unknown-blocked', async () => {
  const module = await loadModule();

  const claim = baseClaim({
    claimId: 'claim-unknown-profile',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceBinding: { profileId: 'word-mac-99.99.99-does-not-exist' },
  });

  // profile null -> PROFILE_UNKNOWN (identity before sufficiency).
  const result = module.evaluateClaimEvidenceBinding({ claim, profile: null });
  assert.equal(result.ok, false, 'unknown profile must be blocked');
  assert.equal(result.code, RELEASE01_CODES.PROFILE_UNKNOWN);
});

// ===========================================================================
// RELEASE01-07 — OVERCLAIM_WORDING: claim wording 'Fully supports Word
// seamlessly' matches bannedPatterns.
// ===========================================================================

test('RELEASE01-07-overclaim-wording-blocked', async () => {
  const module = await loadModule();

  const claim = baseClaim({
    claimId: 'claim-overclaim-wording',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    wording: 'Fully supports Word seamlessly',
  });
  const bannedPatterns = [
    'fully supports',
    'seamless',
    'production-ready',
    'SATURATED',
    'complete Word support',
    'полная поддержка',
    'гарантирован*',
  ];

  const result = module.evaluateWordingOverclaim({ claim, bannedPatterns });
  assert.equal(result.ok, false, 'overclaim wording must be blocked');
  assert.equal(result.code, RELEASE01_CODES.OVERCLAIM_WORDING);
});

// ===========================================================================
// RELEASE01-08 — NONCLAIM_DROPPED: sourceNonClaims contains a nonClaim absent
// from registry.terminalNonClaimInventory.
// ===========================================================================

test('RELEASE01-08-nonclaim-dropped-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  // The source inventory contains a real Google nonClaim that the fixture
  // terminal inventory does NOT list.
  const sourceNonClaims = ['GOOGLE_DOCS_NO_GOOGLE_API_AUTHORITY'];

  const result = module.evaluateNonClaimUnion({ registry, sourceNonClaims });
  assert.equal(result.ok, false, 'dropped nonClaim must be blocked');
  assert.equal(result.code, RELEASE01_CODES.NONCLAIM_DROPPED);
});

// ===========================================================================
// RELEASE01-09 — GOOGLE_WORDING_PRESENT: a surface content line containing
// 'Export to Google Docs...' is GOOGLE_WORDING_PRESENT (not UNMAPPED_WORDING).
// The Google check fires BEFORE the unmapped check.
// ===========================================================================

test('RELEASE01-09-google-wording-present-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  const content = 'File menu\nExport to Google Docs...\nQuit\n';
  const surface = registry.wordingSurfaces.find((s) => s.surfaceId === 'surface-menu-config');

  const result = module.evaluateWordingSurfaceBinding({
    registry,
    surfaceId: 'surface-menu-config',
    content,
    fileSha256: surface.sha256,
  });
  assert.equal(result.ok, false, 'a Google wording line must be blocked as GOOGLE_WORDING_PRESENT');
  assert.equal(result.code, RELEASE01_CODES.GOOGLE_WORDING_PRESENT);
});

// ===========================================================================
// RELEASE01-10 — UNMAPPED_WORDING: a content line 'Batch DOCX export...' that
// is Word/DOCX but not a registered claim wording of this surface.
// ===========================================================================

test('RELEASE01-10-unmapped-wording-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  const content = 'File menu\nBatch DOCX export...\nQuit\n';
  const surface = registry.wordingSurfaces.find((s) => s.surfaceId === 'surface-menu-config');

  const result = module.evaluateWordingSurfaceBinding({
    registry,
    surfaceId: 'surface-menu-config',
    content,
    fileSha256: surface.sha256,
  });
  assert.equal(result.ok, false, 'an unmapped DOCX wording line must be blocked');
  assert.equal(result.code, RELEASE01_CODES.UNMAPPED_WORDING);
});

// ===========================================================================
// RELEASE01-11 — CLAIM_WORDING_DRIFT: a registered claim wording of this
// surface is absent from the extracted content (wording drifted).
// ===========================================================================

test('RELEASE01-11-claim-wording-drift-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  // content has NO word/docx/google line at all: extracted wordings is empty,
  // so the registered wording 'Export DOCX (Minimal)...' is a drift.
  const content = 'Plain line without product wording\nAnother plain line\n';
  const surface = registry.wordingSurfaces.find((s) => s.surfaceId === 'surface-menu-config');

  const result = module.evaluateWordingSurfaceBinding({
    registry,
    surfaceId: 'surface-menu-config',
    content,
    fileSha256: surface.sha256,
  });
  assert.equal(result.ok, false, 'a missing registered wording must be blocked as drift');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_WORDING_DRIFT);
});

// ===========================================================================
// RELEASE01-12 — WORDING_SURFACE_DRIFT: fileSha256 does not match the recorded
// surface sha256.
// ===========================================================================

test('RELEASE01-12-wording-surface-drift-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  const content = 'File menu\nExport DOCX (Minimal)...\nQuit\n';
  const surface = registry.wordingSurfaces.find((s) => s.surfaceId === 'surface-menu-config');

  const result = module.evaluateWordingSurfaceBinding({
    registry,
    surfaceId: 'surface-menu-config',
    content,
    fileSha256: sha256Text('surface:menu-config:DIFFERENT'),
  });
  assert.equal(result.ok, false, 'a file sha256 mismatch must be blocked as surface drift');
  assert.equal(result.code, RELEASE01_CODES.WORDING_SURFACE_DRIFT);
});

// ===========================================================================
// RELEASE01-13 — CLAIM_ON_BLOCKED_ROW: a claim that carries a blockedRowRef
// but whose claimClass is not NOT_CLAIMED_BLOCKED.
// ===========================================================================

test('RELEASE01-13-claim-on-blocked-row-blocked', async () => {
  const module = await loadModule();

  // A SATURATED Word profile with evidence heads satisfies the sufficiency
  // law, so the blocked-row check is the first failing check (identity ->
  // blocked-row -> sufficiency).
  const profile = {
    profileId: 'word-mac-16.111.2-saturated',
    class: 'SATURATED',
    evidenceHeads: [
      { path: 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json' },
    ],
  };

  const claim = baseClaim({
    claimId: 'claim-on-blocked-row',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceBinding: { profileId: 'word-mac-16.111.2-saturated' },
    blockedRowRef: 'MULTI_SCENE_COORDINATOR',
  });

  const result = module.evaluateClaimEvidenceBinding({ claim, profile });
  assert.equal(result.ok, false, 'a non-blocked claim on a blocked row must be blocked');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_ON_BLOCKED_ROW);
});

// ===========================================================================
// RELEASE01-14 — integration against the REAL terminal-claim registry on disk
// (Pass 2 artifact) and the real Word/Google registries + CAPABILITY_MATRIX.
//
// TARGET: the real docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json
// (created in Pass 2) must load ok=true, every wordingSurface path must exist
// with a matching sha256, every real Word/DOCX product wording line extracted
// from README.md, package.json, src/menu/menu-config.v2.json and
// src/renderer/editor.js must be a registered claim wording (ok=true) with no
// Google wording present, every claim evidenceBinding.profileId must resolve
// to a real Word or Google profile and bind ok=true, the nonClaim union
// against real source inventories (Google nonClaims of both profiles +
// CAPABILITY_MATRIX top-level nonClaims) must be ok=true, and the terminal
// roll-up must equal NOT_MADE_WORD_TERMINAL_PASS_REQUIRED and match the
// registry.terminalRollup.state.
//
// RED REASON: the registry file does not exist on CURRENT (Pass 1), so this
// scenario fails at fs.existsSync. That is the intended integration RED state
// until Pass 2 ships the registry.
// ===========================================================================

test('RELEASE01-14-integration-real-registry-binds-all-wording-and-rolls-up', async () => {
  const module = await loadModule();

  assert.equal(fs.existsSync(REGISTRY_PATH), true,
    'YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json must exist in Pass 2');

  const loaded = module.loadTerminalClaimRegistry(REGISTRY_PATH);
  assert.equal(loaded.ok, true, 'real terminal-claim registry must load');
  const historicalRegistry = loaded.registry || loaded.claims ? loaded.registry : null;
  assert.ok(historicalRegistry, 'loaded registry must expose the registry object');
  const successor = JSON.parse(fs.readFileSync(WORDING_SUCCESSOR_PATH, 'utf8'));
  assert.equal(successor.historicalRegistry.sha256, crypto.createHash('sha256').update(fs.readFileSync(REGISTRY_PATH)).digest('hex'));
  assert.equal(successor.predecessorSuccessor.sha256, crypto.createHash('sha256').update(fs.readFileSync(WORDING_PREDECESSOR_PATH)).digest('hex'));
  assert.deepEqual(successor.surfaceOverrides.map((surface) => surface.path), ['package.json', 'src/renderer/editor.js']);
  const registry = JSON.parse(JSON.stringify(historicalRegistry));
  for (const override of successor.surfaceOverrides) {
    const index = registry.wordingSurfaces.findIndex((surface) => surface.surfaceId === override.surfaceId && surface.path === override.path);
    assert.notEqual(index, -1, `successor surface must exist historically: ${override.path}`);
    assert.equal(override.sha256, sha256File(path.join(REPO_ROOT, override.path)), `successor surface sha256 must match: ${override.path}`);
    registry.wordingSurfaces[index] = { surfaceId: override.surfaceId, path: override.path, sha256: override.sha256 };
  }

  // (a) Every wordingSurface path must exist with a matching sha256.
  for (const surface of registry.wordingSurfaces || []) {
    const abs = path.join(REPO_ROOT, surface.path);
    assert.equal(fs.existsSync(abs), true, `wording surface file must exist: ${surface.path}`);
    assert.equal(sha256File(abs), surface.sha256,
      `wording surface sha256 must match: ${surface.path}`);
  }

  // (b) Every real product wording surface binds ok=true (all Word/DOCX lines
  //     registered, no Google wording present, no drift).
  const realSurfacePaths = [
    'README.md',
    'package.json',
    'src/menu/menu-config.v2.json',
    'src/renderer/editor.js',
  ];
  for (const relPath of realSurfacePaths) {
    const abs = path.join(REPO_ROOT, relPath);
    const surface = (registry.wordingSurfaces || []).find((s) => s.path === relPath);
    assert.ok(surface, `real wording surface must be registered: ${relPath}`);
    const content = fs.readFileSync(abs, 'utf8');
    const binding = module.evaluateWordingSurfaceBinding({
      registry,
      surfaceId: surface.surfaceId,
      content,
      fileSha256: sha256File(abs),
    });
    assert.equal(binding.ok, true,
      `real wording surface must bind ok: ${relPath} (${JSON.stringify(binding.reasons || binding.code)})`);
  }

  // (c) Load the real Word and Google profile registries and resolve every
  //     claim's evidenceBinding.profileId to a real profile; the binding must
  //     be ok=true against the real profile.
  const wordRegistryJson = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const googleRegistryJson = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const profilesById = new Map();
  for (const p of wordRegistryJson.profiles || []) profilesById.set(p.profileId, p);
  for (const p of googleRegistryJson.profiles || []) profilesById.set(p.profileId, p);

  for (const claim of loaded.claims || registry.claims || []) {
    const profile = profilesById.get(claim.evidenceBinding && claim.evidenceBinding.profileId) || null;
    assert.ok(profile, `claim ${claim.claimId} profileId must resolve to a real profile: ${claim.evidenceBinding && claim.evidenceBinding.profileId}`);
    const binding = module.evaluateClaimEvidenceBinding({ claim, profile });
    assert.equal(binding.ok, true,
      `claim ${claim.claimId} must bind ok to its real profile (${JSON.stringify(binding.reasons || binding.code)})`);
  }

  // (d) NonClaim union against real source inventories: Google nonClaims of
  //     both profiles + CAPABILITY_MATRIX top-level nonClaims.
  const sourceNonClaims = new Set();
  for (const p of googleRegistryJson.profiles || []) {
    for (const nc of p.nonClaims || []) sourceNonClaims.add(nc);
  }
  const matrix = JSON.parse(fs.readFileSync(CAPABILITY_MATRIX_PATH, 'utf8'));
  for (const nc of matrix.nonClaims || []) sourceNonClaims.add(nc);

  const union = module.evaluateNonClaimUnion({
    registry,
    sourceNonClaims: [...sourceNonClaims],
  });
  assert.equal(union.ok, true,
    `nonClaim union against real inventories must be ok (${JSON.stringify(union.reasons || union.code)})`);

  // (e) Terminal roll-up: NOT_MADE_WORD_TERMINAL_PASS_REQUIRED and matches the
  //     registry.terminalRollup.state.
  const wordProfiles = wordRegistryJson.profiles || [];
  const googleProfiles = googleRegistryJson.profiles || [];
  const blockedMatrixRows = (matrix.rows || []).filter((r) => r && r.status && /blocked|not_ready|not_claimed/i.test(JSON.stringify(r.status)));
  const rollup = module.evaluateTerminalRollup({
    registry,
    context: {
      wordProfiles,
      googleProfiles,
      blockedMatrixRows,
      vetoCounters: {},
    },
  });
  assert.equal(rollup.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED',
    'terminal roll-up must stay at NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.equal(rollup.ok, true, 'roll-up must agree with registry.terminalRollup.state');
});

// ===========================================================================
// RELEASE01-15 — rollup-stale-blocked: a registry whose terminalRollup.state
// is WIDER than the state computed from the context (e.g. the registry records
// WORD_TERMINAL_PASS_ACHIEVED while the evidence context still has a DECLARED
// Google profile) must be blocked as CLAIM_EXCEEDS_EVIDENCE. The recorded
// roll-up must never claim more than the evidence supports.
// ===========================================================================

test('RELEASE01-15-rollup-stale-blocked-claim-exceeds-evidence', async () => {
  const module = await loadModule();
  const registry = await validTwoClaimRegistry();

  // Tamper: record a WIDER terminal state than the evidence allows.
  const overstated = clone(registry);
  overstated.terminalRollup.state = 'WORD_TERMINAL_PASS_ACHIEVED';

  // Context that still has a DECLARED Google profile: the computed state must
  // stay NOT_MADE_WORD_TERMINAL_PASS_REQUIRED, so the wider recorded state is
  // an overclaim.
  const context = {
    wordProfiles: [
      { profileId: 'word-mac-16.111.2-d1', class: 'SATURATED', evidenceHeads: [{ path: 'x' }] },
    ],
    googleProfiles: [
      { profileId: 'google-docs-office-mode-post-d1-v1', class: 'DECLARED', evidenceHeads: [] },
    ],
    blockedMatrixRows: [],
    vetoCounters: {},
  };

  const result = module.evaluateTerminalRollup({ registry: overstated, context });
  assert.equal(result.ok, false, 'a roll-up wider than the computed state must be blocked');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED',
    'computed terminalClaim must stay NOT_MADE while a Google profile is DECLARED');
});

// ===========================================================================
// RELEASE01-16 — class gate is independent of the heads gate (unmasking
// amendment): a DECLARED profile WITH a non-empty evidenceHeads list must still
// fail the class check. With the RELEASE01-04/05 fixtures the heads check alone
// would catch a DECLARED profile (empty heads), masking a removed class check;
// this scenario isolates the class dimension so only the class gate can catch
// it.
// ===========================================================================

test('RELEASE01-16-class-gate-unmasked-by-heads', async () => {
  const module = await loadModule();

  // DECLARED profile WITH evidence heads: the heads gate passes, so only the
  // class gate can produce CLAIM_EXCEEDS_EVIDENCE.
  const declaredWithHeads = {
    profileId: 'google-docs-office-mode-post-d1-v1',
    class: 'DECLARED',
    evidenceHeads: [
      { path: 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json' },
    ],
  };
  const claim = baseClaim({
    claimId: 'claim-google-bounded-with-heads',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceBinding: { profileId: 'google-docs-office-mode-post-d1-v1' },
  });
  const result = module.evaluateClaimEvidenceBinding({ claim, profile: declaredWithHeads });
  assert.equal(result.ok, false, 'DECLARED profile with heads must still fail the class gate');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);
});

// ===========================================================================
// HOTFIX YALKEN_INTEROP_RELEASE01_TERMINAL_ROLLUP_FAIL_CLOSED_HOTFIX_V1
//
// Owner-audited false-green on 74bcee13 (reproduced by the orchestrator before
// this repair): the legacy evaluateTerminalRollup returned ok=true
// WORD_TERMINAL_PASS_ACHIEVED for a context with word-windows NOT_PROVEN,
// word-online DECLARED and six NOT_CLAIMED_BLOCKED claims, and silently
// defaulted missing context collections to empty values. The sixteen scenarios
// below pin the STRICT replacement evaluateTerminalRollupStrict:
//
//   context = { wordProfiles, googleProfiles, terminalMatrix, vetoCounters,
//               claims } — all five collections mandatory.
//   Check order (load-bearing): CONTEXT_INCOMPLETE -> DUPLICATE_PROFILE_ID ->
//   REQUIRED_PROFILE_MISSING -> TERMINAL_MATRIX_INVALID -> VETO_INVENTORY_INVALID
//   -> compute deterministic blockers -> BLOCKER_SET_MISMATCH (recorded blockers
//   must equal computed exactly) -> TERMINAL_STATE_MISMATCH (recorded state must
//   equal computed exactly, both directions) -> COMPILED_OK.
//
//   Deterministic blocker codes (sorted):
//     WORD_PROFILE_NOT_SATURATED:<profileId>   (required current profile not SATURATED)
//     WORD_PROFILE_UNPROVEN:<profileId>        (word profile class NOT_PROVEN)
//     WORD_PROFILE_DECLARED:<profileId>        (word profile class DECLARED)
//     GOOGLE_PROFILE_UNPROVEN:<profileId>      (google profile class NOT_PROVEN)
//     GOOGLE_PROFILE_DECLARED:<profileId>      (google profile class DECLARED)
//     BLOCKED_CLAIM:<claimId>                  (claim class NOT_CLAIMED_BLOCKED remains)
//     TERMINAL_MATRIX_ROW_BLOCKED:<rowId>      (terminal matrix row status BLOCKED)
//
//   computed PASS requires an EMPTY computed blocker set; recorded blockers and
//   recorded state must equal the computed values exactly.
// ===========================================================================

const HOTFIX_CODES = {
  ROLLUP_CONTEXT_INCOMPLETE: 'RTK_RELEASE01_ROLLUP_CONTEXT_INCOMPLETE',
  REQUIRED_PROFILE_MISSING: 'RTK_RELEASE01_REQUIRED_PROFILE_MISSING',
  DUPLICATE_PROFILE_ID: 'RTK_RELEASE01_DUPLICATE_PROFILE_ID',
  BLOCKED_CLAIM_PRESENT: 'RTK_RELEASE01_BLOCKED_CLAIM_PRESENT',
  BLOCKER_SET_MISMATCH: 'RTK_RELEASE01_BLOCKER_SET_MISMATCH',
  VETO_INVENTORY_INVALID: 'RTK_RELEASE01_VETO_INVENTORY_INVALID',
  TERMINAL_STATE_MISMATCH: 'RTK_RELEASE01_TERMINAL_STATE_MISMATCH',
  TERMINAL_MATRIX_INVALID: 'RTK_RELEASE01_TERMINAL_MATRIX_INVALID',
};

const TERMINAL_MATRIX_SCHEMA = 'yalken.word.c5v2.terminal-acceptance-matrix.v1';
const VETO_KNOWN_KEYS = [
  'falseExactVeto',
  'wrongSceneVeto',
  'silentApplyVeto',
  'replayFailureVeto',
  'silentCommentLossVeto',
  'productNetworkRequestsVeto',
];

function hotfixSaturatedWordProfiles() {
  return [
    { profileId: 'word-mac-16.42-d1', class: 'HISTORICAL_BUILD_BOUND', evidenceHeads: [{ path: 'capsule' }] },
    { profileId: 'word-mac-16.111.1-b06', class: 'HISTORICAL_BUILD_BOUND', evidenceHeads: [{ path: 'b06' }] },
    { profileId: 'word-mac-16.111.2-d1', class: 'SATURATED', evidenceHeads: [{ path: 'waves' }] },
    { profileId: 'word-windows-current', class: 'SATURATED', evidenceHeads: [{ path: 'win' }] },
    { profileId: 'word-online-declared', class: 'SATURATED', evidenceHeads: [{ path: 'online' }] },
  ];
}

function hotfixCleanGoogleProfiles() {
  return [
    { profileId: 'google-docs-office-mode-post-d1-v1', class: 'SATURATED', evidenceHeads: [{ path: 'go' }] },
    { profileId: 'google-docs-native-conversion-post-d1-v1', class: 'SATURATED', evidenceHeads: [{ path: 'gn' }] },
  ];
}

function hotfixCleanMatrix() {
  return {
    schemaVersion: TERMINAL_MATRIX_SCHEMA,
    rows: [
      { rowId: 'MULTI_SCENE_COORDINATOR', status: 'EXACT_SUPPORTED' },
    ],
  };
}

function hotfixZeroVetoes() {
  return {
    falseExactVeto: 0,
    wrongSceneVeto: 0,
    silentApplyVeto: 0,
    replayFailureVeto: 0,
    silentCommentLossVeto: 0,
    productNetworkRequestsVeto: 0,
  };
}

function hotfixCleanClaims() {
  return [
    { claimId: 'claim-docx-export-minimal', claimClass: 'USER_FACING_BOUNDED_SUPPORTED', evidenceBinding: { profileId: 'word-mac-16.111.2-d1' } },
  ];
}

function hotfixCleanContext() {
  return {
    // LAB-02: the current-profile pointer travels in the context (read from the
    // Word registry by callers); the roll-up no longer hardcodes a profile id.
    currentProfileId: 'word-mac-16.111.2-d1',
    wordProfiles: hotfixSaturatedWordProfiles(),
    googleProfiles: hotfixCleanGoogleProfiles(),
    terminalMatrix: hotfixCleanMatrix(),
    vetoCounters: hotfixZeroVetoes(),
    claims: hotfixCleanClaims(),
  };
}

function hotfixRecorded(state, blockers) {
  return { terminalRollup: { state, blockers } };
}

// H01 (TEST_01 preservation): the REAL registry against the REAL context stays
// honestly NOT_MADE with recorded blockers exactly equal to computed blockers.
test('RELEASE01-H01-real-registry-strict-rollup-honest-not-made', async () => {
  const module = await loadModule();
  assert.equal(typeof module.evaluateTerminalRollupStrict, 'function', 'strict roll-up must exist');
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const context = {
    // LAB-02: the pointer travels with the context and is read from the real
    // Word registry (post-migration: word-mac-16.111.3-26080215).
    currentProfileId: wordRegistry.currentProfileId,
    wordProfiles: wordRegistry.profiles,
    googleProfiles: googleRegistry.profiles,
    terminalMatrix: matrix,
    vetoCounters,
    claims: registry.claims,
  };
  const result = module.evaluateTerminalRollupStrict({ registry, context });
  assert.equal(result.ok, true, `real registry must agree with strict computation: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(Array.isArray(result.blockers) && result.blockers.length > 0, 'real state must carry deterministic blockers');
});

// H02 (TEST_02): only a SATURATED 16.111.2 profile, every other collection missing.
test('RELEASE01-H02-partial-context-incomplete', async () => {
  const module = await loadModule();
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('NOT_MADE_WORD_TERMINAL_PASS_REQUIRED', []),
    context: { wordProfiles: [{ profileId: 'word-mac-16.111.2-d1', class: 'SATURATED', evidenceHeads: [{ path: 'x' }] }] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.ROLLUP_CONTEXT_INCOMPLETE);
});

// H03 (TEST_03): missing googleProfiles under full-interop semantics.
test('RELEASE01-H03-missing-google-profiles-incomplete', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  delete context.googleProfiles;
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []),
    context,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.ROLLUP_CONTEXT_INCOMPLETE);
});

// H04 (TEST_04): claim references an unresolvable profileId; required current profile absent.
test('RELEASE01-H04-required-profile-missing', async () => {
  const module = await loadModule();
  const contextA = hotfixCleanContext();
  contextA.claims = [{ claimId: 'claim-ghost', claimClass: 'DECLARED_ONLY', evidenceBinding: { profileId: 'word-ghost-does-not-exist' } }];
  const a = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context: contextA });
  assert.equal(a.ok, false);
  assert.equal(a.code, HOTFIX_CODES.REQUIRED_PROFILE_MISSING);

  const contextB = hotfixCleanContext();
  // LAB-02: the required profile is the one the pointer names; removing the
  // pointed-at profile must fail with REQUIRED_PROFILE_MISSING.
  contextB.wordProfiles = contextB.wordProfiles.filter((p) => p.profileId !== contextB.currentProfileId);
  contextB.claims = [];
  const b = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('NOT_MADE_WORD_TERMINAL_PASS_REQUIRED', ['WORD_PROFILE_NOT_SATURATED:word-mac-16.111.2-d1']), context: contextB });
  assert.equal(b.ok, false);
  assert.equal(b.code, HOTFIX_CODES.REQUIRED_PROFILE_MISSING);
});

// H05 (TEST_05): duplicate profileId.
test('RELEASE01-H05-duplicate-profile-id', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  context.wordProfiles.push({ profileId: 'word-mac-16.111.2-d1', class: 'SATURATED', evidenceHeads: [{ path: 'dup' }] });
  const result = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.DUPLICATE_PROFILE_ID);
});

// H06 (TEST_06): Word Windows NOT_PROVEN forbids PASS with everything else closed.
test('RELEASE01-H06-windows-not-proven-blocks-pass', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  context.wordProfiles.find((p) => p.profileId === 'word-windows-current').class = 'NOT_PROVEN';
  const result = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
  assert.equal(result.ok, false);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_UNPROVEN:word-windows-current'), `blockers must name the Windows profile: ${JSON.stringify(result.blockers)}`);
});

// H07 (TEST_07): Word Online DECLARED forbids PASS.
test('RELEASE01-H07-online-declared-blocks-pass', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  context.wordProfiles.find((p) => p.profileId === 'word-online-declared').class = 'DECLARED';
  const result = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
  assert.equal(result.ok, false);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_DECLARED:word-online-declared'), `blockers must name the Online profile: ${JSON.stringify(result.blockers)}`);
});

// H08 (TEST_08): any remaining NOT_CLAIMED_BLOCKED claim forbids PASS.
test('RELEASE01-H08-blocked-claim-blocks-pass', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  context.claims.push({ claimId: 'claim-word-saturated', claimClass: 'NOT_CLAIMED_BLOCKED', evidenceBinding: { profileId: 'word-mac-16.111.2-d1' } });
  const result = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
  assert.equal(result.ok, false);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-word-saturated'), `blockers must name the blocked claim: ${JSON.stringify(result.blockers)}`);
});

// H09 (TEST_09): recorded blocker set non-empty while computed is empty.
test('RELEASE01-H09-recorded-blocker-set-mismatch', async () => {
  const module = await loadModule();
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', ['STALE_BLOCKER_LEFT_BEHIND']),
    context: hotfixCleanContext(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.BLOCKER_SET_MISMATCH);
});

// H10 (TEST_10): real terminal matrix BLOCKED rows forbid PASS; a substitute matrix is invalid.
test('RELEASE01-H10-terminal-matrix-rows-and-substitute', async () => {
  const module = await loadModule();
  const realMatrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const context = hotfixCleanContext();
  context.terminalMatrix = realMatrix;
  const blocked = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(blocked.blockers.includes('TERMINAL_MATRIX_ROW_BLOCKED:MULTI_SCENE_COORDINATOR'), `blockers must name the matrix row: ${JSON.stringify(blocked.blockers)}`);

  const substitute = hotfixCleanContext();
  substitute.terminalMatrix = { schemaVersion: 'revision-bridge.capability-matrix.v1', rows: [] };
  const invalid = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context: substitute });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, HOTFIX_CODES.TERMINAL_MATRIX_INVALID);
});

// H11 (TEST_11): veto inventory missing a known key.
test('RELEASE01-H11-veto-inventory-missing-key', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  delete context.vetoCounters.replayFailureVeto;
  const result = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.VETO_INVENTORY_INVALID);
});

// H12 (TEST_12): nonzero vetoes in numeric, string and boolean form.
test('RELEASE01-H12-veto-nonzero-typed-forms', async () => {
  const module = await loadModule();
  for (const value of [1, '1', true]) {
    const context = hotfixCleanContext();
    context.vetoCounters.silentApplyVeto = value;
    const result = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context });
    assert.equal(result.ok, false, `veto value ${JSON.stringify(value)} must fail closed`);
    assert.equal(result.code, HOTFIX_CODES.VETO_INVENTORY_INVALID);
  }
});

// H13 (TEST_13): recorded PASS while computed NOT_MADE (blockers equal so the
// state check is the first failing one).
test('RELEASE01-H13-recorded-pass-vs-computed-not-made', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  context.terminalMatrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const probe = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('NOT_MADE_WORD_TERMINAL_PASS_REQUIRED', []), context });
  const computedBlockers = probe.blockers;
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', computedBlockers),
    context,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.TERMINAL_STATE_MISMATCH);
});

// H14 (TEST_14): recorded NOT_MADE while computed PASS (narrower recorded is
// equally a mismatch — strict equality, not rank ordering).
test('RELEASE01-H14-recorded-not-made-vs-computed-pass', async () => {
  const module = await loadModule();
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('NOT_MADE_WORD_TERMINAL_PASS_REQUIRED', []),
    context: hotfixCleanContext(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, HOTFIX_CODES.TERMINAL_STATE_MISMATCH);
  assert.equal(result.terminalClaim, 'WORD_TERMINAL_PASS_ACHIEVED');
});

// H15 (TEST_15): fully closed synthetic control still reaches PASS (the gate is
// not a permanent red).
test('RELEASE01-H15-fully-closed-control-passes', async () => {
  const module = await loadModule();
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []),
    context: hotfixCleanContext(),
  });
  assert.equal(result.ok, true, `fully closed control must pass: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'WORD_TERMINAL_PASS_ACHIEVED');
  assert.deepEqual(result.blockers, []);
});

// H16 (TEST_16 preservation): the owner counterexample itself — Windows
// NOT_PROVEN, Online DECLARED and the six real blocked claims present — must now
// fail closed with deterministic blockers on the REAL registry data.
test('RELEASE01-H16-owner-counterexample-fails-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const context = {
    // LAB-02: the counterexample pins 16.111.2 as the (then) current build.
    currentProfileId: 'word-mac-16.111.2-d1',
    wordProfiles: wordRegistry.profiles.map((p) => p.profileId === 'word-mac-16.111.2-d1' ? { ...p, class: 'SATURATED' } : p),
    googleProfiles: [
      { profileId: 'google-docs-office-mode-post-d1-v1', class: 'SATURATED', evidenceHeads: [{ path: 'g' }] },
      { profileId: 'google-docs-native-conversion-post-d1-v1', class: 'SATURATED', evidenceHeads: [{ path: 'h' }] },
    ],
    terminalMatrix: { schemaVersion: TERMINAL_MATRIX_SCHEMA, rows: [] },
    vetoCounters: hotfixZeroVetoes(),
    claims: registry.claims,
  };
  const result = module.evaluateTerminalRollupStrict({
    registry: { terminalRollup: { state: 'WORD_TERMINAL_PASS_ACHIEVED', blockers: [] } },
    context,
  });
  assert.equal(result.ok, false, 'owner counterexample must never pass');
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_UNPROVEN:word-windows-current'));
  assert.ok(result.blockers.includes('WORD_PROFILE_DECLARED:word-online-declared'));
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-word-saturated'));
});

// H17 (unmasking amendment): recorded blocker set of EQUAL length but different
// content must still mismatch. Without this scenario the element-wise blocker
// comparison is masked by the length check (H09 exercises length only).
test('RELEASE01-H17-recorded-blocker-content-mismatch-same-length', async () => {
  const module = await loadModule();
  const context = hotfixCleanContext();
  context.terminalMatrix = {
    schemaVersion: TERMINAL_MATRIX_SCHEMA,
    rows: [{ rowId: 'MULTI_SCENE_COORDINATOR', status: 'BLOCKED' }],
  };
  const result = module.evaluateTerminalRollupStrict({
    registry: hotfixRecorded('NOT_MADE_WORD_TERMINAL_PASS_REQUIRED', ['TERMINAL_MATRIX_ROW_BLOCKED:SOME_OTHER_ROW']),
    context,
  });
  assert.equal(result.ok, false, 'same-length different-content blocker set must mismatch');
  assert.equal(result.code, HOTFIX_CODES.BLOCKER_SET_MISMATCH);
});

// ===========================================================================
// LAB-02 scope split (owner-directed build migration contour):
// build-independent product-function claims may be backed by HISTORICAL
// evidence; CURRENT_BUILD_COMPATIBILITY claims may bind only to the current
// build's COMPETING_NOT_SATURATED / SATURATED profile. Historical evidence
// backs historical scope only. The strict roll-up reads the current-profile
// pointer from the context instead of hardcoding a profile id.
// ===========================================================================

// S01: CURRENT_BUILD_COMPATIBILITY on a HISTORICAL profile fails.
test('RELEASE01-S01-current-compat-on-historical-blocked', async () => {
  const module = await loadModule();
  const historical = {
    profileId: 'word-mac-16.111.2-d1',
    class: 'HISTORICAL_BUILD_BOUND',
    evidenceHeads: [{ path: 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_RECEIPT.json' }],
  };
  const claim = baseClaim({
    claimId: 'claim-current-compat-on-historical',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceScope: 'CURRENT_BUILD_COMPATIBILITY',
    evidenceBinding: { profileId: 'word-mac-16.111.2-d1' },
  });
  const result = module.evaluateClaimEvidenceBinding({ claim, profile: historical });
  assert.equal(result.ok, false, 'current-compat claim on historical evidence must fail');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);
});

// S02: CURRENT_BUILD_COMPATIBILITY on a COMPETING current profile with heads passes.
test('RELEASE01-S02-current-compat-on-competing-current-ok', async () => {
  const module = await loadModule();
  const current = {
    profileId: 'word-mac-16.111.3-26080215',
    class: 'COMPETING_NOT_SATURATED',
    evidenceHeads: [{ path: 'docs/OPS/RTK/SOME_FUTURE_HEAD.json' }],
  };
  const claim = baseClaim({
    claimId: 'claim-current-compat-on-current',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceScope: 'CURRENT_BUILD_COMPATIBILITY',
    evidenceBinding: { profileId: 'word-mac-16.111.3-26080215' },
  });
  const result = module.evaluateClaimEvidenceBinding({ claim, profile: current });
  assert.equal(result.ok, true, `current-compat claim on a proven current profile must pass: ${JSON.stringify(result.reasons)}`);
});

// S03: BUILD_INDEPENDENT_PRODUCT_FUNCTION on a HISTORICAL profile with heads
// stays valid (the product function does not disappear when Word moves builds).
test('RELEASE01-S03-build-independent-on-historical-ok', async () => {
  const module = await loadModule();
  const historical = {
    profileId: 'word-mac-16.111.2-d1',
    class: 'HISTORICAL_BUILD_BOUND',
    evidenceHeads: [{ path: 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE40_RECEIPT.json' }],
  };
  const claim = baseClaim({
    claimId: 'claim-docx-export-minimal',
    claimClass: 'USER_FACING_BOUNDED_SUPPORTED',
    evidenceScope: 'BUILD_INDEPENDENT_PRODUCT_FUNCTION',
    evidenceBinding: { profileId: 'word-mac-16.111.2-d1' },
  });
  const result = module.evaluateClaimEvidenceBinding({ claim, profile: historical });
  assert.equal(result.ok, true, `build-independent claim on historical evidence must pass: ${JSON.stringify(result.reasons)}`);
});

// S04: a claim without evidenceScope fails closed.
test('RELEASE01-S04-missing-evidence-scope-blocked', async () => {
  const module = await loadModule();
  const profile = {
    profileId: 'word-mac-16.111.2-d1',
    class: 'HISTORICAL_BUILD_BOUND',
    evidenceHeads: [{ path: 'x' }],
  };
  const claim = baseClaim({ claimId: 'claim-no-scope' });
  delete claim.evidenceScope;
  const result = module.evaluateClaimEvidenceBinding({ claim, profile });
  assert.equal(result.ok, false, 'missing evidenceScope must fail closed');
  assert.equal(result.code, RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE);
});

// S05: the strict roll-up reads the current pointer from the context.
test('RELEASE01-S05-rollup-pointer-driven', async () => {
  const module = await loadModule();

  // Missing pointer -> CONTEXT_INCOMPLETE.
  const noPointer = hotfixCleanContext();
  delete noPointer.currentProfileId;
  const a = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context: noPointer });
  assert.equal(a.ok, false);
  assert.equal(a.code, HOTFIX_CODES.ROLLUP_CONTEXT_INCOMPLETE);

  // Unresolvable pointer -> REQUIRED_PROFILE_MISSING.
  const ghost = hotfixCleanContext();
  ghost.currentProfileId = 'word-mac-ghost';
  const b = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context: ghost });
  assert.equal(b.ok, false);
  assert.equal(b.code, HOTFIX_CODES.REQUIRED_PROFILE_MISSING);

  // Pointer at a DECLARED current build -> deterministic blockers name it.
  const migrated = hotfixCleanContext();
  migrated.currentProfileId = 'word-mac-16.111.3-26080215';
  migrated.wordProfiles.push({ profileId: 'word-mac-16.111.3-26080215', class: 'DECLARED', evidenceHeads: [] });
  const c = module.evaluateTerminalRollupStrict({ registry: hotfixRecorded('WORD_TERMINAL_PASS_ACHIEVED', []), context: migrated });
  assert.equal(c.ok, false);
  assert.equal(c.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(c.blockers.includes('WORD_PROFILE_DECLARED:word-mac-16.111.3-26080215'));
  assert.ok(c.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.111.3-26080215'));
});

// S06: real integration — every registry claim carries evidenceScope; the
// current-compatibility claim is NOT_CLAIMED_BLOCKED against the registry's
// current Word profile; the strict roll-up over the real context agrees with
// the recorded blocker set.
test('RELEASE01-S06-real-registry-scope-and-pointer-integration', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  for (const claim of registry.claims) {
    assert.ok(claim.evidenceScope === 'BUILD_INDEPENDENT_PRODUCT_FUNCTION' || claim.evidenceScope === 'CURRENT_BUILD_COMPATIBILITY',
      `claim ${claim.claimId} must carry a known evidenceScope`);
  }
  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED', 'current Word compatibility is not claimed until the current profile earns proof');
  assert.equal(compat.evidenceScope, 'CURRENT_BUILD_COMPATIBILITY');

  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  assert.equal(compat.evidenceBinding.profileId, wordRegistry.currentProfileId);
  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `real migrated roll-up must agree: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes(`WORD_PROFILE_NOT_SATURATED:${wordRegistry.currentProfileId}`),
    `computed blockers must name the unsaturated current build: ${JSON.stringify(result.blockers)}`);
});

// S07: provider migration to Word 16.112 rewires only the current-build claim
// and roll-up pointer. The old 16.111.3 profile remains historical, its
// receipts stay non-transferable, and terminal PASS remains blocked until the
// new 16.112 profile earns every required physical rung and saturation.
test('RELEASE01-S07-real-registry-word-16-112-migration-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const prior = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.111.3-26080215');
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(prior, 'historical 16.111.3 profile must remain in the registry');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(wordRegistry.currentProfileId, 'word-mac-16.112-26081010');
  assert.equal(prior.class, 'HISTORICAL_BUILD_BOUND');
  assert.equal(prior.supersededBy, 'word-mac-16.112-26081010');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT);
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    '16.112 must carry its smoke, semantic differential, negative replay/crash, WAVE_10, WAVE_40, WAVE_100, WAVE_300 and WAVE_300_REPEAT receipts');
  const smokeHead = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_CARRIER_SURVIVAL_SMOKE_RECEIPT.json');
  const semanticHead = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_SEMANTIC_DIFFERENTIAL_RECEIPT.json');
  const negativeHead = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_NEGATIVE_REPLAY_CRASH_RECEIPT.json');
  const wave10Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE10_RECEIPT.json');
  const wave40Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE40_RECEIPT.json');
  const wave100Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE100_RECEIPT.json');
  const wave300Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_RECEIPT.json');
  for (const head of [smokeHead, semanticHead, negativeHead, wave10Head, wave40Head, wave100Head, wave300Head]) {
    assert.ok(head, 'expected 16.112 evidence head must be present');
    assert.equal(head.wordVersion, '16.112');
    assert.equal(head.wordBuild, '16.112.26081010');
    assert.equal(String(head.path).includes('16_111_3'), false,
      '16.112 evidence path must not reuse 16.111.3 receipt path');
    assert.equal(sha256File(path.join(REPO_ROOT, head.path)), head.sha256,
      `16.112 evidence sha256 must verify: ${head.path}`);
  }
  assert.deepEqual(smokeHead.rungs, ['CARRIER_SURVIVAL_SMOKE']);
  assert.deepEqual(semanticHead.rungs, ['SEMANTIC_DIFFERENTIAL_SUBSET']);
  assert.deepEqual(negativeHead.rungs, ['NEGATIVE_REPLAY_CRASH_SUBSET']);
  assert.deepEqual(wave10Head.rungs, ['WAVE_10']);
  assert.equal(wave10Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave10Head.casesTotal, 10);
  assert.equal(wave10Head.casesPassed, 10);
  assert.equal(wave10Head.denominator, 'executable-diversity-bound-wave10-only-not-saturation');
  assert.deepEqual(wave40Head.rungs, ['WAVE_40']);
  assert.equal(wave40Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave40Head.casesTotal, 40);
  assert.equal(wave40Head.casesPassed, 40);
  assert.equal(wave40Head.denominator, 'executable-diversity-bound-wave40-only-not-saturation');
  assert.deepEqual(wave100Head.rungs, ['WAVE_100']);
  assert.equal(wave100Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave100Head.casesTotal, 100);
  assert.equal(wave100Head.casesPassed, 100);
  assert.equal(wave100Head.denominator, 'executable-diversity-bound-wave100-only-not-saturation');
  assert.deepEqual(wave300Head.rungs, ['WAVE_300']);
  assert.equal(wave300Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave300Head.casesTotal, 300);
  assert.equal(wave300Head.casesPassed, 300);
  assert.equal(wave300Head.denominator, 'executable-diversity-bound-wave300-only-not-saturation');

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(compat.evidenceScope, 'CURRENT_BUILD_COMPATIBILITY');
  assert.equal(compat.evidenceBinding.profileId, 'word-mac-16.112-26081010');

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 blocked roll-up must match the recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.equal(result.blockers.includes('WORD_PROFILE_DECLARED:word-mac-16.112-26081010'), false,
    'the declared blocker is removed once 16.112 earns smoke evidence');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must name the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.equal(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.111.3-26080215'), false,
    'the terminal roll-up must not keep the old profile as the current blocker');
});

// S08: WAVE_40 evidence can narrow the current 16.112 profile's ladder gap,
// but it still does not make the current-build compatibility claim, saturation
// claim, or terminal Word PASS. The roll-up remains blocked by the unsaturated
// current profile plus the explicit NOT_CLAIMED_BLOCKED inventory.
test('RELEASE01-S08-real-registry-word-16-112-wave40-still-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT);
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    '16.112 must carry its smoke, semantic differential, negative replay/crash, WAVE_10, WAVE_40, WAVE_100, WAVE_300 and WAVE_300_REPEAT receipts');
  const wave40Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE40_RECEIPT.json');
  assert.ok(wave40Head, 'WAVE_40 evidence head must be present');
  assert.equal(wave40Head.wordVersion, '16.112');
  assert.equal(wave40Head.wordBuild, '16.112.26081010');
  assert.deepEqual(wave40Head.rungs, ['WAVE_40']);
  assert.equal(wave40Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave40Head.casesTotal, 40);
  assert.equal(wave40Head.casesPassed, 40);
  assert.equal(wave40Head.denominator, 'executable-diversity-bound-wave40-only-not-saturation');
  assert.equal(sha256File(path.join(REPO_ROOT, wave40Head.path)), wave40Head.sha256,
    `16.112 WAVE_40 evidence sha256 must verify: ${wave40Head.path}`);

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(compat.evidenceScope, 'CURRENT_BUILD_COMPATIBILITY');
  assert.equal(compat.evidenceBinding.profileId, 'word-mac-16.112-26081010');

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 WAVE_40 blocked roll-up must match recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must keep the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-current-word-compatibility'),
    'current Word compatibility claim remains explicitly NOT_CLAIMED_BLOCKED after WAVE_40');
  assert.equal(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.111.3-26080215'), false,
    'the roll-up must not fall back to historical 16.111.3 as current evidence');
});

// S09: WAVE_100 can narrow the current 16.112 profile's ladder gap again, but
// the terminal layer still fails closed. WAVE_100 is a rung, not saturation,
// not current-build compatibility, and not a terminal Word PASS.
test('RELEASE01-S09-real-registry-word-16-112-wave100-still-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT);
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    '16.112 must carry its smoke, semantic differential, negative replay/crash, WAVE_10, WAVE_40, WAVE_100, WAVE_300 and WAVE_300_REPEAT receipts');
  const wave100Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE100_RECEIPT.json');
  assert.ok(wave100Head, 'WAVE_100 evidence head must be present');
  assert.equal(wave100Head.wordVersion, '16.112');
  assert.equal(wave100Head.wordBuild, '16.112.26081010');
  assert.deepEqual(wave100Head.rungs, ['WAVE_100']);
  assert.equal(wave100Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave100Head.casesTotal, 100);
  assert.equal(wave100Head.casesPassed, 100);
  assert.equal(wave100Head.denominator, 'executable-diversity-bound-wave100-only-not-saturation');
  assert.equal(sha256File(path.join(REPO_ROOT, wave100Head.path)), wave100Head.sha256,
    `16.112 WAVE_100 evidence sha256 must verify: ${wave100Head.path}`);

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(compat.evidenceScope, 'CURRENT_BUILD_COMPATIBILITY');
  assert.equal(compat.evidenceBinding.profileId, 'word-mac-16.112-26081010');

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 WAVE_100 blocked roll-up must match recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must keep the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-current-word-compatibility'),
    'current Word compatibility claim remains explicitly NOT_CLAIMED_BLOCKED after WAVE_100');
  assert.equal(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.111.3-26080215'), false,
    'the roll-up must not fall back to historical 16.111.3 as current evidence');
});

// S10: WAVE_300 is a larger executable-diversity rung, not a terminal release
// proof. Current Word compatibility remains NOT_CLAIMED_BLOCKED until the
// separate saturation/repeat/terminal gates are actually proven.
test('RELEASE01-S10-real-registry-word-16-112-wave300-still-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT);
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    '16.112 must carry its smoke, semantic differential, negative replay/crash, WAVE_10, WAVE_40, WAVE_100, WAVE_300 and WAVE_300_REPEAT receipts');
  const wave300Head = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_RECEIPT.json');
  assert.ok(wave300Head, 'WAVE_300 evidence head must be present');
  assert.equal(wave300Head.wordVersion, '16.112');
  assert.equal(wave300Head.wordBuild, '16.112.26081010');
  assert.deepEqual(wave300Head.rungs, ['WAVE_300']);
  assert.equal(wave300Head.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(wave300Head.casesTotal, 300);
  assert.equal(wave300Head.casesPassed, 300);
  assert.equal(wave300Head.denominator, 'executable-diversity-bound-wave300-only-not-saturation');
  assert.equal(sha256File(path.join(REPO_ROOT, wave300Head.path)), wave300Head.sha256,
    `16.112 WAVE_300 evidence sha256 must verify: ${wave300Head.path}`);

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(compat.evidenceScope, 'CURRENT_BUILD_COMPATIBILITY');
  assert.equal(compat.evidenceBinding.profileId, 'word-mac-16.112-26081010');

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 WAVE_300 blocked roll-up must match recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must keep the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-current-word-compatibility'),
    'current Word compatibility claim remains explicitly NOT_CLAIMED_BLOCKED after WAVE_300');
  assert.equal(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.111.3-26080215'), false,
    'the roll-up must not fall back to historical 16.111.3 as current evidence');
});

// S11: WAVE_300_REPEAT is an independent repeat of the executable-diversity
// denominator, not a saturation or terminal release proof. Current Word
// compatibility remains NOT_CLAIMED_BLOCKED until a separate saturation and
// terminal claim contour closes on exact evidence.
test('RELEASE01-S11-real-registry-word-16-112-wave300-repeat-still-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT);
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    '16.112 must carry its eight ladder evidence heads through WAVE_300_REPEAT only');
  const repeatHead = current.evidenceHeads.find((h) =>
    h.path === 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_REPEAT_RECEIPT.json');
  assert.ok(repeatHead, 'WAVE_300_REPEAT evidence head must be present');
  assert.equal(repeatHead.wordVersion, '16.112');
  assert.equal(repeatHead.wordBuild, '16.112.26081010');
  assert.deepEqual(repeatHead.rungs, ['WAVE_300_REPEAT']);
  assert.equal(repeatHead.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.equal(repeatHead.casesTotal, 300);
  assert.equal(repeatHead.casesPassed, 300);
  assert.equal(repeatHead.denominator, 'executable-diversity-bound-wave300-repeat-only-not-saturation');
  assert.equal(sha256File(path.join(REPO_ROOT, repeatHead.path)), repeatHead.sha256,
    `16.112 WAVE_300_REPEAT evidence sha256 must verify: ${repeatHead.path}`);

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(compat.evidenceScope, 'CURRENT_BUILD_COMPATIBILITY');
  assert.equal(compat.evidenceBinding.profileId, 'word-mac-16.112-26081010');

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 WAVE_300_REPEAT blocked roll-up must match recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must keep the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-current-word-compatibility'),
    'current Word compatibility claim remains explicitly NOT_CLAIMED_BLOCKED after WAVE_300_REPEAT');
  assert.equal(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.111.3-26080215'), false,
    'the roll-up must not fall back to historical 16.111.3 as current evidence');
});

// S12: SATURATION_LIMITATION_AUDIT completes the limitation audit, not
// saturation. The audit must be visible in the current profile and the current
// compatibility note, but the profile class, explicit blocked claims and
// terminal roll-up must remain fail-closed.
test('RELEASE01-S12-real-registry-word-16-112-saturation-limitation-audit-still-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.equal(current.saturationStatus, 'COMPLETE_NOT_SATURATED');
  assert.notEqual(current.class, 'SATURATED', 'limitation audit must not promote the profile to SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT,
    'limitation audit is not an executable ladder rung');
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    'limitation audit must not inflate executable evidence heads');

  const auditHeads = current.auditEvidenceHeads || [];
  assert.equal(auditHeads.length, 1, 'current profile must bind one audit evidence head');
  const auditHead = auditHeads[0];
  assert.equal(auditHead.path, SATURATION_LIMITATION_AUDIT_RECEIPT_REF);
  assert.equal(auditHead.status, 'COMPLETE_NOT_SATURATED');
  assert.equal(auditHead.saturated, false);
  assert.deepEqual(auditHead.auditedRungs, ['WAVE_10', 'WAVE_40', 'WAVE_100', 'WAVE_300', 'WAVE_300_REPEAT']);
  assert.equal(sha256File(path.join(REPO_ROOT, auditHead.path)), auditHead.sha256,
    `audit evidence sha256 must verify: ${auditHead.path}`);

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  const saturated = registry.claims.find((c) => c.claimId === 'claim-word-saturated');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.ok(saturated, 'the word-saturated claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(saturated.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.match(compat.note, /SATURATION_LIMITATION_AUDIT COMPLETE_NOT_SATURATED/u,
    'current compatibility note must mention the completed non-saturation audit');
  assert.match(compat.note, /terminal PASS remain blocked/u);

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 limitation-audit blocked roll-up must match recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must keep the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-current-word-compatibility'),
    'current Word compatibility claim remains explicitly NOT_CLAIMED_BLOCKED after the limitation audit');
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-word-saturated'),
    'saturation claim remains explicitly NOT_CLAIMED_BLOCKED after the limitation audit');
});

// S13: TYPED_ADVERSE_SCHEDULES proves a separate stale/replay/tamper/crash
// negative schedule denominator. It does not promote Word saturation or current
// compatibility, and terminal blockers remain identical in kind.
test('RELEASE01-S13-real-registry-word-16-112-typed-adverse-schedules-still-fail-closed', async () => {
  const module = await loadModule();
  const registry = module.loadTerminalClaimRegistry(REGISTRY_PATH).registry;
  const wordRegistry = JSON.parse(fs.readFileSync(WORD_REGISTRY_PATH, 'utf8'));
  const current = wordRegistry.profiles.find((p) => p.profileId === 'word-mac-16.112-26081010');
  assert.ok(current, 'current 16.112 profile must exist');
  assert.equal(current.class, 'COMPETING_NOT_SATURATED');
  assert.equal(current.saturationStatus, 'COMPLETE_NOT_SATURATED');
  assert.deepEqual(current.ladder.completedRungs, CURRENT_16_112_COMPLETED_RUNGS_AFTER_WAVE300_REPEAT,
    'typed adverse schedules do not add a ninth executable edit-diversity rung');
  assert.equal((current.evidenceHeads || []).length, CURRENT_16_112_EVIDENCE_HEAD_COUNT_AFTER_WAVE300_REPEAT,
    'typed adverse schedules must not inflate executable evidence heads');

  const adverseHeads = current.adverseEvidenceHeads || [];
  assert.equal(adverseHeads.length, 1, 'current profile must bind one typed adverse schedule evidence head');
  const adverseHead = adverseHeads[0];
  assert.equal(adverseHead.path, TYPED_ADVERSE_SCHEDULES_RECEIPT_REF);
  assert.equal(adverseHead.status, 'PHYSICAL_TYPED_ADVERSE_SCHEDULES_PASS');
  assert.equal(adverseHead.claimScope, 'TYPED_ADVERSE_SCHEDULES_ONLY');
  assert.equal(adverseHead.casesTotal, 16);
  assert.equal(adverseHead.casesPassed, 16);
  assert.deepEqual(adverseHead.families, ['stale', 'replay', 'tamper', 'crash']);
  assert.equal(adverseHead.saturated, false);
  assert.equal(sha256File(path.join(REPO_ROOT, adverseHead.path)), adverseHead.sha256,
    `typed adverse schedule evidence sha256 must verify: ${adverseHead.path}`);

  const compat = registry.claims.find((c) => c.claimId === 'claim-current-word-compatibility');
  const saturated = registry.claims.find((c) => c.claimId === 'claim-word-saturated');
  assert.ok(compat, 'the current-word-compatibility claim must exist');
  assert.ok(saturated, 'the word-saturated claim must exist');
  assert.equal(compat.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.equal(saturated.claimClass, 'NOT_CLAIMED_BLOCKED');
  assert.match(compat.note, /TYPED_ADVERSE_SCHEDULES 16\/16/u,
    'current compatibility note must mention the typed adverse schedule denominator');
  assert.match(compat.note, /saturation and terminal PASS remain blocked/u);

  const googleRegistry = JSON.parse(fs.readFileSync(GOOGLE_REGISTRY_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json'), 'utf8'));
  const v4Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json'), 'utf8'));
  const vetoCounters = {};
  for (const key of VETO_KNOWN_KEYS) vetoCounters[key] = v4Profile.capabilityClaimPolicy[key];
  const result = module.evaluateTerminalRollupStrict({
    registry,
    context: {
      currentProfileId: wordRegistry.currentProfileId,
      wordProfiles: wordRegistry.profiles,
      googleProfiles: googleRegistry.profiles,
      terminalMatrix: matrix,
      vetoCounters,
      claims: registry.claims,
    },
  });
  assert.equal(result.ok, true, `16.112 typed-adverse blocked roll-up must match recorded registry: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.terminalClaim, 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED');
  assert.ok(result.blockers.includes('WORD_PROFILE_NOT_SATURATED:word-mac-16.112-26081010'),
    `computed blockers must keep the unsaturated 16.112 profile: ${JSON.stringify(result.blockers)}`);
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-current-word-compatibility'),
    'current Word compatibility claim remains explicitly NOT_CLAIMED_BLOCKED after typed adverse schedules');
  assert.ok(result.blockers.includes('BLOCKED_CLAIM:claim-word-saturated'),
    'saturation claim remains explicitly NOT_CLAIMED_BLOCKED after typed adverse schedules');
});

// Keep stableJson referenced for fixture symmetry with sibling contracts.
void stableJson;
