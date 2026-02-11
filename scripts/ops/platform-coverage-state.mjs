#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'platform-coverage-state.v1';
const DEFAULT_COVERAGE_PATH = 'docs/OPS/STATUS/PLATFORM_COVERAGE.json';
const DEFAULT_CAPABILITIES_PATH = 'docs/OPS/CAPABILITIES_MATRIX.json';
const SCHEMA_VERSION = 'platform-coverage.v1';

function parseArgs(argv) {
  const out = {
    json: false,
    coveragePath: '',
    capabilitiesPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--coverage-path') {
      out.coveragePath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--capabilities-path') {
      out.capabilitiesPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
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

function normalizeRepoRelativePath(filePath) {
  if (typeof filePath !== 'string') return '';
  const normalized = filePath.trim();
  if (!normalized) return '';
  if (normalized.startsWith('/')) return '';
  if (normalized.includes('\\')) return '';
  if (normalized.split('/').includes('..')) return '';
  return normalized;
}

function collectRequiredPlatforms(capabilitiesDoc) {
  if (!capabilitiesDoc || !Array.isArray(capabilitiesDoc.items)) return null;
  const ids = new Set();
  for (const item of capabilitiesDoc.items) {
    const platformId = String(item && item.platformId ? item.platformId : '').trim();
    if (!platformId) return null;
    ids.add(platformId);
  }
  return [...ids].sort();
}

export function evaluatePlatformCoverageState(input = {}) {
  const coveragePath = path.resolve(String(input.coveragePath || DEFAULT_COVERAGE_PATH));
  const capabilitiesPath = path.resolve(String(input.capabilitiesPath || DEFAULT_CAPABILITIES_PATH));
  const state = {
    toolVersion: TOOL_VERSION,
    schemaVersion: '',
    coveragePath,
    capabilitiesPath,
    requiredPlatformIds: [],
    declaredPlatformIds: [],
    missingCoveragePlatformIds: [],
    extraCoveragePlatformIds: [],
    missingBoundaryTests: [],
    nonSpecificBoundaryTests: [],
    invalidEntries: [],
    PLATFORM_COVERAGE_DECLARED_OK: 0,
    PLATFORM_COVERAGE_BOUNDARY_TESTED_OK: 0,
    failReason: '',
  };

  if (!fs.existsSync(coveragePath)) {
    state.failReason = 'PLATFORM_COVERAGE_FILE_MISSING';
    return state;
  }

  const coverageDoc = parseJsonObject(coveragePath);
  if (!coverageDoc) {
    state.failReason = 'PLATFORM_COVERAGE_INVALID_JSON';
    return state;
  }

  state.schemaVersion = String(coverageDoc.schemaVersion || '').trim();
  if (state.schemaVersion !== SCHEMA_VERSION) {
    state.failReason = 'PLATFORM_COVERAGE_SCHEMA_INVALID';
    return state;
  }

  if (!Array.isArray(coverageDoc.platforms) || coverageDoc.platforms.length === 0) {
    state.failReason = 'PLATFORM_COVERAGE_ITEMS_EMPTY';
    return state;
  }

  if (!fs.existsSync(capabilitiesPath)) {
    state.failReason = 'PLATFORM_COVERAGE_CAPABILITIES_MISSING';
    return state;
  }
  const capabilitiesDoc = parseJsonObject(capabilitiesPath);
  const requiredPlatformIds = collectRequiredPlatforms(capabilitiesDoc);
  if (!requiredPlatformIds || requiredPlatformIds.length === 0) {
    state.failReason = 'PLATFORM_COVERAGE_CAPABILITIES_INVALID';
    return state;
  }
  state.requiredPlatformIds = requiredPlatformIds;

  const seenPlatformIds = new Set();
  for (let i = 0; i < coverageDoc.platforms.length; i += 1) {
    const item = coverageDoc.platforms[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      state.invalidEntries.push({ index: i, reason: 'item_invalid' });
      continue;
    }
    const platformId = String(item.platformId || '').trim();
    const capabilityBaseline = String(item.capabilityBaseline || '').trim();
    const adapterBoundaryTest = normalizeRepoRelativePath(item.adapterBoundaryTest);

    if (!platformId) {
      state.invalidEntries.push({ index: i, reason: 'platformId_missing' });
      continue;
    }
    if (seenPlatformIds.has(platformId)) {
      state.invalidEntries.push({ index: i, platformId, reason: 'platformId_duplicate' });
      continue;
    }
    seenPlatformIds.add(platformId);

    if (!capabilityBaseline) {
      state.invalidEntries.push({ index: i, platformId, reason: 'capabilityBaseline_missing' });
      continue;
    }
    if (!adapterBoundaryTest) {
      state.invalidEntries.push({ index: i, platformId, reason: 'adapterBoundaryTest_invalid' });
      continue;
    }

    const testExists = fs.existsSync(adapterBoundaryTest);
    if (!testExists) {
      state.missingBoundaryTests.push({ platformId, adapterBoundaryTest });
      continue;
    }

    const testText = fs.readFileSync(adapterBoundaryTest, 'utf8');
    if (!testText.includes(platformId)) {
      state.nonSpecificBoundaryTests.push({ platformId, adapterBoundaryTest });
    }
  }

  state.declaredPlatformIds = [...seenPlatformIds].sort();
  state.missingCoveragePlatformIds = requiredPlatformIds
    .filter((platformId) => !seenPlatformIds.has(platformId))
    .sort();
  state.extraCoveragePlatformIds = state.declaredPlatformIds
    .filter((platformId) => !requiredPlatformIds.includes(platformId))
    .sort();

  const declaredOk = state.invalidEntries.length === 0
    && state.missingCoveragePlatformIds.length === 0
    && state.declaredPlatformIds.length > 0;
  state.PLATFORM_COVERAGE_DECLARED_OK = declaredOk ? 1 : 0;

  const boundaryOk = declaredOk
    && state.missingBoundaryTests.length === 0
    && state.nonSpecificBoundaryTests.length === 0;
  state.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK = boundaryOk ? 1 : 0;

  if (state.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK !== 1) {
    if (state.invalidEntries.length > 0) state.failReason = 'PLATFORM_COVERAGE_DECLARATION_INVALID';
    else if (state.missingCoveragePlatformIds.length > 0) state.failReason = 'PLATFORM_COVERAGE_MISSING_REQUIRED_PLATFORM';
    else if (state.missingBoundaryTests.length > 0) state.failReason = 'PLATFORM_COVERAGE_TEST_FILE_MISSING';
    else if (state.nonSpecificBoundaryTests.length > 0) state.failReason = 'PLATFORM_COVERAGE_TEST_NOT_PLATFORM_SPECIFIC';
    else state.failReason = 'PLATFORM_COVERAGE_NOT_OK';
  }

  return state;
}

function printTokens(state) {
  console.log(`PLATFORM_COVERAGE_TOOL_VERSION=${state.toolVersion}`);
  console.log(`PLATFORM_COVERAGE_SCHEMA_VERSION=${state.schemaVersion}`);
  console.log(`PLATFORM_COVERAGE_PATH=${state.coveragePath}`);
  console.log(`PLATFORM_COVERAGE_CAPABILITIES_PATH=${state.capabilitiesPath}`);
  console.log(`PLATFORM_COVERAGE_REQUIRED_IDS=${JSON.stringify(state.requiredPlatformIds)}`);
  console.log(`PLATFORM_COVERAGE_DECLARED_IDS=${JSON.stringify(state.declaredPlatformIds)}`);
  console.log(`PLATFORM_COVERAGE_MISSING_IDS=${JSON.stringify(state.missingCoveragePlatformIds)}`);
  console.log(`PLATFORM_COVERAGE_EXTRA_IDS=${JSON.stringify(state.extraCoveragePlatformIds)}`);
  console.log(`PLATFORM_COVERAGE_MISSING_TESTS=${JSON.stringify(state.missingBoundaryTests)}`);
  console.log(`PLATFORM_COVERAGE_NON_SPECIFIC_TESTS=${JSON.stringify(state.nonSpecificBoundaryTests)}`);
  console.log(`PLATFORM_COVERAGE_INVALID_ENTRIES=${JSON.stringify(state.invalidEntries)}`);
  console.log(`PLATFORM_COVERAGE_DECLARED_OK=${state.PLATFORM_COVERAGE_DECLARED_OK}`);
  console.log(`PLATFORM_COVERAGE_BOUNDARY_TESTED_OK=${state.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluatePlatformCoverageState({
    coveragePath: args.coveragePath,
    capabilitiesPath: args.capabilitiesPath,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
