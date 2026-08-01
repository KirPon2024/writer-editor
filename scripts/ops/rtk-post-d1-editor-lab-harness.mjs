#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECURE_MOUNT = '/Volumes/T7-Secure';
const SECURE_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/post-d1-editor-lab/current';
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_A00_RECONCILIATION_RECEIPT.json');

export const POST_D1_CAPABILITY_PROFILES = Object.freeze([
  'EXACT_AUTOMATIC',
  'MANUAL_REVIEW',
  'COMMENTS_ONLY',
  'SURVIVAL_ONLY',
  'LOSSY',
  'BLOCKED',
  'UNTESTED',
]);

export const POST_D1_LANES = Object.freeze([
  'manuscriptText',
  'comments',
  'revisions',
  'formatting',
  'structure',
  'locatorSurvival',
  'performance',
  'packageSemantics',
]);

const REQUIRED_EDITOR_PROFILE_IDS = Object.freeze([
  'word-mac-latest-post-d1-v1',
  'word-online-docx-post-d1-v1',
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
  'libreoffice-post-d1-v1',
  'onlyoffice-post-d1-v1',
  'pages-post-d1-v1',
  'wps-advisory-post-d1-v1',
]);

const REQUIRED_FORMAT_FEATURES = Object.freeze([
  'paragraphs',
  'styles',
  'headings',
  'bold',
  'italic',
  'underline',
  'strike',
  'lists',
  'alignment',
  'indents',
  'tabs',
  'tables',
  'hyperlinks',
  'pageBreaks',
  'sectionBreaks',
  'headers',
  'footers',
  'pageNumbers',
  'footnotes',
  'endnotes',
  'bookmarks',
  'images',
  'captions',
  'altText',
  'fields',
  'languageTags',
  'typographyProperties',
  'comments',
  'trackedRevisions',
]);

const REQUIRED_QUEUE = Object.freeze([
  'A00_POST_D1_RECONCILIATION',
  'A01_EDITOR_LAB_HARNESS',
  'A02_WORD_MAC_LATEST_PROFILE',
  'A03_SAFE_PORTABILITY_IMPROVEMENTS',
  'A04_WORD_ONLINE_PROFILE',
  'A05_GOOGLE_DOCS_PROFILES',
  'A06_DESKTOP_EDITOR_PROFILES',
  'A07_CAPABILITY_MATRIX_AND_LOSS_REPORTING',
  'A08_FINAL_POST_D1_AUDIT',
]);
const REMEDIATION_C4_STATUS = 'WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_LOCAL_VERIFIED';
const REMEDIATION_C5_STAGE = 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const written = fs.statSync(tempPath).size;
  if (written <= 2) throw new Error(`ATOMIC_WRITE_EMPTY:${filePath}`);
  fs.renameSync(tempPath, filePath);
  try {
    const fd = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Some platforms cannot fsync directories. The receipt still records this
    // as a harness capability boundary instead of claiming universal durability.
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arrayHasAll(actual, required) {
  const set = new Set(Array.isArray(actual) ? actual : []);
  return required.every((item) => set.has(item));
}

function pushIssue(issues, code, message, details = {}) {
  issues.push({ code, message, ...details });
}

export function assertSecureVolume() {
  if (!fs.existsSync(SECURE_MOUNT)) throw new Error('T7_SECURE_MOUNT_MISSING');
  const info = execFileSync('diskutil', ['info', SECURE_MOUNT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const uuidLine = info.split('\n').find((line) => line.includes('Volume UUID')) || '';
  if (!uuidLine.includes(SECURE_UUID)) {
    throw new Error(`T7_SECURE_UUID_MISMATCH:${uuidLine.trim()}`);
  }
  if (!/FileVault:\s+Yes/u.test(info)) throw new Error('T7_SECURE_FILEVAULT_NOT_YES');
  fs.accessSync(SECURE_MOUNT, fs.constants.W_OK);
  return {
    mount: SECURE_MOUNT,
    uuid: SECURE_UUID,
    fileVault: 'Yes',
    writable: true,
  };
}

export function createPostD1RunPlan(options = {}) {
  const runId = normalizeString(options.runId) || `post-d1-${new Date().toISOString().replace(/[-:.]/gu, '')}`;
  const artifactRoot = normalizeString(options.artifactRoot) || DEFAULT_ARTIFACT_ROOT;
  const caseTimeoutMs = Number.isFinite(Number(options.caseTimeoutMs))
    ? Math.max(1000, Number(options.caseTimeoutMs))
    : 90000;
  const profiles = REQUIRED_EDITOR_PROFILE_IDS.map((profileId) => ({
    profileId,
    status: 'PENDING_PHYSICAL_EVIDENCE',
    capability: 'UNTESTED',
    fixtureOnlyPassAllowed: false,
    physicalEvidenceRequired: true,
  }));

  return {
    schemaVersion: 'yalken.rtk.post-d1.editor-lab-ledger.v1',
    runId,
    createdAtUtc: new Date().toISOString(),
    artifactRoot,
    guards: {
      syntheticDocumentsOnly: true,
      noUserDocuments: true,
      noBuildInstallDownload: true,
      noYalkenRuntimeNetworkDependency: true,
      secureT7RequiredBeforePhysicalRun: true,
      perCaseTimeoutMs: caseTimeoutMs,
      watchdogRequired: true,
      resumeLedgerRequired: true,
      processIsolationWherePossible: true,
      neverKillEditorWithUserDocuments: true,
      cleanupOnlySyntheticOutputs: true,
      hangOutcome: 'TYPED_HANG_RECEIPT_CONTINUE_INDEPENDENT_PROFILES',
      disconnectedT7FailureMode: 'FAIL_CLOSED_NO_PHYSICAL_PROFILE_RUN',
    },
    dirs: {
      inputs: path.join(artifactRoot, 'inputs'),
      outputs: path.join(artifactRoot, 'outputs'),
      receipts: path.join(artifactRoot, 'receipts'),
      logs: path.join(artifactRoot, 'logs'),
      quarantine: path.join(artifactRoot, 'quarantine'),
    },
    profiles,
    requiredLanes: [...POST_D1_LANES],
    requiredFormatFeatures: [...REQUIRED_FORMAT_FEATURES],
    metrics: {
      exactRate: null,
      manualRate: null,
      blockedRate: null,
      textSurvival: null,
      formatSurvival: null,
      commentSurvival: null,
      revisionSurvival: null,
      falseExact: 0,
      anchorLoss: null,
      authorReplyResolveLoss: null,
      layoutDriftAdvisory: null,
      performance: null,
      hangRate: null,
    },
    noClaims: [
      'A ledger skeleton is not editor certification.',
      'Fixture-only checks cannot certify a profile.',
      'Physical editor-native open edit save return is required before PASS.',
      'A profile cannot expand automatic apply authority without negative oracles.',
    ],
  };
}

export function evaluatePostD1PortabilityProgram(input = {}) {
  const repoRoot = normalizeString(input.repoRoot) || REPO_ROOT;
  const program = input.program || readJson(path.join(repoRoot, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json'));
  const receipt = input.receipt || readJson(path.join(repoRoot, 'docs', 'OPS', 'RTK', 'POST_D1_A00_RECONCILIATION_RECEIPT.json'));
  const issues = [];

  if (program.schemaVersion !== 'yalken.rtk.post-d1.portability-program.v1') {
    pushIssue(issues, 'POST_D1_PROGRAM_SCHEMA_INVALID', 'Program schemaVersion is invalid.');
  }
  if (program.taskId !== 'YALKEN_RTK_POST_D1_MAXIMUM_PORTABILITY_AND_EDITOR_MATRIX') {
    pushIssue(issues, 'POST_D1_TASK_ID_INVALID', 'Program taskId must bind the owner post-D1 task.');
  }
  const c4RemediationActive = program.status === REMEDIATION_C4_STATUS
    && program.wordSafetyRemediationV1?.status === REMEDIATION_C4_STATUS
    && program.wordSafetyRemediationV1?.nextStage === REMEDIATION_C5_STAGE
    && program.wordSafetyRemediationV1?.wordAcceptanceRevoked === true;
  if (program.status !== 'A00_A01_PROGRAM_AND_HARNESS_BOUND' && !c4RemediationActive) {
    pushIssue(issues, 'POST_D1_STATUS_INVALID', 'Program status must be the original A00/A01 binding or active C4 Word safety remediation.');
  }
  if (program.binding?.immutableV6HistoryChanged !== false || program.binding?.d1NormativeStatusChanged !== false) {
    pushIssue(issues, 'POST_D1_D1_HISTORY_MUTATED', 'Post-D1 program must not rewrite V6 or D1 normative status.');
  }
  if (program.immutableD1Reference?.status !== 'HISTORICAL_CERTIFIED_D1_MACOS_WORD_16_42') {
    pushIssue(issues, 'POST_D1_D1_REFERENCE_INVALID', 'D1 reference must remain historical Word 16.42 evidence.');
  }
  if (program.immutableD1Reference?.falseExact !== 0 || program.immutableD1Reference?.silentApply !== 0) {
    pushIssue(issues, 'POST_D1_D1_REFERENCE_VETO_INVALID', 'D1 historical veto counters must remain zero.');
  }

  const latest = program.latestWordCandidate || {};
  if (latest.status === 'CERTIFIED' || latest.status === 'PASS') {
    pushIssue(
      issues,
      'POST_D1_PROFILE_CERTIFICATION_WITHOUT_PHYSICAL_EVIDENCE',
      'Latest Word profile cannot be certified by the A00/A01 program binding.',
    );
  }
  if (!Array.isArray(latest.certificationRequires) || latest.certificationRequires.length < 8) {
    pushIssue(issues, 'POST_D1_LATEST_WORD_REQUIREMENTS_INCOMPLETE', 'Latest Word profile requirements are incomplete.');
  }

  if (!arrayHasAll(program.capabilityProfileVocabulary, POST_D1_CAPABILITY_PROFILES)) {
    pushIssue(issues, 'POST_D1_CAPABILITY_VOCABULARY_INCOMPLETE', 'Capability profile vocabulary is incomplete.');
  }
  if (!arrayHasAll(program.lanes, POST_D1_LANES)) {
    pushIssue(issues, 'POST_D1_LANES_INCOMPLETE', 'Lane vocabulary is incomplete.');
  }
  if (!arrayHasAll(program.writerFormattingMatrix, REQUIRED_FORMAT_FEATURES)) {
    pushIssue(issues, 'POST_D1_FORMAT_MATRIX_INCOMPLETE', 'Writer formatting matrix is incomplete.');
  }
  if (!Array.isArray(program.scaleMatrix?.wordTargets) || !program.scaleMatrix.wordTargets.includes(200000)) {
    pushIssue(issues, 'POST_D1_SCALE_WORD_TARGET_MISSING', 'Scale matrix must include 200k-word target.');
  }
  if (!Array.isArray(program.scaleMatrix?.pageTargetsWhenPractical) || !program.scaleMatrix.pageTargetsWhenPractical.includes(5000)) {
    pushIssue(issues, 'POST_D1_SCALE_PAGE_TARGET_MISSING', 'Scale matrix must include 5000-page practical target.');
  }

  const profiles = Array.isArray(program.externalEditorProfiles) ? program.externalEditorProfiles : [];
  if (!arrayHasAll(profiles.map((profile) => profile.profileId), REQUIRED_EDITOR_PROFILE_IDS)) {
    pushIssue(issues, 'POST_D1_EXTERNAL_PROFILE_SET_INCOMPLETE', 'External editor profile set is incomplete.');
  }
  const allowedCapabilities = new Set(POST_D1_CAPABILITY_PROFILES);
  for (const profile of profiles) {
    if (!isObjectRecord(profile)) {
      pushIssue(issues, 'POST_D1_EXTERNAL_PROFILE_INVALID', 'External editor profile must be an object.');
      continue;
    }
    const c4WordProfile = profile.profileId === 'word-mac-latest-post-d1-v1'
      && profile.currentCapability === 'PRODUCT_RUNTIME_WIRED_REOPENED_BY_SAFETY_REMEDIATION_NOT_SATURATED'
      && c4RemediationActive;
    if (!allowedCapabilities.has(profile.currentCapability) && !c4WordProfile) {
      pushIssue(issues, 'POST_D1_EXTERNAL_PROFILE_CAPABILITY_INVALID', 'External editor currentCapability is invalid.', {
        profileId: profile.profileId,
        currentCapability: profile.currentCapability,
      });
    }
    if (profile.fixtureOnlyPassAllowed !== false || profile.physicalEvidenceRequired !== true) {
      pushIssue(issues, 'POST_D1_FIXTURE_ONLY_PASS_NOT_FORBIDDEN', 'Every external profile must reject fixture-only PASS.', {
        profileId: profile.profileId,
      });
    }
    if ((profile.status === 'PASS' || profile.status === 'CERTIFIED') && !Array.isArray(profile.physicalEvidence)) {
      pushIssue(issues, 'POST_D1_PROFILE_CERTIFICATION_WITHOUT_PHYSICAL_EVIDENCE', 'PASS/CERTIFIED requires physical evidence rows.', {
        profileId: profile.profileId,
      });
    }
  }

  const harness = program.editorLabHarness || {};
  if (harness.script !== 'scripts/ops/rtk-post-d1-editor-lab-harness.mjs') {
    pushIssue(issues, 'POST_D1_HARNESS_SCRIPT_INVALID', 'Harness script binding is missing.');
  }
  if (harness.syntheticFilesOnly !== true || harness.requiresSecureVolumeBeforePhysicalRun !== true || harness.watchdogRequired !== true || harness.resumeLedgerRequired !== true) {
    pushIssue(issues, 'POST_D1_HARNESS_GUARDS_INCOMPLETE', 'Harness safety guards are incomplete.');
  }
  if (harness.secureVolume?.uuid !== SECURE_UUID || harness.secureVolume?.fileVaultRequired !== true) {
    pushIssue(issues, 'POST_D1_HARNESS_SECURE_VOLUME_INVALID', 'Harness must bind the encrypted T7-Secure UUID.');
  }

  const queue = Array.isArray(program.executionQueue) ? program.executionQueue : [];
  if (!arrayHasAll(queue.map((stage) => stage.stageId), REQUIRED_QUEUE)) {
    pushIssue(issues, 'POST_D1_QUEUE_INCOMPLETE', 'Post-D1 execution queue is incomplete.');
  }
  for (const requiredComplete of ['A00_POST_D1_RECONCILIATION', 'A01_EDITOR_LAB_HARNESS']) {
    const stage = queue.find((item) => item.stageId === requiredComplete);
    if (stage?.status !== 'COMPLETE_IN_THIS_CONTOUR') {
      pushIssue(issues, 'POST_D1_A00_A01_NOT_BOUND', 'A00/A01 must be marked complete in this contour.', {
        stageId: requiredComplete,
      });
    }
  }
  const a02Status = queue.find((item) => item.stageId === 'A02_WORD_MAC_LATEST_PROFILE')?.status;
  const a02Ok = a02Status === 'READY_NEXT_AFTER_MERGED_A00_A01'
    || (c4RemediationActive && a02Status === 'REOPENED_BY_WORD_SAFETY_REMEDIATION_C4_VERIFIED_C5_REQUIRED');
  if (!a02Ok) {
    pushIssue(issues, 'POST_D1_A02_NOT_READY_NEXT', 'A02 must be the next ready contour after A00/A01 merge.');
  }

  const allText = JSON.stringify(program, null, 2);
  const forbiddenClaims = [
    /\bWord 16\.111\.2 certification is claimed\b/iu,
    /\bWord Online support is claimed\b/iu,
    /\bGoogle Docs support is claimed\b/iu,
    /\bautomatic apply authority is expanded\b/iu,
    /\bfuzzy matching is introduced\b/iu,
  ];
  for (const pattern of forbiddenClaims) {
    if (pattern.test(allText) && !allText.includes(`No ${pattern.source.replace(/\\b/gu, '').replace(/\\\./gu, '.')}`)) {
      pushIssue(issues, 'POST_D1_BROAD_CLAIM_FORBIDDEN', `Forbidden broad claim matched ${pattern.source}`);
    }
  }

  if (receipt.schemaVersion !== 'yalken.rtk.post-d1.a00-reconciliation-receipt.v1' || receipt.result !== 'PASS') {
    pushIssue(issues, 'POST_D1_A00_RECEIPT_INVALID', 'A00 receipt must be present and PASS.');
  }
  if (receipt.repoTruth?.originMainHead !== program.binding?.originMainSha) {
    pushIssue(issues, 'POST_D1_A00_ORIGIN_MISMATCH', 'A00 receipt origin main must match program binding.');
  }
  if (receipt.repoTruth?.selectedHead !== program.binding?.selectedBaseSha) {
    pushIssue(issues, 'POST_D1_A00_SELECTED_HEAD_MISMATCH', 'A00 selected head must match program selected base.');
  }
  if (receipt.secureStorageTruth?.uuid !== SECURE_UUID || receipt.secureStorageTruth?.fileVault !== 'Yes') {
    pushIssue(issues, 'POST_D1_A00_SECURE_STORAGE_INVALID', 'A00 receipt must verify T7-Secure UUID and FileVault.');
  }
  if (receipt.d1Truth?.immutableHistoryChanged !== false || receipt.postD1Truth?.latestWordProfileCertified !== false) {
    pushIssue(issues, 'POST_D1_A00_TRUTH_OVERCLAIM', 'A00 receipt must keep D1 immutable and latest Word uncertified.');
  }

  return {
    ok: issues.length === 0,
    result: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    tokens: {
      POST_D1_PROGRAM_BOUND: issues.length === 0 ? 1 : 0,
      POST_D1_D1_HISTORY_IMMUTABLE: program.binding?.immutableV6HistoryChanged === false && program.binding?.d1NormativeStatusChanged === false ? 1 : 0,
      POST_D1_LATEST_WORD_UNCERTIFIED: latest.status !== 'CERTIFIED' && latest.status !== 'PASS' ? 1 : 0,
      POST_D1_EXTERNAL_PROFILES_DECLARED: profiles.length,
      POST_D1_FIXTURE_ONLY_PASS_FORBIDDEN: profiles.every((profile) => profile.fixtureOnlyPassAllowed === false) ? 1 : 0,
      POST_D1_HARNESS_BOUND: harness.script === 'scripts/ops/rtk-post-d1-editor-lab-harness.mjs' ? 1 : 0,
      POST_D1_A02_READY_NEXT: a02Ok ? 1 : 0,
    },
  };
}

function parseArgs(argv) {
  const options = {
    json: false,
    writeLedger: false,
    requireSecureVolume: false,
    runId: '',
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    caseTimeoutMs: 90000,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--write-ledger') options.writeLedger = true;
    else if (arg === '--require-secure-volume') options.requireSecureVolume = true;
    else if (arg === '--run-id' && argv[index + 1]) {
      options.runId = argv[index + 1];
      index += 1;
    } else if (arg === '--artifact-root' && argv[index + 1]) {
      options.artifactRoot = argv[index + 1];
      index += 1;
    } else if (arg === '--case-timeout-ms' && argv[index + 1]) {
      options.caseTimeoutMs = Number(argv[index + 1]);
      index += 1;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const state = evaluatePostD1PortabilityProgram();
  let secureVolume = {
    checked: false,
    requiredForPhysicalRun: true,
  };
  if (options.requireSecureVolume || options.writeLedger) {
    secureVolume = {
      checked: true,
      ...assertSecureVolume(),
    };
  }
  const runPlan = createPostD1RunPlan({
    runId: options.runId,
    artifactRoot: options.artifactRoot,
    caseTimeoutMs: options.caseTimeoutMs,
  });
  let ledger = null;
  if (options.writeLedger) {
    for (const dir of Object.values(runPlan.dirs)) fs.mkdirSync(dir, { recursive: true });
    const ledgerPath = path.join(runPlan.dirs.receipts, `${runPlan.runId}-ledger.json`);
    ledger = {
      path: ledgerPath,
      digest: `sha256:${sha256Text(stableJson(runPlan))}`,
    };
    atomicWriteJson(ledgerPath, runPlan);
  }
  const output = {
    ...state,
    secureVolume,
    runPlanDigest: `sha256:${sha256Text(stableJson(runPlan))}`,
    ledger,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(`POST_D1_EDITOR_LAB_HARNESS=${output.result}\n`);
  }
  if (!state.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
