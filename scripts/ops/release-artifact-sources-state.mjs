#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateHeadStrictState } from './head-strict-state.mjs';

const TOOL_VERSION = 'release-artifact-sources-state.v1';
const DEFAULT_SPEC_PATH = 'docs/OPS/STATUS/RELEASE_ARTIFACT_SOURCES.json';
const SCHEMA_VERSION = 'release-artifact-sources.v1';
const SHA40_HEX_RE = /^[0-9a-f]{40}$/u;
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

function isSafeRepoRelativePath(input) {
  const normalized = String(input || '').trim();
  if (!normalized || path.isAbsolute(normalized)) return false;
  if (normalized.includes('\\')) return false;
  if (normalized.split('/').includes('..')) return false;
  return true;
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

function asIsoTimestamp(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
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

export function evaluateReleaseArtifactSourcesState(input = {}) {
  const repoRoot = String(input.repoRoot || process.cwd()).trim() || process.cwd();
  const specPath = String(input.specPath || DEFAULT_SPEC_PATH).trim() || DEFAULT_SPEC_PATH;
  const freezeMode = String(input.freezeMode || process.env.FREEZE_MODE || '').trim() === '1';
  const headStrictOverrideRaw = input.headStrictOk;
  const headStrictOverride = headStrictOverrideRaw === 1 || headStrictOverrideRaw === '1'
    ? 1
    : (headStrictOverrideRaw === 0 || headStrictOverrideRaw === '0' ? 0 : null);

  const absoluteSpecPath = path.resolve(repoRoot, specPath);
  let fileSha256 = '';
  if (fs.existsSync(absoluteSpecPath)) {
    const bytes = fs.readFileSync(absoluteSpecPath);
    fileSha256 = createHash('sha256').update(bytes).digest('hex');
  }

  const doc = parseJsonObject(absoluteSpecPath);
  const failures = new Set();
  if (!doc) failures.add('E_RELEASE_ARTIFACT_SPEC_JSON_INVALID');

  const schemaVersion = doc && typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const statusRaw = doc && typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const status = statusRaw === 'READY' || statusRaw === 'PLACEHOLDER' ? statusRaw : '';
  const artifacts = doc && Array.isArray(doc.artifacts) ? doc.artifacts : [];
  const updatedAt = asIsoTimestamp(doc ? doc.updatedAt : '');

  const schemaOk = Boolean(
    doc
    && schemaVersion === SCHEMA_VERSION
    && status !== ''
    && Array.isArray(doc.artifacts)
    && updatedAt !== '',
  );
  if (!schemaOk) failures.add('E_RELEASE_ARTIFACT_SCHEMA_INVALID');

  const seenArtifactIds = new Set();
  let uniqueArtifactIdsOk = true;
  let sourceCommitShapeOk = true;
  let releaseTagShapeOk = true;

  for (const item of artifacts) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      uniqueArtifactIdsOk = false;
      sourceCommitShapeOk = false;
      releaseTagShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_ITEM_INVALID');
      continue;
    }

    const artifactId = typeof item.artifactId === 'string' ? item.artifactId.trim() : '';
    const sourceRepo = typeof item.sourceRepo === 'string' ? item.sourceRepo.trim() : '';
    const sourceCommit = typeof item.sourceCommit === 'string' ? item.sourceCommit.trim().toLowerCase() : '';
    const sourceTag = typeof item.sourceTag === 'string' ? item.sourceTag.trim() : '';
    const sourcePath = typeof item.sourcePath === 'string' ? item.sourcePath.trim() : '';
    const evidenceLinks = item.evidenceLinks;

    if (!artifactId) {
      uniqueArtifactIdsOk = false;
      failures.add('E_RELEASE_ARTIFACT_ID_INVALID');
    } else if (seenArtifactIds.has(artifactId)) {
      uniqueArtifactIdsOk = false;
      failures.add('E_RELEASE_ARTIFACT_ID_DUPLICATE');
    } else {
      seenArtifactIds.add(artifactId);
    }

    if (!sourceRepo) failures.add('E_RELEASE_ARTIFACT_SOURCE_REPO_INVALID');

    if (!SHA40_HEX_RE.test(sourceCommit)) {
      sourceCommitShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_COMMIT_SHAPE_INVALID');
    }

    if (sourceTag && !RELEASE_TAG_RE.test(sourceTag)) {
      releaseTagShapeOk = false;
      failures.add('E_RELEASE_ARTIFACT_SOURCE_TAG_SHAPE_INVALID');
    }

    if (sourcePath && !isSafeRepoRelativePath(sourcePath)) {
      failures.add('E_RELEASE_ARTIFACT_SOURCE_PATH_INVALID');
    }

    if (sourcePath) {
      const fullPath = path.resolve(repoRoot, sourcePath);
      if (!fs.existsSync(fullPath)) failures.add('E_RELEASE_ARTIFACT_SOURCE_PATH_MISSING');
    }

    if (evidenceLinks !== undefined) {
      if (!Array.isArray(evidenceLinks)) {
        failures.add('E_RELEASE_ARTIFACT_EVIDENCE_LINKS_INVALID');
      } else {
        for (const link of evidenceLinks) {
          if (typeof link !== 'string' || !link.trim()) {
            failures.add('E_RELEASE_ARTIFACT_EVIDENCE_LINKS_INVALID');
            break;
          }
        }
      }
    }
  }

  if (status !== 'READY') failures.add('E_RELEASE_ARTIFACT_STATUS_NOT_READY');
  if (status === 'READY' && artifacts.length === 0) failures.add('E_RELEASE_ARTIFACTS_EMPTY');
  if (!uniqueArtifactIdsOk) failures.add('E_RELEASE_ARTIFACT_IDS_NOT_UNIQUE');
  if (!sourceCommitShapeOk) failures.add('E_RELEASE_ARTIFACT_SOURCE_COMMIT_SHAPE_NOT_OK');
  if (!releaseTagShapeOk) failures.add('E_RELEASE_ARTIFACT_SOURCE_TAG_SHAPE_NOT_OK');

  const headStrictComputed = evaluateHeadStrictState({ mode: 'release' });
  const headStrictOk = headStrictOverride === null ? (headStrictComputed.ok === 1 ? 1 : 0) : headStrictOverride;
  const headBindingOk = freezeMode ? (headStrictOk === 1) : true;
  if (!headBindingOk) failures.add('E_RELEASE_ARTIFACT_HEAD_STRICT_REQUIRED');

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;

  return {
    ok,
    failures: sortedFailures,
    artifactsCount: artifacts.length,
    uniqueArtifactIdsOk,
    sourceCommitShapeOk,
    releaseTagShapeOk,
    headBindingOk,
    schemaOk,
    fileSha256,
    RELEASE_ARTIFACT_SOURCES_OK: ok ? 1 : 0,
    toolVersion: TOOL_VERSION,
    specPath,
    freezeMode,
    status: status || 'PLACEHOLDER',
    normalizedSpecHash: doc ? createHash('sha256').update(stableStringify(doc)).digest('hex') : '',
  };
}

function printTokens(state) {
  console.log(`RELEASE_ARTIFACT_SOURCES_OK=${state.RELEASE_ARTIFACT_SOURCES_OK}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_FAILURES=${JSON.stringify(state.failures)}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_ARTIFACTS_COUNT=${state.artifactsCount}`);
  console.log(`RELEASE_ARTIFACT_SOURCES_FILE_SHA256=${state.fileSha256}`);
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
