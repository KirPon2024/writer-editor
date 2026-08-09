#!/usr/bin/env node
/*
 * GOOGLE-01 — provider/editorMode/conversionBoundary profile registry evaluator.
 *
 * This module is the Pass 2 (IMPLEMENTATION) artifact for the GOOGLE-01 contract
 * test contour
 * (test/contracts/rtk-google01-provider-profiles.contract.test.js). It is a
 * pure, read-only evaluator modelled on the LAB-01 word registry evaluator
 * (scripts/ops/rtk-word-build-profiles-v1.mjs), but with the identity axes
 * changed from platform/wordVersion/wordBuild to
 * provider/editorMode/conversionBoundary. Google Docs has TWO distinct editor
 * modes (OFFICE_MODE and NATIVE_CONVERSION) that are TWO separate provider
 * profiles with separate evidence heads; green NEVER carries between modes or
 * between providers.
 *
 * It implements the Proof-Carrying Interop V2 §37 no-inheritance contract:
 *
 *   1. a machine-readable registry of google-docs provider profiles;
 *   2. a fail-closed evidence/profile join evaluator with typed codes;
 *   3. a per-profile migration-ladder admission gate;
 *   4. a registry-level reconciliation law (cross-mode + cross-profile +
 *      discovery-head-as-profile-evidence).
 *
 * Authority model: EVIDENCE_NEVER_CREATES_AUTHORITY. The evaluator returns
 * typed reasons only; it is not a write path and grants no mutation authority.
 * A mode-matching evidence join against a NOT_PROVEN/DECLARED profile stays
 * blocked (NOT_PROVEN_CLAIM). This mirrors the honest current UNTESTED state of
 * Google Docs: both profiles are DECLARED with empty ladders and empty evidence
 * heads, and Google execution is BLOCKED.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Schema constants.
// ---------------------------------------------------------------------------

export const GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA = 'yalken.rtk.google-build-profile-registry.v1';

// PROFILE_CLASSES is the closed vocabulary of profile classes (mirrors LAB-01).
export const PROFILE_CLASSES = Object.freeze([
  'HISTORICAL_BUILD_BOUND',
  'COMPETING_NOT_SATURATED',
  'SATURATED',
  'NOT_PROVEN',
  'DECLARED',
]);

// GOOGLE_EDITOR_MODES is the closed vocabulary of Google Docs editor modes. The
// two modes are TWO separate profiles with separate evidence heads: OFFICE_MODE
// (DOCX edited in Google Docs without conversion) and NATIVE_CONVERSION
// (DOCX -> Google native -> DOCX).
export const GOOGLE_EDITOR_MODES = Object.freeze([
  'OFFICE_MODE',
  'NATIVE_CONVERSION',
]);

// CONVERSION_BOUNDARIES is the closed vocabulary of conversion boundary
// classes. NONE means no DOCX<->native conversion crosses the boundary
// (OFFICE_MODE); DOCX_TO_NATIVE_ROUNDTRIP means a DOCX->native->DOCX roundtrip
// crosses it (NATIVE_CONVERSION).
export const CONVERSION_BOUNDARIES = Object.freeze([
  'NONE',
  'DOCX_TO_NATIVE_ROUNDTRIP',
]);

// LADDER_RUNGS is the ordered, ascending migration ladder (mirrors LAB-01).
export const LADDER_RUNGS = Object.freeze([
  'CARRIER_SURVIVAL_SMOKE',
  'SEMANTIC_DIFFERENTIAL_SUBSET',
  'NEGATIVE_REPLAY_CRASH_SUBSET',
  'WAVE_10',
  'WAVE_40',
  'WAVE_100',
  'WAVE_300',
]);

// ---------------------------------------------------------------------------
// Typed codes. Every string here is pinned by name in the GOOGLE-01 contract
// test, so renaming a value changes the contract.
// ---------------------------------------------------------------------------

export const GOOGLE01_CODES = Object.freeze({
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
});

// ---------------------------------------------------------------------------
// Canonical JSON + digest. computeProfileDigest mirrors the stableJson helper
// in the contract test: object keys sorted ascending, arrays in source order,
// UTF-8 sha256 hex prefixed with 'sha256:'. The digest is computed over the
// profile EXCLUDING its own profileDigest field (self-exclusion), so a recorded
// digest can be recomputed from a profile with the field stripped.
// ---------------------------------------------------------------------------

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
}

export function computeProfileDigest(profile) {
  const { profileDigest: _omitted, ...rest } = profile || {};
  return `sha256:${sha256Hex(stableJson(rest))}`;
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

function reason(code, message) {
  return { code, message };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function findProfile(registry, profileId) {
  const profiles = (registry && Array.isArray(registry.profiles)) ? registry.profiles : [];
  return profiles.find((p) => p && p.profileId === profileId) || null;
}

function firstReasonCode(reasons) {
  if (Array.isArray(reasons) && reasons.length > 0) {
    return reasons[0].code || reasons[0];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// loadGoogleBuildProfileRegistry
//
// Accepts either a filesystem path (string) or a parsed registry object. The
// check order is load-bearing and pinned by the contract:
//
//   1. parse (if path) + top-level structural sanity;
//   2. per-profile SCHEMA validation (mandatory fields, class vocabulary,
//      editorMode vocabulary, conversionBoundary vocabulary, ladder rung
//      vocabulary) -> REGISTRY_SCHEMA_INVALID;
//   3. per-profile DIGEST check (computeProfileDigest(profile without
//      profileDigest) === profile.profileDigest) -> PROFILE_DIGEST_MISMATCH.
//
// Schema is checked before digests because a structurally invalid profile has
// no meaningful digest contract. Returns { ok, code?, reasons?, registry?,
// profiles? }. On failure reasons is the typed list (firstCode is the verdict).
// ---------------------------------------------------------------------------

export function loadGoogleBuildProfileRegistry(input) {
  let registry;
  if (typeof input === 'string') {
    try {
      registry = JSON.parse(fs.readFileSync(input, 'utf8'));
    } catch (err) {
      return {
        ok: false,
        code: GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID,
        reasons: [reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `registry could not be read: ${err.message}`)],
      };
    }
  } else {
    registry = input;
  }

  const reasons = [];

  // Top-level structure.
  if (!isPlainObject(registry)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, 'registry root must be an object'));
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }
  if (registry.schemaVersion !== GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `schemaVersion must equal ${GOOGLE_BUILD_PROFILE_REGISTRY_SCHEMA}`));
  }
  if (!isNonEmptyString(registry.registryId)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, 'registryId must be a non-empty string'));
  }
  if (!Array.isArray(registry.profiles)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, 'profiles must be an array'));
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  // Per-profile schema validation.
  for (const profile of registry.profiles) {
    validateProfileSchema(profile, reasons);
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  // Per-profile digest validation (only after schema is clean).
  for (const profile of registry.profiles) {
    const expected = profile.profileDigest;
    if (!isNonEmptyString(expected)) {
      reasons.push(reason(GOOGLE01_CODES.PROFILE_DIGEST_MISMATCH, `profile ${profile.profileId} missing profileDigest`));
      continue;
    }
    const recomputed = computeProfileDigest(profile);
    if (recomputed !== expected) {
      reasons.push(reason(GOOGLE01_CODES.PROFILE_DIGEST_MISMATCH, `profile ${profile.profileId} profileDigest mismatch (expected ${expected}, recomputed ${recomputed})`));
    }
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  return { ok: true, code: GOOGLE01_CODES.JOIN_OK, registry, profiles: registry.profiles };
}

function validateProfileSchema(profile, reasons) {
  const mandatory = ['profileId', 'class', 'provider', 'editorMode', 'conversionBoundary', 'clientIdentity', 'sessionClass', 'evidenceHeads', 'freshnessPolicy', 'ladder', 'nonClaims'];
  if (!isPlainObject(profile)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, 'profile must be an object'));
    return;
  }
  for (const field of mandatory) {
    if (!(field in profile) || profile[field] === undefined || profile[field] === null) {
      reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} missing mandatory field ${field}`));
    }
  }
  if (!PROFILE_CLASSES.includes(profile.class)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} has unknown class ${JSON.stringify(profile.class)}`));
  }
  if (!GOOGLE_EDITOR_MODES.includes(profile.editorMode)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} has unknown editorMode ${JSON.stringify(profile.editorMode)}`));
  }
  if (!CONVERSION_BOUNDARIES.includes(profile.conversionBoundary)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} has unknown conversionBoundary ${JSON.stringify(profile.conversionBoundary)}`));
  }
  if (!Array.isArray(profile.evidenceHeads)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} evidenceHeads must be an array`));
  }
  if (!isPlainObject(profile.ladder) || !Array.isArray(profile.ladder.completedRungs)) {
    reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} ladder.completedRungs must be an array`));
  } else {
    for (const rung of profile.ladder.completedRungs) {
      if (!LADDER_RUNGS.includes(rung)) {
        reasons.push(reason(GOOGLE01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} completedRungs contains unknown rung ${JSON.stringify(rung)}`));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// evaluateEvidenceProfileJoin
//
// Order is load-bearing and pinned by the contract. The first failing check
// wins and is returned as result.code.
//
//   PROFILE_UNKNOWN             -> profileId not in registry
//   PROVIDER_MISMATCH           -> evidence.provider !== 'google-docs'
//   MODE_IDENTITY_MISSING       -> evidence lacks a non-empty editorMode
//                                  (identity before any mode comparison)
//   CROSS_PROFILE_INHERITANCE   -> evidence.profileId set and != requested
//   CROSS_MODE_EVIDENCE         -> evidence.editorMode != profile.editorMode
//   NOT_PROVEN_CLAIM            -> profile.class is NOT_PROVEN or DECLARED
//   HISTORICAL_PROFILE_MUTATION -> profile.class is HISTORICAL_BUILD_BOUND and
//                                  evidence.evidenceHeadPath is set and is not
//                                  one of the profile's frozen evidence heads
//   EVIDENCE_STALE              -> evidence.evidenceHeadPath matches a head that
//                                  has sealedAtUtc, the profile has
//                                  freshnessPolicy.maxEvidenceAgeDays, and
//                                  nowUtc - sealedAtUtc exceeds that bound
//   ok=true                     -> JOIN_OK
// ---------------------------------------------------------------------------

export function evaluateEvidenceProfileJoin({ registry, profileId, evidence, nowUtc } = {}) {
  const profile = findProfile(registry, profileId);
  if (!profile) {
    return { ok: false, code: GOOGLE01_CODES.PROFILE_UNKNOWN, reasons: [reason(GOOGLE01_CODES.PROFILE_UNKNOWN, `profile ${profileId} not found in registry`)] };
  }
  const ev = evidence || {};

  if (ev.provider !== 'google-docs') {
    return { ok: false, code: GOOGLE01_CODES.PROVIDER_MISMATCH, reasons: [reason(GOOGLE01_CODES.PROVIDER_MISMATCH, `evidence.provider ${JSON.stringify(ev.provider)} != 'google-docs'`)] };
  }

  // Identity before comparison: evidence without a non-empty editorMode cannot
  // prove same-mode, so it must fail closed rather than silently pass the
  // cross-mode comparison.
  if (!isNonEmptyString(ev.editorMode)) {
    return { ok: false, code: GOOGLE01_CODES.MODE_IDENTITY_MISSING, reasons: [reason(GOOGLE01_CODES.MODE_IDENTITY_MISSING, 'evidence must carry a non-empty editorMode before it can join any profile')] };
  }

  if (ev.profileId !== undefined && ev.profileId !== profileId) {
    return { ok: false, code: GOOGLE01_CODES.CROSS_PROFILE_INHERITANCE, reasons: [reason(GOOGLE01_CODES.CROSS_PROFILE_INHERITANCE, `evidence.profileId ${ev.profileId} != requested profileId ${profileId}`)] };
  }

  if (ev.editorMode !== profile.editorMode) {
    return {
      ok: false,
      code: GOOGLE01_CODES.CROSS_MODE_EVIDENCE,
      reasons: [reason(GOOGLE01_CODES.CROSS_MODE_EVIDENCE, `evidence editorMode ${JSON.stringify(ev.editorMode)} != profile editorMode ${JSON.stringify(profile.editorMode)}`)],
    };
  }

  if (profile.class === 'NOT_PROVEN' || profile.class === 'DECLARED') {
    return { ok: false, code: GOOGLE01_CODES.NOT_PROVEN_CLAIM, reasons: [reason(GOOGLE01_CODES.NOT_PROVEN_CLAIM, `profile ${profileId} class ${profile.class} cannot accept evidence`)] };
  }

  if (profile.class === 'HISTORICAL_BUILD_BOUND') {
    if (isNonEmptyString(ev.evidenceHeadPath)) {
      const frozenPaths = (profile.evidenceHeads || []).map((h) => h && h.path).filter(isNonEmptyString);
      if (!frozenPaths.includes(ev.evidenceHeadPath)) {
        return { ok: false, code: GOOGLE01_CODES.HISTORICAL_PROFILE_MUTATION, reasons: [reason(GOOGLE01_CODES.HISTORICAL_PROFILE_MUTATION, `evidence head ${ev.evidenceHeadPath} is not in the frozen historical profile ${profileId} evidence head list`)] };
      }
    }
  }

  // Freshness: only meaningful when the evidence points at a sealed head whose
  // age the registry bounds. nowUtc defaults to the current wall clock; tests
  // inject a fixed value for determinism.
  const maxAgeDays = profile.freshnessPolicy && Number.isFinite(profile.freshnessPolicy.maxEvidenceAgeDays)
    ? profile.freshnessPolicy.maxEvidenceAgeDays
    : null;
  if (isNonEmptyString(ev.evidenceHeadPath) && maxAgeDays !== null) {
    const head = (profile.evidenceHeads || []).find((h) => h && h.path === ev.evidenceHeadPath);
    if (head && head.sealedAtUtc) {
      const now = nowUtc !== undefined ? new Date(nowUtc) : new Date();
      const sealed = new Date(head.sealedAtUtc);
      const ageDays = (now.getTime() - sealed.getTime()) / (24 * 60 * 60 * 1000);
      if (Number.isFinite(ageDays) && ageDays > maxAgeDays) {
        return { ok: false, code: GOOGLE01_CODES.EVIDENCE_STALE, reasons: [reason(GOOGLE01_CODES.EVIDENCE_STALE, `evidence head ${ev.evidenceHeadPath} age ${ageDays.toFixed(2)} days exceeds maxEvidenceAgeDays ${maxAgeDays}`)] };
      }
    }
  }

  return { ok: true, code: GOOGLE01_CODES.JOIN_OK, reasons: [reason(GOOGLE01_CODES.JOIN_OK, `evidence joined profile ${profileId}`)] };
}

// ---------------------------------------------------------------------------
// evaluateLadderAdmission
//
// Forward-only admission over LADDER_RUNGS. A rung may be admitted only when
// every rung that comes BEFORE it in LADDER_RUNGS is already present in
// ladder.completedRungs. Re-admitting an already-completed rung is ok=true
// (idempotent read). A historical frozen profile rejects all admission.
//
//   PROFILE_UNKNOWN             -> profileId not in registry
//   LADDER_RUNG_UNKNOWN         -> rung not in LADDER_RUNGS
//   HISTORICAL_PROFILE_MUTATION -> profile.class HISTORICAL_BUILD_BOUND
//   LADDER_BYPASS               -> an earlier rung is missing
//   ok=true                     -> LADDER_ADMITTED
// ---------------------------------------------------------------------------

export function evaluateLadderAdmission({ registry, profileId, rung } = {}) {
  const profile = findProfile(registry, profileId);
  if (!profile) {
    return { ok: false, code: GOOGLE01_CODES.PROFILE_UNKNOWN, reasons: [reason(GOOGLE01_CODES.PROFILE_UNKNOWN, `profile ${profileId} not found in registry`)] };
  }
  if (!LADDER_RUNGS.includes(rung)) {
    return { ok: false, code: GOOGLE01_CODES.LADDER_RUNG_UNKNOWN, reasons: [reason(GOOGLE01_CODES.LADDER_RUNG_UNKNOWN, `rung ${JSON.stringify(rung)} is not a known ladder rung`)] };
  }
  if (profile.class === 'HISTORICAL_BUILD_BOUND') {
    return { ok: false, code: GOOGLE01_CODES.HISTORICAL_PROFILE_MUTATION, reasons: [reason(GOOGLE01_CODES.HISTORICAL_PROFILE_MUTATION, `historical frozen profile ${profileId} admits no new ladder rungs`)] };
  }

  const completed = new Set((profile.ladder && Array.isArray(profile.ladder.completedRungs)) ? profile.ladder.completedRungs : []);
  const requestedIndex = LADDER_RUNGS.indexOf(rung);
  for (let i = 0; i < requestedIndex; i += 1) {
    if (!completed.has(LADDER_RUNGS[i])) {
      return { ok: false, code: GOOGLE01_CODES.LADDER_BYPASS, reasons: [reason(GOOGLE01_CODES.LADDER_BYPASS, `rung ${rung} requested but earlier rung ${LADDER_RUNGS[i]} is not completed`)] };
    }
  }

  return { ok: true, code: GOOGLE01_CODES.LADDER_ADMITTED, reasons: [reason(GOOGLE01_CODES.LADDER_ADMITTED, `rung ${rung} admitted for profile ${profileId}`)] };
}

// ---------------------------------------------------------------------------
// evaluateRegistryReconciliation
//
// Collects all reasons across the registry; ok=false if any. Order is stable
// and pinned by the contract:
//
//   EVIDENCE_HEAD_SHARED             -> one evidence head path referenced by two
//                                       profiles
//   DISCOVERY_HEAD_AS_PROFILE_EVIDENCE -> a profile evidenceHead.path collides
//                                       with a top-level discoveryHeads[].path
//                                       (discovery artifact is NOT profile
//                                       evidence; anti-inheritance law)
//   LADDER_PRESEEDED                 -> DECLARED or NOT_PROVEN profile with
//                                       non-empty completedRungs or evidenceHeads
//   CROSS_MODE_EVIDENCE              -> evidence head editorMode != profile's
//   RUNG_WITHOUT_EVIDENCE            -> a completedRung is not justified by any
//                                       evidence head of the SAME profile
//                                       (head.rungs, if present, names the
//                                       rungs it proves; otherwise the head
//                                       justifies nothing by default)
// ---------------------------------------------------------------------------

export function evaluateRegistryReconciliation(registry) {
  const reasons = [];
  const profiles = (registry && Array.isArray(registry.profiles)) ? registry.profiles : [];

  // Top-level discovery heads: a discovery artifact is program/discovery
  // evidence and may never serve as a profile evidence head.
  const discoveryPaths = new Set();
  for (const head of (registry && Array.isArray(registry.discoveryHeads)) ? registry.discoveryHeads : []) {
    if (head && isNonEmptyString(head.path)) {
      discoveryPaths.add(head.path);
    }
  }

  // (a) shared evidence head across profiles.
  const seenPaths = new Map();
  for (const profile of profiles) {
    for (const head of (profile && profile.evidenceHeads) || []) {
      if (!head || !isNonEmptyString(head.path)) continue;
      if (seenPaths.has(head.path)) {
        reasons.push(reason(GOOGLE01_CODES.EVIDENCE_HEAD_SHARED, `evidence head ${head.path} shared by profiles ${seenPaths.get(head.path)} and ${profile.profileId}`));
      } else {
        seenPaths.set(head.path, profile.profileId);
      }
    }
  }

  // (b) discovery head reused as profile evidence (anti-inheritance law).
  for (const profile of profiles) {
    for (const head of (profile && profile.evidenceHeads) || []) {
      if (!head || !isNonEmptyString(head.path)) continue;
      if (discoveryPaths.has(head.path)) {
        reasons.push(reason(GOOGLE01_CODES.DISCOVERY_HEAD_AS_PROFILE_EVIDENCE, `profile ${profile.profileId} evidence head ${head.path} is a top-level discovery head, not profile evidence`));
      }
    }
  }

  for (const profile of profiles) {
    if (!profile) continue;

    // (c) preseeded DECLARED / NOT_PROVEN.
    if (profile.class === 'DECLARED' || profile.class === 'NOT_PROVEN') {
      const heads = profile.evidenceHeads || [];
      const rungs = (profile.ladder && profile.ladder.completedRungs) || [];
      if (heads.length > 0 || rungs.length > 0) {
        reasons.push(reason(GOOGLE01_CODES.LADDER_PRESEEDED, `profile ${profile.profileId} class ${profile.class} must start with empty ladder and no evidence heads`));
      }
    }

    // (d) cross-mode evidence head (checked per head against its profile).
    for (const head of profile.evidenceHeads || []) {
      if (!head) continue;
      if (head.editorMode !== undefined && head.editorMode !== profile.editorMode) {
        reasons.push(reason(GOOGLE01_CODES.CROSS_MODE_EVIDENCE, `profile ${profile.profileId} evidence head ${head.path} editorMode ${JSON.stringify(head.editorMode)} != profile editorMode ${JSON.stringify(profile.editorMode)}`));
      }
    }

    // (e) rung without evidence: each completed rung must be justified by at
    // least one evidence head of this same profile. A head justifies exactly
    // the rungs it names in its optional rungs field (else nothing).
    const rungsProven = new Set();
    for (const head of profile.evidenceHeads || []) {
      if (!head) continue;
      const named = Array.isArray(head.rungs) ? head.rungs : [];
      for (const r of named) rungsProven.add(r);
    }
    for (const rung of (profile.ladder && profile.ladder.completedRungs) || []) {
      if (!rungsProven.has(rung)) {
        reasons.push(reason(GOOGLE01_CODES.RUNG_WITHOUT_EVIDENCE, `profile ${profile.profileId} completedRung ${rung} has no justifying evidence head of this profile`));
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }
  return { ok: true, code: GOOGLE01_CODES.JOIN_OK, reasons: [reason(GOOGLE01_CODES.JOIN_OK, 'registry reconciliation passed')] };
}

export { stableJson };
