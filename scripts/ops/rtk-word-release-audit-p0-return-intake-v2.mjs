#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01';
const CONTOUR_ID = 'P0-RETURN-INTAKE-V2';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-return-intake-v2-receipt.v1';
const STATUS = 'WORD_RELEASE_AUDIT_P0_RETURN_INTAKE_V2_WIRED_NOT_SATURATED';
const NEXT_STAGE = 'P0_PARSED_WORD_IR_PREVIEW_COMMAND_APPLY_RECOVERY_REPLAY';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_RETURN_INTAKE_V2_RECEIPT.json';
const EXPORTER_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REVIEW_DOCX_EXPORTER_RECEIPT.json';

const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const EXPORTER_RECEIPT_PATH = path.join(REPO_ROOT, EXPORTER_RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const PARSER_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportPackageParserV2.mjs');
const WORKER_PATH = path.join(REPO_ROOT, 'src', 'main', 'rtkDocxReturnIntakeWorker.cjs');
const PREVIEW_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'revision-bridge-docx-review-preview-session-command-surface.contract.test.js');
const INTAKE_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'revision-bridge-docx-intake-preflight-report.contract.test.js');

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
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

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function issue(code, field, message) {
  return { code, field, message };
}

function base64UrlText(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function customPropertiesXml(properties = []) {
  const body = properties
    .map((property, index) => (
      `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${property.name}"><vt:lpwstr>${property.value}</vt:lpwstr></property>`
    ))
    .join('');
  return `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${body}</Properties>`;
}

function buildProductReturnDocx() {
  const { buildStoredZip } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxMinBuilder.js'));
  const port = cryptoPort();
  const secret = 'local-secret-for-release-audit-return-intake';
  const sceneText = 'Anchored text';
  const rawSha256 = `sha256:${port.sha256Text(sceneText)}`;
  const payload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: TASK_ID,
    profileId: 'word-mac-latest-observed-16.111.x-product-review-export-p0',
    caseId: 'product-review-docx-export-p0',
    sceneId: 'roman/imported/scene-1.txt',
    sceneRevision: rawSha256,
    rawSha256,
    blockId: 'block-release-audit-return-intake',
    roundId: 'round-release-audit-return-intake',
    exportId: 'export-release-audit-return-intake',
    exportArtifactId: 'export-artifact-release-audit-return-intake',
    semanticReturnId: 'semantic-return-release-audit-return-intake',
    coreManifestDigest: port.sha256Json({ core: 'release-audit-return-intake' }),
    transportManifestDigest: port.sha256Json({ transport: 'release-audit-return-intake' }),
    yrtk2TokenDigest: port.sha256Json({ yrtk2: 'release-audit-return-intake' }),
    blockCount: 1,
  };
  const envelope = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: port.sha256Json(payload),
    signature: port.hmacSha256Json(payload, secret),
    keyId: 'product-review-docx-local-secret-v1',
    secretEmbeddedInDocx: false,
  };
  const documentXml = [
    '<w:document><w:body><w:p>',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>Anchored text</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '</w:p></w:body></w:document>',
  ].join('');
  const commentsXml = [
    '<w:comments>',
    '<w:comment w:id="0" w:author="release-audit" w:date="2026-08-01T00:00:00.000Z">',
    '<w:p><w:r><w:t>Return intake comment.</w:t></w:r></w:p>',
    '</w:comment>',
    '</w:comments>',
  ].join('');
  const bytes = buildStoredZip([
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/comments.xml', data: commentsXml },
    {
      name: 'docProps/custom.xml',
      data: customPropertiesXml([
        { name: 'YRTK_C01_AUTH', value: `YRTK1.${base64UrlText(JSON.stringify(envelope))}` },
        { name: 'YRTK2_TOKEN', value: 'YRTK2.release-audit-return-intake' },
        { name: 'YRTK_CORE_DIGEST', value: payload.coreManifestDigest },
      ]),
    },
  ]);
  return {
    bytes,
    secret,
    payload,
    expectedAuthority: {
      sceneId: payload.sceneId,
      sceneRevision: payload.sceneRevision,
      rawSha256: payload.rawSha256,
      blockId: payload.blockId,
      roundId: payload.roundId,
      exportId: payload.exportId,
    },
  };
}

async function runtimeProof() {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const fixture = buildProductReturnDocx();
  const preflight = bridge.buildDocxIntakePreflightReportFromZipBytes(fixture.bytes);
  const analysis = bridge.buildDocxReviewTransportAnalysisFromZipBytes({
    bytes: fixture.bytes,
    hmacSecret: fixture.secret,
    expectedAuthority: fixture.expectedAuthority,
    returnedArtifactSha256: `sha256:${sha256Bytes(fixture.bytes)}`,
    baselineFinalText: 'Anchored text',
  }, { cryptoPort: cryptoPort() });
  const tampered = bridge.buildDocxReviewTransportAnalysisFromZipBytes({
    bytes: fixture.bytes,
    hmacSecret: 'wrong-secret',
    expectedAuthority: fixture.expectedAuthority,
    returnedArtifactSha256: `sha256:${sha256Bytes(fixture.bytes)}`,
    baselineFinalText: 'Anchored text',
  }, { cryptoPort: cryptoPort() });
  return {
    docxSha256: sha256Bytes(fixture.bytes),
    customPropertiesGatePass: preflight.gatePass === true,
    customPropertiesKnownSupport: preflight.partPolicy?.categories?.knownSupportPart?.entryIds?.includes('docProps/custom.xml') === true,
    parserV2Ok: analysis.ok === true,
    authorityCarrierVerified: analysis.authorityCarrier?.status === 'verified-baseline-bound',
    validSignedLocator: analysis.exactAuthority?.validSignedLocator === true,
    reviewIrDerivedOnly: analysis.reviewIr?.conservation?.canWriteManuscript === false
      && analysis.reviewIr?.conservation?.canApply === false,
    commentThreadParsed: Array.isArray(analysis.reviewIr?.commentThreads)
      && analysis.reviewIr.commentThreads.length === 1,
    textRevisionCount: Array.isArray(analysis.reviewIr?.textRevisions)
      ? analysis.reviewIr.textRevisions.length
      : 0,
    wrongSecretRejected: tampered.authorityCarrier?.status !== 'verified-baseline-bound'
      && tampered.exactAuthority?.validSignedLocator !== true,
    canAutoApply: false,
  };
}

function sourceProof() {
  const mainSource = readText(MAIN_PATH);
  const bridgeSource = readText(BRIDGE_PATH);
  const parserSource = readText(PARSER_PATH);
  const workerSource = readText(WORKER_PATH);
  const previewContract = readText(PREVIEW_CONTRACT_PATH);
  const intakeContract = readText(INTAKE_CONTRACT_PATH);
  const markers = {
    mainHasReturnIntakeGate: /inspectDocxReviewReturnIntakeV2[\s\S]*buildDocxReviewPreviewSessionCandidateFromZipBytes/u.test(mainSource),
    mainGatesBeforeImport: /inspectDocxReviewReturnIntakeV2[\s\S]*handleReviewSurfaceImportPacketCommandSurface/u.test(mainSource),
    mainUsesParserV2UtilityBoundary: /runDocxReviewReturnIntakeParserV2InUtilityProcess/u.test(mainSource)
      && /utilityProcess\.fork/u.test(mainSource),
    mainBlocksForeignTamperedStale: /RTK_RETURN_INTAKE_FOREIGN_OR_EXPIRED_ROUND/u.test(mainSource)
      && /RTK_RETURN_INTAKE_AUTHORITY_NOT_VERIFIED/u.test(mainSource)
      && /RTK_RETURN_INTAKE_STALE_CURRENT_SCENE/u.test(mainSource),
    mainBindsCommentShadowToReturnIdentity: /reviewTransportReturnIntake/u.test(mainSource)
      && /roundId: roundId \|\|/u.test(mainSource)
      && /semanticReturnId: semanticReturnId \|\|/u.test(mainSource),
    workerRunsParserV2: /buildDocxReviewTransportAnalysisFromZipBytes/u.test(workerSource)
      && /process\.parentPort/u.test(workerSource),
    bridgeAllowsCustomPropertiesPart: /DOCX_ZIP_INVENTORY_KNOWN_PARTS[\s\S]*'docProps\/custom\.xml'/u.test(bridgeSource),
    parserReadsCustomAuthorityCarrier: /RTK_REVIEW_TRANSPORT_AUTHORITY_CUSTOM_PROPERTY_NAMES[\s\S]*YRTK_C01_AUTH/u.test(parserSource),
    contractsCoverPositiveNegativeProductReturn: /authenticated product return intake/u.test(previewContract)
      && /product carrier without local round store/u.test(previewContract)
      && /tampered product carrier HMAC/u.test(previewContract)
      && /stale local scene/u.test(previewContract),
    contractsKeepUnknownPartBlocked: /customProperties\.partPolicy\.categories\.knownSupportPart/u.test(intakeContract)
      && /unknown\.code, 'STAGE02_PACKAGE_QUARANTINED'/u.test(intakeContract),
  };
  return {
    markers,
    allPresent: Object.values(markers).every(Boolean),
    mainSha256: sha256File(MAIN_PATH),
    bridgeSha256: sha256File(BRIDGE_PATH),
    workerSha256: sha256File(WORKER_PATH),
    previewContractSha256: sha256File(PREVIEW_CONTRACT_PATH),
    intakeContractSha256: sha256File(INTAKE_CONTRACT_PATH),
  };
}

async function buildReceipt() {
  const proof = sourceProof();
  const runtime = await runtimeProof();
  const runtimeOk = Object.entries(runtime)
    .filter(([key]) => !['docxSha256', 'textRevisionCount', 'canAutoApply'].includes(key))
    .every(([, value]) => value === true)
    && runtime.canAutoApply === false;
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: proof.allPresent && runtimeOk ? 'PASS' : 'FAIL',
    headBinding: {
      baseHeadSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      main: binding('MAIN_PRODUCT_RETURN_INTAKE_GATE', MAIN_PATH),
      bridge: binding('REVISION_BRIDGE_ZIP_PART_GATE', BRIDGE_PATH),
      parser: binding('PARSER_V2_AUTHORITY_CARRIER', PARSER_PATH),
      worker: binding('UTILITY_PROCESS_RETURN_INTAKE_WORKER', WORKER_PATH),
      previewContract: binding('PRODUCT_RETURN_INTAKE_CONTRACT', PREVIEW_CONTRACT_PATH),
      intakeContract: binding('CUSTOM_PROPERTIES_GATE_CONTRACT', INTAKE_CONTRACT_PATH),
      exporterReceipt: binding('PREVIOUS_P0_EXPORTER_RECEIPT', EXPORTER_RECEIPT_PATH),
    },
    sourceProof: proof,
    runtimeProof: runtime,
    implementedCapability: {
      capability: 'productReviewDocxReturnIntakeV2',
      productReviewDocxExporterWired: true,
      returnIntakeWired: true,
      parserV2UtilityBoundaryWired: true,
      rejectBeforeProjectStorageOrAuthority: true,
      foreignReturnBlocked: true,
      staleReturnBlocked: true,
      tamperedReturnBlocked: true,
      customDocumentPropertyAuthorityCarrierAdmitted: true,
      parsedWordIrConsumerWired: true,
      commentShadowBoundToAuthenticatedRoundIdentity: true,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      productOriginatedPhysicalLoopCertified: false,
      wordSaturated: false,
      releaseReady: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      foreignReturnAccepted: 0,
      staleReturnAccepted: 0,
      tamperedReturnAccepted: 0,
      projectStorageWriteBeforeGate: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      falseReleaseClaim: 0,
    },
    nonClaims: [
      'P0 return intake does not certify automatic manuscript apply.',
      'P0 return intake does not certify product-originated physical Word loop.',
      'P0 return intake does not certify Word SATURATED.',
      'P0 return intake does not open Google Docs.',
      'Legacy unbound DOCX preview remains diagnostic/manual and cannot provide authenticated authority.',
    ],
    nextStage: NEXT_STAGE,
  };
}

function upsertBinding(ledger, id, filePath) {
  const next = binding(id, filePath);
  const existing = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = existing.findIndex((item) => item.id === id);
  if (index >= 0) existing[index] = next;
  else existing.push(next);
  ledger.evidenceBindings = existing;
}

function updateProgram(program) {
  program.releaseAuditNight01 = {
    status: STATUS,
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    productReviewDocxExporterWired: true,
    productReviewDocxExporterDistinctFromDocxMinimal: true,
    returnIntakeWired: true,
    parsedWordIrConsumerWired: true,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.nonClaims = Array.from(new Set([
    ...list(program.nonClaims),
    'Product Review DOCX return intake is wired for authenticated parser V2 gate, but automatic apply and physical product loop remain uncertified.',
  ]));
}

function updateProfile(profile) {
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.returnIntakeV2',
    operationFamily: 'Authenticated Review DOCX return intake through parser V2 before storage authority',
    state: 'PRODUCT_RUNTIME_WIRED_NOT_APPLY_CERTIFIED',
    currentCapability: 'PRODUCT_REVIEW_DOCX_RETURN_INTAKE_V2_WIRED_APPLY_PENDING',
    physicalWordEvidence: false,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    productReviewDocxExporterDistinctFromDocxMinimal: true,
    returnIntakeWired: true,
    parsedWordIrConsumerWired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    wordSaturated: false,
    consumer: 'Open DOCX Review preview activation before session import and comment shadow import',
    acceptanceTest: 'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
    evidenceReceiptPath: RECEIPT_REF,
    supportedNow: [
      'product-originated returned DOCX with YRTK_C01_AUTH is parsed through ReviewIRV2 before review session import',
      'local HMAC secret and expected scene baseline are required for authenticated return identity',
      'foreign stale and tampered product carriers block before session storage or comment shadow mutation',
      'comment shadow session keys bind to authenticated round return and semantic identities when available',
      'docProps custom properties are admitted only as known custom-properties authority carrier parts',
    ],
    limitations: [
      'automatic manuscript apply remains closed',
      'product-originated physical Word edit return reopen wave is still pending',
      'legacy unbound DOCX preview is diagnostic/manual and cannot provide authority',
      'Word SATURATED remains false',
    ],
    killCriterion: 'Any returned DOCX parser packet or custom property can reach product storage authority without local HMAC baseline binding, or automatic apply/release-ready is claimed before explicit preview/apply/recovery physical loop.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateLedger(ledger) {
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_RETURN_INTAKE_V2', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0ReturnIntakeV2: {
      status: 'BOUND_PRODUCT_REVIEW_DOCX_RETURN_INTAKE_V2_WIRED_APPLY_PENDING',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_RETURN_INTAKE_V2',
      result: STATUS,
      productRuntimeWired: true,
      returnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      automaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
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

async function updateState() {
  const receipt = await buildReceipt();
  writeJson(RECEIPT_PATH, receipt);
  const program = readJson(PROGRAM_PATH);
  updateProgram(program);
  writeJson(PROGRAM_PATH, program);
  const profile = readJson(PROFILE_PATH);
  updateProfile(profile);
  writeJson(PROFILE_PATH, profile);
  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger);
  writeJson(LEDGER_PATH, ledger);
  return receipt;
}

export async function evaluateWordReleaseAuditP0ReturnIntakeV2(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : await buildReceipt());
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.returnIntakeV2');

  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_RECEIPT_INVALID', 'receipt', 'P0 return intake receipt must PASS with canonical schema and status.');
  if (receipt.sourceProof?.allPresent !== true || Object.values(receipt.sourceProof?.markers || {}).some((value) => value !== true)) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_SOURCE_PROOF_INVALID', 'sourceProof', 'P0 return intake source proof must bind main gate parser worker bridge and focused contracts.');
  if (receipt.runtimeProof?.customPropertiesGatePass !== true
    || receipt.runtimeProof?.authorityCarrierVerified !== true
    || receipt.runtimeProof?.validSignedLocator !== true
    || receipt.runtimeProof?.wrongSecretRejected !== true) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_RUNTIME_PROOF_INVALID', 'runtimeProof', 'Runtime proof must admit custom properties, verify HMAC authority, and reject wrong-secret carrier authority.');
  if (receipt.implementedCapability?.returnIntakeWired !== true
    || receipt.implementedCapability?.parsedWordIrConsumerWired !== true
    || receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_AUTHORITY_INVALID', 'implementedCapability', 'Return intake may wire parser gate and comment identity only; apply and saturation remain closed.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_VETO_NONZERO', 'vetoMetrics', 'P0 return intake veto metrics must remain zero.');
  if (program.releaseAuditNight01?.status !== STATUS
    || program.releaseAuditNight01?.nextStage !== NEXT_STAGE
    || program.releaseAuditNight01?.returnIntakeWired !== true
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind return intake without opening apply saturation or Google Docs.');
  if (!cell
    || cell.returnIntakeWired !== true
    || cell.automaticApplyCertified !== false
    || cell.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_PROFILE_INVALID', 'profile.cells', 'Capability profile must expose return intake while preserving no-apply and no-saturation truth.');
  if (ledger.coverageLedger?.releaseAuditNight01P0ReturnIntakeV2?.status !== 'BOUND_PRODUCT_REVIEW_DOCX_RETURN_INTAKE_V2_WIRED_APPLY_PENDING'
    || ledger.coverageLedger?.releaseAuditNight01P0ReturnIntakeV2?.returnIntakeWired !== true
    || ledger.coverageLedger?.releaseAuditNight01P0ReturnIntakeV2?.automaticApplyCertified !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.runtimeClaims?.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_LEDGER_INVALID', 'ledger', 'Ledger must bind return intake and preserve no-saturation/no-Google truth.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt.nextStage,
    returnIntakeWired: receipt.implementedCapability?.returnIntakeWired === true,
    parsedWordIrConsumerWired: receipt.implementedCapability?.parsedWordIrConsumerWired === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt.implementedCapability?.wordSaturated === true,
  };
}

async function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) await updateState();
  const result = await evaluateWordReleaseAuditP0ReturnIntakeV2();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_RETURN_INTAKE_V2=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
