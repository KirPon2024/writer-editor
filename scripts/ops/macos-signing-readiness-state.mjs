#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateHeadStrictState } from './head-strict-state.mjs';

const TOOL_VERSION = 'macos-signing-readiness-state.v1';
const DEFAULT_READINESS_PATH = 'docs/OPS/STATUS/MACOS_SIGNING_READINESS.json';
const SCHEMA_VERSION = 'macos-signing-readiness.v1';
const CONFIG_POLICY_VERSION = 'macos-signing-readiness-config.v1';
const STATUS_SET = new Set(['PLACEHOLDER', 'READY']);
const SHA_HEX_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

function isSafeRepoRelativePath(value) {
  const candidate = String(value || '').trim();
  if (!candidate || path.isAbsolute(candidate)) return false;
  if (candidate.includes('\\')) return false;
  if (candidate.split('/').includes('..')) return false;
  return true;
}

function parseArgs(argv) {
  const out = {
    json: false,
    readinessPath: '',
    repoRoot: '',
    headStrictOk: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--readiness-path') {
      out.readinessPath = String(argv[i + 1] || '').trim();
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

function normalizeConfig(requirements) {
  const identity = typeof requirements.codesignIdentity === 'string' ? requirements.codesignIdentity.trim() : '';
  const teamId = typeof requirements.teamId === 'string' ? requirements.teamId.trim() : '';
  const bundleId = typeof requirements.bundleId === 'string' ? requirements.bundleId.trim() : '';
  const entitlementsPath = typeof requirements.entitlementsPath === 'string' ? requirements.entitlementsPath.trim() : '';
  const notarization = requirements.notarization && typeof requirements.notarization === 'object' && !Array.isArray(requirements.notarization)
    ? requirements.notarization
    : {};
  const provider = typeof notarization.provider === 'string' ? notarization.provider.trim() : '';
  const profileName = typeof notarization.profileName === 'string' ? notarization.profileName.trim() : '';

  return {
    policyVersion: CONFIG_POLICY_VERSION,
    requirements: {
      bundleId,
      codesignIdentity: identity,
      entitlementsPath,
      notarization: {
        profileName,
        provider,
      },
      teamId,
    },
  };
}

export function computeMacosSigningReadinessConfigHash(doc = {}) {
  const requirements = doc && typeof doc.requirements === 'object' && !Array.isArray(doc.requirements)
    ? doc.requirements
    : {};
  return sha256(stableStringify(normalizeConfig(requirements)));
}

export function evaluateMacosSigningReadinessState(input = {}) {
  const readinessPath = String(input.readinessPath || DEFAULT_READINESS_PATH).trim() || DEFAULT_READINESS_PATH;
  const repoRoot = String(input.repoRoot || process.cwd()).trim() || process.cwd();
  const freezeMode = String(input.freezeMode || process.env.FREEZE_MODE || '').trim() === '1';
  const headStrictOverrideRaw = input.headStrictOk;
  const headStrictOverride = headStrictOverrideRaw === 1 || headStrictOverrideRaw === '1'
    ? 1
    : (headStrictOverrideRaw === 0 || headStrictOverrideRaw === '0' ? 0 : null);

  const absolutePath = path.resolve(repoRoot, readinessPath);
  const fileSha256 = fs.existsSync(absolutePath)
    ? sha256(fs.readFileSync(absolutePath))
    : '';
  const doc = parseJsonObject(absolutePath);
  const normalizedSpecHash = doc ? sha256(stableStringify(doc)) : '';

  const failures = new Set();
  const missingFields = new Set();
  if (!doc) failures.add('E_MACOS_SIGNING_READINESS_JSON_INVALID');

  const schemaVersion = doc && typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const statusRaw = doc && typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const status = STATUS_SET.has(statusRaw) ? statusRaw : 'PLACEHOLDER';
  const baselineSha = doc && typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  const requirements = doc && typeof doc.requirements === 'object' && !Array.isArray(doc.requirements)
    ? doc.requirements
    : null;
  const proof = doc && typeof doc.proof === 'object' && !Array.isArray(doc.proof)
    ? doc.proof
    : null;
  const configHash = doc && typeof doc.configHash === 'string' ? doc.configHash.trim().toLowerCase() : '';

  if (schemaVersion !== SCHEMA_VERSION) {
    failures.add('E_MACOS_SIGNING_SCHEMA_INVALID');
    missingFields.add('schemaVersion');
  }
  if (!STATUS_SET.has(statusRaw)) {
    failures.add('E_MACOS_SIGNING_STATUS_INVALID');
    missingFields.add('status');
  }
  if (!SHA_HEX_RE.test(baselineSha)) {
    failures.add('E_MACOS_SIGNING_BASELINE_SHA_INVALID');
    missingFields.add('baselineSha');
  }
  if (!requirements) {
    failures.add('E_MACOS_SIGNING_REQUIREMENTS_INVALID');
    missingFields.add('requirements');
  }
  if (!proof) {
    failures.add('E_MACOS_SIGNING_PROOF_INVALID');
    missingFields.add('proof');
  }

  const reqIdentity = requirements && typeof requirements.codesignIdentity === 'string'
    ? requirements.codesignIdentity.trim()
    : '';
  const reqTeamId = requirements && typeof requirements.teamId === 'string'
    ? requirements.teamId.trim()
    : '';
  const reqBundleId = requirements && typeof requirements.bundleId === 'string'
    ? requirements.bundleId.trim()
    : '';
  const reqEntitlementsPath = requirements && typeof requirements.entitlementsPath === 'string'
    ? requirements.entitlementsPath.trim()
    : '';
  const reqNotarization = requirements && requirements.notarization && typeof requirements.notarization === 'object' && !Array.isArray(requirements.notarization)
    ? requirements.notarization
    : null;
  const reqProvider = reqNotarization && typeof reqNotarization.provider === 'string'
    ? reqNotarization.provider.trim()
    : '';
  const reqProfileName = reqNotarization && typeof reqNotarization.profileName === 'string'
    ? reqNotarization.profileName.trim()
    : '';

  if (!reqIdentity) missingFields.add('requirements.codesignIdentity');
  if (!reqTeamId) missingFields.add('requirements.teamId');
  if (!reqBundleId) missingFields.add('requirements.bundleId');
  if (!reqEntitlementsPath) missingFields.add('requirements.entitlementsPath');
  if (!reqNotarization) missingFields.add('requirements.notarization');
  if (!reqProvider) missingFields.add('requirements.notarization.provider');
  if (!reqProfileName) missingFields.add('requirements.notarization.profileName');

  if (!reqIdentity) failures.add('E_MACOS_SIGNING_CODESIGN_IDENTITY_INVALID');
  if (!reqTeamId) failures.add('E_MACOS_SIGNING_TEAM_ID_INVALID');
  if (!reqBundleId) failures.add('E_MACOS_SIGNING_BUNDLE_ID_INVALID');
  if (!reqEntitlementsPath) failures.add('E_MACOS_SIGNING_ENTITLEMENTS_PATH_INVALID');
  if (reqEntitlementsPath && !isSafeRepoRelativePath(reqEntitlementsPath)) {
    failures.add('E_MACOS_SIGNING_ENTITLEMENTS_PATH_INVALID');
  }
  if (!reqNotarization) failures.add('E_MACOS_SIGNING_NOTARIZATION_INVALID');
  if (reqProvider !== 'apple_notarytool') failures.add('E_MACOS_SIGNING_PROVIDER_INVALID');
  if (!reqProfileName) failures.add('E_MACOS_SIGNING_PROFILE_NAME_INVALID');

  const proofType = proof && typeof proof.proofType === 'string' ? proof.proofType.trim() : '';
  const proofNotes = proof && typeof proof.notes === 'string' ? proof.notes.trim() : '';
  if (proofType !== 'static_policy_check') {
    failures.add('E_MACOS_SIGNING_PROOF_TYPE_INVALID');
    missingFields.add('proof.proofType');
  }
  if (!proofNotes) {
    failures.add('E_MACOS_SIGNING_PROOF_NOTES_INVALID');
    missingFields.add('proof.notes');
  }

  if (!SHA256_HEX_RE.test(configHash)) {
    failures.add('E_MACOS_SIGNING_CONFIG_HASH_INVALID');
    missingFields.add('configHash');
  }
  const configHashExpected = computeMacosSigningReadinessConfigHash(doc || {});
  const configHashOk = SHA256_HEX_RE.test(configHash) && configHash === configHashExpected;
  if (!configHashOk) failures.add('E_MACOS_SIGNING_CONFIG_HASH_MISMATCH');

  if (status !== 'READY') failures.add('E_MACOS_SIGNING_STATUS_NOT_READY');

  const headStrictComputed = evaluateHeadStrictState({ mode: 'release' });
  const headStrictOk = headStrictOverride === null ? (headStrictComputed.ok === 1 ? 1 : 0) : headStrictOverride;
  if (headStrictOk !== 1) failures.add('E_MACOS_SIGNING_HEAD_STRICT_REQUIRED');

  const entitlementsPathExists = reqEntitlementsPath && isSafeRepoRelativePath(reqEntitlementsPath)
    ? fs.existsSync(path.resolve(repoRoot, reqEntitlementsPath))
    : false;

  const sortedFailures = [...failures].sort();
  const sortedMissingFields = [...missingFields].sort();
  const ok = sortedFailures.length === 0;
  const token = {
    XPLAT_CONTRACT_MACOS_SIGNING_READY_OK: ok ? 1 : 0,
  };

  return {
    ok,
    status,
    failures: sortedFailures,
    missingFields: sortedMissingFields,
    evidence: {
      baselineSha,
      configHashExpected,
      entitlementsPathExists,
      headStrictOk,
      schemaVersion,
    },
    configHash,
    freezeMode: freezeMode ? 1 : 0,
    token,
    XPLAT_CONTRACT_MACOS_SIGNING_READY_OK: token.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK,
    toolVersion: TOOL_VERSION,
    readinessPath,
    fileSha256,
    normalizedSpecHash,
    configHashOk,
  };
}

function printTokens(state) {
  console.log(`XPLAT_CONTRACT_MACOS_SIGNING_READY_OK=${state.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK}`);
  console.log(`MACOS_SIGNING_READINESS_STATUS=${state.status}`);
  console.log(`MACOS_SIGNING_READINESS_FAILURES=${JSON.stringify(state.failures)}`);
  console.log(`MACOS_SIGNING_READINESS_MISSING_FIELDS=${JSON.stringify(state.missingFields)}`);
  console.log(`MACOS_SIGNING_READINESS_CONFIG_HASH=${state.configHash}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateMacosSigningReadinessState({
    readinessPath: args.readinessPath,
    repoRoot: args.repoRoot,
    headStrictOk: args.headStrictOk,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
