'use strict';

/*
 * LAB-01 — RED-FIRST contract tests (Pass 1).
 *
 * These tests freeze the TARGET Proof-Carrying Interop V2 §36 contract:
 * provider profiles bind producer build, OS, locale, save/compatibility mode,
 * controller version and corpus digest; NO GREEN CARRIES BETWEEN PROFILES
 * AUTOMATICALLY. Today the repo has only runtime CLI build gates
 * (verifyOrchestratedCampaignBinding in rtk-word-c5v2-physical-canary.mjs and
 * runOrchestratorPreflight in rtk-word-c5v2-terminal-orchestrator.mjs) and
 * prose-level no-inheritance in POST_D1_PORTABILITY_PROGRAM_V1.json. No
 * evaluator joins receipt build against a profile build today.
 *
 * LAB-01 introduces three things (Pass 2):
 *   1. a machine-readable registry of build-bound profiles;
 *   2. a fail-closed evidence/profile join evaluator with typed codes;
 *   3. a per-profile migration-ladder admission gate.
 *
 * The contract module under test is scripts/ops/rtk-word-build-profiles-v1.mjs.
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
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-build-profiles-v1.mjs');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_BUILD_PROFILE_REGISTRY_V1.json');

// ---------------------------------------------------------------------------
// Shared helpers (mirror the rtk-multi01 / rtk-round01 harness style).
// ---------------------------------------------------------------------------

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
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
};

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
// module must export via the LAB01_CODES object. Pinning them by name keeps the
// contract stable across Pass 2.
// ---------------------------------------------------------------------------

const LAB01_CODES = {
  REGISTRY_SCHEMA_INVALID: 'RTK_LAB01_REGISTRY_SCHEMA_INVALID',
  PROFILE_DIGEST_MISMATCH: 'RTK_LAB01_PROFILE_DIGEST_MISMATCH',
  PROFILE_UNKNOWN: 'RTK_LAB01_PROFILE_UNKNOWN',
  CROSS_BUILD_EVIDENCE: 'RTK_LAB01_CROSS_BUILD_EVIDENCE',
  CROSS_PROFILE_INHERITANCE: 'RTK_LAB01_CROSS_PROFILE_INHERITANCE',
  NOT_PROVEN_CLAIM: 'RTK_LAB01_NOT_PROVEN_CLAIM',
  HISTORICAL_PROFILE_MUTATION: 'RTK_LAB01_HISTORICAL_PROFILE_MUTATION',
  LADDER_BYPASS: 'RTK_LAB01_LADDER_BYPASS',
  LADDER_RUNG_UNKNOWN: 'RTK_LAB01_LADDER_RUNG_UNKNOWN',
  LADDER_PRESEEDED: 'RTK_LAB01_LADDER_PRESEEDED',
  EVIDENCE_HEAD_SHARED: 'RTK_LAB01_EVIDENCE_HEAD_SHARED',
  EVIDENCE_HEAD_DRIFT: 'RTK_LAB01_EVIDENCE_HEAD_DRIFT',
  // Pass 2 additions. The freshness and rung-without-evidence codes are the
  // two new typed reasons introduced alongside the registry artifact.
  EVIDENCE_STALE: 'RTK_LAB01_EVIDENCE_STALE',
  RUNG_WITHOUT_EVIDENCE: 'RTK_LAB01_RUNG_WITHOUT_EVIDENCE',
  // Pass 2b addition: identity-before-comparison fail-closed code.
  BUILD_IDENTITY_MISSING: 'RTK_LAB01_BUILD_IDENTITY_MISSING',
};

// ---------------------------------------------------------------------------
// Fixtures. Profiles are built WITHOUT a profileDigest field; the digest is
// stamped in buildProfileWithDigest() via the TARGET computeProfileDigest from
// the module under test. On CURRENT (module absent) every fixture build fails
// at the dynamic import, which is the intended RED.
//
// The fixture shape mirrors the registry model documented in the contract:
//   { schemaVersion, registryId, profiles:[ { profileId, class, platform,
//     wordVersion, wordBuild, os, locale?, editorMode?, saveMode?, returnMode?,
//     controllerVersion?, corpusDigest?, evidenceHeads:[{path, sha256,
//     wordVersion, wordBuild, sealedAtUtc?}], freshnessPolicy:{maxEvidenceAgeDays?},
//     ladder:{completedRungs:[...]}, profileDigest } ] }
// ---------------------------------------------------------------------------

function baseProfile(overrides = {}) {
  return {
    profileId: overrides.profileId || 'word-mac-16.111.2-d1',
    class: overrides.class || 'COMPETING_NOT_SATURATED',
    platform: overrides.platform || 'word-mac',
    wordVersion: overrides.wordVersion || '16.111.2',
    wordBuild: overrides.wordBuild || '16.111.26072617',
    os: overrides.os || { macosVersion: '15.6', macosBuild: '24G84' },
    locale: overrides.locale || 'en-US',
    editorMode: overrides.editorMode || 'PRINT_LAYOUT',
    saveMode: overrides.saveMode || 'NATIVE_DOCX',
    returnMode: overrides.returnMode || 'TRACKED_CHANGES',
    controllerVersion: overrides.controllerVersion || 'rtk-word-v4',
    corpusDigest: overrides.corpusDigest || sha256Text('corpus:mac-16.111.2'),
    evidenceHeads: overrides.evidenceHeads === undefined ? [] : overrides.evidenceHeads,
    freshnessPolicy: overrides.freshnessPolicy || { maxEvidenceAgeDays: 90 },
    ladder: overrides.ladder || { completedRungs: [] },
  };
}

async function withDigest(profile) {
  const module = await loadModule();
  const digest = module.computeProfileDigest(profile);
  return { ...profile, profileDigest: digest };
}

async function validTwoProfileRegistry() {
  const module = await loadModule();

  // Profile A: COMPETING mac 16.111.2 with a full ladder and one evidence head.
  const profileA = await withDigest({
    ...baseProfile({
      profileId: 'word-mac-16.111.2-d1',
      class: 'COMPETING_NOT_SATURATED',
      wordVersion: '16.111.2',
      wordBuild: '16.111.26072617',
      evidenceHeads: [
        {
          path: 'docs/OPS/RTK/WORD_MAC_SETTINGS_CAPSULE.json',
          sha256: sha256Text('evidence-head:mac-16.111.2:settings'),
          wordVersion: '16.111.2',
          wordBuild: '16.111.26072617',
          sealedAtUtc: '2026-08-01T00:00:00.000Z',
          // LAB-02: name the justified rungs explicitly so the fixture registry
          // reconciles green under the rung-without-evidence law.
          rungs: [...module.LADDER_RUNGS],
        },
      ],
      ladder: { completedRungs: module.LADDER_RUNGS },
    }),
  });

  // Profile B: HISTORICAL mac 16.42 (frozen, no ladder).
  const profileB = await withDigest({
    ...baseProfile({
      profileId: 'word-mac-16.42-d1',
      class: 'HISTORICAL_BUILD_BOUND',
      wordVersion: '16.42',
      wordBuild: '16.42.25071018',
      evidenceHeads: [
        {
          path: 'docs/OPS/RTK/HISTORICAL_MAC_16_42_FROZEN.json',
          sha256: sha256Text('evidence-head:mac-16.42:historical-frozen'),
          wordVersion: '16.42',
          wordBuild: '16.42.25071018',
          sealedAtUtc: '2026-06-01T00:00:00.000Z',
        },
      ],
      ladder: { completedRungs: [] },
    }),
  });

  return {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    // LAB-02: the current-profile pointer is part of the registry contract.
    currentProfileId: 'word-mac-16.111.2-d1',
    profiles: [profileA, profileB],
  };
}

// ===========================================================================
// LAB01-01 — loadBuildProfileRegistry accepts a valid two-profile fixture
// ===========================================================================

test('LAB01-01-loadBuildProfileRegistry-accepts-valid-fixture', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  // TARGET: the valid fixture loads as ok=true and returns both profiles.
  // RED REASON: the module does not exist yet.
  const result = module.loadBuildProfileRegistry(registry);
  assert.equal(result.ok, true, 'valid registry must load');
  assert.ok(Array.isArray(result.profiles) || Array.isArray(result.registry && result.registry.profiles),
    'loaded registry must expose profiles');
  const profiles = Array.isArray(result.profiles) ? result.profiles : result.registry.profiles;
  assert.equal(profiles.length, 2, 'both profiles must survive loading');

  // Digests must recompute to the recorded profileDigest via computeProfileDigest.
  for (const profile of profiles) {
    const recomputed = module.computeProfileDigest(stripDigest(profile));
    assert.equal(recomputed, profile.profileDigest, 'recorded profileDigest must recompute');
  }
});

function stripDigest(profile) {
  const { profileDigest, ...rest } = profile;
  return rest;
}

// ===========================================================================
// LAB01-02 — schema invalid (missing schemaVersion / unknown class / unknown rung)
// ===========================================================================

test('LAB01-02-schema-invalid-typed-code', async () => {
  const module = await loadModule();

  // Missing schemaVersion.
  const noSchema = { registryId: 'word-build-profile-registry-v1', profiles: [] };
  const noSchemaResult = module.loadBuildProfileRegistry(noSchema);
  assert.equal(noSchemaResult.ok, false, 'missing schemaVersion must fail');
  assert.equal(firstCode(noSchemaResult), LAB01_CODES.REGISTRY_SCHEMA_INVALID);

  // Unknown class.
  const goodRegistry = await validTwoProfileRegistry();
  const unknownClass = cloneRegistry(goodRegistry);
  unknownClass.profiles[0].class = 'MYSTERY_CLASS';
  const unknownClassResult = module.loadBuildProfileRegistry(unknownClass);
  assert.equal(unknownClassResult.ok, false, 'unknown class must fail');
  assert.equal(firstCode(unknownClassResult), LAB01_CODES.REGISTRY_SCHEMA_INVALID);

  // Unknown rung in completedRungs.
  const unknownRung = cloneRegistry(goodRegistry);
  unknownRung.profiles[0].ladder.completedRungs.push('WAVE_9999_DOES_NOT_EXIST');
  const unknownRungResult = module.loadBuildProfileRegistry(unknownRung);
  assert.equal(unknownRungResult.ok, false, 'unknown rung must fail');
  assert.equal(firstCode(unknownRungResult), LAB01_CODES.REGISTRY_SCHEMA_INVALID);
});

function firstCode(result) {
  if (!result) return undefined;
  if (Array.isArray(result.reasons) && result.reasons.length > 0) {
    return result.reasons[0].code || result.reasons[0];
  }
  return result.code;
}

function cloneRegistry(registry) {
  return JSON.parse(JSON.stringify(registry));
}

// ===========================================================================
// LAB01-03 — digest tamper (wordVersion changed after digest computed)
// ===========================================================================

test('LAB01-03-profile-digest-mismatch', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  // Tamper: change wordVersion AFTER the digest was recorded.
  const tampered = cloneRegistry(registry);
  tampered.profiles[0].wordVersion = '16.111.999';

  const result = module.loadBuildProfileRegistry(tampered);
  assert.equal(result.ok, false, 'tampered profileDigest must fail');
  assert.equal(firstCode(result), LAB01_CODES.PROFILE_DIGEST_MISMATCH);
});

// ===========================================================================
// LAB01-04 — cross-build evidence (evidence wordBuild != profile wordBuild)
// ===========================================================================

test('LAB01-04-cross-build-evidence-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  // Evidence claims a DIFFERENT build than the profile it is being joined to.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.111.2-d1',
    evidence: {
      wordVersion: '16.111.2',
      wordBuild: '16.111.99999999',
    },
  });

  assert.equal(result.ok, false, 'cross-build evidence must be blocked');
  assert.equal(result.code, LAB01_CODES.CROSS_BUILD_EVIDENCE);
});

// ===========================================================================
// LAB01-05 — cross-profile inheritance (evidence.profileId != requested profileId)
// ===========================================================================

test('LAB01-05-cross-profile-inheritance-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  // Evidence carries a profileId pointing at a DIFFERENT profile than the
  // requested one. Green does NOT inherit across profiles, even if builds match.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.111.2-d1',
    evidence: {
      profileId: 'word-mac-16.42-d1',
      wordVersion: '16.111.2',
      wordBuild: '16.111.26072617',
    },
  });

  assert.equal(result.ok, false, 'cross-profile inheritance must be blocked');
  assert.equal(result.code, LAB01_CODES.CROSS_PROFILE_INHERITANCE);
});

// ===========================================================================
// LAB01-06 — unknown profile
// ===========================================================================

test('LAB01-06-unknown-profile-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-99.99.99-does-not-exist',
    evidence: {
      wordVersion: '16.111.2',
      wordBuild: '16.111.26072617',
    },
  });

  assert.equal(result.ok, false, 'unknown profile must be blocked');
  assert.equal(result.code, LAB01_CODES.PROFILE_UNKNOWN);
});

// ===========================================================================
// LAB01-07 — NOT_PROVEN claim (valid-by-build evidence against a NOT_PROVEN profile)
// ===========================================================================

test('LAB01-07-not-proven-claim-blocked', async () => {
  const module = await loadModule();

  // A Windows profile of class NOT_PROVEN with a build-matching evidence head.
  const profile = await withDigest(baseProfile({
    profileId: 'word-windows-16.111-d1',
    class: 'NOT_PROVEN',
    platform: 'word-windows',
    wordVersion: '16.0.17726',
    wordBuild: '16.0.17726.20000',
    evidenceHeads: [
      {
        path: 'docs/OPS/RTK/WORD_WINDOWS_16_0_17726_CAPSULE.json',
        sha256: sha256Text('evidence-head:windows-16.0.17726'),
        wordVersion: '16.0.17726',
        wordBuild: '16.0.17726.20000',
        sealedAtUtc: '2026-08-02T00:00:00.000Z',
      },
    ],
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-windows-16.111-d1',
    evidence: {
      wordVersion: '16.0.17726',
      wordBuild: '16.0.17726.20000',
    },
  });

  // TARGET: even a build-matching evidence cannot turn a NOT_PROVEN profile
  // green; the evaluator must fail closed with NOT_PROVEN_CLAIM.
  assert.equal(result.ok, false, 'NOT_PROVEN claim must be blocked');
  assert.equal(result.code, LAB01_CODES.NOT_PROVEN_CLAIM);
});

// ===========================================================================
// LAB01-08 — historical mutation (new evidence head against a frozen historical profile)
// ===========================================================================

test('LAB01-08-historical-profile-mutation-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  // The evidence head path is NOT in the historical profile's frozen list.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.42-d1',
    evidence: {
      wordVersion: '16.42',
      wordBuild: '16.42.25071018',
      evidenceHeadPath: 'docs/OPS/RTK/NEWLY_FABRICATED_HEAD.json',
    },
  });

  assert.equal(result.ok, false, 'historical profile mutation must be blocked');
  assert.equal(result.code, LAB01_CODES.HISTORICAL_PROFILE_MUTATION);
});

// ===========================================================================
// LAB01-09 — ladder bypass (empty ladder requests a high rung)
// ===========================================================================

test('LAB01-09-ladder-bypass-blocked', async () => {
  const module = await loadModule();

  // A COMPETING_NOT_SATURATED profile with an empty ladder requests WAVE_40,
  // skipping SMOKE/SEMANTIC/NEGATIVE/WAVE_10.
  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-d2',
    class: 'COMPETING_NOT_SATURATED',
    ladder: { completedRungs: [] },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateLadderAdmission({
    registry,
    profileId: 'word-mac-16.111.2-d2',
    rung: 'WAVE_40',
  });

  assert.equal(result.ok, false, 'ladder bypass must be blocked');
  assert.equal(result.code, LAB01_CODES.LADDER_BYPASS);
});

// ===========================================================================
// LAB01-10 — ordered ladder admission (forward admit ok, skipped rung bypass)
// ===========================================================================

test('LAB01-10-ladder-ordered-admission', async () => {
  const module = await loadModule();

  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-d3',
    class: 'COMPETING_NOT_SATURATED',
    ladder: { completedRungs: ['CARRIER_SURVIVAL_SMOKE', 'SEMANTIC_DIFFERENTIAL_SUBSET', 'NEGATIVE_REPLAY_CRASH_SUBSET', 'WAVE_10'] },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  // WAVE_40 is the next rung after the four completed rungs: admit ok.
  const admit = module.evaluateLadderAdmission({
    registry,
    profileId: 'word-mac-16.111.2-d3',
    rung: 'WAVE_40',
  });
  assert.equal(admit.ok, true, 'ordered WAVE_40 admission must succeed');

  // WAVE_100 is two rungs ahead of WAVE_40: requesting it directly is a bypass.
  const skip = module.evaluateLadderAdmission({
    registry,
    profileId: 'word-mac-16.111.2-d3',
    rung: 'WAVE_100',
  });
  assert.equal(skip.ok, false, 'skipping WAVE_40 to WAVE_100 must be blocked');
  assert.equal(skip.code, LAB01_CODES.LADDER_BYPASS);
});

// ===========================================================================
// LAB01-11 — ladder unknown rung
// ===========================================================================

test('LAB01-11-ladder-unknown-rung-blocked', async () => {
  const module = await loadModule();

  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-d4',
    class: 'COMPETING_NOT_SATURATED',
    ladder: { completedRungs: [] },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateLadderAdmission({
    registry,
    profileId: 'word-mac-16.111.2-d4',
    rung: 'WAVE_9000_NOT_A_RUNG',
  });

  assert.equal(result.ok, false, 'unknown rung must be blocked');
  assert.equal(result.code, LAB01_CODES.LADDER_RUNG_UNKNOWN);
});

// ===========================================================================
// LAB01-12 — preseeded DECLARED (DECLARED/NOT_PROVEN with non-empty ladder/heads)
// ===========================================================================

test('LAB01-12-preseeded-declared-blocked-on-reconciliation', async () => {
  const module = await loadModule();

  // A DECLARED profile must start with an empty ladder and no evidence heads.
  // A preseeded completedRungs entry is an inconsistent registry state.
  const profile = await withDigest(baseProfile({
    profileId: 'word-online-declared-d1',
    class: 'DECLARED',
    platform: 'word-online',
    wordVersion: 'online',
    wordBuild: 'online.2026.08',
    ladder: { completedRungs: ['CARRIER_SURVIVAL_SMOKE'] },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'preseeded DECLARED profile must fail reconciliation');
  assert.equal(firstCode(result), LAB01_CODES.LADDER_PRESEEDED);
});

// ===========================================================================
// LAB01-13 — shared evidence head (one path referenced by two profiles)
// ===========================================================================

test('LAB01-13-shared-evidence-head-blocked-on-reconciliation', async () => {
  const module = await loadModule();

  const sharedPath = 'docs/OPS/RTK/SHARED_EVIDENCE_HEAD.json';
  const sharedHead = {
    path: sharedPath,
    sha256: sha256Text('evidence-head:shared'),
    wordVersion: '16.111.2',
    wordBuild: '16.111.26072617',
    sealedAtUtc: '2026-08-03T00:00:00.000Z',
  };

  const profileA = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-shared-a',
    evidenceHeads: [sharedHead],
  }));
  const profileB = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-shared-b',
    evidenceHeads: [sharedHead],
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profileA, profileB],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'shared evidence head must fail reconciliation');
  assert.equal(firstCode(result), LAB01_CODES.EVIDENCE_HEAD_SHARED);
});

// ===========================================================================
// LAB01-14 — integration against the REAL registry on disk (Pass 2 artifact)
// ===========================================================================

test('LAB01-14-integration-real-registry-joins-and-distinguishes-builds', async () => {
  const module = await loadModule();

  // TARGET: the real docs/OPS/RTK/WORD_BUILD_PROFILE_REGISTRY_V1.json (created
  // in Pass 2) must load as ok=true, every evidenceHead path must exist with a
  // matching sha256, and a build-matching evidence join to the 16.111.2 profile
  // must be ok=true while the same evidence joined to the 16.42 profile must be
  // RTK_LAB01_CROSS_BUILD_EVIDENCE.
  //
  // RED REASON: the registry file does not exist on CURRENT (Pass 1), so this
  // scenario fails at fs.readFileSync with ENOENT (or an equivalent failure).
  // That is the intended integration RED state until Pass 2 ships the registry.
  assert.equal(fs.existsSync(REGISTRY_PATH), true, 'WORD_BUILD_PROFILE_REGISTRY_V1.json must exist in Pass 2');

  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const loaded = module.loadBuildProfileRegistry(registryJson);
  assert.equal(loaded.ok, true, 'real registry must load');

  const profiles = Array.isArray(loaded.profiles) ? loaded.profiles : loaded.registry.profiles;
  for (const profile of profiles) {
    for (const head of profile.evidenceHeads || []) {
      const headPath = path.join(REPO_ROOT, head.path);
      assert.equal(fs.existsSync(headPath), true, `evidence head must exist: ${head.path}`);
      const observed = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(headPath)).digest('hex')}`;
      assert.equal(observed, head.sha256, `evidence head sha256 must match: ${head.path}`);
    }
  }

  const realEvidence = {
    wordVersion: '16.111.2',
    wordBuild: '16.111.26072617',
  };

  const joinModern = module.evaluateEvidenceProfileJoin({
    registry: loaded.registry || registryJson,
    profileId: 'word-mac-16.111.2-d1',
    evidence: realEvidence,
  });
  assert.equal(joinModern.ok, true, '16.111.2 evidence must join the 16.111.2 profile');

  const joinHistorical = module.evaluateEvidenceProfileJoin({
    registry: loaded.registry || registryJson,
    profileId: 'word-mac-16.42-d1',
    evidence: realEvidence,
  });
  assert.equal(joinHistorical.ok, false, '16.111.2 evidence must not join the 16.42 profile');
  assert.equal(joinHistorical.code, LAB01_CODES.CROSS_BUILD_EVIDENCE);
});

// ===========================================================================
// LAB01-15 — EVIDENCE_STALE: sealed head older than freshnessPolicy.maxEvidenceAgeDays
//
// Pass 2 addition. The freshness law fires only after build, inheritance,
// not-proven, historical-mutation and unknown-profile checks pass, and only
// when the evidence points at a head that has sealedAtUtc and the profile has
// a finite freshnessPolicy.maxEvidenceAgeDays. nowUtc is injected for
// determinism (200 days after seal vs 90 day bound).
// ===========================================================================

test('LAB01-15-evidence-stale-blocked', async () => {
  const module = await loadModule();

  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-stale',
    class: 'COMPETING_NOT_SATURATED',
    evidenceHeads: [
      {
        path: 'docs/OPS/RTK/STALE_HEAD.json',
        sha256: sha256Text('evidence-head:stale'),
        wordVersion: '16.111.2',
        wordBuild: '16.111.26072617',
        sealedAtUtc: '2026-05-01T00:00:00.000Z',
      },
    ],
    freshnessPolicy: { maxEvidenceAgeDays: 90 },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  // Seal is 200 days before the injected nowUtc; 90 day bound is exceeded.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.111.2-stale',
    evidence: {
      wordVersion: '16.111.2',
      wordBuild: '16.111.26072617',
      evidenceHeadPath: 'docs/OPS/RTK/STALE_HEAD.json',
    },
    nowUtc: '2026-11-07T00:00:00.000Z',
  });

  assert.equal(result.ok, false, 'stale sealed evidence must be blocked');
  assert.equal(result.code, LAB01_CODES.EVIDENCE_STALE);
});

// ===========================================================================
// LAB01-16 — historical re-join POSITIVE: evidence already in the frozen list
//
// Re-joining evidence that is ALREADY in a frozen historical profile's head
// list is a read, not a mutation. Build/version match, the head path is in the
// frozen list, and the join is ok=true.
// ===========================================================================

test('LAB01-16-historical-rejoin-positive', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  const frozenHeadPath = 'docs/OPS/RTK/HISTORICAL_MAC_16_42_FROZEN.json';

  // The historical profile B in validTwoProfileRegistry() already lists this
  // head. Re-joining it (matching build) must be ok=true: re-read, not mutation.
  const result = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.42-d1',
    evidence: {
      wordVersion: '16.42',
      wordBuild: '16.42.25071018',
      evidenceHeadPath: frozenHeadPath,
    },
  });

  assert.equal(result.ok, true, 're-joining an existing frozen head must succeed');
});

// ===========================================================================
// LAB01-17 — RUNG_WITHOUT_EVIDENCE on reconciliation
//
// A profile with completedRungs but no evidenceHeads justifying them fails
// registry reconciliation with RUNG_WITHOUT_EVIDENCE as the first reason.
// ===========================================================================

test('LAB01-17-rung-without-evidence-blocked-on-reconciliation', async () => {
  const module = await loadModule();

  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-norunevidence',
    class: 'COMPETING_NOT_SATURATED',
    evidenceHeads: [],
    ladder: { completedRungs: ['CARRIER_SURVIVAL_SMOKE'] },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'rung without evidence must fail reconciliation');
  assert.equal(firstCode(result), LAB01_CODES.RUNG_WITHOUT_EVIDENCE);
});

// ===========================================================================
// LAB01-18 — head-build-mismatch on reconciliation (CROSS_BUILD_EVIDENCE)
//
// An evidence head whose wordBuild differs from its profile's wordBuild is a
// cross-build head at the registry level and must surface CROSS_BUILD_EVIDENCE
// among the reconciliation reasons.
// ===========================================================================

test('LAB01-18-reconciliation-head-build-mismatch', async () => {
  const module = await loadModule();

  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.2-headmismatch',
    class: 'COMPETING_NOT_SATURATED',
    evidenceHeads: [
      {
        path: 'docs/OPS/RTK/CROSS_BUILD_HEAD.json',
        sha256: sha256Text('evidence-head:cross-build'),
        wordVersion: '16.111.2',
        wordBuild: '16.111.99999999',
        sealedAtUtc: '2026-08-04T00:00:00.000Z',
        rungs: ['CARRIER_SURVIVAL_SMOKE'],
      },
    ],
    ladder: { completedRungs: ['CARRIER_SURVIVAL_SMOKE'] },
  }));

  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    profiles: [profile],
  };

  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'cross-build head must fail reconciliation');
  const codes = (result.reasons || []).map((r) => r.code || r);
  assert.ok(codes.includes(LAB01_CODES.CROSS_BUILD_EVIDENCE),
    `reasons must include ${LAB01_CODES.CROSS_BUILD_EVIDENCE}; got ${JSON.stringify(codes)}`);
});

// ===========================================================================
// LAB01-19 — build identity missing (empty evidence must fail closed)
// ===========================================================================

test('LAB01-19-build-identity-missing-blocked', async () => {
  const module = await loadModule();
  const registry = await validTwoProfileRegistry();

  // Evidence with NO build identity at all must not silently pass the
  // cross-build comparison: identity is validated before any comparison.
  const empty = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.111.2-d1',
    evidence: {},
  });
  assert.equal(empty.ok, false, 'empty evidence must be blocked');
  assert.equal(empty.code, LAB01_CODES.BUILD_IDENTITY_MISSING);

  // Partial identity (version only) is still missing identity.
  const partial = module.evaluateEvidenceProfileJoin({
    registry,
    profileId: 'word-mac-16.111.2-d1',
    evidence: { wordVersion: '16.111.2' },
  });
  assert.equal(partial.ok, false, 'partial identity must be blocked');
  assert.equal(partial.code, LAB01_CODES.BUILD_IDENTITY_MISSING);
});

// ===========================================================================
// LAB01-20 — profile class vocabulary is frozen and includes SATURATED
// ===========================================================================

test('LAB01-20-profile-classes-frozen-vocabulary', async () => {
  const module = await loadModule();
  assert.deepEqual([...module.PROFILE_CLASSES], [
    'HISTORICAL_BUILD_BOUND',
    'COMPETING_NOT_SATURATED',
    'SATURATED',
    'NOT_PROVEN',
    'DECLARED',
  ], 'profile class vocabulary must be the frozen five-class list');
  assert.equal(Object.isFrozen(module.PROFILE_CLASSES), true, 'PROFILE_CLASSES must be frozen');
  assert.equal(Object.isFrozen(module.LADDER_RUNGS), true, 'LADDER_RUNGS must be frozen');
});

// ===========================================================================
// LAB-02 — build migration 16.111.2 -> 16.111.3 (owner-directed contour).
//
// Physical Word on the lab machine moved from 16.111.2 (build 16.111.26072617)
// to 16.111.3 (build 16.111.26080215) on 2026-08-10. The LAB-01 no-inheritance
// law makes the old build's evidence unjoinable to any new-build profile
// (RTK_LAB01_CROSS_BUILD_EVIDENCE), so the migration is typed, never implicit:
//
//   1. word-mac-16.111.2-d1 freezes as HISTORICAL_BUILD_BOUND (no new heads,
//      no new rungs — existing historical law);
//   2. word-mac-16.111.3-26080215 registers as DECLARED with an empty ladder;
//   3. the registry gains a mandatory currentProfileId pointer, validated on
//      reconciliation: it must resolve to a registered profile and must never
//      aim at a HISTORICAL_BUILD_BOUND profile (RTK_LAB01_CURRENT_POINTER_INVALID);
//   4. a DECLARED/NOT_PROVEN profile carrying saturation fields inherits nothing
//      (RTK_LAB01_SATURATION_INHERITANCE);
//   5. rungs, saturation and CURRENT claims never carry from 16.111.2.
// ===========================================================================

const LAB02_CODES = {
  CURRENT_POINTER_INVALID: 'RTK_LAB01_CURRENT_POINTER_INVALID',
  SATURATION_INHERITANCE: 'RTK_LAB01_SATURATION_INHERITANCE',
};

// L2-01: the real migrated registry — 16.111.2 frozen historical, 16.111.3
// DECLARED current with an empty ladder, pointer at 16.111.3.
test('LAB02-01-real-registry-migrated-honestly', async () => {
  const module = await loadModule();
  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const loaded = module.loadBuildProfileRegistry(registryJson);
  assert.equal(loaded.ok, true, `migrated registry must load: ${JSON.stringify(loaded.reasons)}`);
  const reconciliation = module.evaluateRegistryReconciliation(registryJson);
  assert.equal(reconciliation.ok, true, `migrated registry must reconcile: ${JSON.stringify(reconciliation.reasons)}`);

  const profiles = registryJson.profiles;
  const old = profiles.find((p) => p.profileId === 'word-mac-16.111.2-d1');
  const current = profiles.find((p) => p.profileId === 'word-mac-16.111.3-26080215');
  assert.equal(old.class, 'HISTORICAL_BUILD_BOUND', '16.111.2 must freeze as HISTORICAL_BUILD_BOUND');
  assert.equal(old.supersededBy, 'word-mac-16.111.3-26080215', '16.111.2 must name its superseding build');
  assert.ok(current, '16.111.3 profile must exist');
  // PHYS-02 amendment: the CARRIER_SURVIVAL_SMOKE rung was physically earned on
  // 2026-08-10 (12/12 sealed on merged SHA 197ba60f). The profile is now
  // COMPETING_NOT_SATURATED with exactly one head and exactly one rung; every
  // later rung remains unearned.
  assert.equal(current.class, 'COMPETING_NOT_SATURATED', '16.111.3 is COMPETING while rungs are earned and saturation is not claimed');
  assert.equal(current.wordVersion, '16.111.3');
  assert.equal(current.wordBuild, '16.111.26080215');
  // PHYS-04 amendment (rung-count-agnostic law): the earned ladder is always an
  // exact ordered PREFIX of LADDER_RUNGS, every earned rung is justified by at
  // least one on-build head, and every head sha256 verifies against disk. This
  // law holds for every future rung without further amendments.
  const rungs = current.ladder.completedRungs;
  const idx = module.LADDER_RUNGS.indexOf(rungs[rungs.length - 1]);
  assert.deepEqual(rungs, module.LADDER_RUNGS.slice(0, idx + 1), 'earned rungs must be an exact ordered prefix of the ladder');
  assert.ok(rungs.length >= 1, 'at least the smoke rung is earned');
  const justified = new Set(current.evidenceHeads.flatMap((h) => h.rungs || []));
  for (const rung of rungs) assert.ok(justified.has(rung), `rung ${rung} must have a justifying head`);
  for (const head of current.evidenceHeads) {
    const abs = path.join(REPO_ROOT, head.path);
    assert.equal(fs.existsSync(abs), true, `head must exist: ${head.path}`);
    assert.equal(sha256File(abs), head.sha256, `head sha must verify: ${head.path}`);
    assert.equal(head.wordBuild, '16.111.26080215', 'head must be on-build');
  }
  assert.equal(registryJson.currentProfileId, 'word-mac-16.111.3-26080215', 'pointer must name the current build profile');
});

// L2-02: pointer validation — unresolvable, historical-targeted and missing
// pointers all fail reconciliation with CURRENT_POINTER_INVALID.
test('LAB02-02-current-pointer-invalid-cases', async () => {
  const module = await loadModule();
  const base = await validTwoProfileRegistry();

  const unknown = cloneRegistry(base);
  unknown.currentProfileId = 'word-mac-does-not-exist';
  const unknownResult = module.evaluateRegistryReconciliation(unknown);
  assert.equal(unknownResult.ok, false);
  assert.ok((unknownResult.reasons || []).some((r) => r.code === LAB02_CODES.CURRENT_POINTER_INVALID),
    `unresolvable pointer must fail: ${JSON.stringify(unknownResult.reasons)}`);

  const historical = cloneRegistry(base);
  historical.currentProfileId = 'word-mac-16.42-d1';
  const historicalResult = module.evaluateRegistryReconciliation(historical);
  assert.equal(historicalResult.ok, false, 'pointer at a HISTORICAL profile must fail');
  assert.ok((historicalResult.reasons || []).some((r) => r.code === LAB02_CODES.CURRENT_POINTER_INVALID));

  const missing = cloneRegistry(base);
  delete missing.currentProfileId;
  const missingResult = module.evaluateRegistryReconciliation(missing);
  assert.equal(missingResult.ok, false, 'missing pointer must fail');
  assert.ok((missingResult.reasons || []).some((r) => r.code === LAB02_CODES.CURRENT_POINTER_INVALID));

  const valid = module.evaluateRegistryReconciliation(base);
  assert.equal(valid.ok, true, `valid pointer must pass: ${JSON.stringify(valid.reasons)}`);
});

// L2-03: a DECLARED profile carrying saturation fields inherits nothing.
test('LAB02-03-saturation-inheritance-blocked', async () => {
  const module = await loadModule();
  const profile = await withDigest(baseProfile({
    profileId: 'word-mac-16.111.3-26080215',
    class: 'DECLARED',
    wordVersion: '16.111.3',
    wordBuild: '16.111.26080215',
  }));
  profile.saturationStatus = 'SATURATED'; // forged inheritance attempt
  const registry = {
    schemaVersion: module.WORD_BUILD_PROFILE_REGISTRY_SCHEMA,
    registryId: 'word-build-profile-registry-v1',
    currentProfileId: 'word-mac-16.111.3-26080215',
    profiles: [await withDigest(profile)],
  };
  const result = module.evaluateRegistryReconciliation(registry);
  assert.equal(result.ok, false, 'saturation on a DECLARED profile must fail');
  assert.ok((result.reasons || []).some((r) => r.code === LAB02_CODES.SATURATION_INHERITANCE),
    `reasons must include SATURATION_INHERITANCE: ${JSON.stringify(result.reasons)}`);
});

// L2-04: the frozen 16.111.2 profile rejects new evidence heads (real registry).
test('LAB02-04-frozen-16-111-2-rejects-new-evidence', async () => {
  const module = await loadModule();
  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const result = module.evaluateEvidenceProfileJoin({
    registry: registryJson,
    profileId: 'word-mac-16.111.2-d1',
    evidence: {
      wordVersion: '16.111.2',
      wordBuild: '16.111.26072617',
      evidenceHeadPath: 'docs/OPS/RTK/FABRICATED_NEW_HEAD.json',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_LAB01_HISTORICAL_PROFILE_MUTATION');
});

// L2-05: 16.111.3 DECLARED rejects green evidence of its own build.
test('LAB02-05-declared-16-111-3-rejects-green', async () => {
  const module = await loadModule();
  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  // PHYS-02 amendment: 16.111.3 is COMPETING_NOT_SATURATED after the sealed
  // smoke rung, so the NOT_PROVEN_CLAIM law moves to its honest remaining
  // targets: a foreign build never joins (cross-build), and the smoke head is
  // re-joinable (idempotent read of registered evidence).
  const crossBuild = module.evaluateEvidenceProfileJoin({
    registry: registryJson,
    profileId: 'word-mac-16.111.3-26080215',
    evidence: { wordVersion: '16.111.4', wordBuild: '16.111.99999999' },
  });
  assert.equal(crossBuild.ok, false);
  assert.equal(crossBuild.code, 'RTK_LAB01_CROSS_BUILD_EVIDENCE');
  const rejoin = module.evaluateEvidenceProfileJoin({
    registry: registryJson,
    profileId: 'word-mac-16.111.3-26080215',
    evidence: {
      wordVersion: '16.111.3',
      wordBuild: '16.111.26080215',
      evidenceHeadPath: 'docs/OPS/RTK/WORD_MAC_16_111_3_CARRIER_SURVIVAL_SMOKE_RECEIPT.json',
    },
  });
  assert.equal(rejoin.ok, true, `re-joining the registered smoke head is a read: ${JSON.stringify(rejoin.reasons)}`);
});

// L2-06: no rung inheritance — 16.111.3 admits only the first rung (an attempt,
// not a completion) and bypass attempts fail.
test('LAB02-06-no-rung-inheritance-on-new-build', async () => {
  const module = await loadModule();
  const registryJson = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  // PHYS-02 amendment: CARRIER_SURVIVAL_SMOKE is earned; the next admission is
  // SEMANTIC_DIFFERENTIAL_SUBSET, and re-admission of the earned rung stays an
  // idempotent read.
  // PHYS-06 amendment (rung-agnostic): the admitted rung is always the first
  // unearned rung; the bypass probe is the rung after it.
  const earned = registryJson.profiles.find((p) => p.profileId === 'word-mac-16.111.3-26080215').ladder.completedRungs;
  const nextRung = module.LADDER_RUNGS[earned.length];
  const skipRung = module.LADDER_RUNGS[earned.length + 1];
  if (nextRung !== undefined) {
    const first = module.evaluateLadderAdmission({
      registry: registryJson,
      profileId: 'word-mac-16.111.3-26080215',
      rung: nextRung,
    });
    assert.equal(first.ok, true, 'the next rung admission (attempt) must be allowed');
  }
  // PHYS-08 amendment: when the ladder has fewer than two unearned rungs, the
  // bypass probe needs a fabricated gap — clone the registry and truncate the
  // earned prefix, then skipping ahead must still bypass-block.
  const gapRegistry = cloneRegistry(registryJson);
  gapRegistry.profiles.find((p) => p.profileId === 'word-mac-16.111.3-26080215').ladder.completedRungs = ['CARRIER_SURVIVAL_SMOKE'];
  const bypass = module.evaluateLadderAdmission({
    registry: gapRegistry,
    profileId: 'word-mac-16.111.3-26080215',
    rung: skipRung === undefined ? 'WAVE_40' : skipRung,
  });
  assert.equal(bypass.ok, false, 'skipping ahead of the earned prefix must be blocked');
  assert.equal(bypass.code, 'RTK_LAB01_LADDER_BYPASS');
  const historicalAdmission = module.evaluateLadderAdmission({
    registry: registryJson,
    profileId: 'word-mac-16.111.2-d1',
    rung: 'WAVE_300',
  });
  assert.equal(historicalAdmission.ok, false, 'frozen historical profile admits no rungs');
  assert.equal(historicalAdmission.code, 'RTK_LAB01_HISTORICAL_PROFILE_MUTATION');
});

// Keep cryptoPort referenced for fixture symmetry with sibling contracts.
void cryptoPort;
