#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateHeadStrictState } from './head-strict-state.mjs';

const TOOL_VERSION = 'release-artifact-sources-state.v1';
const DEFAULT_SPEC_PATH = 'docs/OPS/STATUS/RELEASE_ARTIFACT_SOURCES.json';
const SCHEMA_VERSION = 'release-artifact-sources.v1';
const CONFIG_POLICY_VERSION = 'release-artifact-sources-config.v1';
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const SOURCE_TYPE_SET = new Set(['commit', 'tag', 'source_link']);
const PROOF_TYPE_SET = new Set(['static_policy_check', 'deterministic_hash_check']);
const RELEASE_TAG_RE = /^release\/.+$/u;

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

function normalizeArtifactsForConfigHash(artifacts) {
  if (!Array.isArray(artifacts)) return [];
  return artifacts
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const artifactId = typeof item.artifactId === 'string' ? item.artifactId.trim() : '';
      const sourceType = typeof item.sourceType === 'string' ? item.sourceType.trim() : '';
      const sourceRef = typeof item.sourceRef === 'string' ? item.sourceRef.trim() : '';
      const proof = item.proof && typeof item.proof === 'object' && !Array.isArray(item.proof)
        ? item.proof
        : {};
      const proofType = typeof proof.proofType === 'string' ? proof.proofType.trim() : '';
      return { artifactId, sourceType, sourceRef, proofType };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ak = `${a.artifactId}\u0000${a.sourceType}\u0000${a.sourceRef}`;
      const bk = `${b.artifactId}\u0000${b.sourceType}\u0000${b.sourceRef}`;
      if (ak < bk) return -1;
      if (ak > bk) return 1;
      return 0;
    });
}

export function computeReleaseArtifactSourcesConfigHash(doc = {}) {
  const baselineSha = typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  const artifacts = Array.isArray(doc.artifacts) ? doc.artifacts : [];
  const normalized = {
    policyVersion: CONFIG_POLICY_VERSION,
    baselineSha,
    artifacts: normalizeArtifactsForConfigHash(artifacts),
  };
  return sha256Hex(stableStringify(normalized));
}

export function evaluateReleaseArtifactSourcesState(input = {}) {
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
  if (!doc) failures.add('E_RELEASE_ARTIFACT_SPEC_JSON_INVALID');

  const schemaVersion = doc && typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const statusRaw = doc && typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const status = statusRaw === 'READY' || statusRaw === 'PLACEHOLDER' ? statusRaw : 'PLACEHOLDER';
  const baselineSha = doc && typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  const artifacts = doc && Array.isArray(doc.artifacts) ? doc.artifacts : [];
  const configHash = doc && typeof doc.configHash === 'string' ? doc.configHash.trim().toLowerCase() : '';

  if (schemaVersion !== SCHEMA_VERSION) {
    failures.add('E_RELEASE_ARTIFACT_SCHEMA_INVALID');
    missingFields.add('schemaVersion');
  }
  if (statusRaw !== 'READY' && statusRaw !== 'PLACEHOLDER') {
    failures.add('E_RELEASE_ARTIFACT_STATUS_INVALID');
    missingFields.add('status');
  }
  if (!SHA_RE.test(baselineSha)) {
    failures.add('E_RELEASE_ARTIFACT_BASELINE_SHA_INVALID');
    missingFields.add('baselineSha');
  }
  if (!SHA256_RE.test(configHash)) {
    failures.add('E_RELEASE_ARTIFACT_CONFIG_HASH_INVALID');
    missingFields.add('configHash');
  }
  if (!Array.isArray(artifacts)) {
    failures.add('E_RELEASE_ARTIFACTS_INVALID');
    missingFields.add('artifacts');
  }

  let uniqueArtifactIdsOk = true;
  let sourceTypeShapeOk = true;
  let sourceRefShapeOk = true;
  let proofShapeOk = true;
  const seenIds = new Set();

  for (const item of artifacts) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      uniqueArtifactIdsOk = false;
      sourceTypeShapeOk = false;
      sourceRefShapeOk = false;
      proofShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_ITEM_INVALID');
      continue;
    }

    const artifactId = typeof item.artifactId === 'string' ? item.artifactId.trim() : '';
    const sourceType = typeof item.sourceType === 'string' ? item.sourceType.trim() : '';
    const sourceRef = typeof item.sourceRef === 'string' ? item.sourceRef.trim() : '';
    const proof = item.proof && typeof item.proof === 'object' && !Array.isArray(item.proof) ? item.proof : null;
    const proofType = proof && typeof proof.proofType === 'string' ? proof.proofType.trim() : '';
    const proofNotes = proof && typeof proof.notes === 'string' ? proof.notes.trim() : '';

    if (!artifactId) {
      uniqueArtifactIdsOk = false;
      failures.add('E_RELEASE_ARTIFACT_ID_INVALID');
      missingFields.add('artifacts[].artifactId');
    } else if (seenIds.has(artifactId)) {
      uniqueArtifactIdsOk = false;
      failures.add('E_RELEASE_ARTIFACT_ID_DUPLICATE');
    } else {
      seenIds.add(artifactId);
    }

    if (!SOURCE_TYPE_SET.has(sourceType)) {
      sourceTypeShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_TYPE_INVALID');
      missingFields.add('artifacts[].sourceType');
    }

    if (!sourceRef) {
      sourceRefShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_REF_INVALID');
      missingFields.add('artifacts[].sourceRef');
    } else if (sourceType === 'commit' && !SHA_RE.test(sourceRef.toLowerCase())) {
      sourceRefShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_REF_COMMIT_INVALID');
    } else if (sourceType === 'tag' && !RELEASE_TAG_RE.test(sourceRef)) {
      sourceRefShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_REF_TAG_INVALID');
    } else if (sourceType === 'source_link' && sourceRef.includes('*')) {
      sourceRefShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_REF_LINK_WILDCARD');
    }

    if (!proof) {
      proofShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_PROOF_INVALID');
      missingFields.add('artifacts[].proof');
      continue;
    }
    if (!PROOF_TYPE_SET.has(proofType)) {
      proofShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_PROOF_TYPE_INVALID');
      missingFields.add('artifacts[].proof.proofType');
    }
    if (!proofNotes) {
      proofShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_PROOF_NOTES_INVALID');
      missingFields.add('artifacts[].proof.notes');
    }
  }

  const configHashExpected = computeReleaseArtifactSourcesConfigHash(doc || {});
  const configHashOk = SHA256_RE.test(configHash) && configHash === configHashExpected;
  if (!configHashOk) failures.add('E_RELEASE_ARTIFACT_CONFIG_HASH_MISMATCH');

  if (status !== 'READY') failures.add('E_RELEASE_ARTIFACT_STATUS_NOT_READY');
  if (status === 'READY' && artifacts.length === 0) failures.add('E_RELEASE_ARTIFACTS_EMPTY');
  if (!uniqueArtifactIdsOk) failures.add('E_RELEASE_ARTIFACT_IDS_NOT_UNIQUE');
  if (!sourceTypeShapeOk) failures.add('E_RELEASE_ARTIFACT_SOURCE_TYPE_NOT_OK');
  if (!sourceRefShapeOk) failures.add('E_RELEASE_ARTIFACT_SOURCE_REF_NOT_OK');
  if (!proofShapeOk) failures.add('E_RELEASE_ARTIFACT_PROOF_NOT_OK');

  const headStrictComputed = evaluateHeadStrictState({ mode: 'release' });
  const headStrictOk = headStrictOverride === null ? (headStrictComputed.ok === 1 ? 1 : 0) : headStrictOverride;
  if (headStrictOk !== 1) failures.add('E_RELEASE_ARTIFACT_HEAD_STRICT_REQUIRED');

  const sortedFailures = [...failures].sort();
  const sortedMissingFields = [...missingFields].sort();
  const ok = sortedFailures.length === 0;
  const token = {
    RELEASE_ARTIFACT_SOURCES_OK: ok ? 1 : 0,
  };

  return {
    ok,
    status,
    failures: sortedFailures,
    missingFields: sortedMissingFields,
    evidence: {
      artifactsCount: artifacts.length,
      baselineSha,
      configHash,
      configHashExpected,
      headStrictOk,
      schemaVersion,
    },
    configHash,
    token,
    RELEASE_ARTIFACT_SOURCES_OK: token.RELEASE_ARTIFACT_SOURCES_OK,
    toolVersion: TOOL_VERSION,
    specPath,
    fileSha256,
    normalizedSpecHash,
    uniqueArtifactIdsOk,
    sourceTypeShapeOk,
    sourceRefShapeOk,
    proofShapeOk,
    configHashOk,
  };
}

function printTokens(state) {
  console.log(`RELEASE_ARTIFACT_SOURCES_OK=${state.RELEASE_ARTIFACT_SOURCES_OK}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_FAILURES=${JSON.stringify(state.failures)}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_MISSING_FIELDS=${JSON.stringify(state.missingFields)}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_ARTIFACTS_COUNT=${state.evidence.artifactsCount}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_CONFIG_HASH=${state.configHash}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateReleaseArtifactSourcesState({
    specPath: args.specPath,
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
