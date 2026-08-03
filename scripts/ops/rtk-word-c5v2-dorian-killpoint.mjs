#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadCanaryCorpus } from './rtk-word-c5v2-physical-canary.mjs';
import {
  deriveVisibleTextFromDocument,
  parseObservablePayload,
} from '../../src/renderer/documentContentEnvelope.mjs';

const T7_MOUNT = '/Volumes/T7-Secure';
const RESULT_PREFIX = 'YALKEN_C5V2_DORIAN_KILLPOINT_RESULT ';
const FIRST_SCENE_PREFIX = 'YALKEN_C5V2_DORIAN_AFTER_FIRST_SCENE ';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), 'utf8'));
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function writeBufferAtomicDurable(filePath, bytes) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const handle = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(tempPath, filePath);
  const dirHandle = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirHandle);
  } finally {
    fs.closeSync(dirHandle);
  }
  return { path: filePath, sha256: sha256Bytes(bytes), bytes: bytes.length };
}

function writeJsonAtomicDurable(filePath, value) {
  return writeBufferAtomicDurable(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function shellValue(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 30_000,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function parseArgs(argv) {
  const options = {
    masterLedgerPath: '',
    wordArtifactPath: '',
    campaignResultPath: '',
    artifactRoot: '',
    expectedHeadSha: '',
    expectedT7Uuid: '',
    maxRound: 4,
    operationSceneCount: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--master-ledger') options.masterLedgerPath = argv[++index] || '';
    else if (arg === '--word-artifact') options.wordArtifactPath = argv[++index] || '';
    else if (arg === '--campaign-result') options.campaignResultPath = argv[++index] || '';
    else if (arg === '--artifact-root') options.artifactRoot = argv[++index] || '';
    else if (arg === '--head') options.expectedHeadSha = argv[++index] || '';
    else if (arg === '--t7-uuid') options.expectedT7Uuid = argv[++index] || '';
    else if (arg === '--max-round') options.maxRound = Number.parseInt(argv[++index], 10);
    else if (arg === '--operation-scene-count') options.operationSceneCount = Number.parseInt(argv[++index], 10);
    else throw new Error(`C5V2_DORIAN_KILLPOINT_ARGUMENT_UNKNOWN:${arg}`);
  }
  return options;
}

function assertGate(condition, code, detail = '') {
  if (!condition) throw new Error(`${code}${detail ? `:${detail}` : ''}`);
}

function inlineIntent(kind) {
  if (!['bold', 'italic'].includes(kind)) {
    throw new Error(`C5V2_DORIAN_KILLPOINT_FORMATTING_KIND_UNSUPPORTED:${kind}`);
  }
  return { [kind]: { action: 'set', value: true } };
}

function resolveParagraphRange(sceneText, operation) {
  const logicalParagraphs = String(sceneText).split(/\n{2,}/u);
  const expectedOrdinal = Number(operation?.anchor?.paragraphOrdinal);
  const selectedText = String(operation?.anchor?.selectedText || '');
  const expectedParagraph = logicalParagraphs[expectedOrdinal] || '';
  const matchingOrdinals = logicalParagraphs
    .map((paragraph, index) => paragraph.includes(selectedText) ? index : -1)
    .filter((index) => index >= 0);
  assertGate(
    expectedParagraph.includes(selectedText) && matchingOrdinals.length === 1,
    'C5V2_DORIAN_KILLPOINT_MASTER_ANCHOR_STALE',
    operation.id,
  );
  const lines = String(sceneText).split('\n');
  const lineOrdinal = lines.findIndex((line) => line === expectedParagraph);
  assertGate(lineOrdinal >= 0, 'C5V2_DORIAN_KILLPOINT_PARAGRAPH_LINE_UNRESOLVED', operation.id);
  const from = expectedParagraph.indexOf(selectedText);
  const to = from + selectedText.length;
  const boundaries = new Set([0, expectedParagraph.length]);
  for (const segment of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(expectedParagraph)) {
    boundaries.add(segment.index);
  }
  assertGate(boundaries.has(from) && boundaries.has(to), 'C5V2_DORIAN_KILLPOINT_GRAPHEME_SPLIT', operation.id);
  return { paragraphOrdinal: lineOrdinal, from, to, selectedText };
}

export function buildC5V2DorianKillpointInput({
  masterLedger,
  scenes,
  projectRoot,
  scenePathBySceneId,
  returnArtifactSha256,
  requestId,
  maxRound = 4,
  operationSceneCount = 3,
}) {
  const profileByOrdinal = new Map((masterLedger?.sceneProfiles || []).map((profile) => [profile.sceneOrdinal, profile]));
  const sceneById = new Map();
  for (let index = 0; index < scenes.length; index += 1) {
    const profile = profileByOrdinal.get(index);
    assertGate(profile?.sceneId, 'C5V2_DORIAN_KILLPOINT_SCENE_PROFILE_MISSING', index);
    assertGate(profile.rawSha256 === sha256Text(scenes[index].text), 'C5V2_DORIAN_KILLPOINT_SCENE_HASH_MISMATCH', profile.sceneId);
    sceneById.set(profile.sceneId, scenes[index]);
  }
  const selected = [];
  const selectedScenes = new Set();
  for (const operation of Array.isArray(masterLedger?.operations) ? masterLedger.operations : []) {
    if (
      operation?.family !== 'formatting'
      || operation.expectedOutcome !== 'SAFE_APPLY'
      || Number(operation.round) > maxRound
      || selectedScenes.has(operation.sceneId)
    ) continue;
    const scene = sceneById.get(operation.sceneId);
    if (!scene) continue;
    const range = resolveParagraphRange(scene.text, operation);
    const rawSha256 = sha256Text(scene.text);
    selected.push({
      operationId: operation.id,
      sceneId: operation.sceneId,
      blockId: operation.anchor.paragraphId,
      paragraphOrdinal: range.paragraphOrdinal,
      from: range.from,
      to: range.to,
      selectedText: range.selectedText,
      inline: inlineIntent(operation.semanticIntent?.kind),
      sourceAuthority: 'authenticated-full-manuscript-export-map-format-ir-v1',
      expectedOutcome: 'SAFE_APPLY',
      sourceSceneRevision: rawSha256,
      sourceRawSha256: rawSha256,
    });
    selectedScenes.add(operation.sceneId);
    if (selected.length === operationSceneCount) break;
  }
  assertGate(selected.length === operationSceneCount, 'C5V2_DORIAN_KILLPOINT_OPERATION_SCENE_COVERAGE_INVALID', selected.length);
  const commandPayload = {
    previewConfirmed: true,
    projectId: 'yalken-c5v2-dorian-killpoint-project',
    projectRoot,
    requestId,
    returnArtifactSha256,
    scenePathBySceneId,
    operations: selected,
  };
  const startupScope = {
    projectId: commandPayload.projectId,
    projectRoot,
    scenePathBySceneId,
    startupSingleInstanceAuthority: true,
  };
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.dorian-killpoint-input.v1',
    commandPayload,
    startupScope,
    inputDigest: sha256Text(stableJson({ commandPayload, startupScope })),
  };
}

function sceneHashes(scenePathBySceneId) {
  return Object.fromEntries(Object.entries(scenePathBySceneId).map(([sceneId, scenePath]) => [sceneId, sha256File(scenePath)]));
}

function visibleSceneText(scenePath) {
  const parsed = parseObservablePayload(fs.readFileSync(scenePath, 'utf8'));
  return parsed.doc ? deriveVisibleTextFromDocument(parsed.doc) : parsed.text;
}

function runChildMode({ childPath, inputPath, mode, timeoutMs = 60_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childPath, '--mode', mode, '--input', inputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`C5V2_DORIAN_KILLPOINT_CHILD_TIMEOUT:${mode}:${stderr.slice(-500)}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const resultLine = stdout.split(/\r?\n/u).find((line) => line.startsWith(RESULT_PREFIX));
      if (!resultLine) {
        reject(new Error(`C5V2_DORIAN_KILLPOINT_CHILD_RESULT_MISSING:${mode}:${code}:${signal}:${stderr.slice(-1000)}`));
        return;
      }
      const parsed = JSON.parse(resultLine.slice(RESULT_PREFIX.length));
      if (code !== 0 || parsed?.result?.ok !== true) {
        reject(new Error(`C5V2_DORIAN_KILLPOINT_CHILD_FAILED:${mode}:${JSON.stringify(parsed?.result || {})}`));
        return;
      }
      resolve({ code, signal, stdout, stderr, result: parsed.result });
    });
  });
}

function spawnKillpointChild({ childPath, inputPath }) {
  const child = spawn(process.execPath, [childPath, '--mode', 'kill', '--input', inputPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const marker = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`C5V2_DORIAN_KILLPOINT_MARKER_TIMEOUT:${stderr.slice(-1000)}`));
    }, 60_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      const line = stdout.split(/\r?\n/u).find((item) => item.startsWith(FIRST_SCENE_PREFIX));
      if (!line) return;
      clearTimeout(timer);
      resolve(JSON.parse(line.slice(FIRST_SCENE_PREFIX.length)));
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (!stdout.includes(FIRST_SCENE_PREFIX)) {
        clearTimeout(timer);
        reject(new Error(`C5V2_DORIAN_KILLPOINT_CHILD_EARLY_EXIT:${code}:${signal}:${stderr.slice(-1000)}`));
      }
    });
  });
  return { child, marker, stdout: () => stdout, stderr: () => stderr };
}

async function waitForClose(child, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('C5V2_DORIAN_KILLPOINT_SIGKILL_CLOSE_TIMEOUT')), timeoutMs);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const [key, value] of Object.entries({
    masterLedgerPath: options.masterLedgerPath,
    wordArtifactPath: options.wordArtifactPath,
    campaignResultPath: options.campaignResultPath,
    artifactRoot: options.artifactRoot,
    expectedHeadSha: options.expectedHeadSha,
    expectedT7Uuid: options.expectedT7Uuid,
  })) assertGate(Boolean(value), 'C5V2_DORIAN_KILLPOINT_ARGUMENT_REQUIRED', key);
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const headSha = shellValue('git', ['rev-parse', 'HEAD'], { cwd: rootDir });
  assertGate(headSha === options.expectedHeadSha, 'C5V2_DORIAN_KILLPOINT_HEAD_MISMATCH', headSha);
  assertGate(shellValue('git', ['status', '--porcelain'], { cwd: rootDir }) === '', 'C5V2_DORIAN_KILLPOINT_WORKTREE_DIRTY');
  const diskInfo = shellValue('/usr/sbin/diskutil', ['info', T7_MOUNT]);
  assertGate(diskInfo.includes(options.expectedT7Uuid), 'C5V2_DORIAN_KILLPOINT_T7_UUID_MISMATCH');
  assertGate(/FileVault:\s+Yes/iu.test(diskInfo) || /Encrypted:\s+Yes/iu.test(diskInfo), 'C5V2_DORIAN_KILLPOINT_T7_ENCRYPTION_REQUIRED');
  const artifactRoot = path.resolve(options.artifactRoot);
  assertGate(artifactRoot.startsWith(`${T7_MOUNT}${path.sep}`), 'C5V2_DORIAN_KILLPOINT_ARTIFACT_ROOT_NOT_T7');
  assertGate(!fs.existsSync(artifactRoot), 'C5V2_DORIAN_KILLPOINT_ARTIFACT_ROOT_EXISTS');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const masterLedgerPath = path.resolve(options.masterLedgerPath);
  const wordArtifactPath = path.resolve(options.wordArtifactPath);
  const campaignResultPath = path.resolve(options.campaignResultPath);
  for (const requiredPath of [masterLedgerPath, wordArtifactPath, campaignResultPath]) {
    assertGate(fs.existsSync(requiredPath), 'C5V2_DORIAN_KILLPOINT_SOURCE_MISSING', requiredPath);
  }
  execFileSync('/usr/bin/unzip', ['-t', wordArtifactPath], { stdio: 'ignore', timeout: 60_000 });
  const authorityCarrier = shellValue('/usr/bin/unzip', ['-p', wordArtifactPath, 'docProps/custom.xml']);
  assertGate(/YRTK1\./u.test(authorityCarrier), 'C5V2_DORIAN_KILLPOINT_AUTHORITY_CARRIER_MISSING');
  const masterLedger = JSON.parse(fs.readFileSync(masterLedgerPath, 'utf8'));
  const campaignResult = JSON.parse(fs.readFileSync(campaignResultPath, 'utf8'));
  const wordArtifactSha256 = sha256File(wordArtifactPath);
  const boundRound = (campaignResult.rounds || []).find((round) => (
    path.resolve(round.returnedDocxPath || '') === wordArtifactPath
  ));
  assertGate(boundRound?.returnedDocxSha256 === wordArtifactSha256, 'C5V2_DORIAN_KILLPOINT_WORD_ARTIFACT_HASH_UNBOUND');
  assertGate(boundRound.wordStatus === 'PASS' && boundRound.productApplyOk === true, 'C5V2_DORIAN_KILLPOINT_WORD_ROUND_NOT_GREEN');
  assertGate(boundRound.roundOracleGate?.ok === true, 'C5V2_DORIAN_KILLPOINT_WORD_ORACLE_NOT_GREEN');
  assertGate(campaignResult.masterLedger?.ledgerDigest === masterLedger.ledgerDigest, 'C5V2_DORIAN_KILLPOINT_LEDGER_BINDING_MISMATCH');
  const corpus = loadCanaryCorpus({ sceneCount: 21, sceneStart: 0 });
  assertGate(corpus.scenes.length === 21 && corpus.provenance.syntheticTailAuthority === false, 'C5V2_DORIAN_KILLPOINT_CORPUS_INVALID');
  const projectRoot = path.join(artifactRoot, 'project');
  const romanRoot = path.join(projectRoot, 'roman');
  fs.mkdirSync(romanRoot, { recursive: true });
  const scenePathBySceneId = {};
  const sceneProvenance = [];
  for (let index = 0; index < corpus.scenes.length; index += 1) {
    const scene = corpus.scenes[index];
    const profile = masterLedger.sceneProfiles[index];
    assertGate(profile?.rawSha256 === sha256Text(scene.text), 'C5V2_DORIAN_KILLPOINT_CORPUS_PROFILE_MISMATCH', index);
    const scenePath = path.join(projectRoot, profile.sceneId);
    const written = writeBufferAtomicDurable(scenePath, Buffer.from(scene.text, 'utf8'));
    scenePathBySceneId[profile.sceneId] = scenePath;
    sceneProvenance.push({
      sceneId: profile.sceneId,
      sourceFile: scene.file,
      rawSourceSha256: scene.rawSourceSha256,
      cleanedSourceSha256: scene.cleanedSourceSha256,
      projectSceneSha256: written.sha256,
    });
  }
  writeJsonAtomicDurable(path.join(projectRoot, 'project.craftsman.json'), {
    schemaVersion: 1,
    projectId: 'yalken-c5v2-dorian-killpoint-project',
    title: 'Dorian C5V2 Killpoint',
    scenes: Object.keys(scenePathBySceneId),
  });
  const requestId = `c5v2-dorian-killpoint-${headSha.slice(0, 12)}`;
  const input = buildC5V2DorianKillpointInput({
    masterLedger,
    scenes: corpus.scenes,
    projectRoot,
    scenePathBySceneId,
    returnArtifactSha256: wordArtifactSha256,
    requestId,
    maxRound: options.maxRound,
    operationSceneCount: options.operationSceneCount,
  });
  const inputPath = path.join(artifactRoot, 'killpoint-input.json');
  writeJsonAtomicDurable(inputPath, input);
  writeJsonAtomicDurable(path.join(artifactRoot, 'corpus-provenance.json'), {
    schemaVersion: 'yalken.rtk.word.c5v2.dorian-killpoint-corpus-provenance.v1',
    headSha,
    masterLedgerPath,
    masterLedgerDigest: masterLedger.ledgerDigest,
    campaignResultPath,
    campaignHeadSha: campaignResult.headSha,
    wordArtifactPath,
    wordArtifactSha256,
    wordRoundId: boundRound.roundId,
    wordRoundOracleDigest: boundRound.roundOracleGate.oracleDigest,
    sourceCorpus: corpus.provenance,
    sceneCount: sceneProvenance.length,
    scenes: sceneProvenance,
    inputDigest: input.inputDigest,
  });
  const beforeHashes = sceneHashes(scenePathBySceneId);
  const beforeVisibleText = Object.fromEntries(Object.entries(scenePathBySceneId).map(([sceneId, scenePath]) => [sceneId, visibleSceneText(scenePath)]));
  const childPath = path.join(rootDir, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint-child.mjs');
  const killed = spawnKillpointChild({ childPath, inputPath });
  const firstSceneMarker = await killed.marker;
  const partialHashes = sceneHashes(scenePathBySceneId);
  const changedAtKillpoint = Object.keys(beforeHashes).filter((sceneId) => beforeHashes[sceneId] !== partialHashes[sceneId]);
  assertGate(changedAtKillpoint.length === 1, 'C5V2_DORIAN_KILLPOINT_PARTIAL_WRITE_COUNT_INVALID', changedAtKillpoint.length);
  assertGate(changedAtKillpoint[0] === firstSceneMarker.sceneId, 'C5V2_DORIAN_KILLPOINT_PARTIAL_SCENE_MISMATCH');
  const recoveryStatePath = path.join(projectRoot, '.yalken', 'recovery', 'rtk-formatting-return-v1.json');
  const leasePath = path.join(projectRoot, '.yalken', 'recovery', 'rtk-formatting-return-v1.lock');
  assertGate(fs.existsSync(recoveryStatePath) && fs.existsSync(leasePath), 'C5V2_DORIAN_KILLPOINT_RECOVERY_AUTHORITY_MISSING');
  const preKillState = JSON.parse(fs.readFileSync(recoveryStatePath, 'utf8'));
  assertGate(preKillState.activeTransaction?.requestId === requestId, 'C5V2_DORIAN_KILLPOINT_ACTIVE_TRANSACTION_MISSING');
  const preKillRecoveryStateSha256 = sha256File(recoveryStatePath);
  const preKillLeaseSha256 = sha256File(leasePath);
  writeJsonAtomicDurable(path.join(artifactRoot, 'pre-kill-checkpoint.json'), {
    schemaVersion: 'yalken.rtk.word.c5v2.dorian-pre-kill-checkpoint.v1',
    headSha,
    inputDigest: input.inputDigest,
    childPid: firstSceneMarker.pid,
    firstSceneMarker,
    beforeHashes,
    partialHashes,
    changedAtKillpoint,
    recoveryStateSha256: preKillRecoveryStateSha256,
    leaseSha256: preKillLeaseSha256,
  });
  const closePromise = waitForClose(killed.child);
  assertGate(killed.child.kill('SIGKILL'), 'C5V2_DORIAN_KILLPOINT_SIGKILL_NOT_SENT');
  const killedExit = await closePromise;
  assertGate(
    killedExit.signal === 'SIGKILL',
    'C5V2_DORIAN_KILLPOINT_SIGNAL_MISMATCH',
    killedExit.signal || `code-${killedExit.code}`,
  );
  const recovery = await runChildMode({ childPath, inputPath, mode: 'recover' });
  const recoveredHashes = sceneHashes(scenePathBySceneId);
  assertGate(stableJson(recoveredHashes) === stableJson(beforeHashes), 'C5V2_DORIAN_KILLPOINT_ROLLBACK_HASH_MISMATCH');
  assertGate(
    recovery.result.recoveryOutcome === 'rolled-back' && recovery.result.staleLeaseRecovered === true,
    'C5V2_DORIAN_KILLPOINT_STARTUP_RECOVERY_NOT_GREEN',
  );
  const apply = await runChildMode({ childPath, inputPath, mode: 'apply' });
  assertGate(apply.result.status === 'applied' && apply.result.writerCalled === true, 'C5V2_DORIAN_KILLPOINT_REAPPLY_NOT_GREEN');
  const appliedHashes = sceneHashes(scenePathBySceneId);
  const changedAfterApply = Object.keys(beforeHashes).filter((sceneId) => beforeHashes[sceneId] !== appliedHashes[sceneId]);
  assertGate(changedAfterApply.length === options.operationSceneCount, 'C5V2_DORIAN_KILLPOINT_APPLY_SCENE_COUNT_INVALID', changedAfterApply.length);
  const visibleTextPreserved = Object.entries(scenePathBySceneId).every(([sceneId, scenePath]) => (
    visibleSceneText(scenePath) === beforeVisibleText[sceneId]
  ));
  assertGate(visibleTextPreserved, 'C5V2_DORIAN_KILLPOINT_VISIBLE_TEXT_DIVERGED');
  const replay = await runChildMode({ childPath, inputPath, mode: 'apply' });
  assertGate(replay.result.status === 'replay' && replay.result.writerCalled === false, 'C5V2_DORIAN_KILLPOINT_REPLAY_NOT_GREEN');
  assertGate(stableJson(sceneHashes(scenePathBySceneId)) === stableJson(appliedHashes), 'C5V2_DORIAN_KILLPOINT_REPLAY_WROTE_SCENE');
  const inspect = await runChildMode({ childPath, inputPath, mode: 'inspect' });
  assertGate(inspect.result.replaySnapshot?.replayVerified === true, 'C5V2_DORIAN_KILLPOINT_REOPEN_READBACK_NOT_GREEN');
  const result = {
    schemaVersion: 'yalken.rtk.word.c5v2.dorian-killpoint-result.v1',
    ok: true,
    headSha,
    wordVersion: shellValue('/usr/bin/osascript', ['-e', 'tell application "Microsoft Word" to return version as text']),
    t7Uuid: options.expectedT7Uuid,
    masterLedgerDigest: masterLedger.ledgerDigest,
    inputDigest: input.inputDigest,
    wordEvidence: {
      campaignHeadSha: campaignResult.headSha,
      roundId: boundRound.roundId,
      artifactSha256: wordArtifactSha256,
      authorityCarrierPresent: true,
      wordStatus: boundRound.wordStatus,
      productApplyOk: boundRound.productApplyOk,
      oracleGateOk: boundRound.roundOracleGate.ok,
      oracleDigest: boundRound.roundOracleGate.oracleDigest,
    },
    corpus: {
      sceneCount: sceneProvenance.length,
      syntheticTailAuthority: corpus.provenance.syntheticTailAuthority,
      operationSceneCount: options.operationSceneCount,
      operationIds: input.commandPayload.operations.map((operation) => operation.operationId),
      operationSceneIds: input.commandPayload.operations.map((operation) => operation.sceneId),
    },
    killpoint: {
      signal: killedExit.signal,
      childPid: firstSceneMarker.pid,
      changedAtKillpoint,
      activeTransactionDurable: true,
      recoveryStateSha256BeforeKill: preKillRecoveryStateSha256,
      leaseSha256BeforeKill: preKillLeaseSha256,
    },
    recovery: {
      ok: recovery.result.ok,
      code: recovery.result.code,
      outcome: recovery.result.recoveryOutcome,
      staleLeaseRecovered: recovery.result.staleLeaseRecovered,
      exactBeforeHashesRestored: stableJson(recoveredHashes) === stableJson(beforeHashes),
    },
    reapply: {
      ok: apply.result.ok,
      status: apply.result.status,
      writerCalled: apply.result.writerCalled,
      changedSceneIds: changedAfterApply,
      visibleTextPreserved,
    },
    replay: {
      ok: replay.result.ok,
      status: replay.result.status,
      writerCalled: replay.result.writerCalled,
      sceneHashesStable: stableJson(sceneHashes(scenePathBySceneId)) === stableJson(appliedHashes),
    },
    reopenReadback: {
      ok: inspect.result.ok,
      code: inspect.result.code,
      replayVerified: inspect.result.replaySnapshot.replayVerified,
      receiptCount: inspect.result.replaySnapshot.receiptCount,
      writerCalled: inspect.result.writerCalled,
    },
    networkRequests: [],
    allGatesGreen: true,
    certificationClaim: 'NO_TERMINAL_CERTIFICATION_CLAIM_REQUIRES_MERGED_HEAD_REPETITIONS_AND_INDEPENDENT_AUDIT',
  };
  result.resultDigest = sha256Text(stableJson(result));
  const written = writeJsonAtomicDurable(path.join(artifactRoot, 'killpoint-result.json'), result);
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    headSha: result.headSha,
    wordVersion: result.wordVersion,
    sceneCount: result.corpus.sceneCount,
    operationSceneCount: result.corpus.operationSceneCount,
    signal: result.killpoint.signal,
    recoveryOutcome: result.recovery.outcome,
    reapplyStatus: result.reapply.status,
    replayStatus: result.replay.status,
    reopenReplayVerified: result.reopenReadback.replayVerified,
    resultDigest: result.resultDigest,
    resultPath: written.path,
    resultSha256: written.sha256,
    certificationClaim: result.certificationClaim,
  }, null, 2)}\n`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
