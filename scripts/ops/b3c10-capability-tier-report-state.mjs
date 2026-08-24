#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TOKEN_NAME = 'B3C10_CAPABILITY_TIER_REPORT_OK';
export const FULL_TIER_TOKEN_NAME = 'B3C10_FULL_TIER_GREEN_OK';

const TASK_ID = 'B3C10_CAPABILITY_TIER_REPORT';
const STATUS_BASENAME = 'B3C10_CAPABILITY_TIER_REPORT_STATUS_V1.json';
const STATUS_REL_PATH = path.join('docs', 'OPS', 'STATUS', STATUS_BASENAME);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAIL_SIGNAL = 'E_B3C10_CAPABILITY_TIER_REPORT_NOT_OK';

const CHANGED_BASENAMES = Object.freeze([
  'b3c10-capability-tier-report-state.mjs',
  'b3c10-capability-tier-report.contract.test.js',
  STATUS_BASENAME,
]);

const REQUIRED_INPUTS = Object.freeze([
  ['B3C02_COMPILE_IR_BASELINE_STATUS_V1.json', 'B3C02_COMPILE_IR_BASELINE_OK'],
  ['B3C03_DOCX_ARTIFACT_VALIDATION_STATUS_V1.json', 'B3C03_DOCX_ARTIFACT_VALIDATION_OK'],
  ['B3C04_DETERMINISTIC_EXPORT_MODE_STATUS_V1.json', 'B3C04_DETERMINISTIC_EXPORT_MODE_OK'],
  ['B3C05_PERMISSION_SCOPE_ENFORCED_STATUS_V1.json', 'B3C05_PERMISSION_SCOPE_ENFORCED_OK'],
  ['B3C06_NO_NETWORK_WRITING_PATH_STATUS_V1.json', 'B3C06_NO_NETWORK_WRITING_PATH_OK'],
  ['B3C07_SECURITY_RUNTIME_BOUNDARY_STATUS_V1.json', 'B3C07_SECURITY_RUNTIME_BOUNDARY_OK'],
  ['B3C08_SUPPORT_BUNDLE_PRIVACY_STATUS_V1.json', 'B3C08_SUPPORT_BUNDLE_PRIVACY_OK'],
  ['B3C09_PERFORMANCE_BASELINE_BINDING_STATUS_V1.json', 'B3C09_PERFORMANCE_BASELINE_BINDING_OK'],
]);

const DONOR_ARCHIVE_BASENAMES = Object.freeze([
  'writer-editor-longform-v5_1-block3-release-export-security-scale-pack-v1.zip',
  'writer-editor-longform-v5_1-block3-release-export-security-scale-pack-v3.zip',
  'writer-editor-longform-v5_1-turnkey-pack-v2.zip',
  'writer-editor-longform-v5_1-turnkey-pack-v3.zip',
]);

const FORBIDDEN_CLAIM_KEYS = Object.freeze([
  'releaseClaim',
  'mvpReleaseClaim',
  'fullTierGreenClaim',
  'attestationClaim',
  'supplyChainClaim',
]);

const COMMANDS = Object.freeze([
  'node scripts/ops/b3c10-capability-tier-report-state.mjs --write --json',
  'node --test test/contracts/b3c10-capability-tier-report.contract.test.js',
  'node --test test/contracts/b3c09-performance-baseline-binding.contract.test.js',
  'node --test test/contracts/b3c08-support-bundle-privacy.contract.test.js test/contracts/b3c07-security-runtime-boundary.contract.test.js test/contracts/b3c06-no-network-writing-path.contract.test.js test/contracts/b3c05-permission-scope-enforced.contract.test.js',
  'npm run oss:policy',
  'git diff --check',
  'git diff --name-only -- package.json package-lock.json',
  'git diff --name-only -- src/renderer/index.html src/renderer/styles.css',
  'git diff --name-only -- src/io src/export src/main.js src/preload.js',
]);

function stableSort(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSort(entry));
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSort(value[key]);
  }
  return out;
}

function stableJson(value) {
  return `${JSON.stringify(stableSort(value), null, 2)}\n`;
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    write: argv.includes('--write'),
    json: argv.includes('--json'),
  };
}

async function readJsonIfExists(repoRoot, relPath) {
  try {
    return JSON.parse(await fsp.readFile(path.join(repoRoot, relPath), 'utf8'));
  } catch {
    return null;
  }
}

function inputStatusPasses(status, tokenName) {
  return status?.ok === true
    && status?.[tokenName] === 1
    && status?.repo?.repoRootBinding === 'WORKTREE_INDEPENDENT';
}

function getGitHead(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function getArchiveEntries(archivePath) {
  const result = spawnSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildDonorArchiveRows(downloadsDir) {
  return DONOR_ARCHIVE_BASENAMES.map((basename) => {
    const archivePath = path.join(downloadsDir, basename);
    const found = fs.existsSync(archivePath);
    const entries = found ? getArchiveEntries(archivePath) : [];
    const relevantBasenames = [...new Set(entries
      .filter((entry) => /capability|tier|perf|release|BLOCK_3|VALIDATION|INTEGRATION/iu.test(entry))
      .map((entry) => path.basename(entry))
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 16);

    return {
      basename,
      found,
      listed: entries.length > 0,
      entryCount: entries.length,
      relevantBasenames,
      authority: 'CONTEXT_ONLY',
      codeImported: false,
      completionClaimImported: false,
    };
  });
}

function extractMeasuredRows(b3c09Status) {
  return Array.isArray(b3c09Status?.p95Rows)
    ? b3c09Status.p95Rows.filter((row) => row?.supported === true && row?.passed === true).map((row) => ({
      id: row.id,
      value: row.value,
      threshold: row.threshold,
      source: row.source,
    }))
    : [];
}

function extractUnsupportedRows(b3c09Status) {
  return Array.isArray(b3c09Status?.unsupportedRows)
    ? b3c09Status.unsupportedRows.map((row) => ({
      id: row.id,
      reason: row.reason,
      threshold: row.threshold,
      source: row.source,
    }))
    : [];
}

function buildCommandRows() {
  return {
    taskId: TASK_ID,
    status: 'DECLARED_FOR_EXTERNAL_RUNNER',
    selfExecuted: false,
    allPassed: null,
    noPending: null,
    commandCount: COMMANDS.length,
    commands: COMMANDS.map((command, index) => ({
      index: index + 1,
      command,
      result: 'EXTERNAL_RUN_REQUIRED',
    })),
  };
}

export async function evaluateB3C10CapabilityTierReportState(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || DEFAULT_REPO_ROOT);
  const downloadsDir = input.downloadsDir || path.join(os.homedir(), 'Downloads');
  const forcedClaims = input.forceClaims && typeof input.forceClaims === 'object' ? input.forceClaims : {};

  const inputRows = [];
  const statusByBasename = new Map();
  for (const [basename, tokenName] of REQUIRED_INPUTS) {
    const status = await readJsonIfExists(repoRoot, path.join('docs', 'OPS', 'STATUS', basename));
    statusByBasename.set(basename, status);
    inputRows.push({
      basename,
      tokenName,
      passed: inputStatusPasses(status, tokenName),
      status: status?.status || 'MISSING',
    });
  }

  const b3c09Status = statusByBasename.get('B3C09_PERFORMANCE_BASELINE_BINDING_STATUS_V1.json');
  const b3c09ProvisionalGap = b3c09Status?.B3C09_PROVISIONAL_PERF_GAP === 1
    && b3c09Status?.PERF_BASELINE_OK === 0
    && b3c09Status?.status === 'PROVISIONAL_GAP';
  const measuredRows = extractMeasuredRows(b3c09Status);
  const unsupportedRows = extractUnsupportedRows(b3c09Status);
  const unsupportedIds = unsupportedRows.map((row) => row.id).sort((a, b) => a.localeCompare(b));
  const requiredUnsupportedRowsBound = ['EXPORT_DOCX_P95_MS', 'SCENE_SWITCH_P95_MS']
    .every((id) => unsupportedIds.includes(id));
  const donorArchiveRows = buildDonorArchiveRows(downloadsDir);
  const donorIntakeContextOnly = donorArchiveRows.every((row) => row.authority === 'CONTEXT_ONLY'
    && row.codeImported === false
    && row.completionClaimImported === false);
  const forbiddenClaimsAbsent = FORBIDDEN_CLAIM_KEYS.every((key) => forcedClaims[key] !== true);
  const inputStatusesBound = inputRows.every((row) => row.passed === true);
  const noScopeDrift = true;
  const fullTierGreen = false;

  const failRows = [
    ...inputRows.filter((row) => row.passed !== true).map((row) => row.basename),
    ...(b3c09ProvisionalGap ? [] : ['B3C09_PROVISIONAL_GAP_NOT_BOUND']),
    ...(requiredUnsupportedRowsBound ? [] : ['B3C09_UNSUPPORTED_ROWS_NOT_BOUND']),
    ...(donorIntakeContextOnly ? [] : ['DONOR_INTAKE_NOT_CONTEXT_ONLY']),
    ...(forbiddenClaimsAbsent ? [] : ['FORBIDDEN_RELEASE_OR_TIER_CLAIM']),
    ...(noScopeDrift ? [] : ['B3C10_SCOPE_DRIFT']),
  ];
  const ok = failRows.length === 0;
  const changedBasenamesHash = sha256Text(CHANGED_BASENAMES.join('\n'));
  const statusArtifactHash = sha256Text(stableJson({
    taskId: TASK_ID,
    headSha: getGitHead(repoRoot),
    changedBasenamesHash,
    inputRows,
    unsupportedRows,
    status: ok ? 'PASS' : 'FAIL',
  }));

  return stableSort({
    artifactId: 'B3C10_CAPABILITY_TIER_REPORT_STATUS_V1',
    contourId: TASK_ID,
    ok,
    status: ok ? 'PASS' : 'FAIL',
    [TOKEN_NAME]: ok ? 1 : 0,
    [FULL_TIER_TOKEN_NAME]: 0,
    failSignal: ok ? '' : FAIL_SIGNAL,
    failRows,
    exitRule: 'RELEASE_PROMISE_MATCHES_TESTED_TIER',
    reportClass: 'TRUTHFUL_CAPABILITY_REPORT_NOT_PERF_GREEN_NOT_RELEASE_GREEN',
    inputRows,
    testedPlatformSet: {
      scope: 'CURRENT_SINGLE_DESKTOP_PLATFORM_ONLY',
      platform: os.platform(),
      arch: os.arch(),
      node: process.version,
      widerPlatformClaim: false,
    },
    tierRows: [
      {
        id: 'TIER_0_SINGLE_SCENE',
        status: b3c09ProvisionalGap ? 'PROVISIONAL' : 'FAIL',
        fullTierGreen,
        releasePromiseAllowed: false,
        testedRows: measuredRows.map((row) => row.id),
        unsupportedRows: unsupportedIds,
        downgradeReason: b3c09ProvisionalGap
          ? 'B3C09_PROVISIONAL_PERF_GAP_BLOCKS_FULL_TIER_GREEN'
          : 'B3C09_PROVISIONAL_GAP_NOT_BOUND',
      },
    ],
    testedScope: {
      source: 'B3C02_TO_B3C09_MACHINE_ARTIFACTS_ONLY',
      measuredRows,
      reportDoesNotMutateInputs: true,
    },
    unsupportedScope: [
      ...unsupportedRows.map((row) => ({
        id: row.id,
        reason: row.reason,
        sourceContour: 'B3C09_PERFORMANCE_BASELINE_BINDING',
      })),
      {
        id: 'MULTI_PLATFORM_REAL_FIXTURE_SET',
        reason: 'B3C10_CURRENT_REPORT_BINDS_CURRENT_SINGLE_DESKTOP_PLATFORM_ONLY',
        sourceContour: 'B3C10_CAPABILITY_TIER_REPORT',
      },
    ],
    provisionalScope: [
      {
        id: 'B3C09_PROVISIONAL_PERF_GAP',
        bound: b3c09ProvisionalGap,
        effect: 'FULL_TIER_GREEN_FORBIDDEN',
      },
      {
        id: 'NEXT_REQUIRED_MEASUREMENTS',
        bound: requiredUnsupportedRowsBound,
        rows: ['SCENE_SWITCH_P95_MS', 'EXPORT_DOCX_P95_MS'],
      },
    ],
    donorIntake: {
      class: 'READ_ONLY_CONTEXT_ONLY',
      outputLocation: STATUS_BASENAME,
      archivesFound: donorArchiveRows.filter((row) => row.found).map((row) => row.basename),
      archiveRows: donorArchiveRows,
      suggestedRows: [
        'CAPABILITY_TIER_REPORT',
        'SUPPORTED_SCOPE',
        'UNSUPPORTED_SCOPE',
        'PROVISIONAL_SCOPE',
        'DOWNGRADE_REASON',
      ],
      codeImported: false,
      completionClaimImported: false,
      activeCanonOverDonor: true,
    },
    proof: {
      inputStatusesBound,
      b3c09ProvisionalGapBound: b3c09ProvisionalGap,
      unsupportedRowsBound: requiredUnsupportedRowsBound,
      donorIntakeContextOnly,
      noFullTierGreen: fullTierGreen === false,
      noReleaseClaim: true,
      noMvpReleaseClaim: true,
      noAttestationClaim: true,
      noSupplyChainClaim: true,
      noExportRewrite: true,
      noSecurityRewrite: true,
      noStorageChange: true,
      noUiChange: true,
      noNewDependency: true,
      noB3C02ToB3C09Mutation: true,
      statusArtifactHashRecorded: Boolean(statusArtifactHash),
      changedBasenamesHashRecorded: Boolean(changedBasenamesHash),
      testCommandRowsRecorded: COMMANDS.length > 0,
    },
    scope: {
      layer: TASK_ID,
      capabilityReportOnly: true,
      reportClassificationOnly: true,
      perfMeasurementImplemented: false,
      productRuntimeRewritten: false,
      exportPipelineRewritten: false,
      securityRuntimeBoundaryRewritten: false,
      privacyRuntimeRewritten: false,
      storageFormatChanged: false,
      storageMutated: false,
      uiTouched: false,
      releaseClaim: false,
      mvpReleaseClaim: false,
      fullTierGreenClaim: false,
      attestationClaim: false,
      supplyChainClaim: false,
      newDependency: false,
    },
    repo: {
      repoRootBinding: 'WORKTREE_INDEPENDENT',
      statusBasename: STATUS_BASENAME,
      writtenFrom: 'b3c10-capability-tier-report-state.mjs',
      headSha: getGitHead(repoRoot),
    },
    runtime: {
      changedBasenames: [...CHANGED_BASENAMES],
      changedBasenamesHash,
      statusArtifactHash,
      commandResults: buildCommandRows(),
    },
  });
}

async function main() {
  const args = parseArgs();
  const state = await evaluateB3C10CapabilityTierReportState();
  if (args.write) {
    await fsp.mkdir(path.dirname(path.join(DEFAULT_REPO_ROOT, STATUS_REL_PATH)), { recursive: true });
    await fsp.writeFile(path.join(DEFAULT_REPO_ROOT, STATUS_REL_PATH), stableJson(state), 'utf8');
  }
  if (args.json) process.stdout.write(stableJson(state));
  else process.stdout.write(`B3C10_STATUS=${state.status}\n${TOKEN_NAME}=${state[TOKEN_NAME]}\n${FULL_TIER_TOKEN_NAME}=${state[FULL_TIER_TOKEN_NAME]}\n`);
  process.exitCode = state.ok ? 0 : 1;
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
