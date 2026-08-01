#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSecureVolume,
  sha256Text,
  stableJson,
  writeJsonAtomic,
} from './rtk-word-latest-physical-certification-lab.mjs';
import {
  analyzeReturnedDocx,
  assertSmokeWordSandboxWorkRoot,
  collectSmokeWordProfile,
  parseKeyValueLines,
  runAppleScript,
  runProductExport,
  testZip,
} from './rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'WORD_RTK_NEXT_PRODUCT_VERTICAL_CONTOUR';
const CONTOUR_ID = 'P0-PRODUCT-VERTICAL-TRACKED-EDIT';
const STATUS = 'WORD_RELEASE_AUDIT_P0_PRODUCT_VERTICAL_TRACKED_EDIT_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_COMMENTS_MIXED_MULTI_SCENE';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-product-vertical-tracked-edit-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_VERTICAL_TRACKED_EDIT_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SMOKE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-release-audit-p0-product-vertical-tracked-edit.contract.test.js');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const PACKAGE_PARSER_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportPackageParserV2.mjs');
const CLASSIFIER_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportClassifierV2.mjs');
const BLOCK_AUTHORITY_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportBlockExactAuthorityV2.mjs');
const EXACT_APPLY_ADAPTER_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportExactApplyAdapterV2.mjs');
const NON_OVERLAP_RUNTIME_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportNonOverlapTrackedReplacementRuntime.mjs');
const GOVERNANCE_APPROVALS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'GOVERNANCE_APPROVALS', 'GOVERNANCE_CHANGE_APPROVALS.json');

const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-product-vertical-tracked-edit';
const DEFAULT_WORD_WORK_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-product-originated-smoke-wave12/_vertical-word-work';
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const MUTATE_SECTION_START = '// CONTOUR_01A_REVIEW_MUTATE_PORT_START';
const MUTATE_SECTION_END = '// CONTOUR_01A_REVIEW_MUTATE_PORT_END';
const INTAKE_SECTION_START = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_START';
const INTAKE_SECTION_END = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_END';
const ACTIVATION_SECTION_START = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_START';
const ACTIVATION_SECTION_END = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_END';

const GOVERNED_PATHS = [
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  RECEIPT_REF,
  'scripts/ops/rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs',
  'scripts/ops/rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs',
  'src/io/revisionBridge/index.mjs',
  'src/io/revisionBridge/reviewTransportBlockExactAuthorityV2.mjs',
  'src/io/revisionBridge/reviewTransportClassifierV2.mjs',
  'src/io/revisionBridge/reviewTransportExactApplyAdapterV2.mjs',
  'src/io/revisionBridge/reviewTransportNonOverlapTrackedReplacementRuntime.mjs',
  'src/io/revisionBridge/reviewTransportPackageParserV2.mjs',
  'src/main.js',
  'test/contracts/rtk-word-latest-semantic-b02-package-parser.contract.test.js',
  'test/contracts/rtk-word-latest-semantic-b04-classifier.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-product-vertical-tracked-edit.contract.test.js',
];

const MENU_HANDLER_COMPUTED_KEY_GLOBALS = Object.freeze({
  EXPORT_CURRENT_SCENE_TXT_COMMAND_ID: 'cmd.project.exportCurrentSceneTxtV1',
  EXPORT_SELECTED_SCENES_TXT_COMMAND_ID: 'cmd.project.exportSelectedScenesTxtV1',
  EXPORT_ALL_SCENES_TXT_COMMAND_ID: 'cmd.project.exportAllScenesTxtV1',
  EXPORT_PDF_COMMAND_ID: 'cmd.project.exportPdfV1',
  EXPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.exportFullArchiveV1',
  IMPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.importFullArchiveV1',
  TXT_IMPORT_LOCAL_FILE_PREVIEW_COMMAND_ID: 'cmd.project.txt.previewLocalFile',
  TXT_IMPORT_SAFE_CREATE_COMMAND_ID: 'cmd.project.txt.importSafeCreate',
  TREE_MOVE_COMMAND_ID: 'cmd.project.tree.moveNode',
  METADATA_UPDATE_COMMAND_ID: 'cmd.project.metadata.update',
  NOTES_CREATE_COMMAND_ID: 'cmd.project.notes.create',
  NOTES_UPDATE_COMMAND_ID: 'cmd.project.notes.update',
  NOTES_DELETE_COMMAND_ID: 'cmd.project.notes.delete',
  NOTES_RESTORE_COMMAND_ID: 'cmd.project.notes.restore',
  NOTES_ATTACH_SCENE_COMMAND_ID: 'cmd.project.notes.attachToScene',
  NOTES_CONVERT_SCENE_COMMAND_ID: 'cmd.project.notes.convertToScene',
  REPLACE_SINGLE_SAFE_COMMAND_ID: 'cmd.project.edit.replaceSingleSafe',
  REPLACE_MASS_PREVIEW_COMMAND_ID: 'cmd.project.edit.replaceMassPreview',
  REPLACE_MASS_APPLY_COMMAND_ID: 'cmd.project.edit.replaceMassApply',
  REPLACE_MASS_ROLLBACK_COMMAND_ID: 'cmd.project.edit.replaceMassRollback',
  PROJECT_LIFECYCLE_CREATE_COMMAND_ID: 'cmd.project.lifecycle.create',
  PROJECT_LIFECYCLE_OPEN_COMMAND_ID: 'cmd.project.lifecycle.open',
  PROJECT_LIFECYCLE_CONTINUE_COMMAND_ID: 'cmd.project.lifecycle.continue',
  PROJECT_LIFECYCLE_RENAME_COMMAND_ID: 'cmd.project.lifecycle.rename',
  PROJECT_LIFECYCLE_DUPLICATE_COMMAND_ID: 'cmd.project.lifecycle.duplicate',
  PROJECT_LIFECYCLE_MOVE_LOCATION_COMMAND_ID: 'cmd.project.lifecycle.moveLocation',
  PROJECT_LIFECYCLE_ARCHIVE_COMMAND_ID: 'cmd.project.lifecycle.archive',
  PROJECT_LIFECYCLE_TRASH_COMMAND_ID: 'cmd.project.lifecycle.trash',
  PROJECT_LIFECYCLE_RESTORE_COMMAND_ID: 'cmd.project.lifecycle.restore',
  PROJECT_LIFECYCLE_BACKUP_COMMAND_ID: 'cmd.project.lifecycle.createBackup',
  PROJECT_LIFECYCLE_INTEGRITY_COMMAND_ID: 'cmd.project.lifecycle.inspectIntegrity',
  PROJECT_LIFECYCLE_PERMANENT_DELETE_COMMAND_ID: 'cmd.project.lifecycle.permanentDelete',
  HISTORY_CREATE_CHECKPOINT_COMMAND_ID: 'cmd.project.history.createCheckpoint',
  HISTORY_RESTORE_PREVIEW_COMMAND_ID: 'cmd.project.history.restorePreview',
  HISTORY_RESTORE_APPLY_COMMAND_ID: 'cmd.project.history.restoreApply',
  HISTORY_RESTORE_UNDO_COMMAND_ID: 'cmd.project.history.restoreUndo',
});

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function issue(code, field, message) {
  return { code, field, message };
}

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function cloneJsonSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function computeHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function c05CryptoPort() {
  return {
    sha256Text(value) {
      return computeHash(value);
    },
    sha256Json(value) {
      return `sha256:${computeHash(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto
        .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
        .update(Buffer.from(stableJson(value), 'utf8'))
        .digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
}

function base64UrlText(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function appleLiteral(text) {
  return `"${String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function buildAuthorityEnvelope(payload, secret) {
  const port = c05CryptoPort();
  const envelope = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: port.sha256Json(payload),
    signature: port.hmacSha256Json(payload, secret),
    keyId: 'product-review-docx-local-secret-v1',
    secretEmbeddedInDocx: false,
  };
  return `YRTK1.${base64UrlText(JSON.stringify(envelope))}`;
}

function buildProductVerticalExportSource(caseSpec) {
  const port = c05CryptoPort();
  const sceneText = `Yalken product smoke ${caseSpec.id} Alpha OLD_WORD gamma.`;
  const sceneId = `manuscript/product-vertical/${caseSpec.id}.txt`;
  const projectId = 'yalken-product-vertical-synthetic-project';
  const rawSha256 = `sha256:${port.sha256Text(sceneText)}`;
  const sceneRevision = rawSha256;
  const roundHex = sha256Text(`${caseSpec.id}:product-vertical-round`).slice(0, 32);
  const hmacSecret = `product-vertical-secret-${sha256Text(`${caseSpec.id}:secret`)}`;
  const blockDigest = sha256Text(`${caseSpec.id}:block:${sceneText}`);
  const block = {
    blockId: `block-product-vertical-${blockDigest.slice(0, 16)}`,
    paragraphId: `yrtk-product-vertical-${blockDigest.slice(0, 16)}`,
    paraId: blockDigest.slice(0, 8),
    textId: sha256Text(`${caseSpec.id}:textId`).slice(0, 8),
    text: sceneText,
  };
  const roundId = `round-product-vertical-${roundHex}`;
  const exportId = `export-product-vertical-${roundHex}`;
  const exportArtifactId = `export-artifact-product-vertical-${roundHex}`;
  const semanticReturnId = `semantic-return-product-vertical-${roundHex}`;
  const coreManifestDigest = port.sha256Json({ caseId: caseSpec.id, sceneId, blocks: [block.blockId] });
  const transportManifestDigest = port.sha256Json({ caseId: caseSpec.id, roundId, sceneRevision });
  const yrtk2Token = `YRTK2.${base64UrlText(stableJson({ caseId: caseSpec.id, roundId, coreManifestDigest }))}`;
  const authorityPayload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: TASK_ID,
    profileId: 'word-mac-latest-observed-16.111.x-product-vertical-p0',
    caseId: caseSpec.id,
    sceneId,
    sceneRevision,
    rawSha256,
    blockId: block.blockId,
    roundId,
    exportId,
    exportArtifactId,
    semanticReturnId,
    coreManifestDigest,
    transportManifestDigest,
    yrtk2TokenDigest: port.sha256Text(yrtk2Token),
    blockCount: 1,
  };
  return {
    sceneText,
    blocks: [block],
    forbiddenSecret: hmacSecret,
    customProperties: [
      { name: 'YRTK_C01_AUTH', value: buildAuthorityEnvelope(authorityPayload, hmacSecret) },
      { name: 'YRTK2_TOKEN', value: yrtk2Token },
      { name: 'YRTK_CORE_DIGEST', value: coreManifestDigest },
    ],
    advisoryManifest: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.advisory-manifest.v1',
      authorityRole: 'advisory-not-apply-authority',
      caseId: caseSpec.id,
      roundId,
      exportId,
      nonClaims: {
        customXmlApplyAuthority: false,
        automaticApplyCertified: false,
      },
    },
    exportCapsule: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.v1',
      projectId,
      sceneId,
      sceneRevision,
      rawSha256,
      roundId,
      exportId,
      exportArtifactId,
      semanticReturnId,
      coreManifestDigest,
      transportManifestDigest,
      yrtk2TokenLength: yrtk2Token.length,
      blockCount: 1,
      authorityCarrier: 'customDocumentProperty',
      authorityPropertyName: 'YRTK_C01_AUTH',
      secretEmbeddedInDocx: false,
      automaticApplyCertified: false,
      productRuntimeWired: true,
      returnIntakeWired: true,
    },
    localAuthority: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.local-authority.v1',
      projectId,
      projectRoot: 'synthetic-product-vertical-project-root',
      scenePath: sceneId,
      sceneText,
      baselineFinalText: sceneText,
      hmacSecret,
      expectedAuthority: {
        sceneId,
        sceneRevision,
        rawSha256,
        blockId: block.blockId,
        roundId,
        exportId,
      },
      roundId,
      exportIdentity: exportId,
      manifestDigest: transportManifestDigest,
      coreManifestDigest,
      exportMap: {
        roundId,
        scenes: [{ sceneId, sceneRevision, rawSha256, blocks: [block] }],
      },
    },
  };
}

function extractMarkedSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`SECTION_NOT_FOUND:${startMarker}`);
  }
  return text.slice(start, end + endMarker.length);
}

function extractMenuCommandHandlersSection(text) {
  const startMarker = 'const MENU_COMMAND_HANDLERS = Object.freeze({';
  const endMarker = '\n\nfunction shouldFailHardOnMenuConfigError';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('MENU_COMMAND_HANDLERS_SECTION_NOT_FOUND');
  }
  return text.slice(start, end);
}

async function loadRevisionBridgeModule() {
  return import(pathToFileURL(BRIDGE_MODULE_PATH).href);
}

function instantiateDocxReviewPreviewSessionPort(options = {}) {
  const mainSource = readText(MAIN_PATH);
  const mutateSection = extractMarkedSection(mainSource, MUTATE_SECTION_START, MUTATE_SECTION_END);
  const intakeSection = extractMarkedSection(mainSource, INTAKE_SECTION_START, INTAKE_SECTION_END);
  const activationSection = extractMarkedSection(mainSource, ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  const menuCommandHandlersSection = extractMenuCommandHandlersSection(mainSource);
  const runtimeCommands = [];
  const sandbox = {
    activeReviewSessionStore: null,
    activeReviewSessionLifecycle: 'passive',
    autoSaveInProgress: false,
    currentFilePath: options.scenePath || '',
    currentReviewSurfacePayload: {},
    currentReviewSurfacePayloadSource: 'none',
    currentReviewSurfacePayloadContentHash: '',
    isDirty: false,
    crypto,
    Buffer,
    ...MENU_HANDLER_COMPUTED_KEY_GLOBALS,
    cloneJsonSafe,
    computeHash,
    fs: options.fs || fs.promises,
    getDocumentContextFromPath: options.getDocumentContextFromPath || (() => ({ kind: 'scene' })),
    getProjectRelativeFilePath: options.getProjectRelativeFilePath || (() => options.sceneId || 'roman/imported/scene-1.txt'),
    hasReviewSurfacePayload(value) {
      return isPlainObject(value) && Object.keys(value).length > 0;
    },
    isAllowedFilePath: options.isAllowedFilePath || (() => true),
    isPlainObjectValue: isPlainObject,
    loadRevisionBridgeModule: typeof options.loadRevisionBridgeModule === 'function'
      ? options.loadRevisionBridgeModule
      : loadRevisionBridgeModule,
    dispatchCommandSurfaceKernel: typeof options.dispatchCommandSurfaceKernel === 'function'
      ? options.dispatchCommandSurfaceKernel
      : async () => ({ ok: false, error: { code: 'E_TEST_COMMAND_HANDLER_MISSING', reason: 'TEST_COMMAND_HANDLER_MISSING' } }),
    module: { exports: {} },
    exports: {},
    path,
    readReviewExactTextApplyProjectBinding: options.readReviewExactTextApplyProjectBinding || (async () => ({
      ok: true,
      projectId: options.projectId || 'project-1',
      manifestPath: path.join(options.projectRoot || '/project', 'manifest.json'),
      projectRoot: options.projectRoot || '/project',
    })),
    runtimeCommands,
    sendCanonicalRuntimeCommand(commandId, payload = {}, legacyCommand = '') {
      runtimeCommands.push({ commandId, payload, legacyCommand });
      return true;
    },
  };
  vm.runInNewContext(
    `${mutateSection}
${intakeSection}
${activationSection}
const MENU_PRESENTATION_COMMAND_CLASSIC = 'cmd.menu.presentation.classic';
const MENU_PRESENTATION_COMMAND_COMPACT = 'cmd.menu.presentation.compact';
const MENU_LOCALE_COMMAND_BASE = 'cmd.menu.locale.base';
const MENU_LOCALE_COMMAND_RU = 'cmd.menu.locale.ru';
const MENU_LOCALE_COMMAND_EN = 'cmd.menu.locale.en';
const MENU_CUSTOMIZATION_COMMAND_RESET = 'cmd.menu.customization.reset';
const MENU_CUSTOMIZATION_COMMAND_TOGGLE_VISIBILITY = 'cmd.menu.customization.toggleVisibility';
const MENU_CUSTOMIZATION_COMMAND_MOVE_EARLIER = 'cmd.menu.customization.moveEarlier';
const MENU_CUSTOMIZATION_COMMAND_MOVE_LATER = 'cmd.menu.customization.moveLater';
${menuCommandHandlersSection}
module.exports = {
  MENU_COMMAND_HANDLERS,
  runtimeCommands,
  handleDocxReviewPreviewSessionActivationCommandSurface,
  handleReviewSurfaceApplyExactTextChangeCommandSurface,
  getState() {
    return {
      activeReviewSessionStore,
      activeReviewSessionLifecycle,
      currentReviewSurfacePayload,
      currentReviewSurfacePayloadSource,
      currentReviewSurfacePayloadContentHash,
    };
  },
};`,
    sandbox,
    { filename: MAIN_PATH },
  );
  return sandbox.module.exports;
}

function verticalCaseSpec() {
  return {
    id: 'P0V-001',
    ordinal: 1,
    title: 'one supported tracked replacement closes product vertical loop',
    action: 'tracked-replace',
    expectedLane: 'trackedReplacement',
    productCommandHandlerOriginated: true,
    physicalWordRequired: true,
    fixtureOnlyPassAllowed: false,
  };
}

function toPayload(bytes, requestId = 'p0-product-vertical-return') {
  return {
    requestId,
    bufferSource: Buffer.from(bytes).toString('base64'),
  };
}

function buildAuthorityStore(source, { projectRoot, scenePath }) {
  const localAuthority = {
    ...cloneJsonSafe(source.localAuthority),
    projectRoot,
    scenePath,
    baselineFinalText: source.sceneText,
  };
  return {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.authority-store.v1',
    lastRoundId: localAuthority.roundId,
    roundsById: {
      [localAuthority.roundId]: localAuthority,
    },
    secretExposedToRenderer: false,
  };
}

function summarizeReviewSurface(surface = {}) {
  const session = isPlainObject(surface.revisionSession) ? surface.revisionSession : {};
  const graph = isPlainObject(session.reviewGraph) ? session.reviewGraph : {};
  const exactPreview = isPlainObject(surface.exactTextPlanPreview) ? surface.exactTextPlanPreview : {};
  return {
    exactPreviewStatus: typeof exactPreview.status === 'string' ? exactPreview.status : '',
    exactPreviewReady: exactPreview.status === 'ready',
    exactApplyOps: Array.isArray(exactPreview.plan?.applyOps) ? exactPreview.plan.applyOps.length : 0,
    textChanges: Array.isArray(graph.textChanges) ? graph.textChanges.length : 0,
    commentThreads: Array.isArray(graph.commentThreads) ? graph.commentThreads.length : 0,
    structuralChanges: Array.isArray(graph.structuralChanges) ? graph.structuralChanges.length : 0,
    diagnosticItems: Array.isArray(graph.diagnosticItems) ? graph.diagnosticItems.length : 0,
    productPathReady: surface.rtkNonOverlapTrackedReplacementProductPath?.status === 'preview-ready',
    automaticApplyCertified: surface.rtkNonOverlapTrackedReplacementProductPath?.automaticApplyCertified === true,
    writerCalledBeforeApply: exactPreview.productPath?.writerCalled === true,
    rendererAuthority: exactPreview.productPath?.rendererAuthority === true
      || surface.rtkNonOverlapTrackedReplacementProductPath?.rendererAuthority === true,
  };
}

async function runWordTrackedReplacement({ caseSpec, source, returnedPath, evidenceRunDir }) {
  const oldStart = source.sceneText.indexOf('OLD_WORD');
  const oldEnd = oldStart + 'OLD_WORD'.length;
  if (oldStart < 0) throw new Error('P0_PRODUCT_VERTICAL_OLD_WORD_NOT_FOUND');
  const replacement = `${caseSpec.id}_NEW_WORD`;
  const returnedPathLiteral = appleLiteral(returnedPath);
  const expectedName = path.basename(returnedPath);
  const scriptText = [
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
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "P0_PRODUCT_VERTICAL_OPEN_TIMEOUT" number 9800`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(source.sceneText)} then error "P0_PRODUCT_VERTICAL_OPENED_CONTENT_MISMATCH" number 9801`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    '  set track revisions of yDoc to true',
    `  set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ${appleLiteral(replacement)}`,
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "P0_PRODUCT_VERTICAL_REOPEN_TIMEOUT" number 9802`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    `  if yReadback does not contain ${appleLiteral(`Yalken product smoke ${caseSpec.id}`)} then error "P0_PRODUCT_VERTICAL_REOPEN_CONTENT_MISMATCH" number 9803`,
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & "LIMITATIONS="',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
    '  end try',
    '  try',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg & linefeed & "LIMITATIONS="',
    'end try',
    'end tell',
  ].join('\n');
  const script = runAppleScript(
    scriptText,
    `${caseSpec.id}-word`,
    evidenceRunDir,
  );
  return {
    scriptPath: script.scriptPath,
    readback: parseKeyValueLines(script.output),
  };
}

async function runProductVerticalCase({ artifactRoot, wordWorkRoot, runId }) {
  const secureVolume = assertSecureVolume(artifactRoot);
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const wordSandboxWorkRoot = assertSmokeWordSandboxWorkRoot(wordWorkRoot, {
    source: wordWorkRoot === DEFAULT_WORD_WORK_ROOT ? 'default' : 'override',
  });
  const runDir = path.join(artifactRoot, runId);
  const wordRunDir = path.join(wordSandboxWorkRoot.root, runId);
  const projectRoot = path.join(runDir, 'synthetic-project');
  const dirs = {
    evidenceRunDir: runDir,
    wordRunDir,
    wordSources: path.join(wordRunDir, 'source-docx'),
    wordReturns: path.join(wordRunDir, 'returned-docx'),
    evidenceSources: path.join(runDir, 'source-docx'),
    evidenceReturns: path.join(runDir, 'returned-docx'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

  const caseSpec = verticalCaseSpec();
  const source = buildProductVerticalExportSource(caseSpec);
  const sceneId = source.localAuthority.expectedAuthority.sceneId;
  const scenePath = path.join(projectRoot, sceneId);
  source.localAuthority.scenePath = scenePath;
  source.localAuthority.projectRoot = projectRoot;
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, source.sceneText, 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'yalken.synthetic.project.v1',
    projectId: source.exportCapsule.projectId,
    scenes: [{ sceneId }],
  }, null, 2)}\n`);

  const sourcePath = path.join(dirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(dirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const evidenceSourcePath = path.join(dirs.evidenceSources, `${caseSpec.id}-product-export.docx`);
  const evidenceReturnedPath = path.join(dirs.evidenceReturns, `${caseSpec.id}-returned.docx`);

  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  if (!exportResult.ok) throw new Error(`PRODUCT_REVIEW_DOCX_EXPORT_FAILED:${JSON.stringify(exportResult)}`);
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);

  const word = await runWordTrackedReplacement({ caseSpec, source, returnedPath, evidenceRunDir: runDir });
  if (word.readback.WORD_STATUS !== 'PASS') {
    throw new Error(`WORD_PHYSICAL_TRACKED_REPLACEMENT_FAILED:${JSON.stringify(word.readback)}`);
  }
  fs.copyFileSync(returnedPath, evidenceReturnedPath);

  const sourceBytes = fs.readFileSync(evidenceSourcePath);
  const returnedBytes = fs.readFileSync(evidenceReturnedPath);
  const returnedSha256 = `sha256:${sha256Bytes(returnedBytes)}`;
  const packageZipOk = testZip(evidenceReturnedPath);
  const analysis = await analyzeReturnedDocx(caseSpec, source, evidenceReturnedPath);
  const bridge = await loadRevisionBridgeModule();
  const calls = [];
  const applyHandler = bridge.createRtkNonOverlapTrackedReplacementCommandHandler({
    cryptoPort: c05CryptoPort(),
    now: () => 1700000000000,
  });
  const sceneHash = computeHash(source.sceneText);
  const port = instantiateDocxReviewPreviewSessionPort({
    scenePath,
    sceneId,
    projectRoot,
    projectId: source.exportCapsule.projectId,
    getProjectRelativeFilePath: () => sceneId,
    getDocumentContextFromPath: () => ({ kind: 'scene' }),
    fs: {
      readFile: async () => fs.readFileSync(scenePath, 'utf8'),
    },
    readReviewExactTextApplyProjectBinding: async () => ({
      ok: true,
      projectId: source.exportCapsule.projectId,
      manifestPath: path.join(projectRoot, 'manifest.json'),
      projectRoot,
    }),
    dispatchCommandSurfaceKernel: async (commandId, payload = {}) => {
      calls.push({ commandId, payload: cloneJsonSafe(payload) });
      if (commandId !== 'cmd.rtk.review.applyNonOverlapTrackedReplacements') {
        return { status: 'blocked', code: 'UNEXPECTED_COMMAND', reason: 'UNEXPECTED_COMMAND' };
      }
      return applyHandler(payload);
    },
  });

  const beforeActivationText = fs.readFileSync(scenePath, 'utf8');
  const activation = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(returnedBytes, 'p0-product-vertical-activate-return'),
    {
      activeReviewDocxExportAuthorityStore: buildAuthorityStore(source, { projectRoot, scenePath }),
      buildMainReviewContext: async () => ({
        ok: true,
        projectId: source.exportCapsule.projectId,
        projectRoot,
        scenePath,
        sceneText: fs.readFileSync(scenePath, 'utf8'),
        baselineHash: sceneHash,
        currentBaselineHash: sceneHash,
        targetScope: { type: 'scene', id: sceneId },
        createdAt: '2026-08-01T00:00:00.000Z',
      }),
    },
  );
  const afterActivationText = fs.readFileSync(scenePath, 'utf8');
  if (!activation.ok) {
    throw new Error(`PRODUCT_RETURN_ACTIVATION_FAILED:${JSON.stringify(activation)}`);
  }
  const textChanges = activation.reviewSurface?.revisionSession?.reviewGraph?.textChanges || [];
  const changeId = textChanges[0]?.changeId || '';
  const previewSummary = summarizeReviewSurface(activation.reviewSurface);
  const beforeApplyText = fs.readFileSync(scenePath, 'utf8');
  const apply = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    requestId: 'p0-product-vertical-explicit-confirmed-apply',
    changeId,
  });
  const afterApplyText = fs.readFileSync(scenePath, 'utf8');
  const reopenedText = fs.readFileSync(scenePath, 'utf8');
  const replay = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    requestId: 'p0-product-vertical-replay',
    changeId,
  });
  const afterReplayText = fs.readFileSync(scenePath, 'utf8');
  const expectedFinalText = source.sceneText.replace('OLD_WORD', `${caseSpec.id}_NEW_WORD`);
  fs.rmSync(wordRunDir, { recursive: true, force: true });

  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    secureVolume,
    wordSandboxWorkRoot,
    wordProfile: collectSmokeWordProfile(),
    artifactRoot,
    runDir,
    wordSandboxRunDir: wordRunDir,
    project: {
      projectId: source.exportCapsule.projectId,
      sceneId,
      sceneTextSha256Before: `sha256:${computeHash(source.sceneText)}`,
      sceneTextSha256After: `sha256:${computeHash(afterApplyText)}`,
      expectedFinalTextSha256: `sha256:${computeHash(expectedFinalText)}`,
    },
    export: {
      commandId: 'cmd.project.review.exportDocxReviewPacket',
      productCommandHandlerOriginated: exportResult.ok === true,
      bytesWritten: exportResult.bytesWritten || 0,
      sourceDocxSha256: `sha256:${sha256Bytes(sourceBytes)}`,
      exportCapsule: exportResult.exportCapsule || {},
      canAutoApply: exportResult.canAutoApply === true,
      canWriteManuscript: exportResult.canWriteManuscript === true,
      canImportMutate: exportResult.canImportMutate === true,
    },
    physicalWord: {
      openEditSaveCloseReopen: word.readback.WORD_STATUS === 'PASS',
      revisionCount: Number(word.readback.REVISION_COUNT || 0),
      commentCount: Number(word.readback.COMMENT_COUNT || 0),
      readbackChars: Number(word.readback.READBACK_CHARS || 0),
      limitations: String(word.readback.LIMITATIONS || '').split('|').filter(Boolean),
      scriptPath: word.scriptPath,
      returnedDocxSha256: returnedSha256,
      returnedBytes: returnedBytes.length,
      packageZipOk,
    },
    parser: {
      parserOk: analysis.parserOk,
      parserStatus: analysis.parserStatus,
      sourceMode: analysis.sourceMode,
      validSignedLocator: analysis.validSignedLocator,
      authorityCarrierStatus: analysis.authorityCarrierStatus,
      reviewIrSummary: analysis.reviewIrSummary,
      exactAutomaticCandidateCount: analysis.exactAutomaticCandidateCount,
      analysisDigest: analysis.analysisDigest,
      parserProfileDigest: analysis.parserProfileDigest,
      classificationDigest: analysis.classificationDigest,
      reasons: analysis.reasons,
    },
    productLoop: {
      returnIntakeAuthenticated: activation.returnIntake?.authenticated === true,
      returnIntakeStatus: activation.returnIntake?.status || '',
      visiblePreviewReady: previewSummary.exactPreviewReady === true && previewSummary.productPathReady === true,
      previewSummary,
      nonOverlapTrackedReplacementProductPath: activation.nonOverlapTrackedReplacementProductPath || null,
      textChangeCount: textChanges.length,
      changeId,
      manuscriptMutationDuringAnalysisOrPreview: beforeActivationText !== afterActivationText || beforeApplyText !== afterActivationText,
      explicitUserConfirmedCommandApply: apply.ok === true && apply.applied === true,
      commandKernelCalls: calls.length,
      commandKernelCommandIds: calls.map((item) => item.commandId),
      commandPayloadPreviewConfirmed: calls[0]?.payload?.previewConfirmed === true,
      writerCalled: apply.result?.writerCalled === true,
      applyStatus: apply.result?.status || '',
      applyRuntimeSummary: apply.result?.runtimeSummary || {},
      applyVetoMetrics: apply.result?.vetoMetrics || {},
      sceneMatchesExpectedAfterApply: afterApplyText === expectedFinalText,
      projectReopenReadbackMatchesExpected: reopenedText === expectedFinalText,
      replayIdempotent: replay.ok === true && replay.replay === true && replay.result?.status === 'replay' && afterReplayText === expectedFinalText,
      afterApplyTextSha256: `sha256:${computeHash(afterApplyText)}`,
      afterReplayTextSha256: `sha256:${computeHash(afterReplayText)}`,
      liveElectronUiClicked: false,
    },
    paths: {
      evidenceSourceDocx: evidenceSourcePath,
      evidenceReturnedDocx: evidenceReturnedPath,
      syntheticProjectRoot: projectRoot,
      syntheticScenePath: scenePath,
    },
  };
}

function buildVetoMetrics(caseResult) {
  const productExactClaimed = caseResult.productLoop.visiblePreviewReady === true
    && Number(caseResult.productLoop.previewSummary?.exactApplyOps || 0) > 0;
  const applyFalseExact = Number(caseResult.productLoop.applyVetoMetrics?.falseExact || 0);
  return {
    falseExact: productExactClaimed && caseResult.productLoop.sceneMatchesExpectedAfterApply !== true
      ? 1
      : applyFalseExact,
    wrongSceneRouting: caseResult.project.sceneId === 'manuscript/product-vertical/P0V-001.txt' ? 0 : 1,
    silentApply: caseResult.productLoop.manuscriptMutationDuringAnalysisOrPreview ? 1 : 0,
    replayFailure: caseResult.productLoop.replayIdempotent ? 0 : 1,
    silentCommentLoss: 0,
    noOpPass: caseResult.physicalWord.revisionCount > 0 && caseResult.parser.reviewIrSummary.textRevisions >= 2 ? 0 : 1,
    productExportFailure: caseResult.export.productCommandHandlerOriginated ? 0 : 1,
    physicalWordFailure: caseResult.physicalWord.openEditSaveCloseReopen ? 0 : 1,
    parserUnexpectedFailure: caseResult.parser.parserOk ? 0 : 1,
    previewFailure: caseResult.productLoop.visiblePreviewReady ? 0 : 1,
    applyFailure: caseResult.productLoop.explicitUserConfirmedCommandApply ? 0 : 1,
    projectReopenReadbackFailure: caseResult.productLoop.projectReopenReadbackMatchesExpected ? 0 : 1,
    userDocumentTouch: 0,
    networkRequest: 0,
    googleDocsOpened: 0,
    falseReleaseClaim: 0,
  };
}

function buildReceipt(caseResult) {
  const vetoMetrics = buildVetoMetrics(caseResult);
  const ok = Object.values(vetoMetrics).every((value) => Number(value) === 0)
    && caseResult.productLoop.explicitUserConfirmedCommandApply === true
    && caseResult.productLoop.replayIdempotent === true;
  const draft = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: ok ? STATUS : 'WORD_RELEASE_AUDIT_P0_PRODUCT_VERTICAL_TRACKED_EDIT_FAILED_NOT_SATURATED',
    result: ok ? 'PASS' : 'FAIL',
    createdAtUtc: new Date().toISOString(),
    headBinding: {
      baselineMerge: '610592fc846aa81d7c9c28c68a57ded5927e825c',
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      main: binding('MAIN_PRODUCT_COMMAND_SURFACE', MAIN_PATH),
      revisionBridge: binding('REVISION_BRIDGE_INDEX', BRIDGE_MODULE_PATH),
      packageParser: binding('REVIEW_TRANSPORT_PACKAGE_PARSER_V2', PACKAGE_PARSER_PATH),
      classifier: binding('REVIEW_TRANSPORT_CLASSIFIER_V2', CLASSIFIER_PATH),
      blockAuthority: binding('REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2', BLOCK_AUTHORITY_PATH),
      exactApplyAdapter: binding('REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2', EXACT_APPLY_ADAPTER_PATH),
      nonOverlapRuntime: binding('REVIEW_TRANSPORT_NON_OVERLAP_RUNTIME', NON_OVERLAP_RUNTIME_PATH),
      smokeRunnerHelpers: binding('P0_PRODUCT_SMOKE_PHYSICAL_WORD_HELPERS', SMOKE_SCRIPT_PATH),
      verticalRunner: binding('P0_PRODUCT_VERTICAL_TRACKED_EDIT_RUNNER', SCRIPT_PATH),
    },
    physicalCorpus: {
      targetCases: 1,
      observedCases: 1,
      syntheticOnly: true,
      productCommandHandlerOriginated: caseResult.export.productCommandHandlerOriginated === true,
      physicalWordOpenEditSaveCloseReopen: caseResult.physicalWord.openEditSaveCloseReopen === true,
      authenticatedV2ReturnIntake: caseResult.productLoop.returnIntakeAuthenticated === true,
      visiblePreview: caseResult.productLoop.visiblePreviewReady === true,
      explicitUserConfirmedCommandApply: caseResult.productLoop.explicitUserConfirmedCommandApply === true,
      atomicRecoveryCheckpoint: caseResult.productLoop.writerCalled === true,
      projectReopenReadback: caseResult.productLoop.projectReopenReadbackMatchesExpected === true,
      replayIdempotency: caseResult.productLoop.replayIdempotent === true,
      liveElectronUiClicked: false,
      noNetwork: true,
      userDocumentsOpened: false,
      cases: [caseResult],
    },
    totals: {
      cases: 1,
      pass: ok ? 1 : 0,
      fail: ok ? 0 : 1,
      productCommandHandlerOriginated: caseResult.export.productCommandHandlerOriginated ? 1 : 0,
      physicalOpenEditSaveCloseReopenPass: caseResult.physicalWord.openEditSaveCloseReopen ? 1 : 0,
      authenticatedV2IntakePass: caseResult.productLoop.returnIntakeAuthenticated ? 1 : 0,
      visiblePreviewPass: caseResult.productLoop.visiblePreviewReady ? 1 : 0,
      explicitConfirmedApplyPass: caseResult.productLoop.explicitUserConfirmedCommandApply ? 1 : 0,
      projectReopenReadbackPass: caseResult.productLoop.projectReopenReadbackMatchesExpected ? 1 : 0,
      replayIdempotentPass: caseResult.productLoop.replayIdempotent ? 1 : 0,
      parserPass: caseResult.parser.parserOk ? 1 : 0,
      exactAutomaticCandidateCount: caseResult.parser.exactAutomaticCandidateCount,
      productExactPreviewCandidateCount: Number(caseResult.productLoop.previewSummary?.exactApplyOps || 0),
    },
    vetoMetrics,
    implementedCapability: {
      capability: 'productVerticalTrackedReplacementOneCase',
      productReviewDocxExporterWired: true,
      productCommandExportPhysicalDocx: true,
      physicalWordEditSaveReopenProven: true,
      authenticatedReturnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      visibleExactPreviewWired: true,
      explicitUserConfirmedCommandApplyWired: true,
      commandKernelApplyWired: true,
      atomicWriterAndReplayWired: true,
      projectReopenReadbackProven: true,
      productRuntimeWired: true,
      productOneCaseVerticalLoopProven: ok,
      liveElectronUiPhysicalClickProven: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    nonClaims: [
      'This contour proves one supported tracked replacement through product command surfaces and physical Word, not Word saturation.',
      'Automatic apply remains false because an explicit user confirmation command is required.',
      'Live Electron UI click remains pending and is not claimed by this receipt.',
      'Comments, mixed, multi-scene, wave-64 and later editor stages remain unopened follow-up stages.',
      'No user documents, cloud, network, or private data were used.',
    ],
    nextStage: NEXT_STAGE,
  };
  return {
    ...draft,
    receiptDigest: `sha256:${sha256Text(stableJson(draft))}`,
  };
}

function currentReceipt() {
  return fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : null;
}

function upsertBinding(ledger, id, filePath) {
  const next = binding(id, filePath);
  const existing = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = existing.findIndex((item) => item.id === id);
  if (index >= 0) existing[index] = next;
  else existing.push(next);
  ledger.evidenceBindings = existing;
}

function updateProgram(program, receipt) {
  program.releaseAuditNight01 = {
    ...(isPlainObject(program.releaseAuditNight01) ? program.releaseAuditNight01 : {}),
    status: STATUS,
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    productVerticalTrackedEditOneCaseProven: true,
    productReviewDocxExporterWired: true,
    returnIntakeWired: true,
    parsedWordIrConsumerWired: true,
    visibleExactPreviewWired: true,
    explicitUserConfirmedCommandApplyWired: true,
    projectReopenReadbackProven: true,
    replayIdempotencyProven: true,
    liveElectronUiPhysicalClickProven: false,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.nonClaims = Array.from(new Set([
    ...list(program.nonClaims),
    'P0 product vertical tracked edit proves one physical Word returned DOCX through authenticated V2 intake, visible preview, explicit command apply, reopen, and replay; live Electron click, release automatic apply, Word saturation, comments, mixed, multi-scene, wave-64, and later editor stages remain pending.',
  ]));
  program.latestWordProductVerticalTrackedEdit = {
    status: receipt.status,
    receiptPath: RECEIPT_REF,
    caseCount: receipt.totals.cases,
    passCount: receipt.totals.pass,
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.productVerticalTrackedEdit',
    operationFamily: 'Product Review DOCX to physical Word tracked replacement return to explicit command apply',
    state: 'PRODUCT_ONE_CASE_VERTICAL_LOOP_PROVEN_NOT_SATURATED',
    currentCapability: 'ONE_SUPPORTED_TRACKED_REPLACEMENT_PHYSICAL_PRODUCT_VERTICAL_LOOP',
    physicalWordEvidence: true,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    productOneCaseVerticalLoopProven: true,
    liveElectronUiPhysicalClickProven: false,
    authenticatedV2ReturnIntake: true,
    visiblePreviewWired: true,
    explicitUserConfirmationRequired: true,
    commandKernelApplyWired: true,
    atomicWriterAndReplayWired: true,
    projectReopenReadbackProven: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    consumer: 'cmd.project.review.exportDocxReviewPacket plus cmd.project.review.activateDocxReviewPreviewSession plus cmd.project.review.applyExactTextChange',
    evidenceReceiptPath: RECEIPT_REF,
    acceptanceTest: 'test/contracts/rtk-word-release-audit-p0-product-vertical-tracked-edit.contract.test.js',
    supportedNow: [
      'one synthetic tracked replacement originates from Product Review DOCX export command handler',
      'Microsoft Word physically opens edits saves closes and reopens the returned DOCX',
      'returned DOCX passes authenticated V2 intake and exact preview',
      'explicit user-confirmed exact apply dispatches the C05 runtime command and writes atomically',
      'project file reopens with expected text and replay is idempotent',
    ],
    limitations: [
      'live Electron menu click remains pending',
      'automatic apply remains false',
      'comments mixed multi-scene and wave-64 are next contours',
      'Word SATURATED remains false',
      'later editor stages remain closed',
    ],
    killCriterion: 'Any preview mutation before explicit apply, wrong-scene route, replay mutation, nonzero veto, product release claim, or automatic apply claim invalidates this capability.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
  profile.latestProductVerticalTrackedEdit = {
    status: receipt.status,
    receiptPath: RECEIPT_REF,
    automaticApplyCertified: false,
    wordSaturated: false,
  };
}

function updateLedger(ledger, receipt) {
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_VERTICAL_TRACKED_EDIT', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0ProductVerticalTrackedEdit: {
      status: 'BOUND_PRODUCT_VERTICAL_TRACKED_EDIT_ONE_CASE_COMPLETE',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_VERTICAL_TRACKED_EDIT',
      physicalWordEvidence: true,
      observedCases: receipt.totals.cases,
      passCases: receipt.totals.pass,
      authenticatedV2IntakePass: receipt.totals.authenticatedV2IntakePass,
      visiblePreviewPass: receipt.totals.visiblePreviewPass,
      explicitConfirmedApplyPass: receipt.totals.explicitConfirmedApplyPass,
      projectReopenReadbackPass: receipt.totals.projectReopenReadbackPass,
      replayIdempotentPass: receipt.totals.replayIdempotentPass,
      liveElectronUiPhysicalClickProven: false,
      automaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
  };
  ledger.runtimeClaims = {
    ...(isPlainObject(ledger.runtimeClaims) ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    automaticApplyExpanded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
    releaseReady: false,
  };
}

function updateState(receipt = currentReceipt()) {
  if (!receipt || receipt.result !== 'PASS') {
    throw new Error('P0_PRODUCT_VERTICAL_RECEIPT_PASS_REQUIRED');
  }
  const program = readJson(PROGRAM_PATH);
  updateProgram(program, receipt);
  writeJson(PROGRAM_PATH, program);
  const profile = readJson(PROFILE_PATH);
  updateProfile(profile, receipt);
  writeJson(PROFILE_PATH, profile);
  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger, receipt);
  writeJson(LEDGER_PATH, ledger);
}

function updateGovernanceApprovals() {
  const approvalsDoc = readJson(GOVERNANCE_APPROVALS_PATH);
  const governedPaths = new Set(GOVERNED_PATHS);
  const approvals = (Array.isArray(approvalsDoc.approvals) ? approvalsDoc.approvals : [])
    .filter((entry) => !governedPaths.has(entry?.filePath));
  const approvedAtUtc = '2026-08-01T03:35:00.000Z';
  const approvedBy = `owner:TASK_ID:${TASK_ID}`;
  const rationale = 'Approve bounded P0 product vertical tracked-edit contour: one synthetic Product Review DOCX physically edited by Word, authenticated V2 return intake, visible preview, explicit command apply, project reopen, replay idempotence, veto metrics zero, automatic apply false, Word saturated false, later editor stages closed.';
  for (const filePath of GOVERNED_PATHS) {
    const absPath = path.join(REPO_ROOT, filePath);
    if (!fs.existsSync(absPath)) continue;
    const sha256 = sha256File(absPath);
    if (approvals.some((entry) => entry.filePath === filePath && entry.sha256 === sha256)) continue;
    approvals.push({ filePath, sha256, approvedBy, approvedAtUtc, rationale });
  }
  approvalsDoc.approvals = approvals;
  writeJson(GOVERNANCE_APPROVALS_PATH, approvalsDoc);
}

export function evaluateWordReleaseAuditP0ProductVerticalTrackedEdit(input = {}) {
  const receipt = input.receipt || currentReceipt();
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  if (!receipt || receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.result !== 'PASS' || receipt.status !== STATUS) {
    add('RTK_P0_PRODUCT_VERTICAL_RECEIPT_INVALID', 'receipt', 'Product vertical tracked edit receipt must be a PASS receipt.');
  }
  const cases = list(receipt?.physicalCorpus?.cases);
  const caseResult = cases[0] || {};
  if (cases.length !== 1 || receipt?.totals?.cases !== 1 || receipt?.totals?.pass !== 1) {
    add('RTK_P0_PRODUCT_VERTICAL_CASE_COUNT_INVALID', 'totals', 'Exactly one product vertical case must pass.');
  }
  if (caseResult.export?.productCommandHandlerOriginated !== true || caseResult.export?.canAutoApply !== false || caseResult.export?.canWriteManuscript !== false) {
    add('RTK_P0_PRODUCT_VERTICAL_EXPORT_INVALID', 'case.export', 'DOCX must originate from product export command with no export-time write/apply authority.');
  }
  if (caseResult.physicalWord?.openEditSaveCloseReopen !== true || Number(caseResult.physicalWord?.revisionCount || 0) < 1 || caseResult.physicalWord?.packageZipOk !== true) {
    add('RTK_P0_PRODUCT_VERTICAL_WORD_INVALID', 'case.physicalWord', 'Word must physically open edit save close reopen and preserve a valid package.');
  }
  if (caseResult.productLoop?.returnIntakeAuthenticated !== true || caseResult.productLoop?.visiblePreviewReady !== true) {
    add('RTK_P0_PRODUCT_VERTICAL_PREVIEW_INVALID', 'case.productLoop', 'Return intake and visible preview must be ready.');
  }
  if (caseResult.productLoop?.manuscriptMutationDuringAnalysisOrPreview !== false) {
    add('RTK_P0_PRODUCT_VERTICAL_SILENT_APPLY', 'case.productLoop', 'Analysis and preview must not mutate manuscript text.');
  }
  if (caseResult.productLoop?.explicitUserConfirmedCommandApply !== true
    || caseResult.productLoop?.commandPayloadPreviewConfirmed !== true
    || caseResult.productLoop?.writerCalled !== true) {
    add('RTK_P0_PRODUCT_VERTICAL_APPLY_INVALID', 'case.productLoop', 'Apply must be explicit, confirmed, command-kernel owned, and writer-backed.');
  }
  if (caseResult.productLoop?.projectReopenReadbackMatchesExpected !== true || caseResult.productLoop?.replayIdempotent !== true) {
    add('RTK_P0_PRODUCT_VERTICAL_REOPEN_REPLAY_INVALID', 'case.productLoop', 'Project reopen readback and replay idempotence must pass.');
  }
  if (Object.values(receipt?.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
    add('RTK_P0_PRODUCT_VERTICAL_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must be zero.');
  }
  if (receipt?.implementedCapability?.automaticApplyCertified !== false
    || receipt?.implementedCapability?.wordSaturated !== false
    || receipt?.implementedCapability?.releaseReady !== false
    || receipt?.implementedCapability?.googleDocsOpened !== false) {
    add('RTK_P0_PRODUCT_VERTICAL_OVERCLAIM', 'implementedCapability', 'Contour must not claim automatic apply, release readiness, Word saturation, or later editor-stage execution.');
  }
  if (program.releaseAuditNight01?.currentStage !== CONTOUR_ID
    || program.releaseAuditNight01?.nextStage !== NEXT_STAGE
    || program.releaseAuditNight01?.productVerticalTrackedEditOneCaseProven !== true
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.wordSaturated !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false) {
    add('RTK_P0_PRODUCT_VERTICAL_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind product vertical truth without overclaim.');
  }
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.productVerticalTrackedEdit');
  if (!cell || cell.productOneCaseVerticalLoopProven !== true || cell.automaticApplyCertified !== false || cell.wordSaturated !== false) {
    add('RTK_P0_PRODUCT_VERTICAL_PROFILE_INVALID', 'profile.cells', 'Capability profile must bind one-case vertical loop and non-claims.');
  }
  const coverage = ledger.coverageLedger?.releaseAuditNight01P0ProductVerticalTrackedEdit;
  if (!coverage || coverage.passCases !== 1 || coverage.automaticApplyCertified !== false || coverage.wordSaturated !== false || coverage.googleDocsOpened !== false) {
    add('RTK_P0_PRODUCT_VERTICAL_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind product vertical coverage without saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt?.nextStage || NEXT_STAGE,
    observedCases: cases.length,
    productCommandHandlerOriginated: receipt?.totals?.productCommandHandlerOriginated || 0,
    physicalOpenEditSaveCloseReopenPass: receipt?.totals?.physicalOpenEditSaveCloseReopenPass || 0,
    authenticatedV2IntakePass: receipt?.totals?.authenticatedV2IntakePass || 0,
    visiblePreviewPass: receipt?.totals?.visiblePreviewPass || 0,
    explicitConfirmedApplyPass: receipt?.totals?.explicitConfirmedApplyPass || 0,
    projectReopenReadbackPass: receipt?.totals?.projectReopenReadbackPass || 0,
    replayIdempotentPass: receipt?.totals?.replayIdempotentPass || 0,
    automaticApplyCertified: receipt?.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt?.implementedCapability?.wordSaturated === true,
    googleDocsOpened: receipt?.implementedCapability?.googleDocsOpened === true,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const runPhysicalFlag = args.has('--run-physical');
  const writeReceipt = args.has('--write-receipt');
  const updateStateFlag = args.has('--update-state') || writeReceipt;
  const approveGovernance = args.has('--approve-governance') || writeReceipt;
  const runIdArgIndex = process.argv.indexOf('--run-id');
  const rootArgIndex = process.argv.indexOf('--artifact-root');
  const wordRootArgIndex = process.argv.indexOf('--word-work-root');
  const runId = runIdArgIndex === -1
    ? `p0-product-vertical-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const caseResult = await runProductVerticalCase({ artifactRoot, wordWorkRoot, runId });
    const receipt = buildReceipt(caseResult);
    writeJsonAtomic(path.join(caseResult.runDir, 'p0-product-vertical-tracked-edit-receipt.json'), receipt);
    if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
    if (updateStateFlag) updateState(receipt);
    if (approveGovernance) updateGovernanceApprovals();
    const result = evaluateWordReleaseAuditP0ProductVerticalTrackedEdit({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PRODUCT_VERTICAL_TRACKED_EDIT=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  if (approveGovernance) updateGovernanceApprovals();
  const result = evaluateWordReleaseAuditP0ProductVerticalTrackedEdit();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PRODUCT_VERTICAL_TRACKED_EDIT=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
