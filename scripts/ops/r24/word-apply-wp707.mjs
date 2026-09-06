#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MISSION_DIGEST = '2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';
const STAGE_ID = 'WP-707_WORD_APPLY';
const DECISION_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR_WP707_SINGLE_SCENE_ONLY_V1';
const RECEIPT_SCHEMA = 'YALKEN_R24_WP707_WORD_APPLY_PHYSICAL_RECEIPT_V1';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs/OPS/R24/CORRECTIVE/WP707_WORD_APPLY_PHYSICAL_RECEIPT_V1.json');
const SUBJECT_PATH = path.join(REPO_ROOT, 'src/interchange/word-single-scene-apply-v1.mjs');
const EXACT_APPLY_PATH = path.join(REPO_ROOT, 'src/io/revisionBridge/reviewTransportExactApply.mjs');
const FIXTURE_PATH = path.join(REPO_ROOT, 'test/fixtures/r24-wp707-word-apply-fixtures.js');
const PHYSICAL_RUNNER_PATH = __filename;
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/evidence/wp707-word-apply-v1/physical-v1';
const WORD_SANDBOX_BASE = path.join(
  os.homedir(),
  'Library/Containers/com.microsoft.Word/Data/Documents/YalkenWordAutomation/R2_4',
);
const DEFAULT_WORD_WORK_ROOT = path.join(WORD_SANDBOX_BASE, 'WP707');
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const require = createRequire(import.meta.url);

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

function bindPath(filePath) {
  return {
    basename: path.basename(filePath),
    sha256: sha256File(filePath),
    byteLength: fs.statSync(filePath).size,
  };
}

function pathIsInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function evaluatePhysicalReceipt(receipt) {
  const reasons = [];
  if (receipt?.schemaVersion !== RECEIPT_SCHEMA) reasons.push('SCHEMA');
  if (receipt?.stageId !== STAGE_ID || receipt?.missionDigest !== MISSION_DIGEST) reasons.push('IDENTITY');
  if (receipt?.decisionId !== DECISION_ID) reasons.push('DECISION');
  if (receipt?.status !== 'PASS' || receipt?.result !== 'PASS') reasons.push('STATUS');
  if (receipt?.syntheticOnly !== true || receipt?.userDocumentsOpened !== false) reasons.push('USER_DATA_BOUNDARY');
  if (receipt?.automaticApply !== false || receipt?.multiSceneApply !== false || receipt?.atomicMultiSceneSemantics !== false) reasons.push('AUTHORITY_EXPANSION');
  if (receipt?.networkRequired !== false || receipt?.dependencyAdopted !== false) reasons.push('RUNTIME_EXPANSION');
  if (receipt?.repetitionDenominator !== 3 || receipt?.repetitionPass !== 3) reasons.push('REPETITION_DENOMINATOR');
  if (!Array.isArray(receipt?.repetitions) || receipt.repetitions.length !== 3) reasons.push('REPETITIONS');
  if (new Set((receipt?.repetitions || []).map((item) => item.runIdentitySha256)).size !== 3) reasons.push('REPETITION_IDENTITY');
  for (const item of receipt?.repetitions || []) {
    if (
      item.status !== 'PASS'
      || item.physicalWordOpenEditSaveCloseReopen !== true
      || item.analyzedReturnContractBound !== true
      || item.explicitPreviewStateBound !== true
      || item.sourceFenceBound !== true
      || item.explicitUserConfirmedCommandApply !== true
      || item.commandKernelRevalidationObserved !== true
      || item.projectReopenReadback !== true
      || item.completedRoundReuse !== true
      || item.wordSandboxStableRoot !== true
      || item.wordOpenedT7Directly !== false
      || item.grantFileAccessInteractionCount !== 0
      || item.sandboxAndDurableHashesMatch !== true
      || item.userDocumentTouch !== 0
      || item.networkRequest !== 0
      || item.wrongSceneRouting !== 0
      || item.silentApply !== 0
    ) reasons.push(`REPETITION_${item.ordinal || 'UNKNOWN'}`);
  }
  if (receipt?.bindings?.subject?.sha256 !== sha256File(SUBJECT_PATH)) reasons.push('SUBJECT_DIGEST');
  if (receipt?.bindings?.exactApply?.sha256 !== sha256File(EXACT_APPLY_PATH)) reasons.push('EXACT_APPLY_DIGEST');
  if (receipt?.bindings?.physicalRunner?.sha256 !== sha256File(PHYSICAL_RUNNER_PATH)) reasons.push('PHYSICAL_RUNNER_DIGEST');
  const comparable = { ...receipt };
  delete comparable.receiptDigest;
  if (receipt?.receiptDigest !== sha256Bytes(Buffer.from(stableJson(comparable), 'utf8'))) reasons.push('RECEIPT_DIGEST');
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons,
    repetitionDenominator: receipt?.repetitionDenominator || 0,
    repetitionPass: receipt?.repetitionPass || 0,
  };
}

function appleLiteral(value) {
  return `"${String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function parseKeyValueLines(value) {
  return Object.fromEntries(String(value || '').trim().split(/\r?\n/u).filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function wordProfile() {
  const plist = (key) => execFileSync('/usr/libexec/PlistBuddy', [
    '-c', `Print ${key}`, path.join(WORD_APP_PATH, 'Contents/Info.plist'),
  ], { encoding: 'utf8', timeout: 15_000 }).trim();
  const version = plist(':CFBundleShortVersionString');
  const build = plist(':CFBundleVersion');
  return { version, build, buildId: `${version}:${build}` };
}

function assertNoOpenWordDocuments() {
  const count = execFileSync('/usr/bin/osascript', [
    '-e', 'tell application "Microsoft Word" to return count of documents',
  ], { encoding: 'utf8', timeout: 30_000 }).trim();
  if (Number(count) !== 0) throw new Error('WP707_WORD_USER_DOCUMENT_SESSION_NOT_EMPTY');
}

function runWordSyntheticCycle({ runDir, wordRunDir, ordinal }) {
  fs.mkdirSync(runDir, { recursive: false });
  fs.mkdirSync(wordRunDir, { recursive: false });
  const initialText = `Yalken WP707 synthetic scene ${ordinal} Alpha OLD_WORD gamma.`;
  const replacementText = `WP707_NEW_${ordinal}`;
  const expectedText = initialText.replace('OLD_WORD', replacementText);
  const docxPath = path.join(wordRunDir, `wp707-single-scene-${ordinal}.docx`);
  const evidenceDocxPath = path.join(runDir, `wp707-single-scene-${ordinal}.docx`);
  const scriptPath = path.join(runDir, `wp707-single-scene-${ordinal}.applescript`);
  const start = initialText.indexOf('OLD_WORD');
  const end = start + 'OLD_WORD'.length;
  const script = [
    'on yOpenExpectedDoc(yPosixPath, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yExpectedFullName to (POSIX file yPosixPath as alias) as text',
    '  set yDeadline to (current date) + 40',
    '  tell application "Microsoft Word"',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        if (name of active document as text) is yExpectedName and (full name of active document as text) is yExpectedFullName then return true',
    '      end try',
    '      delay 0.25',
    '    end repeat',
    '  end tell',
    '  return false',
    'end yOpenExpectedDoc',
    'with timeout of 300 seconds',
    'tell application "Microsoft Word"',
    '  activate',
    '  set yStep to "START"',
    '  set yDocWasOpened to false',
    '  set oldAlerts to display alerts',
    '  try',
    '    set display alerts to alerts none',
    '    set yStep to "CREATE"',
    '    set yDoc to make new document',
    '    set yDocWasOpened to true',
    '    set yStep to "INITIAL_CONTENT"',
    `    set content of text object of yDoc to ${appleLiteral(initialText)}`,
    '    set yStep to "INITIAL_SAVE"',
    `    save as yDoc file name (POSIX file ${appleLiteral(docxPath)}) file format format document add to recent files false`,
    '    set yStep to "INITIAL_CLOSE"',
    '    close active document saving yes',
    '    set yDocWasOpened to false',
    '    set yStep to "INITIAL_REOPEN"',
    `    if my yOpenExpectedDoc(${appleLiteral(docxPath)}, ${appleLiteral(path.basename(docxPath))}) is not true then error "WP707_INITIAL_REOPEN_TIMEOUT" number 9700`,
    '    set yDoc to active document',
    '    set yDocWasOpened to true',
    '    set show revisions of yDoc to true',
    '    set yStep to "INITIAL_READBACK"',
    `    if (content of text object of yDoc) does not contain ${appleLiteral(initialText)} then error "WP707_INITIAL_READBACK_MISMATCH" number 9701`,
    '    set yStep to "TRACK_REVISIONS"',
    '    set track revisions of yDoc to true',
    '    set yStep to "RANGE_EDIT"',
    `    set content of (create range yDoc start ${start} end ${end}) to ${appleLiteral(replacementText)}`,
    '    set yStep to "EDIT_SAVE"',
    '    save yDoc',
    '    set yStep to "EDIT_CLOSE"',
    '    close active document saving yes',
    '    set yDocWasOpened to false',
    '    set yStep to "FINAL_REOPEN"',
    `    if my yOpenExpectedDoc(${appleLiteral(docxPath)}, ${appleLiteral(path.basename(docxPath))}) is not true then error "WP707_FINAL_REOPEN_TIMEOUT" number 9703`,
    '    set yDoc to active document',
    '    set yDocWasOpened to true',
    '    set show revisions of yDoc to true',
    '    set yStep to "FINAL_READBACK"',
    '    set yReadback to content of text object of yDoc',
    `    if yReadback does not contain ${appleLiteral(expectedText)} then error "WP707_REOPEN_READBACK_MISMATCH" number 9702`,
    '    set yRevisionCount to count of revisions of yDoc',
    '    close active document saving no',
    '    set yDocWasOpened to false',
    '    set display alerts to oldAlerts',
    '    return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "READBACK_CHARS=" & (count of yReadback)',
    '  on error errMsg number errNo',
    '    try',
    '      if yDocWasOpened then close active document saving no',
    '    end try',
    '    set display alerts to oldAlerts',
    '    return "WORD_STATUS=FAIL" & linefeed & "STEP=" & yStep & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    '  end try',
    'end tell',
    'end timeout',
  ].join('\n');
  if (script.includes('Grant File Access') || /\bclick\b/iu.test(script)) {
    throw new Error('WP707_WORD_GRANT_FILE_ACCESS_INTERACTION_FORBIDDEN');
  }
  fs.writeFileSync(scriptPath, script, { encoding: 'utf8', mode: 0o600 });
  const output = execFileSync('/usr/bin/osascript', [scriptPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 360_000,
  });
  const readback = parseKeyValueLines(output);
  if (readback.WORD_STATUS !== 'PASS') throw new Error(`WP707_WORD_PHYSICAL_FAILED:${JSON.stringify(readback)}`);
  fs.copyFileSync(docxPath, evidenceDocxPath);
  const sandboxDocxSha256 = sha256File(docxPath);
  const durableT7DocxSha256 = sha256File(evidenceDocxPath);
  if (sandboxDocxSha256 !== durableT7DocxSha256) throw new Error('WP707_SANDBOX_T7_COPY_DIGEST_MISMATCH');
  return {
    initialText,
    replacementText,
    expectedText,
    revisionCount: Number(readback.REVISION_COUNT || 0),
    readbackChars: Number(readback.READBACK_CHARS || 0),
    sandboxDocxSha256,
    durableT7DocxSha256,
    grantFileAccessInteractionCount: 0,
    evidenceDocxPath,
    scriptPath,
  };
}

function buildConsolidatedReceipt(repetitions) {
  const pass = repetitions.filter((item) => item.status === 'PASS').length;
  const draft = {
    schemaVersion: RECEIPT_SCHEMA,
    stageId: STAGE_ID,
    missionDigest: MISSION_DIGEST,
    decisionId: DECISION_ID,
    generatedAtUtc: new Date().toISOString(),
    status: pass === 3 ? 'PASS' : 'FAIL',
    result: pass === 3 ? 'PASS' : 'FAIL',
    syntheticOnly: true,
    taskCreatedDisposableDocumentsAndProjectsOnly: true,
    userDocumentsOpened: false,
    automaticApply: false,
    multiSceneApply: false,
    atomicMultiSceneSemantics: false,
    networkRequired: false,
    dependencyAdopted: false,
    repetitionDenominator: 3,
    repetitionPass: pass,
    bindings: {
      subject: bindPath(SUBJECT_PATH),
      exactApply: bindPath(EXACT_APPLY_PATH),
      physicalRunner: bindPath(PHYSICAL_RUNNER_PATH),
      fixture: bindPath(FIXTURE_PATH),
    },
    repetitions,
    nonClaims: [
      'No user document or existing user-drive file is covered.',
      'Automatic apply and multi-scene apply remain denied.',
      'This is local physical Word evidence only; no network or cloud authority is created.',
      'WP706 remains the predecessor authority for report and analyzed-return semantics.',
    ],
  };
  return { ...draft, receiptDigest: sha256Bytes(Buffer.from(stableJson(draft), 'utf8')) };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runPrefix }) {
  if (!path.isAbsolute(artifactRoot) || !artifactRoot.startsWith('/Volumes/T7-Secure/')) {
    throw new Error('WP707_ARTIFACT_ROOT_NOT_SECURE_ABSOLUTE');
  }
  if (!path.isAbsolute(wordWorkRoot) || !pathIsInside(WORD_SANDBOX_BASE, wordWorkRoot)) {
    throw new Error('WP707_WORD_WORK_ROOT_OUTSIDE_STABLE_SANDBOX');
  }
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('WP707_WORD_APP_MISSING');
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.mkdirSync(wordWorkRoot, { recursive: true });
  assertNoOpenWordDocuments();
  const profile = wordProfile();
  const { createWp707Scenario } = require(FIXTURE_PATH);
  const subject = await import(pathToFileURL(SUBJECT_PATH).href);
  const repetitions = [];
  const sandboxRunPaths = [];
  for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
    const runId = `${runPrefix}-r${ordinal}`;
    const runDir = path.join(artifactRoot, runId);
    const wordRunDir = path.join(wordWorkRoot, runId);
    if (fs.existsSync(runDir)) throw new Error(`WP707_RUN_ALREADY_EXISTS:${runId}`);
    if (fs.existsSync(wordRunDir)) throw new Error(`WP707_WORD_RUN_ALREADY_EXISTS:${runId}`);
    sandboxRunPaths.push(wordRunDir);
    const word = runWordSyntheticCycle({ runDir, wordRunDir, ordinal });
    const scenario = createWp707Scenario({
      ordinal: 700 + ordinal,
      beforeText: word.initialText,
      quote: 'OLD_WORD',
      replacementText: word.replacementText,
      wordBuildId: profile.buildId,
    });
    const apply = await subject.executeWordSingleSceneApplyV1(scenario.input, scenario.options);
    const status = apply.ok === true
      && apply.status === 'verified'
      && apply.firstOutcome === 'applied'
      && apply.firstWriterCalled === true
      && apply.replayOutcome === 'replay'
      && apply.replayWriterCalled === false
      && fs.readFileSync(scenario.scenePath, 'utf8') === word.expectedText
      ? 'PASS' : 'FAIL';
    const runReceipt = {
      schemaVersion: 'YALKEN_R24_WP707_WORD_APPLY_PHYSICAL_REPETITION_V1',
      ordinal,
      runId,
      status,
      word: {
        sandboxDocxSha256: word.sandboxDocxSha256,
        durableT7DocxSha256: word.durableT7DocxSha256,
        appleScriptSha256: sha256File(word.scriptPath),
        revisionCount: word.revisionCount,
        readbackChars: word.readbackChars,
      },
      apply,
    };
    const sourceReceiptPath = path.join(runDir, 'wp707-word-apply-repetition.json');
    writeJsonAtomic(sourceReceiptPath, runReceipt);
    repetitions.push({
      ordinal,
      status,
      runIdentitySha256: sha256Bytes(Buffer.from(runId, 'utf8')),
      sourceReceiptSha256: sha256File(sourceReceiptPath),
      sourceDocxSha256: sha256File(word.evidenceDocxPath),
      returnedDocxSha256: sha256File(word.evidenceDocxPath),
      syntheticProjectIdentitySha256: sha256Bytes(Buffer.from(`${runId}:${scenario.projectId}`, 'utf8')),
      syntheticSceneIdentitySha256: sha256Bytes(Buffer.from(`${runId}:${scenario.sceneId}`, 'utf8')),
      wordVersion: profile.version,
      wordBuild: profile.build,
      physicalWordOpenEditSaveCloseReopen: true,
      revisionCount: word.revisionCount,
      analyzedReturnContractBound: scenario.input.lifecycle.returnState === 'RETURN_ANALYZED',
      explicitPreviewStateBound: scenario.input.lifecycle.previewState === 'VISIBLE_EXPLICIT',
      sourceFenceBound: scenario.input.envelopeInput.sourceFence?.result?.decision === 'ALLOW',
      explicitUserConfirmedCommandApply: scenario.input.explicitUserConfirmation === true && apply.ok === true,
      commandKernelRevalidationObserved: Array.isArray(apply.commandKernelRevalidation) && apply.commandKernelRevalidation.length === 2,
      projectReopenReadback: apply.afterTextSha256 === apply.readbackTextSha256,
      completedRoundReuse: apply.replayOutcome === 'replay' && apply.replayWriterCalled === false,
      wordSandboxStableRoot: pathIsInside(WORD_SANDBOX_BASE, wordRunDir),
      wordOpenedT7Directly: false,
      grantFileAccessInteractionCount: word.grantFileAccessInteractionCount,
      sandboxAndDurableHashesMatch: word.sandboxDocxSha256 === word.durableT7DocxSha256,
      userDocumentTouch: 0,
      networkRequest: 0,
      wrongSceneRouting: apply.sceneId === scenario.sceneId ? 0 : 1,
      silentApply: apply.firstWriterCalled === true && scenario.input.explicitUserConfirmation === true ? 0 : 1,
    });
    fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
    assertNoOpenWordDocuments();
  }
  return { receipt: buildConsolidatedReceipt(repetitions), sandboxRunPaths };
}

async function main() {
  if (process.argv.includes('--run-physical')) {
    const runPrefix = argValue('--run-prefix', `wp707-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`);
    const run = await runPhysical({
      artifactRoot: argValue('--artifact-root', DEFAULT_ARTIFACT_ROOT),
      wordWorkRoot: argValue('--word-work-root', DEFAULT_WORD_WORK_ROOT),
      runPrefix,
    });
    const receipt = run.receipt;
    if (process.argv.includes('--write-receipt')) writeJsonAtomic(RECEIPT_PATH, receipt);
    const result = evaluatePhysicalReceipt(receipt);
    let sandboxCleanupCount = 0;
    if (result.ok && process.argv.includes('--write-receipt')) {
      for (const sandboxRunPath of run.sandboxRunPaths) {
        if (!pathIsInside(WORD_SANDBOX_BASE, sandboxRunPath) || !path.basename(sandboxRunPath).startsWith(runPrefix)) {
          throw new Error('WP707_SANDBOX_CLEANUP_TARGET_INVALID');
        }
        fs.rmSync(sandboxRunPath, { recursive: true, force: false });
        sandboxCleanupCount += 1;
      }
    }
    process.stdout.write(`${JSON.stringify({ ...result, sandboxCleanupCount })}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (!fs.existsSync(RECEIPT_PATH)) throw new Error('WP707_PHYSICAL_RECEIPT_MISSING');
  const result = evaluatePhysicalReceipt(readJson(RECEIPT_PATH));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
