#!/usr/bin/env node
/*
 * LAB-01 — build-bound Word profile registry evaluator.
 *
 * This module is the Pass 2 (IMPLEMENTATION) artifact for the LAB-01 contract
 * test contour (test/contracts/rtk-lab01-build-bound-profiles.contract.test.js).
 * It is a pure, read-only evaluator: it never mutates a registry, never reads
 * the filesystem during evaluation, and never expands the product runtime. It
 * implements the Proof-Carrying Interop V2 §36 "no green carries between
 * profiles automatically" contract:
 *
 *   1. a machine-readable registry of build-bound profiles;
 *   2. a fail-closed evidence/profile join evaluator with typed codes;
 *   3. a per-profile migration-ladder admission gate;
 *   4. a registry-level reconciliation law.
 *
 * Authority model: EVIDENCE_NEVER_CREATES_AUTHORITY. The evaluator returns typed
 * reasons only; it is not a write path and grants no mutation authority. A
 * build-matching evidence join against a NOT_PROVEN/DECLARED profile stays
 * blocked (NOT_PROVEN_CLAIM). A historical build-bound profile is frozen and
 * rejects new evidence heads and new ladder rungs.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Schema constants.
// ---------------------------------------------------------------------------

export const WORD_BUILD_PROFILE_REGISTRY_SCHEMA = 'yalken.rtk.word-build-profile-registry.v1';

// PROFILE_CLASSES is the closed vocabulary of profile classes. The order is
// informational; membership is what the schema check enforces.
export const PROFILE_CLASSES = Object.freeze([
  'HISTORICAL_BUILD_BOUND',
  'COMPETING_NOT_SATURATED',
  'SATURATED',
  'NOT_PROVEN',
  'DECLARED',
]);

// LADDER_RUNGS is the ordered, ascending migration ladder. Admission is
// forward-only: a rung may be admitted only when every earlier rung is already
// in ladder.completedRungs. The ladder is frozen; adding a rung requires a new
// registry revision.
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
// Typed codes. Every string here is pinned by name in the LAB-01 contract test,
// so renaming a value changes the contract. New codes added in Pass 2 (join
// freshness, rung-without-evidence) are appended at the end.
// ---------------------------------------------------------------------------

export const LAB01_CODES = Object.freeze({
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
  // Pass 2 additions.
  JOIN_OK: 'RTK_LAB01_JOIN_OK',
  LADDER_ADMITTED: 'RTK_LAB01_LADDER_ADMITTED',
  EVIDENCE_STALE: 'RTK_LAB01_EVIDENCE_STALE',
  RUNG_WITHOUT_EVIDENCE: 'RTK_LAB01_RUNG_WITHOUT_EVIDENCE',
  // Pass 2b additions.
  BUILD_IDENTITY_MISSING: 'RTK_LAB01_BUILD_IDENTITY_MISSING',
  // LAB-02 additions (build migration 16.111.2 -> 16.111.3): the registry
  // current-profile pointer must resolve to a registered non-HISTORICAL
  // profile, and a DECLARED/NOT_PROVEN profile inherits no saturation state.
  CURRENT_POINTER_INVALID: 'RTK_LAB01_CURRENT_POINTER_INVALID',
  SATURATION_INHERITANCE: 'RTK_LAB01_SATURATION_INHERITANCE',
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

// ---------------------------------------------------------------------------
// loadBuildProfileRegistry
//
// Accepts either a filesystem path (string) or a parsed registry object. The
// check order is load-bearing and pinned by the contract:
//
//   1. parse (if path) + top-level structural sanity;
//   2. per-profile SCHEMA validation (mandatory fields, class vocabulary,
//      ladder rung vocabulary) -> REGISTRY_SCHEMA_INVALID;
//   3. per-profile DIGEST check (computeProfileDigest(profile without
//      profileDigest) === profile.profileDigest) -> PROFILE_DIGEST_MISMATCH.
//
// Schema is checked before digests because a structurally invalid profile has
// no meaningful digest contract. Returns { ok, code?, reasons?, registry?,
// profiles? }. On failure reasons is the typed list (firstCode is the verdict).
// ---------------------------------------------------------------------------

export function loadBuildProfileRegistry(input) {
  let registry;
  if (typeof input === 'string') {
    try {
      registry = JSON.parse(fs.readFileSync(input, 'utf8'));
    } catch (err) {
      return {
        ok: false,
        code: LAB01_CODES.REGISTRY_SCHEMA_INVALID,
        reasons: [reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `registry could not be read: ${err.message}`)],
      };
    }
  } else {
    registry = input;
  }

  const reasons = [];

  // Top-level structure.
  if (!isPlainObject(registry)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, 'registry root must be an object'));
    return { ok: false, code: LAB01_CODES.REGISTRY_SCHEMA_INVALID, reasons };
  }
  if (registry.schemaVersion !== WORD_BUILD_PROFILE_REGISTRY_SCHEMA) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `schemaVersion must equal ${WORD_BUILD_PROFILE_REGISTRY_SCHEMA}`));
  }
  if (!isNonEmptyString(registry.registryId)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, 'registryId must be a non-empty string'));
  }
  if (!Array.isArray(registry.profiles)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, 'profiles must be an array'));
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
      reasons.push(reason(LAB01_CODES.PROFILE_DIGEST_MISMATCH, `profile ${profile.profileId} missing profileDigest`));
      continue;
    }
    const recomputed = computeProfileDigest(profile);
    if (recomputed !== expected) {
      reasons.push(reason(LAB01_CODES.PROFILE_DIGEST_MISMATCH, `profile ${profile.profileId} profileDigest mismatch (expected ${expected}, recomputed ${recomputed})`));
    }
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  return { ok: true, code: LAB01_CODES.JOIN_OK, registry, profiles: registry.profiles };
}

function validateProfileSchema(profile, reasons) {
  const mandatory = ['profileId', 'class', 'platform', 'wordVersion', 'wordBuild', 'os', 'evidenceHeads', 'freshnessPolicy', 'ladder'];
  if (!isPlainObject(profile)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, 'profile must be an object'));
    return;
  }
  for (const field of mandatory) {
    if (!(field in profile) || profile[field] === undefined || profile[field] === null) {
      reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} missing mandatory field ${field}`));
    }
  }
  if (!PROFILE_CLASSES.includes(profile.class)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} has unknown class ${JSON.stringify(profile.class)}`));
  }
  if (!Array.isArray(profile.evidenceHeads)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} evidenceHeads must be an array`));
  }
  if (!isPlainObject(profile.ladder) || !Array.isArray(profile.ladder.completedRungs)) {
    reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} ladder.completedRungs must be an array`));
  } else {
    for (const rung of profile.ladder.completedRungs) {
      if (!LADDER_RUNGS.includes(rung)) {
        reasons.push(reason(LAB01_CODES.REGISTRY_SCHEMA_INVALID, `profile ${profile.profileId || '(unknown)'} completedRungs contains unknown rung ${JSON.stringify(rung)}`));
      }
    }
  }
}

function firstReasonCode(reasons) {
  if (Array.isArray(reasons) && reasons.length > 0) {
    return reasons[0].code || reasons[0];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// evaluateEvidenceProfileJoin
//
// Order is load-bearing and pinned by the contract. The first failing check
// wins and is returned as result.code.
//
//   PROFILE_UNKNOWN           -> profileId not in registry
//   CROSS_PROFILE_INHERITANCE -> evidence.profileId set and != requested
//   BUILD_IDENTITY_MISSING    -> evidence lacks a non-empty wordVersion or
//                                wordBuild (identity before any build compare)
//   CROSS_BUILD_EVIDENCE      -> evidence.wordBuild != profile.wordBuild
//                                OR evidence.wordVersion != profile.wordVersion
//   NOT_PROVEN_CLAIM          -> profile.class is NOT_PROVEN or DECLARED
//   HISTORICAL_PROFILE_MUTATION -> profile.class is HISTORICAL_BUILD_BOUND and
//                                  evidence.evidenceHeadPath is set and is not
//                                  one of the profile's frozen evidence heads
//   EVIDENCE_STALE            -> evidence.evidenceHeadPath matches a head that
//                                has sealedAtUtc, the profile has
//                                freshnessPolicy.maxEvidenceAgeDays, and
//                                nowUtc - sealedAtUtc exceeds that bound
//   ok=true                   -> JOIN_OK
// ---------------------------------------------------------------------------

export function evaluateEvidenceProfileJoin({ registry, profileId, evidence, nowUtc } = {}) {
  const profile = findProfile(registry, profileId);
  if (!profile) {
    return { ok: false, code: LAB01_CODES.PROFILE_UNKNOWN, reasons: [reason(LAB01_CODES.PROFILE_UNKNOWN, `profile ${profileId} not found in registry`)] };
  }
  const ev = evidence || {};

  if (ev.profileId !== undefined && ev.profileId !== profileId) {
    return { ok: false, code: LAB01_CODES.CROSS_PROFILE_INHERITANCE, reasons: [reason(LAB01_CODES.CROSS_PROFILE_INHERITANCE, `evidence.profileId ${ev.profileId} != requested profileId ${profileId}`)] };
  }

  // Identity before comparison: evidence without a non-empty build identity
  // cannot prove same-build, so it must fail closed rather than silently pass
  // the cross-build comparison.
  if (!isNonEmptyString(ev.wordVersion) || !isNonEmptyString(ev.wordBuild)) {
    return { ok: false, code: LAB01_CODES.BUILD_IDENTITY_MISSING, reasons: [reason(LAB01_CODES.BUILD_IDENTITY_MISSING, 'evidence must carry non-empty wordVersion and wordBuild before it can join any profile')] };
  }

  if ((ev.wordBuild !== undefined && ev.wordBuild !== profile.wordBuild) || (ev.wordVersion !== undefined && ev.wordVersion !== profile.wordVersion)) {
    return {
      ok: false,
      code: LAB01_CODES.CROSS_BUILD_EVIDENCE,
      reasons: [reason(LAB01_CODES.CROSS_BUILD_EVIDENCE, `evidence build ${JSON.stringify(ev.wordBuild)} / version ${JSON.stringify(ev.wordVersion)} != profile build ${JSON.stringify(profile.wordBuild)} / version ${JSON.stringify(profile.wordVersion)}`)],
    };
  }

  if (profile.class === 'NOT_PROVEN' || profile.class === 'DECLARED') {
    return { ok: false, code: LAB01_CODES.NOT_PROVEN_CLAIM, reasons: [reason(LAB01_CODES.NOT_PROVEN_CLAIM, `profile ${profileId} class ${profile.class} cannot accept evidence`)] };
  }

  if (profile.class === 'HISTORICAL_BUILD_BOUND') {
    if (isNonEmptyString(ev.evidenceHeadPath)) {
      const frozenPaths = (profile.evidenceHeads || []).map((h) => h && h.path).filter(isNonEmptyString);
      if (!frozenPaths.includes(ev.evidenceHeadPath)) {
        return { ok: false, code: LAB01_CODES.HISTORICAL_PROFILE_MUTATION, reasons: [reason(LAB01_CODES.HISTORICAL_PROFILE_MUTATION, `evidence head ${ev.evidenceHeadPath} is not in the frozen historical profile ${profileId} evidence head list`)] };
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
        return { ok: false, code: LAB01_CODES.EVIDENCE_STALE, reasons: [reason(LAB01_CODES.EVIDENCE_STALE, `evidence head ${ev.evidenceHeadPath} age ${ageDays.toFixed(2)} days exceeds maxEvidenceAgeDays ${maxAgeDays}`)] };
      }
    }
  }

  return { ok: true, code: LAB01_CODES.JOIN_OK, reasons: [reason(LAB01_CODES.JOIN_OK, `evidence joined profile ${profileId}`)] };
}

// ---------------------------------------------------------------------------
// evaluateLadderAdmission
//
// Forward-only admission over LADDER_RUNGS. A rung may be admitted only when
// every rung that comes BEFORE it in LADDER_RUNGS is already present in
// ladder.completedRungs. Re-admitting an already-completed rung is ok=true
// (idempotent read). A historical frozen profile rejects all admission.
//
//   PROFILE_UNKNOWN            -> profileId not in registry
//   LADDER_RUNG_UNKNOWN        -> rung not in LADDER_RUNGS
//   HISTORICAL_PROFILE_MUTATION -> profile.class HISTORICAL_BUILD_BOUND
//   LADDER_BYPASS              -> an earlier rung is missing
//   ok=true                    -> LADDER_ADMITTED
// ---------------------------------------------------------------------------

export function evaluateLadderAdmission({ registry, profileId, rung } = {}) {
  const profile = findProfile(registry, profileId);
  if (!profile) {
    return { ok: false, code: LAB01_CODES.PROFILE_UNKNOWN, reasons: [reason(LAB01_CODES.PROFILE_UNKNOWN, `profile ${profileId} not found in registry`)] };
  }
  if (!LADDER_RUNGS.includes(rung)) {
    return { ok: false, code: LAB01_CODES.LADDER_RUNG_UNKNOWN, reasons: [reason(LAB01_CODES.LADDER_RUNG_UNKNOWN, `rung ${JSON.stringify(rung)} is not a known ladder rung`)] };
  }
  if (profile.class === 'HISTORICAL_BUILD_BOUND') {
    return { ok: false, code: LAB01_CODES.HISTORICAL_PROFILE_MUTATION, reasons: [reason(LAB01_CODES.HISTORICAL_PROFILE_MUTATION, `historical frozen profile ${profileId} admits no new ladder rungs`)] };
  }

  const completed = new Set((profile.ladder && Array.isArray(profile.ladder.completedRungs)) ? profile.ladder.completedRungs : []);
  const requestedIndex = LADDER_RUNGS.indexOf(rung);
  for (let i = 0; i < requestedIndex; i += 1) {
    if (!completed.has(LADDER_RUNGS[i])) {
      return { ok: false, code: LAB01_CODES.LADDER_BYPASS, reasons: [reason(LAB01_CODES.LADDER_BYPASS, `rung ${rung} requested but earlier rung ${LADDER_RUNGS[i]} is not completed`)] };
    }
  }

  return { ok: true, code: LAB01_CODES.LADDER_ADMITTED, reasons: [reason(LAB01_CODES.LADDER_ADMITTED, `rung ${rung} admitted for profile ${profileId}`)] };
}

// ---------------------------------------------------------------------------
// evaluateRegistryReconciliation
//
// Collects all reasons across the registry; ok=false if any. Order is stable:
// profiles are scanned in registry order, and within each profile the laws are
// applied in the documented order. firstCode is the first reason found.
//
//   EVIDENCE_HEAD_SHARED  -> one evidence head path referenced by two profiles
//   LADDER_PRESEEDED      -> DECLARED or NOT_PROVEN profile with non-empty
//                            completedRungs or evidenceHeads
//   RUNG_WITHOUT_EVIDENCE -> a completedRung is not justified by any evidence
//                            head of the SAME profile (head.rungs, if present,
//                            names the rungs it proves; otherwise the head
//                            justifies nothing by default)
//   CROSS_BUILD_EVIDENCE  -> evidence head wordBuild/wordVersion != profile's
// ---------------------------------------------------------------------------

// Default mapping used when an evidence head omits an explicit rungs field. The
// real registry stamps rungs explicitly on every head, so this default is only
// a defensive fallback for hand-built fixtures; the reconciliation law never
// silently invents justification from a wave recipe name.
const DEFAULT_HEAD_RUNGS = new Map();

export function evaluateRegistryReconciliation(registry) {
  const reasons = [];
  const profiles = (registry && Array.isArray(registry.profiles)) ? registry.profiles : [];

  // (a) shared evidence head across profiles.
  const seenPaths = new Map();
  for (const profile of profiles) {
    for (const head of (profile && profile.evidenceHeads) || []) {
      if (!head || !isNonEmptyString(head.path)) continue;
      if (seenPaths.has(head.path)) {
        reasons.push(reason(LAB01_CODES.EVIDENCE_HEAD_SHARED, `evidence head ${head.path} shared by profiles ${seenPaths.get(head.path)} and ${profile.profileId}`));
      } else {
        seenPaths.set(head.path, profile.profileId);
      }
    }
  }

  for (const profile of profiles) {
    if (!profile) continue;

    // (b) preseeded DECLARED / NOT_PROVEN.
    if (profile.class === 'DECLARED' || profile.class === 'NOT_PROVEN') {
      const heads = profile.evidenceHeads || [];
      const rungs = (profile.ladder && profile.ladder.completedRungs) || [];
      if (heads.length > 0 || rungs.length > 0) {
        reasons.push(reason(LAB01_CODES.LADDER_PRESEEDED, `profile ${profile.profileId} class ${profile.class} must start with empty ladder and no evidence heads`));
      }
    }

    // (d) cross-build evidence head (checked per head against its profile).
    for (const head of profile.evidenceHeads || []) {
      if (!head) continue;
      if ((head.wordBuild !== undefined && head.wordBuild !== profile.wordBuild) || (head.wordVersion !== undefined && head.wordVersion !== profile.wordVersion)) {
        reasons.push(reason(LAB01_CODES.CROSS_BUILD_EVIDENCE, `profile ${profile.profileId} evidence head ${head.path} build ${JSON.stringify(head.wordBuild)} / version ${JSON.stringify(head.wordVersion)} != profile build ${JSON.stringify(profile.wordBuild)} / version ${JSON.stringify(profile.wordVersion)}`));
      }
    }

    // (c) rung without evidence: each completed rung must be justified by at
    // least one evidence head of this same profile. A head justifies exactly
    // the rungs it names in its optional rungs field (else the DEFAULT mapping,
    // else nothing).
    const rungsProven = new Set();
    for (const head of profile.evidenceHeads || []) {
      if (!head) continue;
      const named = Array.isArray(head.rungs) ? head.rungs : (DEFAULT_HEAD_RUNGS.get(head.path) || []);
      for (const r of named) rungsProven.add(r);
    }
    for (const rung of (profile.ladder && profile.ladder.completedRungs) || []) {
      if (!rungsProven.has(rung)) {
        reasons.push(reason(LAB01_CODES.RUNG_WITHOUT_EVIDENCE, `profile ${profile.profileId} completedRung ${rung} has no justifying evidence head of this profile`));
      }
    }

    // (f) LAB-02: saturation inheritance — a DECLARED or NOT_PROVEN profile
    // must not carry saturation state fields. A new build starts with no
    // saturation claim; saturation is earned only inside its own ladder.
    if (profile.class === 'DECLARED' || profile.class === 'NOT_PROVEN') {
      if (profile.saturationStatus !== undefined || profile.saturated !== undefined || profile.saturationNote !== undefined) {
        reasons.push(reason(LAB01_CODES.SATURATION_INHERITANCE, `profile ${profile.profileId} class ${profile.class} must not carry saturation fields (saturationStatus/saturated/saturationNote)`));
      }
    }
  }

  // (e) LAB-02: current-profile pointer. The registry must name exactly one
  // registered profile as current, and the pointer must never aim at a
  // HISTORICAL_BUILD_BOUND profile (a frozen build cannot be the current
  // target of new evidence).
  const pointer = registry.currentProfileId;
  const pointed = isNonEmptyString(pointer)
    ? profiles.find((p) => p && p.profileId === pointer) || null
    : null;
  if (!pointed) {
    reasons.push(reason(LAB01_CODES.CURRENT_POINTER_INVALID, `registry currentProfileId ${JSON.stringify(pointer)} does not resolve to a registered profile`));
  } else if (pointed.class === 'HISTORICAL_BUILD_BOUND') {
    reasons.push(reason(LAB01_CODES.CURRENT_POINTER_INVALID, `registry currentProfileId ${pointer} aims at HISTORICAL_BUILD_BOUND profile`));
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }
  return { ok: true, code: LAB01_CODES.JOIN_OK, reasons: [reason(LAB01_CODES.JOIN_OK, 'registry reconciliation passed')] };
}

export { stableJson };
