'use strict';

const crypto = require('node:crypto');

const WRITER_REFINEMENT_VERDICT_SCHEMA_VERSION = 'writer-refinement-verdict.v1';
const WRITER_DNA_OBSERVATION_SCHEMA_VERSION = 'writer-dna-observation.v1';
const WRITER_PROFILE_ID = 'WRITER_CORE';
const PROFILE_CLAIM_CEILING = 'PROFILE_VERDICT_ONLY';
const WRITER_PROFILE_VERDICT = 'WRITER_CORE_RUNTIME_REFINEMENT_BOUND_BY_F0_DNA_AND_SAFE_DENY';
const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
const REQUIRED_EVIDENCE_CLASS = 'RUNTIME_DNA_OBSERVATION';

const OPTIONAL_PROFILES = Object.freeze([
  'ATLAS_MAPS_DERIVED',
  'WORD_ROUNDTRIP',
  'PACKAGED_RELEASE_SECURITY',
]);

const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_RELEASE_READINESS',
  'NO_VISUAL_READINESS',
  'NO_PHYSICAL_MACOS_QUALIFICATION',
  'NO_OPTIONAL_PROFILE_VERDICT',
  'NO_ENTITLEMENT_ENABLEMENT',
]);

const REQUIRED_DNA_ROWS = Object.freeze([
  Object.freeze({
    rowId: 'DNA_CALM_DEFAULT_IS_BASELINE_WRITE',
    dimension: 'calm',
  }),
  Object.freeze({
    rowId: 'DNA_DISCLOSURE_REQUIRES_EXPLICIT_ADVANCED_OPEN',
    dimension: 'disclosure',
  }),
  Object.freeze({
    rowId: 'DNA_CONTINUITY_BLOCKS_UNSAVED_LIFECYCLE',
    dimension: 'continuity',
  }),
  Object.freeze({
    rowId: 'DNA_CUSTOMIZATION_CANNOT_HIDE_CORE_COMMANDS',
    dimension: 'customization',
  }),
  Object.freeze({
    rowId: 'DNA_OPTIONAL_OFF_PRESERVES_FREE_AUTHORSHIP',
    dimension: 'optional-off',
  }),
  Object.freeze({
    rowId: 'DNA_NO_BLOAT_HAS_ONLY_APPROVED_PRODUCT_DEPENDENCIES',
    dimension: 'no-bloat',
  }),
]);

const REQUIRED_ROW_BY_ID = new Map(REQUIRED_DNA_ROWS.map((row) => [row.rowId, row]));
const HEX40_RE = /^[a-f0-9]{40}$/u;
const HEX64_RE = /^[a-f0-9]{64}$/u;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value) {
  return normalizeString(value).toUpperCase();
}

function stableNormalize(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map((entry) => stableNormalize(entry));
  if (!value || typeof value !== 'object') return String(value);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableNormalize(value[key]);
  return out;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableNormalize(value))).digest('hex');
}

function fail(code, detail, context = {}) {
  return Object.freeze({
    ok: false,
    schemaVersion: WRITER_REFINEMENT_VERDICT_SCHEMA_VERSION,
    verdict: 'FAIL',
    code,
    detail,
    context: Object.freeze({ ...context }),
  });
}

function normalizeIdentity(identity = {}) {
  const source = identity && typeof identity === 'object' && !Array.isArray(identity) ? identity : {};
  const out = {
    headSha: normalizeString(source.headSha) || null,
    treeSha: normalizeString(source.treeSha) || null,
    source: normalizeString(source.source) || 'CALLER_BOUND',
  };
  for (const key of ['headSha', 'treeSha']) {
    if (out[key] !== null && !HEX40_RE.test(out[key])) {
      return fail('E_R24_WP207_EXACT_IDENTITY_SHAPE', key, { key, value: out[key] });
    }
  }
  return { ok: true, value: Object.freeze(out) };
}

function validateClaimRequest(claimRequest = {}) {
  const request = claimRequest && typeof claimRequest === 'object' && !Array.isArray(claimRequest) ? claimRequest : {};
  if (request.programVerdict === 'PASS' || request.globalScalarPass === true) {
    return fail('E_R24_WP207_PROGRAM_SCALAR_PASS_FORBIDDEN', 'Writer V0 runtime refinement cannot promote program PASS');
  }
  if (request.claimCeiling && request.claimCeiling !== PROFILE_CLAIM_CEILING) {
    return fail('E_R24_WP207_OVERCLAIM', String(request.claimCeiling));
  }
  const profiles = Array.isArray(request.profiles) ? request.profiles.map(normalizeString).filter(Boolean) : [];
  const optionalProfiles = profiles.filter((profile) => OPTIONAL_PROFILES.includes(profile));
  if (optionalProfiles.length > 0) return fail('E_R24_WP207_OPTIONAL_PROFILE_IMPORTED', optionalProfiles.join(','), { optionalProfiles });
  return { ok: true };
}

function createWriterDnaObservation(input = {}) {
  const rowId = normalizeString(input.rowId || input.id);
  const spec = REQUIRED_ROW_BY_ID.get(rowId);
  if (!spec) throw new Error(`E_R24_WP207_DNA_ROW_UNKNOWN:${rowId}`);
  const status = normalizeStatus(input.status || 'PASS');
  const source = normalizeString(input.source) || 'CALLER_OBSERVED';
  const observed = stableNormalize(input.observed || {});
  const row = {
    schemaVersion: WRITER_DNA_OBSERVATION_SCHEMA_VERSION,
    rowId,
    dimension: spec.dimension,
    status,
    evidenceClass: normalizeString(input.evidenceClass) || REQUIRED_EVIDENCE_CLASS,
    source,
    observed,
  };
  return Object.freeze({
    ...row,
    digest: digest(row),
  });
}

function normalizeObservation(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, code: 'E_R24_WP207_DNA_ROW_SHAPE', detail: 'row must be an object' };
  }
  const rowId = normalizeString(row.rowId || row.id);
  const status = normalizeStatus(row.status);
  const observed = stableNormalize(row.observed || {});
  return {
    ok: true,
    value: {
      schemaVersion: normalizeString(row.schemaVersion),
      rowId,
      dimension: normalizeString(row.dimension),
      status,
      evidenceClass: normalizeString(row.evidenceClass),
      source: normalizeString(row.source),
      observed,
      digest: normalizeString(row.digest),
      skipped: row.skipped === true || Number(row.counts?.skipped || 0) > 0,
    },
  };
}

function compileWriterV0RuntimeVerdict(input = {}) {
  const claimCheck = validateClaimRequest(input.claimRequest);
  if (!claimCheck.ok) return claimCheck;
  const identity = normalizeIdentity(input.exactIdentity || input.runtimeIdentity);
  if (!identity.ok) return identity;

  const observedRows = Array.isArray(input.observedRows) ? input.observedRows : input.observations;
  if (!Array.isArray(observedRows)) return fail('E_R24_WP207_DNA_OBSERVATIONS_REQUIRED', 'observedRows must be an array');
  if (observedRows.length === 0) return fail('E_R24_WP207_ZERO_DENOMINATOR', 'zero DNA observation denominator');

  const byId = new Map();
  for (const rawRow of observedRows) {
    const normalized = normalizeObservation(rawRow);
    if (!normalized.ok) return fail(normalized.code, normalized.detail);
    const row = normalized.value;
    const spec = REQUIRED_ROW_BY_ID.get(row.rowId);
    if (row.schemaVersion !== WRITER_DNA_OBSERVATION_SCHEMA_VERSION) {
      return fail('E_R24_WP207_DNA_ROW_SCHEMA_VERSION', row.rowId, { rowId: row.rowId, schemaVersion: row.schemaVersion });
    }
    if (!spec) return fail('E_R24_WP207_DNA_ROW_UNKNOWN', row.rowId, { rowId: row.rowId });
    if (byId.has(row.rowId)) return fail('E_R24_WP207_DNA_ROW_DUPLICATE', row.rowId, { rowId: row.rowId });
    if (row.dimension !== spec.dimension) {
      return fail('E_R24_WP207_DNA_DIMENSION_MISMATCH', row.rowId, { expected: spec.dimension, actual: row.dimension });
    }
    if (row.status !== 'PASS') return fail('E_R24_WP207_DNA_ROW_NOT_PASS', row.rowId, { rowId: row.rowId, status: row.status });
    if (row.evidenceClass !== REQUIRED_EVIDENCE_CLASS) {
      return fail('E_R24_WP207_DNA_EVIDENCE_CLASS', row.rowId, { rowId: row.rowId, evidenceClass: row.evidenceClass });
    }
    if (row.skipped) return fail('E_R24_WP207_DNA_ROW_SKIPPED', row.rowId, { rowId: row.rowId });
    if (!HEX64_RE.test(row.digest)) return fail('E_R24_WP207_DNA_ROW_DIGEST_SHAPE', row.rowId, { rowId: row.rowId, digest: row.digest });
    const expectedDigest = digest({
      schemaVersion: row.schemaVersion,
      rowId: row.rowId,
      dimension: row.dimension,
      status: row.status,
      evidenceClass: row.evidenceClass,
      source: row.source,
      observed: row.observed,
    });
    if (row.digest !== expectedDigest) {
      return fail('E_R24_WP207_DNA_ROW_DIGEST_MISMATCH', row.rowId, { rowId: row.rowId, expectedDigest, actualDigest: row.digest });
    }
    byId.set(row.rowId, row);
  }

  const missing = REQUIRED_DNA_ROWS.map((row) => row.rowId).filter((rowId) => !byId.has(rowId));
  if (missing.length > 0) return fail('E_R24_WP207_DNA_ROW_MISSING', missing.join(','), { missing });

  const orderedRows = REQUIRED_DNA_ROWS.map((row) => byId.get(row.rowId));
  return Object.freeze({
    ok: true,
    schemaVersion: WRITER_REFINEMENT_VERDICT_SCHEMA_VERSION,
    verdict: 'PASS',
    code: 'R24_WP207_WRITER_V0_RUNTIME_VERDICT_COMPILED',
    exactIdentity: identity.value,
    selectedProfiles: Object.freeze(['SHARED_ASSURANCE', WRITER_PROFILE_ID]),
    profileVerdict: Object.freeze({
      profileId: WRITER_PROFILE_ID,
      verdict: WRITER_PROFILE_VERDICT,
      claimCeiling: PROFILE_CLAIM_CEILING,
      requiredEvidenceClass: REQUIRED_EVIDENCE_CLASS,
      requiredDnaRowCount: REQUIRED_DNA_ROWS.length,
      closedDnaRowCount: orderedRows.length,
      requiredDnaRows: Object.freeze(REQUIRED_DNA_ROWS.map((row) => row.rowId)),
      requiredDnaDimensions: Object.freeze(REQUIRED_DNA_ROWS.map((row) => row.dimension)),
      observationDigest: digest(orderedRows),
    }),
    programVerdict: PROGRAM_VERDICT,
    globalScalarPassForbidden: true,
    optionalProfilesExcluded: Object.freeze([...OPTIONAL_PROFILES]),
    materiality: Object.freeze(['INVARIANT_NEWLY_ENFORCED', 'NAMED_GATE_CLOSED']),
    nonClaims: Object.freeze([...NON_CLAIMS]),
  });
}

module.exports = Object.freeze({
  WRITER_REFINEMENT_VERDICT_SCHEMA_VERSION,
  WRITER_DNA_OBSERVATION_SCHEMA_VERSION,
  WRITER_PROFILE_ID,
  PROFILE_CLAIM_CEILING,
  WRITER_PROFILE_VERDICT,
  PROGRAM_VERDICT,
  REQUIRED_EVIDENCE_CLASS,
  OPTIONAL_PROFILES,
  NON_CLAIMS,
  REQUIRED_DNA_ROWS,
  createWriterDnaObservation,
  compileWriterV0RuntimeVerdict,
});
