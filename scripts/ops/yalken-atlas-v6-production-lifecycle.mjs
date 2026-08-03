#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runP0_03PackagedVisibleJourney } from './yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey.mjs';
import { runManualMapPortabilityJourney } from './yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v6.productionLifecycle.v2';
const ROOT = process.cwd();

const A7_TEST_NAMES = Object.freeze([
  'Atlas V6 A7: exact named passing evidence certifies every production matrix row',
  'Atlas V6 A7: zero-test aggregate success fails closed',
  'Atlas V6 A7: skipped and todo tests fail closed',
  'Atlas V6 A7: missing and duplicate matrix rows fail closed',
  'Atlas V6 A7: wrong row mapping fails closed',
  'Atlas V6 A7: malformed and inconsistent TAP reports fail closed',
  'Atlas V6 A7: missing named evidence fails closed',
  'Atlas V6 A7: duplicate test identity fails closed',
  'Atlas V6 A7: unmapped passing evidence fails closed',
]);

function evidenceRow(id, testNames) {
  return Object.freeze({ id, testNames: Object.freeze(testNames) });
}

export const PRODUCTION_NEGATIVE_EVIDENCE_MAP = Object.freeze([
  evidenceRow('collaborator-envelope-version-lifecycle-and-provenance', [
    'Atlas V6: strict collaborator admission is batch-atomic and preserves complete provenance',
    'Atlas V6 production negative: collaborator lifecycle admission precedes mutation and survives durable reopen replay',
  ]),
  evidenceRow('recovery-schema-project-lifecycle-revision-authority-and-provenance', [
    'Atlas V6 production negative: recovery is admitted before publication and rejects future, foreign, stale and immutable conflicts',
  ]),
  evidenceRow('replay-state-injection-rejection', [
    'Atlas V6 production negative: canonical recovery provenance is integrity-bound and cannot be substituted during replay',
    'Atlas V6: renderer and main contain no fixed Stage-10 or replay injection theater',
  ]),
  evidenceRow('manual-map-real-json-svg-and-pdf-typed-loss', [
    'Atlas V6: Manual Map repeat import is one canonical operation with complete domain events and replay',
    'Atlas V6 production negative: real JSON and SVG artifacts commit with canonical history and interrupted output is recovered',
  ]),
  evidenceRow('append-only-restore-and-undo', [
    'Atlas V6 production negative: restore and undo append compensating history without rewinding eventLog',
  ]),
  evidenceRow('interprocess-lease-and-lock-held-cas', [
    'Atlas V6 production negative: main-owned lease is interprocess, expiry-bounded and revision plus authority CAS protected',
  ]),
  evidenceRow('live-holder-slow-write-fencing-and-stale-holder-rejection', [
    'Atlas V6 A3: a two-process slow truth publication exceeds TTL without reclaim and crash recovery converges',
    'Atlas V6 A3: monotonic fencing rejects every later publication and finalization from a genuinely stale holder',
  ]),
  evidenceRow('injective-project-id-binding-and-collision-aware-migration', [
    'Atlas V6 A3: accepted project IDs have reversible injective domain-separated keys and invalid IDs mutate nothing',
    'Atlas V6 A3: legacy key migration is atomic, identity-bound and collision-aware for the reproduced alias pair',
  ]),
  evidenceRow('shared-main-manifest-lease-and-exact-byte-cas', [
    'Atlas V6 A4: a child main-manifest writer wins after stale preparation and Stage-10 returns typed CAS without dropping its field',
  ]),
  evidenceRow('reserved-external-artifact-cas-and-crash-reconciliation', [
    'Atlas V6 A4: child changes to absent and existing artifact targets after preflight are preserved and recovered',
    'Atlas V6 A4: interrupted artifact reservation restores prior bytes and stale recovery leaves no reservation files',
  ]),
  evidenceRow('unicode-project-id-domain-parity-and-foreign-alias-fail-closed', [
    'Atlas V6 A4: Stage-10 project identity exactly shares the valid Unicode main domain without normalization',
    'Atlas V6 A4: foreign legacy aliases fail before canonical lineage mutation in both creation orders',
  ]),
  evidenceRow('process-instance-heartbeat-pid-reuse-and-clock-edge-recovery', [
    'Atlas V6 A4: process-instance heartbeat defeats PID reuse, wall-clock jumps, blocked-loop expiry and crash staleness',
  ]),
  evidenceRow('selected-stage10-control-state-binding', [
    'Atlas V6: packaged startup binds the selected project before visible product controls become available',
  ]),
  evidenceRow('retained-analytics-scheduler', [
    'Atlas V6: retained analytics scheduler coalesces, invalidates, cancels, bounds and discards stale work',
  ]),
  evidenceRow('live-command-provider-and-exact-slot-catalogs', [
    'Atlas V6: Design OS resolution requires real command, provider and exact slot catalogs',
  ]),
  evidenceRow('production-required-negative-gate', A7_TEST_NAMES),
  evidenceRow('complete-bcp47-and-author-text-preservation', [
    'Atlas V6: complete BCP47 author tags survive without manuscript normalization',
  ]),
]);

export const PRODUCTION_NEGATIVE_TEST_FILES = Object.freeze([
  'test/contracts/yalken-atlas-v6-audit-hold-repair.contract.test.js',
  'test/contracts/yalken-atlas-v6-a3-bounded-repair.contract.test.js',
  'test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js',
  'test/contracts/yalken-atlas-v6-production-negative.contract.test.js',
  'test/contracts/yalken-atlas-v6-a7-false-green-bounded-repair.contract.test.js',
]);

function diagnostic(code, detail = '') {
  return { code, ...(detail ? { detail } : {}) };
}

function parseCount(lines, label, diagnostics) {
  const matches = lines
    .map((line) => line.match(new RegExp(`^# ${label} (\\d+)$`)))
    .filter(Boolean);
  if (matches.length !== 1) {
    diagnostics.push(diagnostic('E_TAP_SUMMARY_COUNT_INVALID', label));
    return null;
  }
  return Number.parseInt(matches[0][1], 10);
}

function parseOptionalNestedCount(lines, label, diagnostics, parentName) {
  const matches = lines
    .map((line) => line.match(new RegExp(`^# ${label} (\\d+)$`)))
    .filter(Boolean);
  if (matches.length > 1) {
    diagnostics.push(diagnostic('E_TAP_NESTED_SUMMARY_COUNT_INVALID', `${parentName}:${label}`));
    return null;
  }
  return matches.length === 1 ? Number.parseInt(matches[0][1], 10) : null;
}

function isNestedTapMarker(text) {
  return /^(?:TAP version 13|# Subtest: .+|(?:ok|not ok) \d+ - .+|1\.\.\d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo) \d+|# duration_ms \d+(?:\.\d+)?)$/.test(text);
}

function isNestedYamlDiagnosticLine(text) {
  return text === '---'
    || text === '...'
    || /^[A-Za-z_][A-Za-z0-9_]*:/.test(text)
    || /^[-?]\s/.test(text);
}

function validateNestedTapBody(bodyLines, parentName, diagnostics) {
  const nestedLines = bodyLines
    .map((line) => line.replace(/^\s+/, ''))
    .filter(Boolean);
  if (!nestedLines.some(isNestedTapMarker)) return;

  const headers = nestedLines.filter((line) => line === 'TAP version 13');
  if (headers.length > 1) diagnostics.push(diagnostic('E_TAP_NESTED_HEADER_INVALID', parentName));

  const planMatches = nestedLines
    .map((line) => line.match(/^1\.\.(\d+)$/))
    .filter(Boolean);
  if (planMatches.length > 1) diagnostics.push(diagnostic('E_TAP_NESTED_PLAN_INVALID', parentName));
  const plan = planMatches.length === 1 ? Number.parseInt(planMatches[0][1], 10) : null;
  const records = [];
  const seenNumbers = new Set();
  const seenNames = new Set();
  let pendingSubtest = null;

  for (const line of nestedLines) {
    if (line === 'TAP version 13') continue;
    if (line.startsWith('# Subtest: ')) {
      if (pendingSubtest) {
        diagnostics.push(diagnostic('E_TAP_NESTED_TEST_RECORD_BOUNDARY', `${parentName}:${pendingSubtest}`));
      }
      pendingSubtest = line.slice('# Subtest: '.length);
      continue;
    }

    const statusMatch = line.match(/^(ok|not ok) (\d+) - (.*?)(?: # (SKIP|TODO)(?: .*)?)?$/);
    if (statusMatch) {
      if (!pendingSubtest) {
        diagnostics.push(diagnostic('E_TAP_NESTED_STATUS_ORPHAN', `${parentName}:${statusMatch[3]}`));
        continue;
      }
      const name = pendingSubtest;
      const statusName = statusMatch[3];
      const number = Number.parseInt(statusMatch[2], 10);
      if (!name || statusName !== name) {
        diagnostics.push(diagnostic('E_TAP_NESTED_TEST_IDENTITY_MISMATCH', `${parentName}:${name || statusName}`));
      }
      if (seenNumbers.has(number) || seenNames.has(name)) {
        diagnostics.push(diagnostic('E_TAP_NESTED_TEST_IDENTITY_DUPLICATE', `${parentName}:${name}`));
      }
      seenNumbers.add(number);
      seenNames.add(name);
      records.push({
        number,
        name,
        pass: statusMatch[1] === 'ok' && !statusMatch[4],
        directive: statusMatch[4] || '',
      });
      pendingSubtest = null;
      continue;
    }

    if (
      /^1\.\.\d+$/.test(line)
      || /^# (?:tests|suites|pass|fail|cancelled|skipped|todo) \d+$/.test(line)
      || /^# duration_ms \d+(?:\.\d+)?$/.test(line)
      || isNestedYamlDiagnosticLine(line)
    ) {
      continue;
    }

    diagnostics.push(diagnostic('E_TAP_NESTED_UNEXPECTED_LINE', `${parentName}:${line}`));
  }

  if (pendingSubtest) {
    diagnostics.push(diagnostic('E_TAP_NESTED_TEST_RECORD_INCOMPLETE', `${parentName}:${pendingSubtest}`));
  }
  records.forEach((record, index) => {
    if (record.number !== index + 1) diagnostics.push(diagnostic('E_TAP_NESTED_TEST_SEQUENCE_INVALID', `${parentName}:${record.name}`));
  });

  const counts = {
    tests: parseOptionalNestedCount(nestedLines, 'tests', diagnostics, parentName),
    suites: parseOptionalNestedCount(nestedLines, 'suites', diagnostics, parentName),
    pass: parseOptionalNestedCount(nestedLines, 'pass', diagnostics, parentName),
    fail: parseOptionalNestedCount(nestedLines, 'fail', diagnostics, parentName),
    cancelled: parseOptionalNestedCount(nestedLines, 'cancelled', diagnostics, parentName),
    skipped: parseOptionalNestedCount(nestedLines, 'skipped', diagnostics, parentName),
    todo: parseOptionalNestedCount(nestedLines, 'todo', diagnostics, parentName),
  };
  if (counts.suites !== null && counts.suites !== 0) diagnostics.push(diagnostic('E_TAP_NESTED_SUITES_UNEXPECTED', parentName));
  if (plan === 0 || counts.tests === 0) diagnostics.push(diagnostic('E_TAP_NESTED_ZERO_TESTS', parentName));
  if (counts.skipped !== null && counts.skipped !== 0) diagnostics.push(diagnostic('E_TAP_NESTED_SKIPPED_TESTS', parentName));
  if (counts.todo !== null && counts.todo !== 0) diagnostics.push(diagnostic('E_TAP_NESTED_TODO_TESTS', parentName));
  if (counts.cancelled !== null && counts.cancelled !== 0) diagnostics.push(diagnostic('E_TAP_NESTED_CANCELLED_TESTS', parentName));
  if (counts.fail !== null && counts.fail !== 0) diagnostics.push(diagnostic('E_TAP_NESTED_FAILED_TESTS', parentName));
  if (records.some((record) => record.directive === 'SKIP')) diagnostics.push(diagnostic('E_TAP_NESTED_SKIPPED_TESTS', parentName));
  if (records.some((record) => record.directive === 'TODO')) diagnostics.push(diagnostic('E_TAP_NESTED_TODO_TESTS', parentName));
  if (records.some((record) => !record.pass)) diagnostics.push(diagnostic('E_TAP_NESTED_FAILED_TESTS', parentName));
  if (
    (plan !== null && plan !== records.length)
    || (counts.tests !== null && counts.tests !== records.length)
    || (counts.pass !== null && counts.pass !== records.filter((record) => record.pass).length)
    || (counts.fail !== null && counts.fail !== records.filter((record) => !record.pass && !record.directive).length)
  ) {
    diagnostics.push(diagnostic('E_TAP_NESTED_COUNTS_INCONSISTENT', parentName));
  }
}

function parseTapReport(stdout) {
  const diagnostics = [];
  const lines = String(stdout || '').replace(/\r\n/g, '\n').split('\n');
  const tapHeaders = lines.filter((line) => line === 'TAP version 13');
  if (lines[0] !== 'TAP version 13' || tapHeaders.length !== 1) {
    diagnostics.push(diagnostic('E_TAP_HEADER_INVALID'));
  }
  const knownTopLevelLine = /^(?:TAP version 13|# Subtest: .+|(?:ok|not ok) \d+ - .+|1\.\.\d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo) \d+|# duration_ms \d+(?:\.\d+)?)$/;
  for (const line of lines) {
    if (line && !/^\s/.test(line) && !knownTopLevelLine.test(line)) {
      diagnostics.push(diagnostic('E_TAP_UNEXPECTED_TOP_LEVEL_LINE', line));
    }
  }

  const topLevelRecords = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line && !/^\s/.test(line));
  const planMatches = lines
    .map((line) => line.match(/^1\.\.(\d+)$/))
    .filter(Boolean);
  if (planMatches.length !== 1) diagnostics.push(diagnostic('E_TAP_PLAN_INVALID'));
  const plan = planMatches.length === 1 ? Number.parseInt(planMatches[0][1], 10) : null;

  const records = [];
  const seenNumbers = new Set();
  const seenNames = new Set();
  let pendingSubtest = null;
  for (const item of topLevelRecords) {
    const { line, index } = item;
    if (line === 'TAP version 13') continue;
    if (line.startsWith('# Subtest: ')) {
      if (pendingSubtest) {
        diagnostics.push(diagnostic('E_TAP_TEST_RECORD_BOUNDARY', pendingSubtest.name));
      }
      pendingSubtest = {
        index,
        name: line.slice('# Subtest: '.length),
      };
      continue;
    }
    const statusMatch = line.match(/^(ok|not ok) (\d+) - (.*?)(?: # (SKIP|TODO)(?: .*)?)?$/);
    if (statusMatch) {
      if (!pendingSubtest) {
        diagnostics.push(diagnostic('E_TAP_STATUS_ORPHAN', statusMatch[3]));
        continue;
      }
      const name = pendingSubtest.name;
      const statusName = statusMatch[3];
      const number = Number.parseInt(statusMatch[2], 10);
      if (!name || statusName !== name) {
        diagnostics.push(diagnostic('E_TAP_TEST_IDENTITY_MISMATCH', name || statusName));
      }
      if (seenNumbers.has(number) || seenNames.has(name)) {
        diagnostics.push(diagnostic('E_TAP_TEST_IDENTITY_DUPLICATE', name));
      }
      seenNumbers.add(number);
      seenNames.add(name);
      validateNestedTapBody(lines.slice(pendingSubtest.index + 1, index), name, diagnostics);
      records.push({
        number,
        name,
        pass: statusMatch[1] === 'ok' && !statusMatch[4],
        directive: statusMatch[4] || '',
      });
      pendingSubtest = null;
      continue;
    }
    if (pendingSubtest && (line.startsWith('1..') || line.startsWith('# '))) {
      diagnostics.push(diagnostic('E_TAP_TEST_RECORD_BOUNDARY', pendingSubtest.name));
      pendingSubtest = null;
    }
  }
  if (pendingSubtest) {
    diagnostics.push(diagnostic('E_TAP_TEST_RECORD_INCOMPLETE', pendingSubtest.name));
  }

  records.forEach((record, index) => {
    if (record.number !== index + 1) diagnostics.push(diagnostic('E_TAP_TEST_SEQUENCE_INVALID', record.name));
  });

  const counts = {
    tests: parseCount(lines, 'tests', diagnostics),
    suites: parseCount(lines, 'suites', diagnostics),
    pass: parseCount(lines, 'pass', diagnostics),
    fail: parseCount(lines, 'fail', diagnostics),
    cancelled: parseCount(lines, 'cancelled', diagnostics),
    skipped: parseCount(lines, 'skipped', diagnostics),
    todo: parseCount(lines, 'todo', diagnostics),
  };
  const durationMatches = lines
    .map((line) => line.match(/^# duration_ms (\d+(?:\.\d+)?)$/))
    .filter(Boolean);
  if (durationMatches.length !== 1 || !Number.isFinite(Number(durationMatches[0]?.[1]))) {
    diagnostics.push(diagnostic('E_TAP_DURATION_INVALID'));
  }
  if (counts.suites !== 0) diagnostics.push(diagnostic('E_TAP_SUITES_UNEXPECTED'));
  if (plan === 0 || counts.tests === 0 || records.length === 0) {
    diagnostics.push(diagnostic('E_TAP_ZERO_TESTS'));
  }
  if (counts.skipped !== 0 || records.some((record) => record.directive === 'SKIP')) {
    diagnostics.push(diagnostic('E_TAP_SKIPPED_TESTS'));
  }
  if (counts.todo !== 0 || records.some((record) => record.directive === 'TODO')) {
    diagnostics.push(diagnostic('E_TAP_TODO_TESTS'));
  }
  if (counts.cancelled !== 0) diagnostics.push(diagnostic('E_TAP_CANCELLED_TESTS'));
  if (counts.fail !== 0 || records.some((record) => !record.pass)) {
    diagnostics.push(diagnostic('E_TAP_FAILED_TESTS'));
  }
  if (
    plan !== records.length
    || counts.tests !== records.length
    || counts.pass !== records.filter((record) => record.pass).length
    || counts.fail !== records.filter((record) => !record.pass && !record.directive).length
  ) {
    diagnostics.push(diagnostic('E_TAP_COUNTS_INCONSISTENT'));
  }
  return { records, plan, counts, diagnostics };
}

function compareStringArrays(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validateEvidenceMap(evidenceMap) {
  const diagnostics = [];
  if (!Array.isArray(evidenceMap)) return [diagnostic('E_MATRIX_DEFINITION_MALFORMED')];
  const canonicalIds = new Set(PRODUCTION_NEGATIVE_EVIDENCE_MAP.map((row) => row.id));
  const evidenceOwners = new Map();
  for (const canonicalRow of PRODUCTION_NEGATIVE_EVIDENCE_MAP) {
    const matches = evidenceMap.filter((row) => row?.id === canonicalRow.id);
    if (matches.length === 0) diagnostics.push(diagnostic('E_MATRIX_ROW_MISSING', canonicalRow.id));
    if (matches.length > 1) diagnostics.push(diagnostic('E_MATRIX_ROW_DUPLICATE', canonicalRow.id));
    if (matches.length === 1 && !compareStringArrays(matches[0].testNames, canonicalRow.testNames)) {
      diagnostics.push(diagnostic('E_MATRIX_ROW_MAPPING_INVALID', canonicalRow.id));
    }
  }
  for (const row of evidenceMap) {
    if (!row || typeof row.id !== 'string' || !Array.isArray(row.testNames)) {
      diagnostics.push(diagnostic('E_MATRIX_DEFINITION_MALFORMED'));
      continue;
    }
    if (!canonicalIds.has(row.id)) diagnostics.push(diagnostic('E_MATRIX_ROW_UNKNOWN', row.id));
    for (const testName of row.testNames) {
      if (evidenceOwners.has(testName)) {
        diagnostics.push(diagnostic('E_MATRIX_EVIDENCE_DUPLICATE', testName));
      } else {
        evidenceOwners.set(testName, row.id);
      }
    }
  }
  return diagnostics;
}

export function evaluateAtlasV6NegativeMatrixExecution(execution, options = {}) {
  const evidenceMap = options.evidenceMap || PRODUCTION_NEGATIVE_EVIDENCE_MAP;
  const tap = parseTapReport(execution?.stdout);
  const diagnostics = [...validateEvidenceMap(evidenceMap), ...tap.diagnostics];
  if (!execution || execution.exitCode !== 0 || execution.ok !== true || execution.signal) {
    diagnostics.push(diagnostic('E_CHILD_EXECUTION_FAILED'));
  }
  if (String(execution?.stderr || '').trim()) diagnostics.push(diagnostic('E_CHILD_STDERR_PRESENT'));

  const recordsByName = new Map();
  for (const record of tap.records) {
    const records = recordsByName.get(record.name) || [];
    records.push(record);
    recordsByName.set(record.name, records);
  }
  const canonicalNames = new Set(PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames));
  for (const record of tap.records) {
    if (!canonicalNames.has(record.name)) {
      diagnostics.push(diagnostic('E_MATRIX_EVIDENCE_UNMAPPED', record.name));
    }
  }

  const matrix = PRODUCTION_NEGATIVE_EVIDENCE_MAP.map((row) => {
    const evidence = row.testNames.map((testName) => {
      const records = recordsByName.get(testName) || [];
      if (records.length === 0) diagnostics.push(diagnostic('E_MATRIX_EVIDENCE_MISSING', testName));
      return {
        testName,
        executed: records.length === 1,
        pass: records.length === 1 && records[0].pass === true,
        testNumber: records.length === 1 ? records[0].number : null,
      };
    });
    return {
      id: row.id,
      executed: evidence.every((item) => item.executed),
      pass: evidence.every((item) => item.pass),
      evidence,
    };
  });
  const uniqueDiagnostics = [...new Map(diagnostics.map((item) => [`${item.code}\u0000${item.detail || ''}`, item])).values()];
  const pass = uniqueDiagnostics.length === 0 && matrix.every((row) => row.executed && row.pass);
  return {
    schemaVersion: REPORT_SCHEMA,
    mode: 'negative-matrix',
    pass,
    productionModulesExecuted: tap.records.length > 0 && tap.diagnostics.length === 0,
    sourceOnlyAcceptance: false,
    directReducerOnlyAcceptance: false,
    matrix,
    coverage: {
      requiredRows: PRODUCTION_NEGATIVE_EVIDENCE_MAP.length,
      coveredRows: matrix.filter((row) => row.executed && row.pass).length,
      executedTests: tap.records.length,
      skippedTests: tap.counts.skipped,
      todoTests: tap.counts.todo,
    },
    diagnostics: uniqueDiagnostics,
    execution,
  };
}

function runNodeTests(files) {
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  return {
    ok: result.status === 0,
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || '',
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

export function runAtlasV6NegativeMatrix() {
  const files = [...PRODUCTION_NEGATIVE_TEST_FILES];
  const execution = runNodeTests(files);
  return {
    ...evaluateAtlasV6NegativeMatrixExecution(execution),
    files,
  };
}

function allAcceptedExceptExactMainBinding(accepted = {}) {
  return Object.entries(accepted)
    .filter(([key]) => key !== 'exactSourceBindingPresent')
    .every(([, value]) => value === true);
}

export async function runAtlasV6PackagedLifecycle() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-atlas-v6-packaged-lifecycle-'));
  const packagedOutDir = path.join(tempRoot, 'packaged');
  const manualMapOutDir = path.join(tempRoot, 'manual-map');
  try {
    const packaged = await runP0_03PackagedVisibleJourney({
      outDir: packagedOutDir,
      receiptPath: path.join(packagedOutDir, 'receipt.json'),
      skipBuild: false,
      skipRuntime: false,
    });
    const manualMap = await runManualMapPortabilityJourney({
      rootDir: ROOT,
      outDir: manualMapOutDir,
    });
    const accepted = {
      packagedArtifactBuiltFromCurrentBranch: packaged.accepted?.currentSourcePackageBuilt === true,
      packagedExecutableVisibleLifecycle: packaged.accepted?.packagedExecutableRuntime === true
        && packaged.accepted?.visibleUiInputUsed === true,
      packagedCommandPersistenceAndFreshReopen: packaged.acceptance?.persistedCommandAndFreshReopenProof === true,
      packagedNegativeRowsExceptPremergeMainIdentity: allAcceptedExceptExactMainBinding(packaged.accepted),
      manualMapVisiblePhysicalLifecycle: manualMap.accepted?.visibleInputRuntime === true
        && manualMap.accepted?.pointerAndKeyboardUsed === true,
      manualMapRealJsonAndSvgBytes: manualMap.accepted?.realLocalArtifactBytes === true,
      manualMapCanonicalPersistenceAndReopenReplay: manualMap.accepted?.canonicalPersistenceReopenReplay === true,
      manualMapPdfClaimTruthful: manualMap.accepted?.pdfClaimHonestTypedLoss === true,
      noNetworkOrDirectStorageBypass: manualMap.accepted?.noNetworkNoDialogs === true
        && manualMap.accepted?.noDirectIpcOrStorageBypass === true,
    };
    return {
      schemaVersion: REPORT_SCHEMA,
      mode: 'packaged',
      pass: Object.values(accepted).every((value) => value === true),
      accepted,
      branchIdentityPolicy: 'CURRENT_CLEAN_BRANCH_PACKAGE_PREMERGE; exact merged main is verified separately after merge',
      packaged: {
        status: packaged.status,
        passIncludingExactMainIdentity: packaged.pass === true,
        accepted: packaged.accepted,
        acceptance: packaged.acceptance,
      },
      manualMap: {
        status: manualMap.status,
        pass: manualMap.pass === true,
        accepted: manualMap.accepted,
        artifactBytes: {
          json: manualMap.portability?.realJsonProof?.bytes || 0,
          svg: manualMap.portability?.realSvgProof?.bytes || 0,
        },
        stage10EventCount: manualMap.portability?.stage10EventCount || 0,
      },
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const mode = process.argv.includes('--packaged')
    ? 'packaged'
    : process.argv.includes('--negative-matrix')
      ? 'negative-matrix'
      : '';
  if (!mode) throw new Error('ATLAS_V6_LIFECYCLE_MODE_REQUIRED');
  const report = mode === 'packaged'
    ? await runAtlasV6PackagedLifecycle()
    : runAtlasV6NegativeMatrix();
  const output = mode === 'negative-matrix'
    ? {
        schemaVersion: report.schemaVersion,
        mode: report.mode,
        pass: report.pass,
        matrix: report.matrix,
        coverage: report.coverage,
        diagnostics: report.diagnostics,
        exitCode: report.execution.exitCode,
      }
    : report;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (report.pass !== true) {
    if (mode === 'negative-matrix') {
      process.stderr.write(report.execution.stdout);
      process.stderr.write(report.execution.stderr);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
