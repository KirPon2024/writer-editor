#!/usr/bin/env node
/*
 * PHYS-01 — build-bound physical ladder runner for word-mac-16.111.3-26080215.
 *
 * The lab machine moved to Word 16.111.3 (build 16.111.26080215) on
 * 2026-08-10; LAB-02 typed the migration with zero inheritance. This runner
 * executes the migration ladder for the new build under fail-closed gates.
 * It never reuses or overwrites a receipt bound to another build.
 *
 * Gate law (order load-bearing, pinned by rtk-phys01-ladder-runner.contract):
 *   RUNG_UNKNOWN -> SHA_MISMATCH -> DIRTY_WORKTREE -> WORD_VERSION_MISMATCH ->
 *   WORD_BUILD_MISMATCH -> ARTIFACT_ROOT_INVALID -> WORD_SESSION_NOT_CLEAN.
 *
 * Receipt law: a rung seals only when every case passes
 * open-edit-save-close-reopen with sentinel AND insertion readback proof.
 * buildSmokeReceipt throws RTK_PHYS_CASE_FAILURES_PRESENT instead of sealing a
 * failed run — there is no silent seal path.
 *
 * Physical execution happens only with --run-physical and only after all gates
 * pass. Synthetic fixtures only, inside the Word container sandbox; no user
 * documents are opened; no network; no credentials.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeJsonAtomic, buildB06SyntheticDocxBuffer } from './rtk-word-latest-physical-certification-lab.mjs';
import { defaultWordSandboxWorkRoot, assertWordSandboxWorkRoot } from './rtk-word-sandbox-work-root.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The T7 artifact-root law mirrors the C5V2 canary verifier
// (verifyC5V2PhysicalArtifactRoot) but is implemented inline so this runner
// never imports the canary module (which carries a heavy electron import
// chain). Same checks, same codes: containment under /Volumes/T7-Secure,
// symlink-free components, diskutil-parsed UUID / APFS / FileVault / not
// read-only, and an R_OK|W_OK access probe.
const T7_MOUNT = '/Volumes/T7-Secure';
const T7_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';

function parseDiskInfoValue(text, key) {
  const match = String(text || '').match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm'));
  return match ? match[1] : '';
}

export function verifyPhysArtifactRoot({ artifactRoot, diskInfoText } = {}) {
  const root = path.resolve(String(artifactRoot || ''));
  if (!path.isAbsolute(String(artifactRoot || '')) || root === path.parse(root).root) {
    throw new Error('C5V2_ARTIFACT_ROOT_INVALID');
  }
  // Symlink-free components between the mount and the root.
  let cursor = root;
  const components = [];
  while (cursor !== path.parse(cursor).root) {
    components.unshift(cursor);
    cursor = path.dirname(cursor);
  }
  for (const component of components) {
    if (fs.existsSync(component) && fs.lstatSync(component).isSymbolicLink()) {
      throw new Error(`C5V2_ARTIFACT_ROOT_SYMLINK:${component}`);
    }
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const rootReal = fs.realpathSync(root);
  const mountReal = fs.realpathSync(T7_MOUNT);
  if (!(rootReal === mountReal || rootReal.startsWith(`${mountReal}${path.sep}`))) {
    throw new Error(`C5V2_ARTIFACT_ROOT_NOT_T7:${rootReal}`);
  }
  const parsed = {
    uuid: parseDiskInfoValue(diskInfoText, 'Volume UUID'),
    apfs: /Type \(Bundle\):\s*apfs/i.test(String(diskInfoText)) || /File System Personality:\s*APFS/i.test(String(diskInfoText)),
    fileVault: /FileVault:\s*Yes/i.test(String(diskInfoText)),
    readOnly: /Read-Only Volume:\s*Yes/i.test(String(diskInfoText)),
  };
  if (parsed.uuid !== T7_UUID) throw new Error(`C5V2_ARTIFACT_ROOT_T7_UUID_MISMATCH:${parsed.uuid}`);
  if (parsed.apfs !== true) throw new Error('C5V2_ARTIFACT_ROOT_T7_APFS_REQUIRED');
  if (parsed.fileVault !== true) throw new Error('C5V2_ARTIFACT_ROOT_T7_FILEVAULT_REQUIRED');
  if (parsed.readOnly === true) throw new Error('C5V2_ARTIFACT_ROOT_T7_READ_ONLY');
  fs.accessSync(rootReal, fs.constants.R_OK | fs.constants.W_OK);
  return { ok: true, rootReal };
}

export const PHYS_PROFILE_ID = 'word-mac-16.111.3-26080215';
export const PHYS_EXPECTED_WORD_VERSION = '16.111.3';
export const PHYS_EXPECTED_WORD_BUILD = '16.111.26080215';
export const PHYS_LADDER_RUNGS = Object.freeze(['CARRIER_SURVIVAL_SMOKE']);
export const SMOKE_RECEIPT_SCHEMA = 'yalken.rtk.word-mac-16-111-3.carrier-survival-smoke-receipt.v1';
export const SMOKE_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_111_3_CARRIER_SURVIVAL_SMOKE_RECEIPT.json';
export const SMOKE_CASE_COUNT = 12;

export const PHYS_CODES = Object.freeze({
  GATES_OK: 'RTK_PHYS_GATES_OK',
  RUNG_UNKNOWN: 'RTK_PHYS_RUNG_UNKNOWN',
  SHA_MISMATCH: 'RTK_PHYS_SHA_MISMATCH',
  DIRTY_WORKTREE: 'RTK_PHYS_DIRTY_WORKTREE',
  WORD_VERSION_MISMATCH: 'RTK_PHYS_WORD_VERSION_MISMATCH',
  WORD_BUILD_MISMATCH: 'RTK_PHYS_WORD_BUILD_MISMATCH',
  ARTIFACT_ROOT_INVALID: 'RTK_PHYS_ARTIFACT_ROOT_INVALID',
  WORD_SESSION_NOT_CLEAN: 'RTK_PHYS_WORD_SESSION_NOT_CLEAN',
  CASE_FAILURES_PRESENT: 'RTK_PHYS_CASE_FAILURES_PRESENT',
  RECEIPT_INVALID: 'RTK_PHYS_RECEIPT_INVALID',
});

function reason(code, message) {
  return { code, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Default ports (the only place process/git/Word are touched; tests inject).
// ---------------------------------------------------------------------------

function shell(command, args, options = {}) {
  try {
    return String(execFileSync(command, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })).trim();
  } catch (error) {
    return '';
  }
}

function defaultPorts() {
  return {
    gitHead: () => shell('git', ['rev-parse', 'HEAD']),
    gitOriginMain: () => shell('git', ['rev-parse', 'origin/main']),
    gitDirty: () => shell('git', ['status', '--porcelain']) !== '',
    probeWordPlist: () => ({
      version: shell('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '/Applications/Microsoft Word.app/Contents/Info.plist']),
      build: shell('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '/Applications/Microsoft Word.app/Contents/Info.plist']),
    }),
    verifyArtifactRoot: ({ artifactRoot }) => {
      try {
        verifyPhysArtifactRoot({ artifactRoot, diskInfoText: shell('diskutil', ['info', '/Volumes/T7-Secure']) });
        return { ok: true };
      } catch (error) {
        return { ok: false, code: String(error.message || error).split(':')[0] };
      }
    },
    countOpenWordDocuments: () => {
      const out = shell('osascript', ['-e', 'tell application "Microsoft Word" to return (count of documents) as text'], { timeout: 15_000 });
      const n = Number(out);
      return Number.isSafeInteger(n) ? n : -1;
    },
  };
}

// ---------------------------------------------------------------------------
// evaluatePhysGates — fail-closed gate evaluation. Read-only; never spawns
// Word. The session check runs only when requireSession is set (physical mode).
// ---------------------------------------------------------------------------

export function evaluatePhysGates({ rung, expectedSha, expectedWordVersion, expectedWordBuild, artifactRoot, ports, requireSession = true } = {}) {
  const p = ports || defaultPorts();

  if (!PHYS_LADDER_RUNGS.includes(rung)) {
    return { ok: false, code: PHYS_CODES.RUNG_UNKNOWN, reasons: [reason(PHYS_CODES.RUNG_UNKNOWN, `rung ${JSON.stringify(rung)} is not implemented by this runner`)] };
  }

  const head = p.gitHead();
  const originMain = p.gitOriginMain();
  if (head !== expectedSha || originMain !== expectedSha) {
    return { ok: false, code: PHYS_CODES.SHA_MISMATCH, reasons: [reason(PHYS_CODES.SHA_MISMATCH, `HEAD ${head} / origin/main ${originMain} != expected ${expectedSha}`)] };
  }

  if (p.gitDirty() === true) {
    return { ok: false, code: PHYS_CODES.DIRTY_WORKTREE, reasons: [reason(PHYS_CODES.DIRTY_WORKTREE, 'worktree is dirty; physical evidence binds only to a clean exact head')] };
  }

  const probed = p.probeWordPlist() || {};
  if (probed.version !== expectedWordVersion) {
    return { ok: false, code: PHYS_CODES.WORD_VERSION_MISMATCH, reasons: [reason(PHYS_CODES.WORD_VERSION_MISMATCH, `Word version ${JSON.stringify(probed.version)} != expected ${JSON.stringify(expectedWordVersion)}`)] };
  }
  if (probed.build !== expectedWordBuild) {
    return { ok: false, code: PHYS_CODES.WORD_BUILD_MISMATCH, reasons: [reason(PHYS_CODES.WORD_BUILD_MISMATCH, `Word build ${JSON.stringify(probed.build)} != expected ${JSON.stringify(expectedWordBuild)}`)] };
  }

  const root = p.verifyArtifactRoot({ artifactRoot });
  if (!root || root.ok !== true) {
    return { ok: false, code: PHYS_CODES.ARTIFACT_ROOT_INVALID, reasons: [reason(PHYS_CODES.ARTIFACT_ROOT_INVALID, `artifact root rejected: ${JSON.stringify(root && root.code)}`)] };
  }

  if (requireSession === true) {
    const openDocs = p.countOpenWordDocuments();
    if (openDocs !== 0) {
      return { ok: false, code: PHYS_CODES.WORD_SESSION_NOT_CLEAN, reasons: [reason(PHYS_CODES.WORD_SESSION_NOT_CLEAN, `Word has ${openDocs} open document(s); the controller convention requires zero extraneous documents`)] };
    }
  }

  return { ok: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, 'all physical gates green')] };
}

// ---------------------------------------------------------------------------
// Smoke cases — the CARRIER_SURVIVAL_SMOKE rung: synthetic DOCX survives a
// full Word open -> tracked edit -> save -> close -> reopen cycle with the
// sentinel and the inserted text both visible on readback.
// ---------------------------------------------------------------------------

export function buildSmokeCaseSpecs() {
  return Array.from({ length: SMOKE_CASE_COUNT }, (_, i) => ({
    id: `phys-16-111-3-smoke-${String(i + 1).padStart(2, '0')}`,
    ordinal: i + 1,
    title: `Carrier survival smoke case ${i + 1} (Word 16.111.3)`,
  }));
}

export function evaluateSmokeCases(cases) {
  const list = Array.isArray(cases) ? cases : [];
  const failed = list.filter((c) => !c
    || c.wordStatus !== 'PASS'
    || c.openEditSaveCloseReopen !== 'PASS'
    || c.readbackContainsSentinel !== true
    || c.readbackContainsInsertion !== true);
  if (list.length === 0 || failed.length > 0) {
    return {
      ok: false,
      sealed: false,
      code: PHYS_CODES.CASE_FAILURES_PRESENT,
      reasons: [reason(PHYS_CODES.CASE_FAILURES_PRESENT, `${failed.length} of ${list.length} cases failed or lack readback proof`)],
    };
  }
  return { ok: true, sealed: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, `${list.length} cases passed with readback proof`)] };
}

export function buildSmokeReceipt({ rung, headSha, originMainSha, wordProfile, cases, artifactRoot }) {
  const verdict = evaluateSmokeCases(cases);
  if (!verdict.ok) {
    throw new Error(`${PHYS_CODES.CASE_FAILURES_PRESENT}: cannot seal a smoke receipt with failed cases`);
  }
  const passed = cases.filter((c) => c.openEditSaveCloseReopen === 'PASS').length;
  return {
    schema: SMOKE_RECEIPT_SCHEMA,
    profileId: PHYS_PROFILE_ID,
    rung,
    status: 'PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS',
    headSha,
    originMainSha,
    wordProfile,
    artifactRoot,
    counters: { total: cases.length, passed, failed: cases.length - passed },
    cases,
    nonClaims: [
      'This receipt is evidence for the word-mac-16.111.3-26080215 profile only.',
      'No compatibility with the current Word build is claimed by this rung.',
      'No saturation, no terminal pass and no user-facing claim follows.',
    ],
  };
}

export function validateSmokeReceipt(receipt) {
  const reasons = [];
  if (!isPlainObject(receipt)) {
    return { ok: false, code: PHYS_CODES.RECEIPT_INVALID, reasons: [reason(PHYS_CODES.RECEIPT_INVALID, 'receipt must be an object')] };
  }
  if (receipt.schema !== SMOKE_RECEIPT_SCHEMA) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `schema must equal ${SMOKE_RECEIPT_SCHEMA}`));
  if (receipt.profileId !== PHYS_PROFILE_ID) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `profileId must equal ${PHYS_PROFILE_ID}`));
  if (receipt.rung !== 'CARRIER_SURVIVAL_SMOKE') reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'rung must be CARRIER_SURVIVAL_SMOKE'));
  if (receipt.status !== 'PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS') reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'status must be PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS'));
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  const counters = isPlainObject(receipt.counters) ? receipt.counters : {};
  if (counters.total !== cases.length || counters.passed !== cases.filter((c) => c && c.openEditSaveCloseReopen === 'PASS').length) {
    reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `counters ${JSON.stringify(counters)} do not match cases`));
  }
  const verdict = evaluateSmokeCases(cases);
  if (!verdict.ok) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `cases do not satisfy the seal law: ${verdict.reasons[0].message}`));
  if (reasons.length > 0) return { ok: false, code: PHYS_CODES.RECEIPT_INVALID, reasons };
  return { ok: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, 'receipt valid')] };
}

// ---------------------------------------------------------------------------
// Physical execution (only under --run-physical after gates).
// ---------------------------------------------------------------------------

function appleLiteral(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildSmokeWordScript(expectedName, returnedPath, sentinel, insertion) {
  const returnedPathLiteral = appleLiteral(returnedPath);
  return [
    'on yOpenExpectedDoc(yPosixPath, yExpectedFullName, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 25',
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        if (name of active document as text) is yExpectedName and (full name of active document as text) is yExpectedFullName then return true',
    '      end try',
    '      delay 0.25',
    '    end repeat',
    '  end tell',
    '  return false',
    'end yOpenExpectedDoc',
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'try',
    '  set display alerts to alerts none',
    `  set yFile to POSIX file ${returnedPathLiteral} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "PHYS_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(sentinel)} then error "PHYS_OPEN_CONTENT_MISMATCH" number 9701`,
    '  set track revisions of yDoc to true',
    '  set show revisions of yDoc to true',
    `  set end of content of text object of yDoc to (count of content of text object of yDoc)`,
    `  set content of (create range yDoc start ((count of content of text object of yDoc) - 1) end (count of content of text object of yDoc)) to (content of (create range yDoc start ((count of content of text object of yDoc) - 1) end (count of content of text object of yDoc))) & ${appleLiteral(insertion)}`,
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "PHYS_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    '  set ySentinelOk to yReadback contains ' + appleLiteral(sentinel),
    '  set yInsertionOk to yReadback contains ' + appleLiteral(insertion),
    '  set yRevisionCount to count of revisions of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "SENTINEL_OK=" & ySentinelOk & linefeed & "INSERTION_OK=" & yInsertionOk & linefeed & "REVISION_COUNT=" & yRevisionCount',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
    '  end try',
    '  try',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    'end try',
    'end tell',
  ].join('\n');
}

function parseKeyValueLines(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function collectPhysWordProfile() {
  const probed = defaultPorts().probeWordPlist();
  return {
    appPath: '/Applications/Microsoft Word.app',
    versionByBundle: probed.version,
    buildByBundle: probed.build,
    versionByAppleScript: shell('osascript', ['-e', 'tell application "Microsoft Word" to return version as text']),
    macosVersion: shell('sw_vers', ['-productVersion']),
    macosBuild: shell('sw_vers', ['-buildVersion']),
    locale: shell('defaults', ['read', '-g', 'AppleLocale']),
  };
}

async function runSmokePhysical({ artifactRoot, runId }) {
  const wordWorkRoot = defaultWordSandboxWorkRoot('phys-16-111-3', 'carrier-survival-smoke');
  assertWordSandboxWorkRoot(wordWorkRoot);
  const dirs = {
    wordSources: path.join(wordWorkRoot, 'sources', runId),
    wordReturns: path.join(wordWorkRoot, 'returns', runId),
    evidence: path.join(artifactRoot, runId),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

  const cases = [];
  for (const spec of buildSmokeCaseSpecs()) {
    const sentinel = `YALKEN_B06_CASE ${spec.id}`;
    const insertion = ` PHYS_16_111_3_CARRIER ${spec.id}`;
    const sourcePath = path.join(dirs.wordSources, `${spec.id}-source.docx`);
    const returnedPath = path.join(dirs.wordReturns, `${spec.id}-returned.docx`);
    const buffer = buildB06SyntheticDocxBuffer(spec);
    fs.writeFileSync(sourcePath, buffer);
    fs.copyFileSync(sourcePath, returnedPath);
    const script = buildSmokeWordScript(path.basename(returnedPath), returnedPath, sentinel, insertion);
    const scriptPath = path.join(dirs.evidence, `${spec.id}.applescript`);
    fs.writeFileSync(scriptPath, script);
    const output = shell('osascript', [scriptPath], { timeout: 120_000 });
    const kv = parseKeyValueLines(output);
    fs.copyFileSync(returnedPath, path.join(dirs.evidence, `${spec.id}-returned.docx`));
    fs.copyFileSync(sourcePath, path.join(dirs.evidence, `${spec.id}-source.docx`));
    cases.push({
      caseId: spec.id,
      ordinal: spec.ordinal,
      wordStatus: kv.WORD_STATUS === 'PASS' && kv.SENTINEL_OK === 'true' && kv.INSERTION_OK === 'true' ? 'PASS' : 'FAIL',
      openEditSaveCloseReopen: kv.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
      readbackContainsSentinel: kv.SENTINEL_OK === 'true',
      readbackContainsInsertion: kv.INSERTION_OK === 'true',
      wordRevisionCount: Number(kv.REVISION_COUNT || 0),
      sourceDocxSha256: sha256File(sourcePath),
      returnedDocxSha256: sha256File(returnedPath),
      error: kv.ERR ? `${kv.ERRNO || ''}:${kv.ERR}` : '',
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function getArg(argv, name, fallback = '') {
  const idx = argv.indexOf(name);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const rung = getArg(argv, '--rung', 'CARRIER_SURVIVAL_SMOKE');
  const expectedSha = getArg(argv, '--expected-sha');
  const artifactRoot = getArg(argv, '--artifact-root', '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/phys-16-111-3');
  const runPhysical = argv.includes('--run-physical');
  const gates = evaluatePhysGates({
    rung,
    expectedSha,
    expectedWordVersion: getArg(argv, '--expected-word-version', PHYS_EXPECTED_WORD_VERSION),
    expectedWordBuild: getArg(argv, '--expected-word-build', PHYS_EXPECTED_WORD_BUILD),
    artifactRoot,
  });
  if (!gates.ok) {
    console.log(`PHYS_GATES=FAIL code=${gates.code}`);
    console.log(JSON.stringify(gates.reasons, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log('PHYS_GATES=PASS');
  if (!runPhysical) {
    console.log('PHYS_REPORT_ONLY: gates green; pass --run-physical to execute.');
    return;
  }

  const runId = `phys-smoke-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`;
  const cases = await runSmokePhysical({ artifactRoot, runId });
  const verdict = evaluateSmokeCases(cases);
  const headSha = defaultPorts().gitHead();
  const receiptAttempt = {
    rung,
    headSha,
    originMainSha: headSha,
    wordProfile: collectPhysWordProfile(),
    cases,
    artifactRoot: path.join(artifactRoot, runId),
  };
  if (!verdict.ok) {
    const failPath = path.join(artifactRoot, runId, 'FAILED_RUN.json');
    writeJsonAtomic(failPath, { ...receiptAttempt, status: 'PHYSICAL_RUN_FAILED', verdict });
    console.log(`PHYS_RUN=FAIL code=${verdict.code} evidence=${failPath}`);
    process.exitCode = 1;
    return;
  }
  const receipt = buildSmokeReceipt(receiptAttempt);
  const validation = validateSmokeReceipt(receipt);
  if (!validation.ok) {
    console.log(`PHYS_RUN=FAIL code=${validation.code}`);
    process.exitCode = 1;
    return;
  }
  const receiptPath = path.join(REPO_ROOT, SMOKE_RECEIPT_REF);
  writeJsonAtomic(receiptPath, receipt);
  writeJsonAtomic(path.join(artifactRoot, runId, path.basename(SMOKE_RECEIPT_REF)), receipt);
  console.log(`PHYS_RUN=PASS cases=${receipt.counters.passed}/${receipt.counters.total} receipt=${SMOKE_RECEIPT_REF}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`PHYS_RUNNER_FATAL: ${error.message}`);
    process.exitCode = 1;
  });
}

export { pathToFileURL };
