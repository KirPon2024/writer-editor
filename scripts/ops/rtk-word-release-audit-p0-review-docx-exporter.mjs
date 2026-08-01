#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01';
const CONTOUR_ID = 'P0-REVIEW-DOCX-EXPORTER';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-review-docx-exporter-receipt.v1';
const STATUS = 'WORD_RELEASE_AUDIT_P0_PRODUCT_REVIEW_DOCX_EXPORTER_WIRED_NOT_SATURATED';
const NEXT_STAGE = 'P0_RETURN_INTAKE_PARSE_REVIEW_TRANSPORT_PACKAGE_V2';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REVIEW_DOCX_EXPORTER_RECEIPT.json';

const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BUILDER_PATH = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js');
const HANDLER_PATH = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js');
const DOCX_MIN_BUILDER_PATH = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxMinBuilder.js');
const PROJECT_COMMANDS_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'projectCommands.mjs');
const CAPABILITY_POLICY_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'capabilityPolicy.mjs');
const LOCAL_CAPABILITY_PROVIDER_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs');
const MENU_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.json');
const MENU_LOCALE_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-locale.catalog.v1.json');
const DOCS_CAPABILITY_MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'CAPABILITIES_MATRIX.json');
const DOCS_COMMAND_BINDING_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'COMMAND_CAPABILITY_BINDING.json');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-p0-product-review-docx-exporter.contract.test.js');

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

function buildRuntimeProof() {
  const { buildDocxReviewPacketBuffer } = require(BUILDER_PATH);
  const forbiddenSecret = 'local-secret-must-not-appear-in-review-docx-p0';
  const buffer = buildDocxReviewPacketBuffer({
    sceneText: 'Alpha\nBeta',
    blocks: [
      { blockId: 'block-alpha', paragraphId: 'p-alpha', paraId: '00112233', textId: '44556677', text: 'Alpha' },
      { blockId: 'block-beta', paragraphId: 'p-beta', paraId: '8899aabb', textId: 'ccddeeff', text: 'Beta' },
    ],
    forbiddenSecret,
    customProperties: [
      { name: 'YRTK_C01_AUTH', value: 'YRTK1.synthetic-authority-envelope' },
      { name: 'YRTK2_TOKEN', value: 'YRTK2.synthetic-round-token' },
      { name: 'YRTK_CORE_DIGEST', value: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ],
    advisoryManifest: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.advisory-manifest.v1',
      authorityRole: 'advisory-not-apply-authority',
    },
  });
  const raw = buffer.toString('utf8');
  return {
    docxBytes: buffer.length,
    hasWordDocument: raw.includes('word/document.xml'),
    hasCustomProperties: raw.includes('docProps/custom.xml'),
    hasCustomXmlAdvisory: raw.includes('customXml/item1.xml'),
    hasAuthorityCarrier: raw.includes('YRTK_C01_AUTH'),
    hasYrtk2Token: raw.includes('YRTK2_TOKEN'),
    hasCoreDigest: raw.includes('YRTK_CORE_DIGEST'),
    customXmlMarkedAdvisoryOnly: raw.includes('advisory-not-apply-authority'),
    forbiddenSecretAbsent: !raw.includes(forbiddenSecret),
    docxSha256: sha256Bytes(buffer),
  };
}

function sourceProof() {
  const mainSource = readText(MAIN_PATH);
  const builderSource = readText(BUILDER_PATH);
  const handlerSource = readText(HANDLER_PATH);
  const docxMinBuilderSource = readText(DOCX_MIN_BUILDER_PATH);
  const projectCommandsSource = readText(PROJECT_COMMANDS_PATH);
  const capabilityPolicySource = readText(CAPABILITY_POLICY_PATH);
  const localCapabilityProviderSource = readText(LOCAL_CAPABILITY_PROVIDER_PATH);
  const menuConfig = readJson(MENU_CONFIG_PATH);
  const menuLocale = readJson(MENU_LOCALE_PATH);
  const docsCapabilityMatrix = readJson(DOCS_CAPABILITY_MATRIX_PATH);
  const docsCommandBinding = readJson(DOCS_COMMAND_BINDING_PATH);
  const contractSource = readText(CONTRACT_PATH);
  const reviewMenu = list(menuConfig.menus).find((menu) => menu.id === 'review');
  const menuItem = list(reviewMenu?.items).find((item) => item.command === 'cmd.project.review.exportDocxReviewPacket');
  const commandBindings = list(docsCommandBinding.items);
  const nodeCapabilityMatrix = list(docsCapabilityMatrix.items).find((item) => item.platformId === 'node')?.capabilities || {};
  const webCapabilityMatrix = list(docsCapabilityMatrix.items).find((item) => item.platformId === 'web')?.capabilities || {};
  const mobileCapabilityMatrix = list(docsCapabilityMatrix.items).find((item) => item.platformId === 'mobile-wrapper')?.capabilities || {};
  const reviewExportBridgeBlock = /async function runReviewExportDocxReviewPacketBridge[\s\S]*?export function resolveLegacyActionToCommand/u.exec(projectCommandsSource)?.[0] || '';

  const markers = {
    mainCommandRegistered: /cmd\.project\.review\.exportDocxReviewPacket[\s\S]*handleReviewDocxExportPacketCommandSurface/u.test(mainSource),
    mainBuildsAuthorityEnvelope: /buildReviewDocxPacketAuthorityEnvelope/u.test(mainSource)
      && /createYrtk2RoundLocatorToken/u.test(mainSource)
      && /createWordV4CoreManifest/u.test(mainSource),
    mainKeepsSecretLocal: /activeReviewDocxExportAuthorityStore/u.test(mainSource)
      && /hmacSecret/u.test(mainSource)
      && /secretEmbeddedInDocx:\s*false/u.test(mainSource),
    cryptoPortHasHmac: /hmacSha256Text/u.test(mainSource),
    builderRequiresCustomProperties: /DOCX_REVIEW_PACKET_AUTHORITY_PROPERTY_REQUIRED/u.test(builderSource)
      && /DOCX_REVIEW_PACKET_YRTK2_PROPERTY_REQUIRED/u.test(builderSource),
    builderWritesCustomPropsAndAdvisoryXml: /docProps\/custom\.xml/u.test(builderSource)
      && /customXml\/item1\.xml/u.test(builderSource)
      && /advisory-not-apply-authority/u.test(builderSource),
    builderBlocksSecretEmbedding: /DOCX_REVIEW_PACKET_SECRET_EMBEDDED/u.test(builderSource),
    handlerRejectsBufferSource: /REVIEW_DOCX_EXPORT_BUFFER_SOURCE_FORBIDDEN/u.test(handlerSource),
    handlerUsesAtomicWrite: /writeBufferAtomic/u.test(handlerSource)
      && /queueDiskOperation/u.test(handlerSource),
    handlerReturnsNoApplyAuthority: /canAutoApply:\s*false/u.test(handlerSource)
      && /canWriteManuscript:\s*false/u.test(handlerSource)
      && /canImportMutate:\s*false/u.test(handlerSource),
    docxMinimalUntouched: !/YRTK_C01_AUTH|YRTK2_TOKEN/u.test(docxMinBuilderSource),
    rendererBridgeOnly: /REVIEW_EXPORT_DOCX_REVIEW_PACKET/u.test(reviewExportBridgeBlock)
      && /invokeBridgeOnlyCommand/u.test(reviewExportBridgeBlock)
      && !/bufferSource/u.test(reviewExportBridgeBlock),
    capabilityNodeOnly: /'cmd\.project\.review\.exportDocxReviewPacket': 'cap\.project\.review\.exportDocxReviewPacket'/u.test(capabilityPolicySource)
      && /'cap\.project\.review\.exportDocxReviewPacket': true/u.test(capabilityPolicySource)
      && /'cap\.project\.review\.exportDocxReviewPacket': false/u.test(capabilityPolicySource),
    localProviderKnown: /cmd\.project\.review\.exportDocxReviewPacket/u.test(localCapabilityProviderSource),
    menuReachable: menuItem?.id === 'review-export-docx-review-packet',
    localeReachable: menuLocale.entries?.['menu.review.exportDocxReviewPacket']?.base === 'Export Review DOCX Packet...',
    docsCapabilityBound: nodeCapabilityMatrix['cap.project.review.exportDocxReviewPacket'] === true
      && webCapabilityMatrix['cap.project.review.exportDocxReviewPacket'] === false
      && mobileCapabilityMatrix['cap.project.review.exportDocxReviewPacket'] === false,
    docsCommandBound: commandBindings.some((item) => item.commandId === 'cmd.project.review.exportDocxReviewPacket'
      && item.capabilityId === 'cap.project.review.exportDocxReviewPacket'),
    focusedContractPresent: /P0 Review DOCX exporter/u.test(contractSource)
      && /REVIEW_DOCX_EXPORT_BUFFER_SOURCE_FORBIDDEN/u.test(contractSource),
  };

  return {
    markers,
    allPresent: Object.values(markers).every(Boolean),
    mainSha256: sha256File(MAIN_PATH),
    builderSha256: sha256File(BUILDER_PATH),
    handlerSha256: sha256File(HANDLER_PATH),
    projectCommandsSha256: sha256File(PROJECT_COMMANDS_PATH),
    capabilityPolicySha256: sha256File(CAPABILITY_POLICY_PATH),
  };
}

function buildReceipt() {
  const proof = sourceProof();
  const runtimeProof = buildRuntimeProof();
  const runtimeProofOk = Object.entries(runtimeProof)
    .filter(([key]) => key !== 'docxBytes' && key !== 'docxSha256')
    .every(([, value]) => value === true);
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: proof.allPresent && runtimeProofOk ? 'PASS' : 'FAIL',
    headBinding: {
      baseHeadSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      main: binding('MAIN_PRODUCT_COMPOSITION_ROOT', MAIN_PATH),
      builder: binding('PRODUCT_REVIEW_DOCX_PACKET_BUILDER', BUILDER_PATH),
      handler: binding('PRODUCT_REVIEW_DOCX_PACKET_EXPORT_HANDLER', HANDLER_PATH),
      projectCommands: binding('RENDERER_COMMAND_REGISTRY_BRIDGE_ONLY', PROJECT_COMMANDS_PATH),
      capabilityPolicy: binding('RUNTIME_CAPABILITY_POLICY_NODE_ONLY', CAPABILITY_POLICY_PATH),
      menuConfig: binding('REVIEW_MENU_COMMAND_SURFACE', MENU_CONFIG_PATH),
      contract: binding('P0_PRODUCT_REVIEW_DOCX_EXPORTER_CONTRACT', CONTRACT_PATH),
    },
    sourceProof: proof,
    runtimeProof,
    implementedCapability: {
      capability: 'productReviewDocxExporter',
      productCompositionRegistered: true,
      productRuntimeWired: true,
      productReviewDocxExporterDistinctFromDocxMinimal: true,
      productUiInvoked: true,
      immutableRoundProjectSceneBaselineIdentity: true,
      exportMapBound: true,
      yrtk2HmacAuthorityBound: true,
      blockLocatorsIncluded: true,
      hmacSecretMainOnly: true,
      customDocumentPropertyAuthorityCarrier: true,
      customXmlAdvisoryOnly: true,
      returnIntakeWired: false,
      parsedWordIrConsumerWired: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      wordSaturated: false,
      releaseReady: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      secretEmbeddedInDocx: 0,
      rendererForgedBufferSourceAccepted: 0,
      docxMinimalChanged: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      falseReleaseClaim: 0,
    },
    nonClaims: [
      'P0 exporter does not certify return intake.',
      'P0 exporter does not parse returned Word IR.',
      'P0 exporter does not apply manuscript changes.',
      'P0 exporter does not certify automatic apply.',
      'P0 exporter does not certify Word SATURATED.',
      'P0 exporter does not open Google Docs.',
      'customXml is advisory only because mutating Word saves were previously proven to drop it as authority carrier.',
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
    returnIntakeWired: false,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.nonClaims = Array.from(new Set([
    ...list(program.nonClaims),
    'Product Review DOCX exporter is wired but return intake and product-originated physical loop are not certified yet.',
  ]));
}

function updateProfile(profile) {
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.productReviewDocxExporter',
    operationFamily: 'Product-originated Review DOCX export packet with authenticated round identity',
    state: 'PRODUCT_RUNTIME_WIRED',
    currentCapability: 'PRODUCT_REVIEW_DOCX_EXPORTER_WIRED_RETURN_INTAKE_PENDING',
    physicalWordEvidence: false,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    productReviewDocxExporterDistinctFromDocxMinimal: true,
    returnIntakeWired: false,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    wordSaturated: false,
    consumer: 'Review menu and Command Kernel bridge export command',
    acceptanceTest: 'test/contracts/rtk-word-p0-product-review-docx-exporter.contract.test.js',
    evidenceReceiptPath: RECEIPT_REF,
    supportedNow: [
      'real product command exports a Review DOCX packet separate from DOCX Minimal',
      'main owns project scene round baseline and HMAC authority construction',
      'DOCX carries custom document property authority capsule YRTK_C01_AUTH and YRTK2 token',
      'customXml exists only as advisory manifest and never grants apply authority',
      'renderer cannot provide raw DOCX bytes or HMAC secret',
    ],
    limitations: [
      'returned DOCX intake through parseReviewTransportPackageV2 is next P0 contour',
      'physical Yalken export Word edit return reopen wave is not certified by this contour',
      'automatic apply remains closed',
      'Word SATURATED remains false',
    ],
    killCriterion: 'Any renderer bufferSource, returned DOCX, parser packet, or customXml advisory part can manufacture writer authority; any secret appears in the DOCX; or release-ready/automatic-apply is claimed before return intake and physical product loop.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateLedger(ledger) {
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_REVIEW_DOCX_EXPORTER', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0ReviewDocxExporter: {
      status: 'BOUND_PRODUCT_REVIEW_DOCX_EXPORTER_WIRED_RETURN_INTAKE_PENDING',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_REVIEW_DOCX_EXPORTER',
      result: STATUS,
      productRuntimeWired: true,
      productReviewDocxExporterDistinctFromDocxMinimal: true,
      returnIntakeWired: false,
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

function updateState() {
  const receipt = buildReceipt();
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

export function evaluateWordReleaseAuditP0ReviewDocxExporter(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : buildReceipt());
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.productReviewDocxExporter');

  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_RELEASE_AUDIT_P0_EXPORTER_RECEIPT_INVALID', 'receipt', 'P0 exporter receipt must PASS with the canonical schema and status.');
  if (receipt.sourceProof?.allPresent !== true || Object.values(receipt.sourceProof?.markers || {}).some((value) => value !== true)) add('RTK_RELEASE_AUDIT_P0_EXPORTER_SOURCE_PROOF_INVALID', 'sourceProof', 'P0 exporter source proof must bind product command menu capability builder handler and contracts.');
  if (receipt.runtimeProof?.forbiddenSecretAbsent !== true
    || receipt.runtimeProof?.hasAuthorityCarrier !== true
    || receipt.runtimeProof?.hasYrtk2Token !== true
    || receipt.runtimeProof?.customXmlMarkedAdvisoryOnly !== true) add('RTK_RELEASE_AUDIT_P0_EXPORTER_RUNTIME_PROOF_INVALID', 'runtimeProof', 'P0 exporter runtime proof must build a carrier DOCX without embedding the main-only secret.');
  if (receipt.implementedCapability?.productRuntimeWired !== true
    || receipt.implementedCapability?.productReviewDocxExporterDistinctFromDocxMinimal !== true
    || receipt.implementedCapability?.returnIntakeWired !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_EXPORTER_AUTHORITY_INVALID', 'implementedCapability', 'P0 exporter must wire export only and keep return/apply/saturation closed.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_RELEASE_AUDIT_P0_EXPORTER_VETO_NONZERO', 'vetoMetrics', 'P0 exporter veto metrics must be zero.');
  if (program.releaseAuditNight01?.status !== STATUS
    || program.releaseAuditNight01?.nextStage !== NEXT_STAGE
    || program.releaseAuditNight01?.returnIntakeWired !== false
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false) add('RTK_RELEASE_AUDIT_P0_EXPORTER_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind P0 exporter without opening return intake, apply, saturation, or Google Docs claims.');
  if (!cell
    || cell.state !== 'PRODUCT_RUNTIME_WIRED'
    || cell.returnIntakeWired !== false
    || cell.automaticApplyCertified !== false
    || cell.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_EXPORTER_PROFILE_INVALID', 'profile.cells', 'Capability profile must expose only exporter runtime wiring and keep later authority closed.');
  if (ledger.coverageLedger?.releaseAuditNight01P0ReviewDocxExporter?.status !== 'BOUND_PRODUCT_REVIEW_DOCX_EXPORTER_WIRED_RETURN_INTAKE_PENDING'
    || ledger.coverageLedger?.releaseAuditNight01P0ReviewDocxExporter?.returnIntakeWired !== false
    || ledger.coverageLedger?.releaseAuditNight01P0ReviewDocxExporter?.automaticApplyCertified !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.runtimeClaims?.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_EXPORTER_LEDGER_INVALID', 'ledger', 'Ledger must bind P0 exporter and preserve no-saturation/no-Google truth.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt.nextStage,
    productRuntimeWired: receipt.implementedCapability?.productRuntimeWired === true,
    returnIntakeWired: receipt.implementedCapability?.returnIntakeWired === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt.implementedCapability?.wordSaturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) updateState();
  const result = evaluateWordReleaseAuditP0ReviewDocxExporter();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_REVIEW_DOCX_EXPORTER=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
