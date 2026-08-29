#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';

export const FIXED_BINDINGS = Object.freeze({
  ownerAuthorityBindingDigest: 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6',
  programTemplateDigest: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  stageAdmissionVerifierContractDigest: '925b4c23f1cad674720ee6a22fcd74cc2169b16bbc161be5d43535f20dd2ee31',
  stageAdmissionVerifierDigest: '82e49d577b79b41b26b67e25b7ce0fd81f26fb973232194fef8d96d6c563c6f9',
  stageRegistryDigest: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
  trustModelDigest: '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d',
});

export const REGISTERED_G0_FIELDS = Object.freeze([
  'canonicalRepo',
  'activeWorktree',
  'originUrl',
  'headSha',
  'treeSha',
  'baseSha',
  'activeCanonPath',
  'activeCanonDigest',
  'corexDigest',
  'bibleDigest',
  'missionDigest',
  'graphDigest',
  'liveCiBindingDigest',
  'cleanWorktree',
  'singleWriterLease',
]);

export const AUDIT_R1_EVIDENCE_STAMP_IDS = Object.freeze([
  'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS',
]);

const REPO_PATH_PREFIXES = Object.freeze([
  '.github/',
  'docs/',
  'scripts/',
  'src/',
  'test/',
]);
const REPO_ROOT_FILES = new Set(['AGENTS.md', 'CANON.md', 'LICENSE', 'README.md', 'package-lock.json', 'package.json']);
const APPROVED_URL_HOSTS = new Set(['github.com', 'api.github.com']);
const SINGLE_WRITER_LEASE_FIELDS = Object.freeze([
  'activeAdmissionAmendment',
  'fenceDigest',
  'fencingCounter',
  'leaseDigest',
  'oneWriter',
  'predecessorReleaseDigest',
  'originalStageAdmissionDigest',
  'originalStageInstanceDigest',
  'status',
  'wip',
  'originalWriteSetDigest',
]);

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

export function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

export function assertHex(value, length, field) {
  assert(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value), 'E_IDENTITY_INVALID', field);
}

export function assertClosedObject(value, allowedKeys, requiredKeys, field) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'E_SCHEMA_TYPE', field);
  const actual = Object.keys(value).sort();
  const allowed = new Set(allowedKeys);
  for (const key of actual) assert(allowed.has(key), 'E_SCHEMA_UNKNOWN_FIELD', `${field}.${key}`);
  for (const key of requiredKeys) assert(Object.hasOwn(value, key), 'E_SCHEMA_MISSING_FIELD', `${field}.${key}`);
}

export function assertExactJson(actual, expected, code, field) {
  assert(canonicalize(actual) === canonicalize(expected), code, field);
}

export function assertUniqueStrings(values, field) {
  assert(Array.isArray(values), 'E_SCHEMA_TYPE', field);
  const seen = new Set();
  for (const value of values) {
    assert(typeof value === 'string' && value.length > 0 && value === value.normalize('NFC'), 'E_SCHEMA_TYPE', field);
    assert(!seen.has(value), 'E_DUPLICATE_VALUE', `${field}:${value}`);
    seen.add(value);
  }
}

export function normalizeRepoPath(candidate) {
  assert(typeof candidate === 'string' && candidate.length > 0, 'E_PATH_INVALID', 'empty');
  assert(candidate === candidate.normalize('NFC'), 'E_PATH_NOT_NFC', candidate);
  assert(!candidate.includes('\\') && !candidate.includes('\0'), 'E_PATH_INVALID', candidate);
  assert(!path.posix.isAbsolute(candidate), 'E_PATH_ABSOLUTE', candidate);
  assert(!/^[A-Za-z]:/u.test(candidate), 'E_PATH_DRIVE_LETTER', candidate);
  const normalized = path.posix.normalize(candidate);
  assert(normalized === candidate && candidate !== '.' && !candidate.startsWith('../'), 'E_PATH_NOT_NORMALIZED', candidate);
  assert(!candidate.split('/').some((part) => part === '' || part === '.' || part === '..'), 'E_PATH_ESCAPE', candidate);
  return candidate;
}

export function assertPublicLocator(candidate) {
  assert(typeof candidate === 'string' && candidate.length > 0, 'E_PUBLIC_LOCATOR_INVALID', 'empty');
  assert(!candidate.startsWith('file:'), 'E_PUBLIC_LOCATOR_FILE_URL', candidate);
  assert(!candidate.startsWith('\\\\') && !candidate.startsWith('//'), 'E_PUBLIC_LOCATOR_UNC', candidate);
  assert(!path.posix.isAbsolute(candidate), 'E_PUBLIC_LOCATOR_ABSOLUTE', candidate);
  assert(!/^[A-Za-z]:[\\/]/u.test(candidate), 'E_PUBLIC_LOCATOR_DRIVE', candidate);
  if (/^https:\/\//u.test(candidate)) {
    let parsed;
    try { parsed = new URL(candidate); } catch { fail('E_PUBLIC_LOCATOR_URL', candidate); }
    assert(parsed.protocol === 'https:' && APPROVED_URL_HOSTS.has(parsed.hostname) && !parsed.username && !parsed.password, 'E_PUBLIC_LOCATOR_URL', candidate);
    return candidate;
  }
  normalizeRepoPath(candidate);
  assert(REPO_ROOT_FILES.has(candidate) || REPO_PATH_PREFIXES.some((prefix) => candidate.startsWith(prefix)), 'E_PUBLIC_LOCATOR_NOT_ALLOWLISTED', candidate);
  return candidate;
}

function git(rootDir, args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function digestFile(rootDir, relativePath) {
  assertPublicLocator(relativePath);
  return sha256(readFileSync(path.join(rootDir, relativePath)));
}

function validateSingleWriterLease(lease, expected = undefined) {
  assertClosedObject(lease, SINGLE_WRITER_LEASE_FIELDS, SINGLE_WRITER_LEASE_FIELDS, 'singleWriterLease');
  assertClosedObject(lease.activeAdmissionAmendment, ['authority', 'legacyAdmissionDigest', 'stageAdmissionDigest', 'stageInstanceDigest', 'status', 'writeSetDigest'], ['authority', 'legacyAdmissionDigest', 'stageAdmissionDigest', 'stageInstanceDigest', 'status', 'writeSetDigest'], 'singleWriterLease.activeAdmissionAmendment');
  assert(lease.status === 'ACTIVE' && lease.oneWriter === true && lease.wip === 1, 'E_G0_SINGLE_WRITER', 'lease');
  assert(lease.activeAdmissionAmendment.authority === 'AUDIT_ROUND_1_CORRECTION_BRIEF_AND_FIXED_SUCCESSOR_ADMISSION' && lease.activeAdmissionAmendment.status === 'ADMITTED_WITHIN_ACTIVE_ONE_WRITER_LEASE', 'E_G0_LEASE_AMENDMENT', 'status/authority');
  assert(Number.isInteger(lease.fencingCounter) && lease.fencingCounter > 0, 'E_G0_FENCING_COUNTER', lease.fencingCounter);
  for (const field of ['fenceDigest', 'leaseDigest', 'predecessorReleaseDigest', 'originalStageAdmissionDigest', 'originalStageInstanceDigest', 'originalWriteSetDigest']) assertHex(lease[field], 64, `singleWriterLease.${field}`);
  for (const field of ['legacyAdmissionDigest', 'stageAdmissionDigest', 'stageInstanceDigest', 'writeSetDigest']) assertHex(lease.activeAdmissionAmendment[field], 64, `singleWriterLease.activeAdmissionAmendment.${field}`);
  if (expected) {
    for (const field of ['stageAdmissionDigest', 'stageInstanceDigest', 'writeSetDigest']) assert(lease.activeAdmissionAmendment[field] === expected[field], 'E_G0_LEASE_BINDING', field);
  }
  return true;
}

function repositorySlugFromOrigin(originUrl) {
  const match = originUrl.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u);
  assert(match, 'E_G0_ORIGIN_URL', originUrl);
  return match[1];
}

function resolveActiveCorexPath(rootDir) {
  const resolver = readFileSync(path.join(rootDir, 'docs/corex/COREX.md'), 'utf8');
  const matches = [...resolver.matchAll(/ACTIVE_COREX:\s*`([^`]+)`/gu)].map((match) => match[1]);
  assert(matches.length === 1, 'E_G0_COREX_RESOLVER', matches.length);
  assertPublicLocator(matches[0]);
  return matches[0];
}

export function collectRepositoryG0DigestBindings(rootDir, liveCiBindingDigest) {
  assertHex(liveCiBindingDigest, 64, 'liveCiBindingDigest');
  const canonStatus = JSON.parse(readFileSync(path.join(rootDir, 'docs/OPS/STATUS/CANON_STATUS.json'), 'utf8'));
  const activeCanonPath = canonStatus.canonicalDocPath;
  assertPublicLocator(activeCanonPath);
  return {
    activeCanonDigest: digestFile(rootDir, activeCanonPath),
    activeCanonPath,
    bibleDigest: digestFile(rootDir, 'docs/BIBLE.md'),
    corexDigest: digestFile(rootDir, resolveActiveCorexPath(rootDir)),
    graphDigest: digestFile(rootDir, 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json'),
    liveCiBindingDigest,
    missionDigest: digestFile(rootDir, 'CANON.md'),
  };
}

export function collectFreshG0Evidence(rootDir, bindings) {
  const headSha = git(rootDir, ['rev-parse', 'HEAD']);
  const treeSha = git(rootDir, ['rev-parse', 'HEAD^{tree}']);
  const baseSha = git(rootDir, ['merge-base', 'HEAD', 'origin/main']);
  const topLevel = git(rootDir, ['rev-parse', '--show-toplevel']);
  const originUrl = git(rootDir, ['remote', 'get-url', 'origin']);
  assert(originUrl === bindings.originUrl, 'E_G0_ORIGIN_URL', originUrl);
  const canonicalRepo = repositorySlugFromOrigin(originUrl);
  assert(canonicalRepo === bindings.canonicalRepo, 'E_G0_REPOSITORY_IDENTITY', canonicalRepo);
  assert(headSha === bindings.headSha && treeSha === bindings.treeSha && baseSha === bindings.baseSha, 'E_G0_GIT_IDENTITY', `${headSha}/${treeSha}/${baseSha}`);
  assert(git(rootDir, ['status', '--porcelain=v1', '--untracked-files=all']) === '', 'E_G0_DIRTY_WORKTREE', topLevel);
  validateSingleWriterLease(bindings.singleWriterLease, bindings.expectedLeaseBindings);
  const repositoryBindings = collectRepositoryG0DigestBindings(rootDir, bindings.liveCiBindingDigest);
  const evidence = {
    ...repositoryBindings,
    activeWorktree: {
      classification: 'EPHEMERAL_OR_REGISTERED_GIT_WORKTREE',
      observedPathDigest: sha256(Buffer.from(`${topLevel}\n`, 'utf8')),
    },
    baseSha,
    canonicalRepo,
    cleanWorktree: true,
    headSha,
    originUrl,
    singleWriterLease: bindings.singleWriterLease,
    treeSha,
  };
  assertExactJson(Object.keys(evidence).sort(), [...REGISTERED_G0_FIELDS].sort(), 'E_G0_FIELD_SET', 'g0');
  return {
    schemaVersion: 'AUDIT_R1_G0_EVIDENCE_V1',
    source: 'FRESH_INDEPENDENT_GIT_AND_REPOSITORY_OBSERVATION',
    status: 'VERIFIED_CURRENT',
    observedAtUtc: bindings.observedAtUtc,
    evidence,
  };
}

export function validateFreshG0(g0, expected) {
  assertClosedObject(g0, ['schemaVersion', 'source', 'status', 'observedAtUtc', 'evidence'], ['schemaVersion', 'source', 'status', 'observedAtUtc', 'evidence'], 'g0');
  assert(g0.schemaVersion === 'AUDIT_R1_G0_EVIDENCE_V1' && g0.source === 'FRESH_INDEPENDENT_GIT_AND_REPOSITORY_OBSERVATION', 'E_G0_SCHEMA', g0.schemaVersion);
  assert(g0.status === 'VERIFIED_CURRENT', 'E_G0_STATUS', g0.status);
  assert(typeof g0.observedAtUtc === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(g0.observedAtUtc) && Number.isFinite(Date.parse(g0.observedAtUtc)), 'E_G0_OBSERVED_AT', g0.observedAtUtc);
  assertClosedObject(g0.evidence, REGISTERED_G0_FIELDS, REGISTERED_G0_FIELDS, 'g0.evidence');
  for (const field of ['headSha', 'treeSha', 'baseSha']) assertHex(g0.evidence[field], 40, `g0.evidence.${field}`);
  for (const field of ['activeCanonDigest', 'corexDigest', 'bibleDigest', 'missionDigest', 'graphDigest', 'liveCiBindingDigest']) assertHex(g0.evidence[field], 64, `g0.evidence.${field}`);
  assertPublicLocator(g0.evidence.activeCanonPath);
  const normalizeOrigin = (value) => value.endsWith('.git') ? value.slice(0, -4) : value;
  assert(normalizeOrigin(g0.evidence.originUrl) === normalizeOrigin(expected.originUrl) && g0.evidence.canonicalRepo === expected.canonicalRepo, 'E_G0_REPOSITORY_IDENTITY', g0.evidence.canonicalRepo);
  assert(g0.evidence.headSha === expected.headSha && g0.evidence.treeSha === expected.treeSha && g0.evidence.baseSha === expected.baseSha, 'E_G0_GIT_IDENTITY', 'expected');
  for (const field of ['activeCanonPath', 'activeCanonDigest', 'corexDigest', 'bibleDigest', 'missionDigest', 'graphDigest', 'liveCiBindingDigest']) {
    if (Object.hasOwn(expected, field)) assert(g0.evidence[field] === expected[field], 'E_G0_REPOSITORY_DIGEST', field);
  }
  assert(g0.evidence.cleanWorktree === true, 'E_G0_DIRTY_WORKTREE', 'false');
  validateSingleWriterLease(g0.evidence.singleWriterLease, expected.expectedLeaseBindings);
  assertClosedObject(g0.evidence.activeWorktree, ['classification', 'observedPathDigest'], ['classification', 'observedPathDigest'], 'g0.evidence.activeWorktree');
  assert(g0.evidence.activeWorktree.classification === 'EPHEMERAL_OR_REGISTERED_GIT_WORKTREE', 'E_G0_ACTIVE_WORKTREE', 'classification');
  assertHex(g0.evidence.activeWorktree?.observedPathDigest, 64, 'g0.evidence.activeWorktree.observedPathDigest');
  return true;
}

export function validateAcceptanceRequirements(requirements) {
  assertClosedObject(
    requirements,
    ['correctionId', 'evidenceStampIds', 'programTemplateDigest', 'requiredOutcomes', 'schemaVersion', 'stageRegistryDigest'],
    ['correctionId', 'evidenceStampIds', 'programTemplateDigest', 'requiredOutcomes', 'schemaVersion', 'stageRegistryDigest'],
    'requirements',
  );
  assert(requirements.schemaVersion === 'AUDIT_R1_ACCEPTANCE_REQUIREMENTS_V1', 'E_ACCEPTANCE_REQUIREMENTS_SCHEMA', requirements.schemaVersion);
  assert(requirements.correctionId === 'YALKEN_R24_AUDIT_ROUND_1_CORRECTIONS_V1', 'E_ACCEPTANCE_CORRECTION_ID', requirements.correctionId);
  assert(requirements.programTemplateDigest === FIXED_BINDINGS.programTemplateDigest, 'E_ACCEPTANCE_PROGRAM_DIGEST', requirements.programTemplateDigest);
  assert(requirements.stageRegistryDigest === FIXED_BINDINGS.stageRegistryDigest, 'E_ACCEPTANCE_REGISTRY_DIGEST', requirements.stageRegistryDigest);
  assertExactJson(requirements.evidenceStampIds, AUDIT_R1_EVIDENCE_STAMP_IDS, 'E_ACCEPTANCE_EVIDENCE_STAMPS', 'requirements.evidenceStampIds');
  assert(Array.isArray(requirements.requiredOutcomes) && requirements.requiredOutcomes.length > 0, 'E_ACCEPTANCE_OUTCOMES', 'requirements.requiredOutcomes');
  assertUniqueStrings(requirements.requiredOutcomes.map((entry) => entry?.id), 'requirements.requiredOutcomes');
  for (const outcome of requirements.requiredOutcomes) {
    assertClosedObject(outcome, ['id', 'requiredStatus', 'source'], ['id', 'requiredStatus', 'source'], `requirements.requiredOutcomes.${outcome?.id}`);
    assert(outcome.requiredStatus === 'PASS', 'E_ACCEPTANCE_REQUIRED_STATUS', outcome.id);
    assert(['GITHUB_ACTIONS_JOB', 'LOCAL_PHYSICAL_LANE_CARRIER'].includes(outcome.source), 'E_ACCEPTANCE_REQUIRED_SOURCE', outcome.id);
  }
  return true;
}

export function validateAcceptanceResultBundle(bundle, requirements) {
  validateAcceptanceRequirements(requirements);
  assertClosedObject(bundle, ['schemaVersion', 'bundleId', 'evaluationSha', 'evaluationTreeSha', 'requirementsDigest', 'results', 'status'], ['schemaVersion', 'bundleId', 'evaluationSha', 'evaluationTreeSha', 'requirementsDigest', 'results', 'status'], 'bundle');
  assert(bundle.schemaVersion === 'AUDIT_R1_ACCEPTANCE_RESULT_BUNDLE_V1', 'E_ACCEPTANCE_SCHEMA', bundle.schemaVersion);
  assertHex(bundle.evaluationSha, 40, 'bundle.evaluationSha');
  assertHex(bundle.evaluationTreeSha, 40, 'bundle.evaluationTreeSha');
  assert(bundle.requirementsDigest === sha256(canonicalBytes(requirements)), 'E_ACCEPTANCE_REQUIREMENTS_DIGEST', bundle.requirementsDigest);
  const required = requirements.requiredOutcomes.map((entry) => entry.id);
  assertUniqueStrings(required, 'requirements.requiredOutcomes');
  assert(Array.isArray(bundle.results), 'E_SCHEMA_TYPE', 'bundle.results');
  const actual = bundle.results.map((entry) => entry.id);
  assertExactJson(actual, required, 'E_ACCEPTANCE_RESULT_SET', 'bundle.results');
  for (let index = 0; index < bundle.results.length; index += 1) {
    const result = bundle.results[index];
    const requirement = requirements.requiredOutcomes[index];
    assertClosedObject(result, ['id', 'status', 'exitCode', 'commandDigest', 'evidenceDigest', 'source'], ['id', 'status', 'exitCode', 'commandDigest', 'evidenceDigest', 'source'], `bundle.results.${result.id}`);
    assert(result.status === requirement.requiredStatus, result.status === 'SKIPPED' ? 'E_ACCEPTANCE_SKIPPED' : result.status === 'CANCELLED' ? 'E_ACCEPTANCE_CANCELLED' : 'E_ACCEPTANCE_NOT_PASS', result.id);
    assert(result.exitCode === 0, 'E_ACCEPTANCE_EXIT_CODE', result.id);
    assertHex(result.commandDigest, 64, `${result.id}.commandDigest`);
    assertHex(result.evidenceDigest, 64, `${result.id}.evidenceDigest`);
    assert(result.source === requirement.source, 'E_ACCEPTANCE_SOURCE', result.id);
  }
  assert(bundle.status === 'PASS', 'E_ACCEPTANCE_BUNDLE_STATUS', bundle.status);
  return true;
}

function readFileDigest(rootDir, locator) {
  assertPublicLocator(locator);
  assert(!locator.startsWith('https://'), 'E_CARRIER_REMOTE_UNSUPPORTED', locator);
  return sha256(readFileSync(path.join(rootDir, locator)));
}

export function verifyCarrierRegistry(rootDir, registry) {
  assertClosedObject(registry, ['schemaVersion', 'evidenceStampIds', 'carriers', 'supersededClaims'], ['schemaVersion', 'evidenceStampIds', 'carriers', 'supersededClaims'], 'carrierRegistry');
  assert(registry.schemaVersion === 'AUDIT_R1_CARRIER_REGISTRY_V1', 'E_CARRIER_SCHEMA', registry.schemaVersion);
  assertExactJson(registry.evidenceStampIds, AUDIT_R1_EVIDENCE_STAMP_IDS, 'E_CARRIER_EVIDENCE_STAMPS', 'carrierRegistry.evidenceStampIds');
  assert(Array.isArray(registry.carriers) && registry.carriers.length >= 4, 'E_CARRIER_SET', 'carriers');
  for (const carrier of registry.carriers) {
    assertClosedObject(carrier, ['id', 'locator', 'sha256', 'status'], ['id', 'locator', 'sha256', 'status'], `carrier.${carrier?.id}`);
    assert(carrier.status === 'CANONICAL_BYTES_PRESENT', 'E_CARRIER_STATUS', carrier.id);
    assertHex(carrier.sha256, 64, `${carrier.id}.sha256`);
    assert(readFileDigest(rootDir, carrier.locator) === carrier.sha256, 'E_CARRIER_DIGEST', carrier.id);
  }
  assert(Array.isArray(registry.supersededClaims), 'E_SCHEMA_TYPE', 'supersededClaims');
  for (const claim of registry.supersededClaims) {
    assertClosedObject(claim, ['digest', 'reason', 'status', 'successorCarrierId'], ['digest', 'reason', 'status', 'successorCarrierId'], 'supersededClaim');
    assertHex(claim.digest, 64, 'supersededClaim.digest');
    assert(claim.status === 'SUPERSEDED_NON_CARRIED_NO_OVERCLAIM', 'E_SUPERSESSION_STATUS', claim.digest);
  }
  return true;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    result[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    assert(options.check === true, 'E_USAGE', '--check');
    const rootDir = process.cwd();
    const program = readCanonicalJson(path.join(rootDir, 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json'));
    const registry = readCanonicalJson(path.join(rootDir, 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json'));
    const trust = readCanonicalJson(path.join(rootDir, 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json'));
    const owner = readCanonicalJson(path.join(rootDir, 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json'));
    assert(program.digest === FIXED_BINDINGS.programTemplateDigest, 'E_FIXED_PROGRAM_DIGEST', program.digest);
    assert(registry.digest === FIXED_BINDINGS.stageRegistryDigest && registry.value.stages.length === 33, 'E_FIXED_REGISTRY_DIGEST', registry.digest);
    assert(trust.digest === FIXED_BINDINGS.trustModelDigest, 'E_FIXED_TRUST_DIGEST', trust.digest);
    assert(owner.digest === FIXED_BINDINGS.ownerAuthorityBindingDigest, 'E_FIXED_OWNER_DIGEST', owner.digest);
    const carriers = readCanonicalJson(path.join(rootDir, 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_CARRIER_REGISTRY_V1.json'));
    verifyCarrierRegistry(rootDir, carriers.value);
    process.stdout.write(`${canonicalize({ fixedBindings: FIXED_BINDINGS, registeredStages: registry.value.stages.length, status: 'PASS' })}\n`);
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
