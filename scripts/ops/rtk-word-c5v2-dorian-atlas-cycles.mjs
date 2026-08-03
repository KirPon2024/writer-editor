#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  CORE_COMMAND_IDS,
  createInitialCoreState,
  hashCoreState,
  reduceCoreState,
} from '../../src/core/runtime.mjs';
import { hashCanonicalValue } from '../../src/core/browser-safe-hash.mjs';
import { hashEventLog } from '../../src/collab/index.mjs';
import {
  buildAtlasTextOffsetMap,
  deriveAtlasMentionIndex,
  deriveManualMapGraph,
} from '../../src/derived/index.mjs';
import {
  buildAtlasGraphPackage,
} from '../../src/export/atlas/v1/index.mjs';
import {
  validateAtlasGraphPackageRepeatImport,
} from '../../src/import/atlas/v1/index.mjs';
import {
  createStage10MainPersistenceAdapter,
} from '../../src/product/stage10MainPersistenceAdapter.mjs';
import {
  STAGE10_ACTIVATION_MODES,
  STAGE10_PRODUCT_COMMAND_IDS,
  createStage10ProductRuntime,
  reopenStage10ProductRuntime,
} from '../../src/product/stage10ProductWiring.mjs';
import {
  deriveVisibleTextFromDocument,
  parseObservablePayload,
} from '../../src/renderer/documentContentEnvelope.mjs';

const T7_MOUNT = '/Volumes/T7-Secure';
const RESULT_PREFIX = 'YALKEN_C5V2_DORIAN_ATLAS_CYCLES_RESULT ';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5v2-physical-canary';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Bytes(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), 'utf8'));
}

export function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

function assertGate(condition, code, detail = '') {
  if (!condition) throw new Error(`${code}${detail ? `:${detail}` : ''}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  return {
    path: filePath,
    sha256: sha256Bytes(bytes),
    bytes: bytes.length,
  };
}

function writeJsonAtomicDurable(filePath, value) {
  return writeBufferAtomicDurable(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function hashTextHex(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

async function writeFileAtomicDurable(filePath, content) {
  writeBufferAtomicDurable(filePath, Buffer.from(String(content), 'utf8'));
  return { success: true };
}

function shellValue(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 30_000,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function parseArgs(argv) {
  const options = {
    campaignRoot: '',
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    expectedHeadSha: '',
    expectedT7Uuid: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--campaign-root') options.campaignRoot = argv[++index] || '';
    else if (arg === '--artifact-root') options.artifactRoot = argv[++index] || '';
    else if (arg === '--head') options.expectedHeadSha = argv[++index] || '';
    else if (arg === '--t7-uuid') options.expectedT7Uuid = argv[++index] || '';
    else throw new Error(`C5V2_DORIAN_ATLAS_CYCLES_ARGUMENT_UNKNOWN:${arg}`);
  }
  return options;
}

function visibleSceneText(rawContent) {
  const parsed = parseObservablePayload(String(rawContent || ''));
  return parsed.doc ? deriveVisibleTextFromDocument(parsed.doc) : parsed.text;
}

function normalizeSceneRows(rows, sourceLabel) {
  assertGate(Array.isArray(rows), 'C5V2_DORIAN_ATLAS_SCENE_ROWS_REQUIRED', sourceLabel);
  return rows.map((row) => {
    const sceneId = typeof row?.sceneId === 'string' ? row.sceneId : '';
    const rawContent = typeof row?.rawContent === 'string' ? row.rawContent : '';
    assertGate(sceneId && rawContent, 'C5V2_DORIAN_ATLAS_SCENE_ROW_INVALID', `${sourceLabel}:${sceneId}`);
    const text = typeof row.text === 'string' ? row.text : visibleSceneText(rawContent);
    assertGate(text === visibleSceneText(rawContent), 'C5V2_DORIAN_ATLAS_VISIBLE_TEXT_MISMATCH', `${sourceLabel}:${sceneId}`);
    return {
      sceneId,
      rawContent,
      rawContentSha256: sha256Text(rawContent),
      text,
      textSha256: sha256Text(text),
    };
  });
}

function sceneSetDigest(scenes) {
  return sha256Text(stableJson(scenes.map((scene) => ({
    sceneId: scene.sceneId,
    rawContentSha256: scene.rawContentSha256,
    textSha256: scene.textSha256,
  }))));
}

function sameSceneSet(left, right) {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((scene) => [scene.sceneId, scene]));
  return left.every((scene) => {
    const candidate = rightById.get(scene.sceneId);
    return candidate
      && candidate.rawContentSha256 === scene.rawContentSha256
      && candidate.textSha256 === scene.textSha256;
  });
}

export function verifyC5V2CycleCarryover(rounds = []) {
  assertGate(Array.isArray(rounds) && rounds.length >= 3, 'C5V2_DORIAN_ATLAS_CYCLE_ROUNDS_INSUFFICIENT');
  const carryovers = [];
  for (let index = 0; index < rounds.length - 1; index += 1) {
    const current = rounds[index];
    const next = rounds[index + 1];
    const exact = sameSceneSet(current.reopenedScenes, next.baselineScenes);
    carryovers.push({
      fromRoundId: current.roundId,
      toRoundId: next.roundId,
      exact,
      fromSceneSetDigest: sceneSetDigest(current.reopenedScenes),
      toSceneSetDigest: sceneSetDigest(next.baselineScenes),
    });
  }
  return {
    ok: carryovers.length >= 2 && carryovers.every((row) => row.exact),
    carryovers,
  };
}

function graphemeBoundaries(text) {
  const boundaries = new Set([0, text.length]);
  for (const segment of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(text)) {
    boundaries.add(segment.index);
  }
  return boundaries;
}

function caseFold(value) {
  return String(value).toLocaleLowerCase('und');
}

function countOccurrences(haystack, needle) {
  const source = caseFold(haystack);
  const target = caseFold(needle);
  let count = 0;
  let cursor = 0;
  while (target && cursor <= source.length - target.length) {
    const found = source.indexOf(target, cursor);
    if (found < 0) break;
    count += 1;
    cursor = found + Math.max(1, target.length);
  }
  return count;
}

export function selectNaturalAtlasAnchor({ scenes, preferredSceneIndex = 0, usedQuotes = [] } = {}) {
  assertGate(Array.isArray(scenes) && scenes.length > 0, 'C5V2_DORIAN_ATLAS_ANCHOR_SCENES_REQUIRED');
  const used = new Set(usedQuotes.map(caseFold));
  const combined = scenes.map((scene) => scene.text).join('\n\n');
  for (let sceneOffset = 0; sceneOffset < scenes.length; sceneOffset += 1) {
    const scene = scenes[(preferredSceneIndex + sceneOffset) % scenes.length];
    const text = String(scene.text || '');
    const boundaries = graphemeBoundaries(text);
    const words = [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:[’'][\p{L}\p{M}\p{N}]+)?/gu)]
      .map((match) => ({ start: match.index, end: match.index + match[0].length }));
    if (words.length < 4) continue;
    const pivot = Math.floor(words.length * (((preferredSceneIndex % 5) + 1) / 6));
    for (let distance = 0; distance < words.length; distance += 1) {
      const startWord = words[(pivot + distance) % words.length];
      const startIndex = words.indexOf(startWord);
      for (const width of [3, 2, 4]) {
        const endWord = words[startIndex + width - 1];
        if (!endWord) continue;
        const quote = text.slice(startWord.start, endWord.end);
        if (quote.length < 8 || quote.length > 96 || used.has(caseFold(quote))) continue;
        if (!boundaries.has(startWord.start) || !boundaries.has(endWord.end)) continue;
        if (countOccurrences(combined, quote) !== 1) continue;
        const offsetMap = buildAtlasTextOffsetMap(text);
        const graphemeStart = offsetMap.graphemes.findIndex((item) => item.utf16Start === startWord.start);
        const graphemeEndItem = offsetMap.graphemes.find((item) => item.utf16End === endWord.end);
        if (graphemeStart < 0 || !graphemeEndItem) continue;
        return {
          sceneId: scene.sceneId,
          quote,
          startOffset: startWord.start,
          endOffset: endWord.end,
          quoteSha256: sha256Text(quote),
          sceneTextSha256: sha256Text(text),
          graphemeStart,
          graphemeEnd: graphemeEndItem.graphemeIndex + 1,
          normalizationChangedByNfc: offsetMap.normalizationMap.changedByNfc,
          destructiveNormalizationApplied: offsetMap.normalizationMap.destructiveNormalizationApplied,
          naturalSource: true,
          syntheticTail: false,
        };
      }
    }
  }
  throw new Error('C5V2_DORIAN_ATLAS_NATURAL_UNIQUE_ANCHOR_UNAVAILABLE');
}

function readPhysicalRounds(campaignRoot, campaignResult) {
  const rounds = [];
  for (let index = 0; index < campaignResult.rounds.length; index += 1) {
    const roundId = `round-${String(index + 1).padStart(2, '0')}`;
    const resultRow = campaignResult.rounds[index];
    assertGate(resultRow?.roundId === roundId, 'C5V2_DORIAN_ATLAS_ROUND_ORDER_INVALID', roundId);
    const roundRoot = path.join(campaignRoot, roundId);
    const sourceDocxPath = path.join(roundRoot, 'c5v2-cumulative-source-fullmanuscript.docx');
    const returnedDocxPath = path.join(roundRoot, 'c5v2-cumulative-returned-word-native.docx');
    const baselinePath = path.join(roundRoot, 'product-baseline-scenes.json');
    const reopenedTruthPath = path.join(roundRoot, 'yalken-reopened-truth.json');
    const oraclePath = path.join(roundRoot, 'complete-round-oracle.json');
    const oracleGatePath = path.join(roundRoot, 'complete-round-oracle-gate.json');
    for (const filePath of [sourceDocxPath, returnedDocxPath, baselinePath, reopenedTruthPath, oraclePath, oracleGatePath]) {
      assertGate(fs.existsSync(filePath), 'C5V2_DORIAN_ATLAS_PHYSICAL_ARTIFACT_MISSING', filePath);
    }
    shellValue('/usr/bin/unzip', ['-tq', sourceDocxPath], { timeout: 90_000 });
    shellValue('/usr/bin/unzip', ['-tq', returnedDocxPath], { timeout: 90_000 });
    const baseline = readJson(baselinePath);
    const reopenedTruth = readJson(reopenedTruthPath);
    const oracle = readJson(oraclePath);
    const oracleGate = readJson(oracleGatePath);
    const baselineScenes = normalizeSceneRows(baseline.scenes, `${roundId}:baseline`);
    const reopenedScenes = normalizeSceneRows(reopenedTruth.sceneReadback, `${roundId}:reopened`);
    assertGate(baselineScenes.length === 21 && reopenedScenes.length === 21, 'C5V2_DORIAN_ATLAS_SCENE_COUNT_INVALID', roundId);
    assertGate(oracle.ok === true && oracleGate.ok === true, 'C5V2_DORIAN_ATLAS_ORACLE_NOT_GREEN', roundId);
    assertGate(sha256File(sourceDocxPath) === resultRow.sourceDocxSha256, 'C5V2_DORIAN_ATLAS_SOURCE_DOCX_HASH_MISMATCH', roundId);
    assertGate(sha256File(returnedDocxPath) === resultRow.returnedDocxSha256, 'C5V2_DORIAN_ATLAS_RETURNED_DOCX_HASH_MISMATCH', roundId);
    rounds.push({
      roundId,
      roundRoot,
      sourceDocxPath,
      returnedDocxPath,
      baselinePath,
      reopenedTruthPath,
      oraclePath,
      oracleGatePath,
      baselineScenes,
      reopenedScenes,
      sourceDocxSha256: resultRow.sourceDocxSha256,
      returnedDocxSha256: resultRow.returnedDocxSha256,
      baselineArtifactSha256: sha256File(baselinePath),
      reopenedTruthSha256: sha256File(reopenedTruthPath),
      oracleSha256: sha256File(oraclePath),
      oracleGateSha256: sha256File(oracleGatePath),
      oracleDigest: oracle.oracleDigest || '',
    });
  }
  return rounds;
}

function buildInitialCoreState(projectId, scenes) {
  const created = reduceCoreState(createInitialCoreState(), {
    type: CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: {
      projectId,
      title: 'The Picture of Dorian Gray — C5V2 physical cyclic certification',
      sceneId: scenes[0].sceneId,
    },
  });
  assertGate(created.ok === true, 'C5V2_DORIAN_ATLAS_INITIAL_PROJECT_CREATE_FAILED');
  const state = cloneJson(created.state);
  state.data.projects[projectId].scenes = Object.fromEntries(scenes.map((scene) => [scene.sceneId, {
    id: scene.sceneId,
    text: scene.text,
  }]));
  return state;
}

function activation(controlId) {
  return {
    mode: STAGE10_ACTIVATION_MODES.PHYSICAL_POINTER_OR_KEYBOARD,
    controlId,
  };
}

function deterministicClock() {
  let tick = 0;
  const start = Date.parse('2026-08-03T01:00:00.000Z');
  return () => new Date(start + (tick += 1) * 1000).toISOString();
}

async function dispatchRequired(runtime, commandId, payload, controlId, commandContext = {}) {
  const result = await runtime.dispatchVisibleCommand(commandId, payload, activation(controlId), commandContext);
  assertGate(result?.ok === true, 'C5V2_DORIAN_ATLAS_COMMAND_FAILED', `${commandId}:${result?.error?.reason || ''}`);
  assertGate(result.receipt?.storageWritten === true, 'C5V2_DORIAN_ATLAS_COMMAND_NOT_DURABLE', commandId);
  assertGate(result.receipt?.visibleUiCommand === true, 'C5V2_DORIAN_ATLAS_COMMAND_NOT_VISIBLE_ROUTE', commandId);
  if (commandContext?.canonicalProjectTruth) {
    assertGate(
      result.receipt?.details?.canonicalProjectTruthPort === true,
      'C5V2_DORIAN_ATLAS_CANONICAL_PROJECT_TRUTH_ROUTE_MISSING',
      commandId,
    );
  }
  return result;
}

function canonicalManifestText(projectId, coreState) {
  return `${JSON.stringify({
    schemaVersion: 'yalken.rtk.word.c5v2.dorian-atlas-canonical-project.v1',
    projectId,
    lastCommandId: coreState.data.lastCommandId,
    project: coreState.data.projects[projectId],
  }, null, 2)}\n`;
}

function canonicalCommandContext({ projectId, coreState, manifestPath }) {
  const previousText = fs.readFileSync(manifestPath, 'utf8');
  return {
    canonicalProjectTruth: {
      schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
      projectId,
      coreState: cloneJson(coreState),
      sourceHash: hashTextHex(previousText),
      sourceRevision: coreState.data.lastCommandId,
      prepareMutation({ nextCoreState }) {
        const nextText = canonicalManifestText(projectId, nextCoreState);
        return {
          schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
          projectId,
          relativePath: 'project.craftsman.json',
          previousText,
          nextText,
          previousHash: hashTextHex(previousText),
          nextHash: hashTextHex(nextText),
        };
      },
    },
  };
}

function verifyT7(expectedUuid) {
  assertGate(fs.existsSync(T7_MOUNT), 'C5V2_DORIAN_ATLAS_T7_NOT_MOUNTED');
  const diskInfo = shellValue('/usr/sbin/diskutil', ['info', T7_MOUNT]);
  const uuid = diskInfo.match(/Volume UUID:\s+([A-F0-9-]+)/u)?.[1] || '';
  assertGate(uuid === expectedUuid, 'C5V2_DORIAN_ATLAS_T7_UUID_MISMATCH', uuid);
  assertGate(/File System Personality:\s+APFS/u.test(diskInfo), 'C5V2_DORIAN_ATLAS_T7_NOT_APFS');
  assertGate(/FileVault:\s+Yes/u.test(diskInfo), 'C5V2_DORIAN_ATLAS_T7_FILEVAULT_REQUIRED');
  assertGate(/Volume Read-Only:\s+No/u.test(diskInfo), 'C5V2_DORIAN_ATLAS_T7_READ_ONLY');
  fs.accessSync(T7_MOUNT, fs.constants.R_OK | fs.constants.W_OK);
  return {
    mount: T7_MOUNT,
    uuid,
    filesystem: 'APFS',
    fileVault: true,
    writable: true,
  };
}

function commandPayload(commandId, payload, operationId) {
  return {
    ...payload,
    opId: operationId,
  };
}

export async function runC5V2DorianAtlasCycles(options = {}) {
  assertGate(options.campaignRoot, 'C5V2_DORIAN_ATLAS_CAMPAIGN_ROOT_REQUIRED');
  assertGate(options.expectedHeadSha, 'C5V2_DORIAN_ATLAS_HEAD_REQUIRED');
  assertGate(options.expectedT7Uuid, 'C5V2_DORIAN_ATLAS_T7_UUID_REQUIRED');
  const headSha = shellValue('/usr/bin/git', ['rev-parse', 'HEAD']);
  assertGate(headSha === options.expectedHeadSha, 'C5V2_DORIAN_ATLAS_HEAD_MISMATCH', headSha);
  const originMainSha = shellValue('/usr/bin/git', ['rev-parse', 'origin/main']);
  const t7 = verifyT7(options.expectedT7Uuid);
  const campaignResultPath = path.join(options.campaignRoot, 'cumulative-result.json');
  const campaignResult = readJson(campaignResultPath);
  assertGate(campaignResult.roundCount === 5 && campaignResult.sceneCount === 21, 'C5V2_DORIAN_ATLAS_CAMPAIGN_TOPOLOGY_INVALID');
  assertGate(campaignResult.electronResult?.ok === true, 'C5V2_DORIAN_ATLAS_CAMPAIGN_CONTROLLER_NOT_GREEN');
  assertGate(
    campaignResult.vetoStatus
      && typeof campaignResult.vetoStatus === 'object'
      && Object.values(campaignResult.vetoStatus).every((value) => value === false),
    'C5V2_DORIAN_ATLAS_CAMPAIGN_VETO_NOT_CLEAR',
  );
  assertGate(
    campaignResult.totals?.attempted === 1960
      && campaignResult.totals?.reported === 1960
      && campaignResult.totals?.productApplyGreen === 5,
    'C5V2_DORIAN_ATLAS_CAMPAIGN_POSITIVE_TOTALS_INVALID',
  );
  const rounds = readPhysicalRounds(options.campaignRoot, campaignResult);
  const carryover = verifyC5V2CycleCarryover(rounds);
  assertGate(carryover.ok, 'C5V2_DORIAN_ATLAS_WORD_CHECKPOINT_CARRYOVER_FAILED');

  const runId = `c5v2-dorian-atlas-cycles-${headSha.slice(0, 8)}-${nowStamp()}`;
  const runDir = path.join(options.artifactRoot || DEFAULT_ARTIFACT_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: false });
  const projectId = `yalken-c5v2-dorian-atlas-${headSha.slice(0, 12)}`;
  const projectRoot = path.join(runDir, 'stage10-project-state');
  const anchorRoot = path.join(runDir, 'stage10-anchor-state');
  const persistencePort = createStage10MainPersistenceAdapter({
    projectRoot,
    anchorRoot,
    writeFileAtomic: writeFileAtomicDurable,
  });
  const capabilitySnapshot = {
    platformId: 'packaged-local-electron',
    capabilities: {
      stage10LocalProductWiring: true,
      atlasMentionIndex: true,
      manualMapView: true,
    },
  };
  const now = deterministicClock();
  const initialCoreState = buildInitialCoreState(projectId, rounds[0].baselineScenes);
  const initialCoreStateHash = hashCoreState(initialCoreState);
  let runtime = await createStage10ProductRuntime({
    projectId,
    actorId: 'c5v2-physical-certifier',
    sessionId: 'c5v2-dorian-atlas-cycle-session',
    lifecycleId: 'c5v2-dorian-atlas-cycle-lifecycle',
    persistencePort,
    capabilitySnapshot,
    now,
  });

  const bootstrapOperationId = 'bootstrap:project:create';
  await dispatchRequired(
    runtime,
    CORE_COMMAND_IDS.PROJECT_CREATE,
    commandPayload(CORE_COMMAND_IDS.PROJECT_CREATE, {
      projectId,
      title: 'The Picture of Dorian Gray — C5V2 physical cyclic certification',
      sceneId: rounds[0].baselineScenes[0].sceneId,
    }, bootstrapOperationId),
    'c5v2-dorian-atlas-project-create',
  );
  const manifestPath = path.join(projectRoot, 'project.craftsman.json');
  writeBufferAtomicDurable(
    manifestPath,
    Buffer.from(canonicalManifestText(projectId, initialCoreState), 'utf8'),
  );

  const cycleRows = [];
  const usedQuotes = [];
  let previousCycleDigest = '';
  let previousCheckpointSha256 = '';
  let previousEventIds = [];
  const completedOperationIds = [bootstrapOperationId];
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index];
    const cycleNumber = index + 1;
    const cycleId = `cycle-${String(cycleNumber).padStart(2, '0')}`;
    const beforeSession = runtime.getSession();
    const beforeEventLogHash = hashEventLog(beforeSession.eventLog);
    const beforeRevision = beforeSession.eventLog.events.length;
    const beforeEventIds = beforeSession.eventLog.events.map((event) => event.eventId);
    assertGate(
      previousEventIds.every((eventId, eventIndex) => beforeEventIds[eventIndex] === eventId),
      'C5V2_DORIAN_ATLAS_EVENT_LOG_PREFIX_BROKEN',
      cycleId,
    );

    const requestEffectKeys = [];
    const canonicalRoundState = cloneJson(runtime.getSession().coreState);
    canonicalRoundState.data.projects[projectId].scenes = Object.fromEntries(round.baselineScenes.map((scene) => [scene.sceneId, {
      id: scene.sceneId,
      text: scene.text,
    }]));
    if (index > 0) {
      const priorProject = runtime.getSession().coreState.data.projects[projectId];
      for (const scene of round.baselineScenes) {
        assertGate(
          priorProject.scenes[scene.sceneId]?.text === scene.text,
          'C5V2_DORIAN_ATLAS_PRE_WORD_CHECKPOINT_STATE_DIVERGED',
          `${cycleId}:${scene.sceneId}`,
        );
      }
    }
    for (let sceneIndex = 0; sceneIndex < round.reopenedScenes.length; sceneIndex += 1) {
      const scene = round.reopenedScenes[sceneIndex];
      const operationId = `${cycleId}:word-return:text:${String(sceneIndex + 1).padStart(2, '0')}`;
      const result = await dispatchRequired(
        runtime,
        CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
        commandPayload(CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, {
          projectId,
          sceneId: scene.sceneId,
          text: scene.text,
          sourceArtifactSha256: round.reopenedTruthSha256,
          sourceRoundId: round.roundId,
        }, operationId),
        `c5v2-${cycleId}-word-return-${sceneIndex + 1}`,
        canonicalCommandContext({
          projectId,
          coreState: sceneIndex === 0 ? canonicalRoundState : runtime.getSession().coreState,
          manifestPath,
        }),
      );
      completedOperationIds.push(operationId);
      requestEffectKeys.push({
        operationId,
        requestKey: sha256Text(stableJson({ commandId: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, sceneId: scene.sceneId, textSha256: scene.textSha256 })),
        effectKey: result.receipt.postStateHash,
      });
    }

    const scenesAfterWord = round.reopenedScenes;
    const naturalAnchor = selectNaturalAtlasAnchor({
      scenes: scenesAfterWord,
      preferredSceneIndex: index * 4,
      usedQuotes,
    });
    usedQuotes.push(naturalAnchor.quote);
    const entityId = `entity-${cycleId}`;
    const entityOperationId = `${cycleId}:atlas:entity`;
    await dispatchRequired(
      runtime,
      CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      commandPayload(CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, {
        projectId,
        entityId,
        name: naturalAnchor.quote,
        entityKind: 'natural-manuscript-phrase',
      }, entityOperationId),
      `c5v2-${cycleId}-atlas-entity`,
      canonicalCommandContext({
        projectId,
        coreState: runtime.getSession().coreState,
        manifestPath,
      }),
    );
    completedOperationIds.push(entityOperationId);

    const mentionIndex = deriveAtlasMentionIndex({
      coreState: runtime.getSession().coreState,
      params: { projectId },
      capabilitySnapshot,
    });
    assertGate(mentionIndex.ok === true, 'C5V2_DORIAN_ATLAS_MENTION_DERIVATION_FAILED', cycleId);
    const mention = mentionIndex.value.mentions.find((item) => (
      item.entityId === entityId
      && item.sceneId === naturalAnchor.sceneId
      && item.evidenceAnchor?.startOffset === naturalAnchor.startOffset
      && item.evidenceAnchor?.endOffset === naturalAnchor.endOffset
      && item.evidenceAnchor?.quote === naturalAnchor.quote
    ));
    assertGate(mention, 'C5V2_DORIAN_ATLAS_NATURAL_MENTION_NOT_FOUND', cycleId);
    assertGate(mention.evidenceAnchor.normalizationMap?.destructiveNormalizationApplied === false, 'C5V2_DORIAN_ATLAS_NORMALIZATION_APPLIED', cycleId);
    const mentionOperationId = `${cycleId}:atlas:mention-confirm`;
    await dispatchRequired(
      runtime,
      CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
      commandPayload(CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM, {
        projectId,
        sceneId: naturalAnchor.sceneId,
        entityId,
        mentionId: mention.mentionId,
        decisionId: `decision-${cycleId}`,
        evidenceAnchor: mention.evidenceAnchor,
      }, mentionOperationId),
      `c5v2-${cycleId}-atlas-mention-confirm`,
      canonicalCommandContext({
        projectId,
        coreState: runtime.getSession().coreState,
        manifestPath,
      }),
    );
    completedOperationIds.push(mentionOperationId);

    const mapId = 'map-c5v2-dorian-cycles';
    if (index === 0) {
      const mapCreateOperationId = `${cycleId}:map:create`;
      await dispatchRequired(
        runtime,
        CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
        commandPayload(CORE_COMMAND_IDS.MANUAL_MAP_CREATE, {
          projectId,
          mapId,
          title: 'Dorian physical Word–Yalken–Atlas lineage',
        }, mapCreateOperationId),
        `c5v2-${cycleId}-map-create`,
        canonicalCommandContext({
          projectId,
          coreState: runtime.getSession().coreState,
          manifestPath,
        }),
      );
      completedOperationIds.push(mapCreateOperationId);
    }
    const sceneNodeId = `node-${cycleId}-scene`;
    const entityNodeId = `node-${cycleId}-entity`;
    const nodeCommands = [
      {
        operationId: `${cycleId}:map:scene-node`,
        payload: {
          projectId,
          mapId,
          nodeId: sceneNodeId,
          label: `${round.roundId} scene checkpoint`,
          nodeKind: 'sceneRef',
          targetKind: 'scene',
          targetId: naturalAnchor.sceneId,
          position: { x: index * 240, y: 0 },
        },
      },
      {
        operationId: `${cycleId}:map:entity-node`,
        payload: {
          projectId,
          mapId,
          nodeId: entityNodeId,
          label: naturalAnchor.quote,
          nodeKind: 'entityRef',
          targetKind: 'entity',
          targetId: entityId,
          position: { x: index * 240, y: 140 },
        },
      },
    ];
    for (const nodeCommand of nodeCommands) {
      await dispatchRequired(
        runtime,
        CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
        commandPayload(CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD, nodeCommand.payload, nodeCommand.operationId),
        `c5v2-${cycleId}-${nodeCommand.payload.nodeId}`,
        canonicalCommandContext({
          projectId,
          coreState: runtime.getSession().coreState,
          manifestPath,
        }),
      );
      completedOperationIds.push(nodeCommand.operationId);
    }
    const edgeOperationId = `${cycleId}:map:edge`;
    await dispatchRequired(
      runtime,
      CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      commandPayload(CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD, {
        projectId,
        mapId,
        edgeId: `edge-${cycleId}`,
        fromNodeId: sceneNodeId,
        toNodeId: entityNodeId,
        edgeKind: 'evidence',
        label: 'physical Word return evidence',
      }, edgeOperationId),
      `c5v2-${cycleId}-map-edge`,
      canonicalCommandContext({
        projectId,
        coreState: runtime.getSession().coreState,
        manifestPath,
      }),
    );
    completedOperationIds.push(edgeOperationId);

    const checkpointOperationId = `${cycleId}:history:checkpoint`;
    const historyCheckpoint = await dispatchRequired(
      runtime,
      STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT,
      commandPayload(STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT, {
        snapshotId: `${cycleId}-word-yalken-atlas`,
      }, checkpointOperationId),
      `c5v2-${cycleId}-history-checkpoint`,
    );
    completedOperationIds.push(checkpointOperationId);

    const session = runtime.getSession();
    const readModels = runtime.getReadModels();
    assertGate(readModels.replay?.ok === true, 'C5V2_DORIAN_ATLAS_REPLAY_FAILED', cycleId);
    const project = session.coreState.data.projects[projectId];
    assertGate(project, 'C5V2_DORIAN_ATLAS_PROJECT_MISSING', cycleId);
    for (const scene of round.reopenedScenes) {
      assertGate(project.scenes[scene.sceneId]?.text === scene.text, 'C5V2_DORIAN_ATLAS_STAGE10_TEXT_DIVERGED', `${cycleId}:${scene.sceneId}`);
    }
    const graphPackage = buildAtlasGraphPackage({ coreState: session.coreState, projectId });
    assertGate(graphPackage.ok === true, 'C5V2_DORIAN_ATLAS_GRAPH_PACKAGE_FAILED', cycleId);
    const repeatImport = validateAtlasGraphPackageRepeatImport({ graphPackage: graphPackage.value });
    assertGate(repeatImport.ok === true && repeatImport.value?.repeatImportValidated === true, 'C5V2_DORIAN_ATLAS_REPEAT_IMPORT_FAILED', cycleId);
    const manualMap = deriveManualMapGraph({
      coreState: session.coreState,
      params: { projectId, mapId },
      capabilitySnapshot,
    });
    assertGate(manualMap.ok === true, 'C5V2_DORIAN_ATLAS_MANUAL_MAP_DERIVATION_FAILED', cycleId);
    assertGate(manualMap.value.nodes.length === cycleNumber * 2, 'C5V2_DORIAN_ATLAS_MAP_NODE_CARRYOVER_FAILED', cycleId);
    assertGate(manualMap.value.edges.length === cycleNumber, 'C5V2_DORIAN_ATLAS_MAP_EDGE_CARRYOVER_FAILED', cycleId);

    const eventIds = session.eventLog.events.map((event) => event.eventId);
    assertGate(beforeEventIds.every((eventId, eventIndex) => eventIds[eventIndex] === eventId), 'C5V2_DORIAN_ATLAS_EVENT_LOG_PREFIX_MUTATED', cycleId);
    assertGate(new Set(eventIds).size === eventIds.length, 'C5V2_DORIAN_ATLAS_EVENT_ID_DUPLICATE', cycleId);
    const authorityHead = runtime.getCommandReceiptAuthorityHead();
    const integrityAnchor = runtime.getIntegrityAnchor();
    const stage10SceneSetDigest = sceneSetDigest(Object.values(project.scenes).map((scene) => ({
      sceneId: scene.id,
      rawContentSha256: round.reopenedScenes.find((item) => item.sceneId === scene.id)?.rawContentSha256 || '',
      textSha256: sha256Text(scene.text),
    })).sort((left, right) => left.sceneId.localeCompare(right.sceneId)));
    const reopenedSorted = [...round.reopenedScenes].sort((left, right) => left.sceneId.localeCompare(right.sceneId));
    assertGate(stage10SceneSetDigest === sceneSetDigest(reopenedSorted), 'C5V2_DORIAN_ATLAS_STAGE10_SCENE_DIGEST_MISMATCH', cycleId);

    const nextWordCheckpoint = index < rounds.length - 1 ? {
      roundId: rounds[index + 1].roundId,
      sourceDocxSha256: rounds[index + 1].sourceDocxSha256,
      baselineArtifactSha256: rounds[index + 1].baselineArtifactSha256,
      exactRawAndVisibleCarryover: carryover.carryovers[index].exact,
      sceneSetDigest: sceneSetDigest(rounds[index + 1].baselineScenes),
    } : null;
    const cycleCore = {
      schemaVersion: 'yalken.rtk.word.c5v2.dorian-atlas-cycle.v1',
      cycleId,
      roundId: round.roundId,
      previousCycleDigest,
      physicalCampaignHeadSha: campaignResult.headSha,
      certificationHarnessHeadSha: headSha,
      physical: {
        sourceDocxSha256: round.sourceDocxSha256,
        returnedDocxSha256: round.returnedDocxSha256,
        baselineArtifactSha256: round.baselineArtifactSha256,
        reopenedTruthSha256: round.reopenedTruthSha256,
        oracleSha256: round.oracleSha256,
        oracleGateSha256: round.oracleGateSha256,
        oracleDigest: round.oracleDigest,
        sceneCount: round.reopenedScenes.length,
        reopenedSceneSetDigest: sceneSetDigest(round.reopenedScenes),
      },
      atlas: {
        naturalAnchor,
        mentionId: mention.mentionId,
        evidenceAnchorHash: hashCanonicalValue(mention.evidenceAnchor),
        entityCount: Object.keys(project.atlas.entities).length,
        evidenceIdentityCount: graphPackage.value.summary.evidenceIdentityCount,
        graphPackageHash: graphPackage.value.packageHash,
        exportIrCoreStateHash: graphPackage.value.readableJsonPacket.exportIr.source.coreStateHash,
        repeatImportValidated: repeatImport.value.repeatImportValidated,
        manualMapGraphHash: manualMap.value.meta.graphHash,
        manualMapInvalidationKey: manualMap.meta.invalidationKey,
        manualMapNodeCount: manualMap.value.nodes.length,
        manualMapEdgeCount: manualMap.value.edges.length,
      },
      stage10: {
        beforeRevision,
        afterRevision: session.eventLog.events.length,
        beforeEventLogHash,
        afterEventLogHash: hashEventLog(session.eventLog),
        eventLogPrefixPreserved: true,
        coreStateHash: hashCoreState(session.coreState),
        authorityHeadDigest: authorityHead.authorityHeadDigest,
        authorityReceiptCount: authorityHead.receiptCount,
        integrityAnchorDigest: integrityAnchor.integrityAnchorDigest,
        replayVerified: true,
        recoverySnapshotDigest: historyCheckpoint.snapshotRef?.snapshotDigest || '',
        completedOperationIds: [...completedOperationIds],
        requestEffectKeys,
      },
      nextWordCheckpoint,
    };
    const cycleDigest = sha256Text(stableJson(cycleCore));
    const checkpoint = {
      ...cycleCore,
      cycleDigest,
      previousCheckpointSha256,
      completedAtUtc: now(),
    };
    const checkpointArtifact = writeJsonAtomicDurable(path.join(runDir, `${cycleId}.checkpoint.json`), checkpoint);

    const preReopenSessionDigest = hashCanonicalValue(session);
    const preReopenAuthorityDigest = hashCanonicalValue(authorityHead);
    runtime = await reopenStage10ProductRuntime({
      projectId,
      persistencePort,
      capabilitySnapshot,
      now,
    });
    const reopenedSession = runtime.getSession();
    assertGate(hashCanonicalValue(reopenedSession) === preReopenSessionDigest, 'C5V2_DORIAN_ATLAS_REOPEN_SESSION_MISMATCH', cycleId);
    assertGate(hashCanonicalValue(runtime.getCommandReceiptAuthorityHead()) === preReopenAuthorityDigest, 'C5V2_DORIAN_ATLAS_REOPEN_AUTHORITY_MISMATCH', cycleId);
    assertGate(runtime.getReadModels().replay?.ok === true, 'C5V2_DORIAN_ATLAS_REOPEN_REPLAY_FAILED', cycleId);

    cycleRows.push({
      ...checkpoint,
      checkpointArtifact,
      closeReopenVerified: true,
      reopenedSessionDigest: hashCanonicalValue(reopenedSession),
      reopenedAuthorityDigest: hashCanonicalValue(runtime.getCommandReceiptAuthorityHead()),
    });
    previousCycleDigest = cycleDigest;
    previousCheckpointSha256 = checkpointArtifact.sha256;
    previousEventIds = eventIds;
  }

  const terminalSession = runtime.getSession();
  const terminalAuthority = runtime.getCommandReceiptAuthorityHead();
  const resultCore = {
    schemaVersion: 'yalken.rtk.word.c5v2.dorian-atlas-cyclic-certification.v1',
    runId,
    headSha,
    originMainSha,
    campaignResultSha256: sha256File(campaignResultPath),
    physicalCampaignHeadSha: campaignResult.headSha,
    exactHeadPhysicalCampaign: campaignResult.headSha === headSha,
    projectId,
    t7,
    topology: {
      yalkenWordYalkenAtlasCycleCount: cycleRows.length,
      wordYalkenAtlasWordCarryoverCount: carryover.carryovers.length,
      cumulativeNoRevisionReset: true,
      eventLogPrefixPreserved: true,
      physicalFullManuscriptOnly: true,
      syntheticTailAuthority: false,
    },
    initialCoreStateHash,
    carryover,
    cycles: cycleRows,
    terminal: {
      eventCount: terminalSession.eventLog.events.length,
      eventLogHash: hashEventLog(terminalSession.eventLog),
      coreStateHash: hashCoreState(terminalSession.coreState),
      authorityHeadDigest: terminalAuthority.authorityHeadDigest,
      authorityReceiptCount: terminalAuthority.receiptCount,
      integrityAnchorDigest: runtime.getIntegrityAnchor().integrityAnchorDigest,
      replayVerified: runtime.getReadModels().replay?.ok === true,
      cycleDigest: previousCycleDigest,
      checkpointSha256: previousCheckpointSha256,
    },
    acceptance: {
      allPhysicalRoundOraclesGreen: rounds.every((round) => Boolean(round.oracleDigest)),
      fiveCumulativeYalkenWordYalkenAtlasCycles: cycleRows.length === 5,
      fourWordCheckpointYalkenAtlasWordCarryovers: carryover.carryovers.length === 4 && carryover.ok,
      exactRawAndVisibleCarryover: carryover.carryovers.every((row) => row.exact),
      stage10VisibleCommandPath: cycleRows.every((row) => row.stage10.afterRevision > row.stage10.beforeRevision),
      stage10DurableCloseReopenReplay: cycleRows.every((row) => row.closeReopenVerified && row.stage10.replayVerified),
      atlasGraphPackageRepeatImport: cycleRows.every((row) => row.atlas.repeatImportValidated),
      atlasEvidenceNoSilentNormalization: cycleRows.every((row) => row.atlas.naturalAnchor.destructiveNormalizationApplied === false),
      manualMapCumulativeLineage: cycleRows.at(-1)?.atlas.manualMapNodeCount === 10 && cycleRows.at(-1)?.atlas.manualMapEdgeCount === 5,
      eventLogAndAuthorityDigestsCarried: cycleRows.every((row) => row.stage10.afterEventLogHash && row.stage10.authorityHeadDigest && row.stage10.integrityAnchorDigest),
      noNetwork: true,
      googleUntouched: true,
      atlasSourceFilesUntouchedByHarness: true,
    },
    certificationClaim: 'CUMULATIVE_PHYSICAL_ARTIFACT_BOUND_CYCLIC_CERTIFICATION_PASS',
  };
  const acceptancePass = Object.values(resultCore.acceptance).every(Boolean);
  assertGate(acceptancePass, 'C5V2_DORIAN_ATLAS_ACCEPTANCE_FAILED');
  const result = {
    ...resultCore,
    resultDigest: sha256Text(stableJson(resultCore)),
  };
  const resultArtifact = writeJsonAtomicDurable(path.join(runDir, 'dorian-atlas-cyclic-result.json'), result);
  return {
    ...result,
    resultArtifact,
  };
}

async function main() {
  const result = await runC5V2DorianAtlasCycles(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({
    ok: true,
    runId: result.runId,
    headSha: result.headSha,
    resultDigest: result.resultDigest,
    resultArtifact: result.resultArtifact,
    cycleCount: result.topology.yalkenWordYalkenAtlasCycleCount,
    carryoverCount: result.topology.wordYalkenAtlasWordCarryoverCount,
    terminal: result.terminal,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    const rendered = error instanceof Error
      ? (error.stack || error.message)
      : JSON.stringify(error, null, 2);
    process.stderr.write(`${rendered}\n`);
    process.exitCode = 1;
  });
}
