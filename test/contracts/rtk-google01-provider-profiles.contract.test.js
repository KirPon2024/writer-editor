'use strict';

/*
 * GOOGLE-01 — RED-FIRST contract tests (Pass 1).
 *
 * These tests freeze the TARGET Proof-Carrying Interop V2 §37 contract for the
 * Google Docs provider. Google Docs has TWO distinct editor modes that are TWO
 * separate provider profiles with separate evidence heads: OFFICE_MODE (DOCX
 * edited in Google Docs without conversion) and NATIVE_CONVERSION
 * (DOCX -> Google native -> DOCX). Green NEVER carries between modes or between
 * providers. Today both modes are prose stubs in
 * POST_D1_PORTABILITY_PROGRAM_V1.json (UNTESTED / UNTESTED_MANUAL_LOSSY_BY_DEFAULT);
 * the G00 matrix types them as separate UNTESTED cells
 * (G00_NO_PHYSICAL_OFFICE_MODE_ROUNDTRIP /
 * G00_NATIVE_CONVERSION_DEFAULTS_LOSSY_UNTIL_EVIDENCE); Google execution is
 * BLOCKED (CONTEXT.md). No physical Google evidence exists today.
 *
 * The LAB-01 word registry is Word-specific (mandatory wordVersion/wordBuild).
 * GOOGLE-01 introduces a PARALLEL registry with the identity axes
 * provider/editorMode/conversionBoundary:
 *   1. a machine-readable registry of google-docs provider profiles;
 *   2. a fail-closed evidence/profile join evaluator with typed codes;
 *   3. a per-profile migration-ladder admission gate;
 *   4. a registry-level reconciliation law (cross-mode + cross-profile).
 *
 * The contract module under test is scripts/ops/rtk-google-build-profiles-v1.mjs.
 * It does NOT exist on CURRENT, so every scenario below is RED on CURRENT with
 * ERR_MODULE_NOT_FOUND (or an equivalent module-load failure). That is the
 * intended Pass 1 RED state. Each scenario documents its TARGET expectation so
 * Pass 2 can flip it green by implementing the documented API.
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
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-google-build-profiles-v1.mjs');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'GOOGLE_BUILD_PROFILE_REGISTRY_V1.json');

// ---------------------------------------------------------------------------
// Shared helpers (mirror the rtk-lab01 / rtk-multi01 harness style).
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
// module must export via the GOOGLE01_CODES object. Pinning them by name keeps
// the contract stable across Pass 2.
// ---------------------------------------------------------------------------

const GOOGLE01_CODES = {
  REGISTRY_SCHEMA_INVALID: 'RTK_GOOGLE01_REGISTRY_SCHEMA_INVALID',
  PROFILE_DIGEST_MISMATCH: 'RTK_GOOGLE01_PROFILE_DIGEST_MISMATCH',
  PROFILE_UNKNOWN: 'RTK_GOOGLE01_PROFILE_UNKNOWN',
  PROVIDER_MISMATCH: 'RTK_GOOGLE01_PROVIDER_MISMATCH',
  MODE_IDENTITY_MISSING: 'RTK_GOOGLE01_MODE_IDENTITY_MISSING',
  CROSS_MODE_EVIDENCE: 'RTK_GOOGLE01_CROSS_MODE_EVIDENCE',
  CROSS_PROFILE_INHERITANCE: 'RTK_GOOGLE01_CROSS_PROFILE_INHERITANCE',
  NOT_PROVEN_CLAIM: 'RTK_GOOGLE01_NOT_PROVEN_CLAIM',
  HISTORICAL_PROFILE_MUTATION: 'RTK_GOOGLE01_HISTORICAL_PROFILE_MUTATION',
  EVIDENCE_STALE: 'RTK_GOOGLE01_EVIDENCE_STALE',
  LADDER_BYPASS: 'RTK_GOOGLE01_LADDER_BYPASS',
  LADDER_RUNG_UNKNOWN: 'RTK_GOOGLE01_LADDER_RUNG_UNKNOWN',
  LADDER_PRESEEDED: 'RTK_GOOGLE01_LADDER_PRESEEDED',
  EVIDENCE_HEAD_SHARED: 'RTK_GOOGLE01_EVIDENCE_HEAD_SHARED',
  RUNG_WITHOUT_EVIDENCE: 'RTK_GOOGLE01_RUNG_WITHOUT_EVIDENCE',
  JOIN_OK: 'RTK_GOOGLE01_JOIN_OK',
  LADDER_ADMITTED: 'RTK_GOOGLE01_LADDER_ADMITTED',
  // GOOGLE-01 Pass 2 addition: a discovery artifact is program/discovery
  // evidence, not profile evidence. A profile whose evidenceHead.path collides
  // with a top-level discoveryHeads[].path is rejected on reconciliation.
  DISCOVERY_HEAD_AS_PROFILE_EVIDENCE: 'RTK_GOOGLE01_DISCOVERY_HEAD_AS_PROFILE_EVIDENCE',
};

// ---------------------------------------------------------------------------
// Fixtures. Profiles are built WITHOUT a profileDigest field; the digest is
// stamped in withDigest() via the TARGET computeProfileDigest from the module
// under test. On CURRENT (module absent) every fixture build fails at the
// dynamic import, which is the intended RED.
//
// The fixture shape mirrors the google-docs registry model:
//   { profileId, class, provider:'google-docs', editorMode ∈ GOOGLE_EDITOR_MODES,
//     conversionBoundary:'NONE'|'DOCX_TO_NATIVE_ROUNDTRIP', clientIdentity,
//     sessionClass:'NONE_BOUND', os?, locale?, evidenceHeads:[{path, sha256,
//     editorMode, sealedAtUtc?, rungs?}], freshnessPolicy:{maxEvidenceAgeDays},
//     ladder:{completedRungs}, nonClaims:[...], profileDigest }
//
// Evidence shape for join:
//   { provider, profileId?, editorMode, evidenceHeadPath? }
// ---------------------------------------------------------------------------

function baseProfile(overrides = {}) {
  return {
    profileId: overrides.profileId || 'google-docs-office-mode-post-d1-v1',
    class: overrides.class || 'DECLARED',
    provider: overrides.provider || 'google-docs',
    editorMode: overrides.editorMode || 'OFFICE_MODE',
    conversionBoundary: overrides.conversionBoundary || 'NONE',
    clientIdentity: overrides.clientIdentity || { channel: 'unknown', build: 'unproven' },
    sessionClass: overrides.sessionClass || 'NONE_BOUND',
    os: overrides.os || { platform: 'unproven' },
    locale: overrides.locale || 'unproven',
    evidenceHeads: overrides.evidenceHeads === undefined ? [] : overrides.evidenceHeads,
    freshnessPolicy: overrides.freshnessPolicy || { maxEvidenceAgeDays: 90 },
    ladder: overrides.ladder || { completedRungs: [] },
    nonClaims: overrides.nonClaims === undefined ? ['GOOGLE_DOCS_GREEN_NEVER_CARRIES_ACROSS_MODES_OR_PROVIDERS'] : overrides.nonClaims,
  };
}

async function withDigest(profile) {
  const module = await loadModule();
  const digest = module.computeProfileDigest(profile);
  return { ...profile, profileDigest: digest };
}

function stripDigest(profile) {
  const { profileDigest, ...rest } = profile;
  return rest;
}

function cloneRegistry(registry) {
  return JSON.parse(JSON.stringify(registry));
}

function firstCode(result) {
  if (!result) return undefined;
  if (Array.isArray(result.reasons) && result.reasons.length > 0) {
    return result.reasons[0].code || result.reasons[0];
  }
  return result.code;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// A valid two-DECLARED-profile fixture: office-mode (conversionBoundary NONE)
// and native-conversion (conversionBoundary DOCX_TO_NATIVE_ROUNDTRIP). Both
// start with empty evidenceHeads and empty ladders, mirroring the honest
// current UNTESTED state of Google Docs.
async function validTwoDeclaredRegistry() {
  const module = await loadModule();

  const officeMode = await withDigest(baseProfile({
    profileId: 'google-docs-office-mode-post-d1-v1',
    class: 'DECLARED',
    editorMode: 'OFFICE_MODE',
    conversionBoundary: 'NONE',
  }));

  const nativeConversion = await withDigest(baseProfile({
    profileId: 'google-docs-native-conversion-post-d1-v1',
    class: 'DECLARED',
    editorMode: 'NATIVE_CONVERSION',
    conversionBoundary: 'DOCX_TO_NATIVE_ROUNDTRIP',
  }));

  return {
    schemaVersion: module.GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'google-build-profile-registry-v1',
    profiles: [officeMode, nativeConversion],
  };
}

// A COMPETING_NOT_SATURATED native-conversion profile fixture used by the
// ladder and cross-mode scenarios (so the join does not trip the DECLARED /
// NOT_PROVEN class check before the targeted check fires).
async function competingNativeRegistry(overrides = {}) {
  const module = await loadModule();
  const profile = await withDigest(baseProfile({
    profileId: overrides.profileId || 'google-docs-native-conversion-competing-v1',
    class: 'COMPETING_NOT_SATURATED',
    editorMode: 'NATIVE_CONVERSION',
    conversionBoundary: 'DOCX_TO_NATIVE_ROUNDTRIP',
    evidenceHeads: overrides.evidenceHeads === undefined ? [] : overrides.evidenceHeads,
    ladder: overrides.ladder || { completedRungs: [] },
  }));
  return {
    schemaVersion: module.GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'google-build-profile-registry-v1',
    profiles: [profile],
  };
}

// ===========================================================================
// GOOGLE01-01 — valid load of a two-DECLARED-profile fixture
// ===========================================================================

test('GOOGLE01-01-loadGoogleBuildProfileRegistry-accepts-valid-fixture', async () => {
  const module = await loadModule();
  const registry = await validTwoDeclaredRegistry();

  // TARGET: the valid fixture loads as ok=true and returns both profiles.
  // RED REASON: the module does not exist yet.
  const result = module.loadGoogleBuildProfileRegistry(registry);
  assert.equal(result.ok, true, 'valid google registry must load');
  assert.ok(Array.isArray(result.profiles) || Array.isArray(result.registry && result.registry.profiles),
    'loaded registry must expose profiles');
  const profiles = Array.isArray(result.profiles) ? result.profiles : result.registry.profiles;
  assert.equal(profiles.length, 2, 'both google profiles must survive loading');

  // conversionBoundary distinguishes the two modes.
  const office = profiles.find((p) => p.editorMode === 'OFFICE_MODE');
  const native = profiles.find((p) => p.editorMode === 'NATIVE_CONVERSION');
  assert.equal(office.conversionBoundary, 'NONE', 'office-mode conversionBoundary must be NONE');
  assert.equal(native.conversionBoundary, 'DOCX_TO_NATIVE_ROUNDTRIP', 'native-conversion conversionBoundary must be DOCX_TO_NATIVE_ROUNDTRIP');

  // Digests must recompute to the recorded profileDigest via computeProfileDigest.
  for (const profile of profiles) {
    const recomputed = module.computeProfileDigest(stripDigest(profile));
    assert.equal(recomputed, profile.profileDigest, 'recorded profileDigest must recompute');
  }
});

// ===========================================================================
// GOOGLE01-02 — schema invalid (missing field / unknown class / unknown editorMode / unknown rung)
// ===========================================================================

test('GOOGLE01-02-schema-invalid-typed-code', async () => {
  const module = await loadModule();

  // Missing schemaVersion.
  const noSchema = { registryId: 'google-build-profile-registry-v1', profiles: [] };
  const noSchemaResult = module.loadGoogleBuildProfileRegistry(noSchema);
  assert.equal(noSchemaResult.ok, false, 'missing schemaVersion must fail');
  assert.equal(firstCode(noSchemaResult), GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID);

  const goodRegistry = await validTwoDeclaredRegistry();

  // Unknown class.
  const unknownClass = cloneRegistry(goodRegistry);
  unknownClass.profiles[0].class = 'MYSTERY_CLASS';
  const unknownClassResult = module.loadGoogleBuildProfileRegistry(unknownClass);
  assert.equal(unknownClassResult.ok, false, 'unknown class must fail');
  assert.equal(firstCode(unknownClassResult), GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID);

  // Unknown editorMode.
  const unknownMode = cloneRegistry(goodRegistry);
  unknownMode.profiles[0].editorMode = 'QUANTUM_MODE';
  const unknownModeResult = module.loadGoogleBuildProfileRegistry(unknownMode);
  assert.equal(unknownModeResult.ok, false, 'unknown editorMode must fail');
  assert.equal(firstCode(unknownModeResult), GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID);

  // Unknown rung in completedRungs.
  const unknownRung = cloneRegistry(goodRegistry);
  unknownRung.profiles[0].ladder.completedRungs.push('WAVE_9999_DOES_NOT_EXIST');
  const unknownRungResult = module.loadGoogleBuildProfileRegistry(unknownRung);
  assert.equal(unknownRungResult.ok, false, 'unknown rung must fail');
  assert.equal(firstCode(unknownRungResult), GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID);
});

// ===========================================================================
// GOOGLE01-03 — digest tamper (editorMode changed after digest computed)
// ===========================================================================

test('GOOGLE01-03-profile-digest-mismatch', async () => {
  const module = await loadModule();
  const registry = await validTwoDeclaredRegistry();

  // Tamper: change editorMode AFTER the digest was recorded.
  const tampered = cloneRegistry(registry);
  tampered.profiles[0].editorMode = 'NATIVE_CONVERSION';

  const result = module.loadGoogleBuildProfileRegistry(tampered);
  assert.equal(result.ok, false, 'tampered profileDigest must fail');
  assert.equal(firstCode(result), GOOGLE01_CODES.PROFILE_DIGEST_MISMATCH);
});

// ===========================================================================
// GOOGLE01-04 — cross-mode evidence (evidence editorMode != profile editorMode)
// ===========================================================================

test('GOOGLE01-04-cross-mode-evidence-blocked', async () => {
  const module = await loadModule();
  const registry = await competingNativeRegistry();

  // Evidence claims OFFICE_MODE against a NATIVE_CONVERSION profile. The class
  // is COMPETING_NOT_SATURATED so the join reaches the mode comparison rather
  // than failing earlier on the DECLARED / NOT_PROVEN class gate.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'google-docs-native-conversion-competing-v1',
    evidence: {
      provider: 'google-docs',
      editorMode: 'OFFICE_MODE',
    },
  });

  assert.equal(result.ok, false, 'cross-mode evidence must be blocked');
  assert.equal(result.code, GOOGLE01_CODES.CROSS_MODE_EVIDENCE);
});

// ===========================================================================
// GOOGLE01-05 — cross-profile inheritance (evidence.profileId != requested profileId)
// ===========================================================================

test('GOOGLE01-05-cross-profile-inheritance-blocked', async () => {
  const module = await loadModule();
  const registry = await competingNativeRegistry();

  // Evidence carries a profileId pointing at the office-mode profile while the
  // join targets the native-conversion profile. editorMode is NATIVE_CONVERSION
  // (matches the target), so without the inheritance check the join would pass
  // the mode gate. Inheritance is caught BEFORE mode-matching.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'google-docs-native-conversion-competing-v1',
    evidence: {
      provider: 'google-docs',
      profileId: 'google-docs-office-mode-post-d1-v1',
      editorMode: 'NATIVE_CONVERSION',
    },
  });

  assert.equal(result.ok, false, 'cross-profile inheritance must be blocked');
  assert.equal(result.code, GOOGLE01_CODES.CROSS_PROFILE_INHERITANCE);
});

// ===========================================================================
// GOOGLE01-06 — unknown profile
// ===========================================================================

test('GOOGLE01-06-unknown-profile-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoDeclaredRegistry();

  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'google-docs-quantum-mode-does-not-exist',
    evidence: {
      provider: 'google-docs',
      editorMode: 'OFFICE_MODE',
    },
  });

  assert.equal(result.ok, false, 'unknown profile must be blocked');
  assert.equal(result.code, GOOGLE01_CODES.PROFILE_UNKNOWN);
});

// ===========================================================================
// GOOGLE01-07 — provider mismatch (evidence.provider != 'google-docs')
// ===========================================================================

test('GOOGLE01-07-provider-mismatch-blocked', async () => {
  const module = await loadModule();
  const registry = await competingNativeRegistry();

  // Evidence carries provider 'word' against a google-docs profile. Provider
  // mismatch is caught before the mode identity check.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'google-docs-native-conversion-competing-v1',
    evidence: {
      provider: 'word',
      editorMode: 'NATIVE_CONVERSION',
    },
  });

  assert.equal(result.ok, false, 'provider mismatch must be blocked');
  assert.equal(result.code, GOOGLE01_CODES.PROVIDER_MISMATCH);
});

// ===========================================================================
// GOOGLE01-08 — mode identity missing (evidence without editorMode)
// ===========================================================================

test('GOOGLE01-08-mode-identity-missing-blocked', async () => {
  const module = await loadModule();
  const registry = await competingNativeRegistry();

  // Evidence with provider google-docs but NO editorMode must fail closed:
  // identity is validated before any mode comparison.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'google-docs-native-conversion-competing-v1',
    evidence: {
      provider: 'google-docs',
    },
  });

  assert.equal(result.ok, false, 'missing editorMode identity must be blocked');
  assert.equal(result.code, GOOGLE01_CODES.MODE_IDENTITY_MISSING);
});

// ===========================================================================
// GOOGLE01-09 — NOT_PROVEN_CLAIM (mode-matching evidence against a DECLARED profile)
// ===========================================================================

test('GOOGLE01-09-not-proven-claim-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoDeclaredRegistry();

  // A mode-matching evidence join against the DECLARED office-mode profile.
  // DECLARED never accepts green even of its own mode: this is the honest
  // current UNTESTED state of Google Docs.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'google-docs-office-mode-post-d1-v1',
    evidence: {
      provider: 'google-docs',
      editorMode: 'OFFICE_MODE',
    },
  });

  assert.equal(result.ok, false, 'DECLARED profile must not accept evidence');
  assert.equal(result.code, GOOGLE01_CODES.NOT_PROVEN_CLAIM);
});

// ===========================================================================
// GOOGLE01-10 — ladder bypass then ordered admission then bypass
// ===========================================================================

test('GOOGLE01-10-ladder-bypass-and-ordered-admission', async () => {
  const module = await loadModule();

  // Empty ladder requests WAVE_40 -> bypass (skips SMOKE/SEMANTIC/NEGATIVE/WAVE_10).
  const emptyRegistry = await competingNativeRegistry({
    profileId: 'google-docs-native-conversion-ladder-v1',
    ladder: { completedRungs: [] },
  });

  const bypass = module.evaluateLadderAdmission({
    registry: emptyRegistry,
    profileId: 'google-docs-native-conversion-ladder-v1',
    rung: 'WAVE_40',
  });
  assert.equal(bypass.ok, false, 'ladder bypass must be blocked');
  assert.equal(bypass.code, GOOGLE01_CODES.LADDER_BYPASS);

  // Completed SMOKE/SEMANTIC/NEGATIVE/WAVE_10: WAVE_40 is the next rung (admit),
  // and WAVE_100 is two rungs ahead (bypass).
  const orderedRegistry = await competingNativeRegistry({
    profileId: 'google-docs-native-conversion-ladder-v2',
    ladder: { completedRungs: ['CARRIER_SURVIVAL_SMOKE', 'SEMANTIC_DIFFERENTIAL_SUBSET', 'NEGATIVE_REPLAY_CRASH_SUBSET', 'WAVE_10'] },
  });

  const admit = module.evaluateLadderAdmission({
    registry: orderedRegistry,
    profileId: 'google-docs-native-conversion-ladder-v2',
    rung: 'WAVE_40',
  });
  assert.equal(admit.ok, true, 'ordered WAVE_40 admission must succeed');
  assert.equal(admit.code, GOOGLE01_CODES.LADDER_ADMITTED);

  const skip = module.evaluateLadderAdmission({
    registry: orderedRegistry,
    profileId: 'google-docs-native-conversion-ladder-v2',
    rung: 'WAVE_100',
  });
  assert.equal(skip.ok, false, 'skipping WAVE_40 to WAVE_100 must be blocked');
  assert.equal(skip.code, GOOGLE01_CODES.LADDER_BYPASS);
});

// ===========================================================================
// GOOGLE01-11 — ladder unknown rung
// ===========================================================================

test('GOOGLE01-11-ladder-unknown-rung-blocked', async () => {
  const module = await loadModule();
  const registry = await competingNativeRegistry({
    profileId: 'google-docs-native-conversion-ladder-v3',
    ladder: { completedRungs: [] },
  });

  const result = module.evaluateLadderAdmission({
    registry,
    profileId: 'google-docs-native-conversion-ladder-v3',
    rung: 'WAVE_9000_NOT_A_RUNG',
  });

  assert.equal(result.ok, false, 'unknown rung must be blocked');
  assert.equal(result.code, GOOGLE01_CODES.LADDER_RUNG_UNKNOWN);
});

// ===========================================================================
// GOOGLE01-12 — preseeded DECLARED on reconciliation
// ===========================================================================

test('GOOGLE01-12-preseeded-declared-blocked-on-reconciliation', async () => {
  const module = await loadModule();

  // A DECLARED profile must start with an empty ladder and no evidence heads.
  // A preseeded completedRung (or one head) is an inconsistent registry state.
  const profile = await withDigest(baseProfile({
    profileId: 'google-docs-office-mode-preseeded-v1',
    class: 'DECLARED',
    editorMode: 'OFFICE_MODE',
    conversionBoundary: 'NONE',
    ladder: { completedRungs: ['CARRIER_SURVIVAL_SMOKE'] },
  }));

  const registry = {
    schemaVersion: module.GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'google-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'preseeded DECLARED profile must fail reconciliation');
  assert.equal(firstCode(result), GOOGLE01_CODES.LADDER_PRESEEDED);
});

// ===========================================================================
// GOOGLE01-13 — shared evidence head across two profiles
// ===========================================================================

test('GOOGLE01-13-shared-evidence-head-blocked-on-reconciliation', async () => {
  const module = await loadModule();

  // The same evidence head path referenced by two profiles (even of the same
  // mode) must fail reconciliation: one physical evidence head cannot prove
  // two separate identity-bound profiles.
  const sharedPath = 'docs/OPS/RTK/GOOGLE_SHARED_EVIDENCE_HEAD.json';
  const sharedHead = {
    path: sharedPath,
    sha256: sha256Text('evidence-head:google-shared'),
    editorMode: 'OFFICE_MODE',
    sealedAtUtc: '2026-08-08T00:00:00.000Z',
  };

  const profileA = await withDigest(baseProfile({
    profileId: 'google-docs-office-mode-shared-a',
    class: 'COMPETING_NOT_SATURATED',
    editorMode: 'OFFICE_MODE',
    conversionBoundary: 'NONE',
    evidenceHeads: [sharedHead],
    ladder: { completedRungs: [] },
  }));
  const profileB = await withDigest(baseProfile({
    profileId: 'google-docs-office-mode-shared-b',
    class: 'COMPETING_NOT_SATURATED',
    editorMode: 'OFFICE_MODE',
    conversionBoundary: 'NONE',
    evidenceHeads: [sharedHead],
    ladder: { completedRungs: [] },
  }));

  const registry = {
    schemaVersion: module.GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'google-build-profile-registry-v1',
    profiles: [profileA, profileB],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'shared evidence head must fail reconciliation');
  assert.equal(firstCode(result), GOOGLE01_CODES.EVIDENCE_HEAD_SHARED);
});

// ===========================================================================
// GOOGLE01-14 — integration against the REAL registry on disk (Pass 2 artifact)
// ===========================================================================

test('GOOGLE01-14-integration-real-registry-discovery-heads-and-declared-state', async () => {
  const module = await loadModule();

  // TARGET: the real docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json (created
  // in Pass 2) must exist, load as ok=true, reconcile ok, expose BOTH profiles
  // as DECLARED with empty evidenceHeads and empty completedRungs, and use the
  // exact profileIds that match the POST_D1 stubs. The three G00 discovery
  // heads must exist on disk with matching sha256. A mode-matching evidence
  // join to the office-mode profile must stay NOT_PROVEN_CLAIM (DECLARED never
  // accepts green) — the honest current BLOCKED state.
  //
  // RED REASON: the registry file does not exist on CURRENT (Pass 1), so this
  // scenario fails at fs.existsSync. That is the intended integration RED state
  // until Pass 2 ships the registry.
  assert.equal(fs.existsSync(REGISTRY_PATH), true, 'GOOGLE_BUILD_PROFILE_REGISTRY_V1.json must exist in Pass 2');

  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const loaded = module.loadGoogleBuildProfileRegistry(registryJson);
  assert.equal(loaded.ok, true, 'real google registry must load');

  const reconciliation = module.evaluateRegistryReconciliation(loaded.registry || registryJson);
  assert.equal(reconciliation.ok, true, 'real google registry must reconcile');

  const profiles = Array.isArray(loaded.profiles) ? loaded.profiles : loaded.registry.profiles;
  assert.equal(profiles.length, 2, 'real google registry must have exactly two profiles');

  const office = profiles.find((p) => p.profileId === 'google-docs-office-mode-post-d1-v1');
  const native = profiles.find((p) => p.profileId === 'google-docs-native-conversion-post-d1-v1');
  assert.ok(office, 'office-mode profileId must match the POST_D1 stub exactly');
  assert.ok(native, 'native-conversion profileId must match the POST_D1 stub exactly');
  assert.equal(office.class, 'DECLARED', 'office-mode must be DECLARED in Pass 2');
  assert.equal(native.class, 'DECLARED', 'native-conversion must be DECLARED in Pass 2');
  assert.equal((office.evidenceHeads || []).length, 0, 'office-mode must start with no evidence heads');
  assert.equal((native.evidenceHeads || []).length, 0, 'native-conversion must start with no evidence heads');
  assert.equal((office.ladder && office.ladder.completedRungs || []).length, 0, 'office-mode must start with empty ladder');
  assert.equal((native.ladder && native.ladder.completedRungs || []).length, 0, 'native-conversion must start with empty ladder');

  // The three G00 discovery heads exist on disk and their sha256 matches.
  const discoveryHeads = [
    { rel: 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json' },
    { rel: 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json' },
    { rel: 'docs/OPS/STATUS/REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json' },
  ];
  for (const head of discoveryHeads) {
    const abs = path.join(REPO_ROOT, head.rel);
    assert.equal(fs.existsSync(abs), true, `discovery head must exist: ${head.rel}`);
    head.observed = sha256File(abs);
  }

  // DECLARED never accepts green: the honest current BLOCKED state.
  const join = module.evaluateEvidenceProfileJoin({
    registry: loaded.registry || registryJson,
    profileId: 'google-docs-office-mode-post-d1-v1',
    evidence: {
      provider: 'google-docs',
      editorMode: 'OFFICE_MODE',
    },
  });
  assert.equal(join.ok, false, 'office-mode DECLARED must not accept green evidence');
  assert.equal(join.code, GOOGLE01_CODES.NOT_PROVEN_CLAIM);
});

// ===========================================================================
// GOOGLE01-15 — discovery-head drift against the REAL registry on disk
//
// GOOGLE01-14 only computes the observed sha256 of each discovery head and
// asserts the files exist; it never COMPARES the observed hash to the hash
// recorded in the registry. This scenario closes that hole: every discovery
// head recorded in the real registry must (a) exist on disk and (b) have a
// sha256 that exactly matches the recorded value. Drift (file changed after
// the registry was pinned) must fail closed.
// ===========================================================================

test('GOOGLE01-15-integration-real-registry-discovery-head-sha256-drift', async () => {
  const module = await loadModule();

  assert.equal(fs.existsSync(REGISTRY_PATH), true, 'GOOGLE_BUILD_PROFILE_REGISTRY_V1.json must exist in Pass 2');
  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

  const discoveryHeads = Array.isArray(registryJson.discoveryHeads) ? registryJson.discoveryHeads : [];
  assert.ok(discoveryHeads.length >= 3, 'real google registry must pin at least the three G00 discovery heads');

  for (const head of discoveryHeads) {
    assert.ok(head && isNonEmptyString(head.path), 'each discovery head must have a path');
    assert.ok(isNonEmptyString(head.sha256), `discovery head ${head && head.path} must record a sha256`);
    const abs = path.join(REPO_ROOT, head.path);
    assert.equal(fs.existsSync(abs), true, `discovery head must exist on disk: ${head.path}`);
    const observed = sha256File(abs);
    assert.equal(
      observed,
      head.sha256,
      `discovery head ${head.path} sha256 drift: observed ${observed} != recorded ${head.sha256}`,
    );
  }
});

// ===========================================================================
// GOOGLE01-16 — DISCOVERY_HEAD_AS_PROFILE_EVIDENCE (anti-inheritance law)
//
// A profile that references a top-level discoveryHeads[].path as one of its own
// evidenceHeads is rejected on reconciliation. A discovery artifact is
// program/discovery evidence, NOT profile evidence; letting a profile inherit it
// would let one artifact silently prove an identity-bound profile (inheritance).
// The fixture uses a COMPETING_NOT_SATURATED profile so the join/reconciliation
// path is not short-circuited by the DECLARED / NOT_PROVEN preseed gate.
// ===========================================================================

test('GOOGLE01-16-discovery-head-as-profile-evidence-blocked-on-reconciliation', async () => {
  const module = await loadModule();

  // A top-level discovery head (a real G00 artifact path).
  const discoveryPath = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
  const discoveryHead = {
    path: discoveryPath,
    sha256: sha256Text('discovery-head:google-g00-matrix'),
    note: 'discovery artifact, not profile evidence',
  };

  // A COMPETING profile that tries to reuse the discovery head as its own
  // evidence head (the inheritance attempt).
  const profile = await withDigest(baseProfile({
    profileId: 'google-docs-office-mode-discovery-inheritance-v1',
    class: 'COMPETING_NOT_SATURATED',
    editorMode: 'OFFICE_MODE',
    conversionBoundary: 'NONE',
    evidenceHeads: [
      {
        path: discoveryPath,
        sha256: sha256Text('evidence-head:google-inheritance-attempt'),
        editorMode: 'OFFICE_MODE',
        sealedAtUtc: '2026-08-08T00:00:00.000Z',
      },
    ],
    ladder: { completedRungs: [] },
  }));

  const registry = {
    schemaVersion: module.GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'google-build-profile-registry-v1',
    discoveryHeads: [discoveryHead],
    profiles: [profile],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'a profile reusing a discovery head as evidence must fail reconciliation');
  const codes = (result.reasons || []).map((r) => r.code);
  assert.ok(
    codes.includes(GOOGLE01_CODES.DISCOVERY_HEAD_AS_PROFILE_EVIDENCE),
    `reasons must include ${GOOGLE01_CODES.DISCOVERY_HEAD_AS_PROFILE_EVIDENCE}, got ${JSON.stringify(codes)}`,
  );
});

// ===========================================================================
// GOOGLE01-17 — unknown conversionBoundary at load time
//
// The conversionBoundary vocabulary is closed: NONE and
// DOCX_TO_NATIVE_ROUNDTRIP. A profile carrying any other boundary value (here
// 'QUANTUM_BOUNDARY') must be rejected by the loader as REGISTRY_SCHEMA_INVALID.
// The digest is recomputed over the tampered profile so this scenario isolates
// the schema check from the digest check.
// ===========================================================================

test('GOOGLE01-17-unknown-conversion-boundary-blocked-at-load', async () => {
  const module = await loadModule();

  const profile = await withDigest(baseProfile({
    profileId: 'google-docs-office-mode-quantum-boundary-v1',
    class: 'DECLARED',
    editorMode: 'OFFICE_MODE',
    conversionBoundary: 'QUANTUM_BOUNDARY',
  }));

  const registry = {
    schemaVersion: module.GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'google-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.loadGoogleBuildProfileRegistry(registry);
  assert.equal(result.ok, false, 'unknown conversionBoundary must fail at load');
  assert.equal(firstCode(result), GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID);
});
