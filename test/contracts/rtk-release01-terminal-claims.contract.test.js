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
const WORD_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_BUILD_PROFILE_REGISTRY_V1.json');
const GOOGLE_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_BUILD_PROFILE_REGISTRY_V1.json');
const CAPABILITY_MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'CAPABILITY_MATRIX.json');

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
  const registry = loaded.registry || loaded.claims ? loaded.registry : null;
  assert.ok(registry, 'loaded registry must expose the registry object');

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

// Keep stableJson referenced for fixture symmetry with sibling contracts.
void stableJson;
