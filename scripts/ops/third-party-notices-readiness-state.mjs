#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateHeadStrictState } from './head-strict-state.mjs';

const TOOL_VERSION = 'third-party-notices-readiness-state.v1';
const DEFAULT_SPEC_PATH = 'docs/OPS/STATUS/THIRD_PARTY_NOTICES_READINESS.json';
const SCHEMA_VERSION = 'third-party-notices-readiness.v1';
const CONFIG_POLICY_VERSION = 'third-party-notices-readiness-config.v1';
const STATUS_SET = new Set(['PLACEHOLDER', 'READY']);
const PACKAGE_LOCK_SET = new Set(['npm', 'none', 'unknown']);
const SHA_HEX_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

const LICENSE_HYGIENE_NOTE_PATH = 'docs/OPERATIONS/THIRD_PARTY_LICENSES_NOTE.md';
const SOURCE_OFFER_POLICY_PATH = 'docs/OPERATIONS/AGPL_SOURCE_OFFER.md';
const PACKAGE_JSON_PATH = 'package.json';
const PACKAGE_LOCK_PATH = 'package-lock.json';

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function parseJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = {
    json: false,
    specPath: '',
    repoRoot: '',
    headStrictOk: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--spec-path') {
      out.specPath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--repo-root') {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--head-strict-ok') {
      out.headStrictOk = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function isSafeRepoRelativePath(value) {
  const candidate = String(value || '').trim();
  if (!candidate || path.isAbsolute(candidate)) return false;
  if (candidate.includes('\\')) return false;
  if (candidate.split('/').includes('..')) return false;
  return true;
}

function normalizeKnownLicenseFiles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function normalizeConfig(doc = {}) {
  const baselineSha = typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  const policy = doc.policy && typeof doc.policy === 'object' && !Array.isArray(doc.policy)
    ? doc.policy
    : {};
  const inputs = doc.inputs && typeof doc.inputs === 'object' && !Array.isArray(doc.inputs)
    ? doc.inputs
    : {};

  return {
    policyVersion: CONFIG_POLICY_VERSION,
    baselineSha,
    policy: {
      licenseHygieneNotePresent: policy.licenseHygieneNotePresent === true,
      sourceOfferPolicyPresent: policy.sourceOfferPolicyPresent === true,
    },
    inputs: {
      packageLockDetected: String(inputs.packageLockDetected || '').trim().toLowerCase(),
      packageJsonPresent: inputs.packageJsonPresent === true,
      knownLicenseFiles: normalizeKnownLicenseFiles(inputs.knownLicenseFiles),
    },
  };
}

export function computeThirdPartyNoticesReadinessConfigHash(doc = {}) {
  return sha256Hex(stableStringify(normalizeConfig(doc)));
}

export function evaluateThirdPartyNoticesReadinessState(input = {}) {
  const repoRoot = String(input.repoRoot || process.cwd()).trim() || process.cwd();
  const specPath = String(input.specPath || DEFAULT_SPEC_PATH).trim() || DEFAULT_SPEC_PATH;
  const headStrictOverrideRaw = input.headStrictOk;
  const headStrictOverride = headStrictOverrideRaw === 1 || headStrictOverrideRaw === '1'
    ? 1
    : (headStrictOverrideRaw === 0 || headStrictOverrideRaw === '0' ? 0 : null);

  const absoluteSpecPath = path.resolve(repoRoot, specPath);
  const fileSha256 = fs.existsSync(absoluteSpecPath)
    ? sha256Hex(fs.readFileSync(absoluteSpecPath))
    : '';
  const doc = parseJsonObject(absoluteSpecPath);
  const normalizedSpecHash = doc ? sha256Hex(stableStringify(doc)) : '';

  const failures = new Set();
  const missingFields = new Set();
  if (!doc) failures.add('E_THIRD_PARTY_NOTICES_SPEC_JSON_INVALID');

  const schemaVersion = doc && typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const statusRaw = doc && typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const status = STATUS_SET.has(statusRaw) ? statusRaw : 'PLACEHOLDER';
  const baselineSha = doc && typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  const configHash = doc && typeof doc.configHash === 'string' ? doc.configHash.trim().toLowerCase() : '';

  const policy = doc && doc.policy && typeof doc.policy === 'object' && !Array.isArray(doc.policy)
    ? doc.policy
    : null;
  const inputs = doc && doc.inputs && typeof doc.inputs === 'object' && !Array.isArray(doc.inputs)
    ? doc.inputs
    : null;

  if (schemaVersion !== SCHEMA_VERSION) {
    failures.add('E_THIRD_PARTY_NOTICES_SCHEMA_INVALID');
    missingFields.add('schemaVersion');
  }
  if (!STATUS_SET.has(statusRaw)) {
    failures.add('E_THIRD_PARTY_NOTICES_STATUS_INVALID');
    missingFields.add('status');
  }
  if (!SHA_HEX_RE.test(baselineSha)) {
    failures.add('E_THIRD_PARTY_NOTICES_BASELINE_SHA_INVALID');
    missingFields.add('baselineSha');
  }
  if (!policy) {
    failures.add('E_THIRD_PARTY_NOTICES_POLICY_INVALID');
    missingFields.add('policy');
  }
  if (!inputs) {
    failures.add('E_THIRD_PARTY_NOTICES_INPUTS_INVALID');
    missingFields.add('inputs');
  }

  const licenseHygieneNotePresent = policy && typeof policy.licenseHygieneNotePresent === 'boolean'
    ? policy.licenseHygieneNotePresent
    : null;
  const sourceOfferPolicyPresent = policy && typeof policy.sourceOfferPolicyPresent === 'boolean'
    ? policy.sourceOfferPolicyPresent
    : null;

  if (licenseHygieneNotePresent === null) {
    failures.add('E_THIRD_PARTY_NOTICES_POLICY_LICENSE_NOTE_INVALID');
    missingFields.add('policy.licenseHygieneNotePresent');
  }
  if (sourceOfferPolicyPresent === null) {
    failures.add('E_THIRD_PARTY_NOTICES_POLICY_SOURCE_OFFER_INVALID');
    missingFields.add('policy.sourceOfferPolicyPresent');
  }

  const packageLockDetectedRaw = inputs && typeof inputs.packageLockDetected === 'string'
    ? inputs.packageLockDetected.trim().toLowerCase()
    : '';
  const packageJsonPresent = inputs && typeof inputs.packageJsonPresent === 'boolean'
    ? inputs.packageJsonPresent
    : null;
  const knownLicenseFilesRaw = inputs && Array.isArray(inputs.knownLicenseFiles)
    ? inputs.knownLicenseFiles.map((item) => String(item || '').trim())
    : null;
  const knownLicenseFiles = normalizeKnownLicenseFiles(knownLicenseFilesRaw);

  if (!PACKAGE_LOCK_SET.has(packageLockDetectedRaw)) {
    failures.add('E_THIRD_PARTY_NOTICES_INPUT_PACKAGE_LOCK_INVALID');
    missingFields.add('inputs.packageLockDetected');
  }
  if (packageJsonPresent === null) {
    failures.add('E_THIRD_PARTY_NOTICES_INPUT_PACKAGE_JSON_INVALID');
    missingFields.add('inputs.packageJsonPresent');
  }
  if (!Array.isArray(knownLicenseFilesRaw)) {
    failures.add('E_THIRD_PARTY_NOTICES_INPUT_KNOWN_LICENSE_FILES_INVALID');
    missingFields.add('inputs.knownLicenseFiles');
  }

  if (Array.isArray(knownLicenseFilesRaw)) {
    if (knownLicenseFilesRaw.some((item) => !isSafeRepoRelativePath(item))) {
      failures.add('E_THIRD_PARTY_NOTICES_INPUT_KNOWN_LICENSE_FILES_PATH_INVALID');
    }
    if (JSON.stringify(knownLicenseFilesRaw) !== JSON.stringify(knownLicenseFiles)) {
      failures.add('E_THIRD_PARTY_NOTICES_INPUT_KNOWN_LICENSE_FILES_NOT_SORTED');
    }
    const dedupe = new Set(knownLicenseFiles);
    if (dedupe.size !== knownLicenseFiles.length) {
      failures.add('E_THIRD_PARTY_NOTICES_INPUT_KNOWN_LICENSE_FILES_DUPLICATE');
    }
  }

  const licenseHygieneNoteExists = fs.existsSync(path.resolve(repoRoot, LICENSE_HYGIENE_NOTE_PATH));
  const sourceOfferPolicyExists = fs.existsSync(path.resolve(repoRoot, SOURCE_OFFER_POLICY_PATH));
  const packageJsonExists = fs.existsSync(path.resolve(repoRoot, PACKAGE_JSON_PATH));
  const packageLockExists = fs.existsSync(path.resolve(repoRoot, PACKAGE_LOCK_PATH));
  const knownLicenseMissing = knownLicenseFiles
    .filter((filePath) => !fs.existsSync(path.resolve(repoRoot, filePath)))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (knownLicenseMissing.length > 0) failures.add('E_THIRD_PARTY_NOTICES_KNOWN_LICENSE_FILES_MISSING');

  if (licenseHygieneNotePresent !== null && licenseHygieneNotePresent !== licenseHygieneNoteExists) {
    failures.add('E_THIRD_PARTY_NOTICES_POLICY_LICENSE_NOTE_MISMATCH');
  }
  if (sourceOfferPolicyPresent !== null && sourceOfferPolicyPresent !== sourceOfferPolicyExists) {
    failures.add('E_THIRD_PARTY_NOTICES_POLICY_SOURCE_OFFER_MISMATCH');
  }
  if (packageJsonPresent !== null && packageJsonPresent !== packageJsonExists) {
    failures.add('E_THIRD_PARTY_NOTICES_INPUT_PACKAGE_JSON_MISMATCH');
  }
  if (PACKAGE_LOCK_SET.has(packageLockDetectedRaw)) {
    const expected = packageLockExists ? 'npm' : 'none';
    if (packageLockDetectedRaw !== expected) {
      failures.add('E_THIRD_PARTY_NOTICES_INPUT_PACKAGE_LOCK_MISMATCH');
    }
  }

  if (!SHA256_HEX_RE.test(configHash)) {
    failures.add('E_THIRD_PARTY_NOTICES_CONFIG_HASH_INVALID');
    missingFields.add('configHash');
  }
  const configHashExpected = computeThirdPartyNoticesReadinessConfigHash(doc || {});
  const configHashOk = SHA256_HEX_RE.test(configHash) && configHash === configHashExpected;
  if (!configHashOk) failures.add('E_THIRD_PARTY_NOTICES_CONFIG_HASH_MISMATCH');

  if (status !== 'READY') failures.add('E_THIRD_PARTY_NOTICES_STATUS_NOT_READY');
  if (status === 'READY') {
    const readyInputs = licenseHygieneNotePresent === true
      && sourceOfferPolicyPresent === true
      && packageJsonPresent === true
      && packageLockDetectedRaw === 'npm'
      && knownLicenseFiles.length > 0;
    if (!readyInputs) failures.add('E_THIRD_PARTY_NOTICES_READY_INPUTS_NOT_MET');
  }

  const headStrictComputed = evaluateHeadStrictState({ mode: 'release' });
  const headStrictOk = headStrictOverride === null ? (headStrictComputed.ok === 1 ? 1 : 0) : headStrictOverride;
  if (headStrictOk !== 1) failures.add('E_THIRD_PARTY_NOTICES_HEAD_STRICT_REQUIRED');

  const sortedFailures = [...failures].sort();
  const sortedMissingFields = [...missingFields].sort();
  const ok = sortedFailures.length === 0;
  const token = {
    THIRD_PARTY_NOTICES_READINESS_OK: ok ? 1 : 0,
  };

  return {
    ok,
    status,
    failures: sortedFailures,
    missingFields: sortedMissingFields,
    evidence: {
      baselineSha,
      configHash,
      configHashExpected,
      licenseHygieneNoteExists,
      sourceOfferPolicyExists,
      packageJsonExists,
      packageLockExists,
      knownLicenseFilesCount: knownLicenseFiles.length,
      knownLicenseMissing,
      headStrictOk,
      schemaVersion,
    },
    configHash,
    token,
    THIRD_PARTY_NOTICES_READINESS_OK: token.THIRD_PARTY_NOTICES_READINESS_OK,
    toolVersion: TOOL_VERSION,
    specPath,
    fileSha256,
    normalizedSpecHash,
    configHashOk,
  };
}

function printTokens(state) {
  console.log(`THIRD_PARTY_NOTICES_READINESS_OK=${state.THIRD_PARTY_NOTICES_READINESS_OK}`);
  console.log(`THIRD_PARTY_NOTICES_READINESS_STATUS=${state.status}`);
  if (state.failures.length > 0) {
    console.log(`FAIL_REASON=${state.failures[0]}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateThirdPartyNoticesReadinessState({
    specPath: args.specPath,
    repoRoot: args.repoRoot,
    headStrictOk: args.headStrictOk,
  });
  if (args.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  else printTokens(state);
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
