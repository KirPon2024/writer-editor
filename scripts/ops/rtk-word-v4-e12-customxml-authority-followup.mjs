#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_CUSTOMXML_AUTHORITY_FOLLOWUP_RECEIPT.json');
const E02_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E02_LOCATOR_STACK_SURVIVAL_RECEIPT.json');
const C01_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C01_LOCATOR_CARRIER_RECEIPT.json');
const C02_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C02_AUTHORITY_CARRIER_RECEIPT.json');
const E03_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E03_COREMANIFEST_YRTK2_RECEIPT.json');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-customxml-authority-followup-receipt.v1';
const STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY';
const STATUS = 'CUSTOM_XML_AUTHORITY_REROUTED_TO_CUSTOM_DOCUMENT_PROPERTY_NOT_SATURATED';
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION';
const RESOLVED_LIMITATION = 'CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function issue(code, field, message) {
  return { code, field, message };
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function verifyBinding(binding, expectedPath, issues, field, { requireFiles }) {
  const relative = path.relative(REPO_ROOT, expectedPath).replaceAll(path.sep, '/');
  if (!binding || binding.path !== relative || !isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_CUSTOMXML_BINDING_INVALID', field, 'Binding path and lowercase SHA-256 are required.'));
    return null;
  }
  if (!requireFiles) return null;
  if (!fs.existsSync(expectedPath)) {
    issues.push(issue('RTK_V4_E12_CUSTOMXML_BINDING_FILE_MISSING', field, 'Bound evidence file is missing.'));
    return null;
  }
  if (sha256File(expectedPath) !== binding.sha256) {
    issues.push(issue('RTK_V4_E12_CUSTOMXML_BINDING_SHA_MISMATCH', field, 'Bound evidence SHA-256 does not match current bytes.'));
  }
  return readJson(expectedPath);
}

export function evaluateWordV4E12CustomXmlAuthorityFollowup(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_CUSTOMXML_SCHEMA_INVALID', 'schemaVersion', 'Custom XML authority followup schema is invalid.');
  if (receipt.stageId !== STAGE) add('RTK_V4_E12_CUSTOMXML_STAGE_INVALID', 'stageId', 'Custom XML authority followup stage is invalid.');
  if (receipt.status !== STATUS || receipt.result !== 'PASS') {
    add('RTK_V4_E12_CUSTOMXML_STATUS_INVALID', 'status', 'Followup must pass by rerouting authority away from customXml, not by certifying customXml.');
  }
  if (receipt.nextStage !== NEXT_STAGE || receipt.saturated !== false) {
    add('RTK_V4_E12_CUSTOMXML_SEQUENCE_INVALID', 'nextStage', 'Followup must keep Word not saturated and continue Word-only limitation work.');
  }

  const e02 = verifyBinding(receipt.boundEvidence?.e02LocatorSurvival, E02_PATH, issues, 'boundEvidence.e02LocatorSurvival', { requireFiles: input.requireFiles === true });
  const c01 = verifyBinding(receipt.boundEvidence?.c01PhysicalCarrierLab, C01_PATH, issues, 'boundEvidence.c01PhysicalCarrierLab', { requireFiles: input.requireFiles === true });
  const c02 = verifyBinding(receipt.boundEvidence?.c02ParserCarrier, C02_PATH, issues, 'boundEvidence.c02ParserCarrier', { requireFiles: input.requireFiles === true });
  const e03 = verifyBinding(receipt.boundEvidence?.e03Yrtk2Core, E03_PATH, issues, 'boundEvidence.e03Yrtk2Core', { requireFiles: input.requireFiles === true });

  const decision = receipt.authorityDecision || {};
  if (decision.customXmlAuthorityAllowed !== false
    || decision.customXmlResolvedByAllowlist !== false
    || decision.selectedAuthorityCarrier !== 'customDocumentProperty'
    || decision.selectedPropertyName !== 'YRTK_C01_AUTH'
    || decision.parserAuthorityIntegrated !== true
    || decision.yrtk2CoreImplemented !== true
    || decision.runtimeApplyAuthorityExpanded !== false) {
    add('RTK_V4_E12_CUSTOMXML_DECISION_INVALID', 'authorityDecision', 'Authority must be rerouted to the verified customDocumentProperty carrier without expanding runtime apply.');
  }

  if (input.requireFiles === true) {
    if (e02?.selectedCarrier?.carrier !== 'customDocumentProperty'
      || e02?.selectedCarrier?.survivedAllMutatingCases !== true
      || e02?.selectedCarrier?.verifiedAllMutatingCases !== true
      || e02?.rejectedAuthorityCarriers?.find((item) => item.carrier === 'customXmlManifest')?.authorityAllowed !== false) {
      add('RTK_V4_E12_CUSTOMXML_E02_INVALID', 'boundEvidence.e02LocatorSurvival', 'E02 must select customDocumentProperty and reject customXml authority.');
    }
    if (c01?.carrierRollup?.customDocumentProperty?.survivedAllMutatingCases !== true
      || c01?.carrierRollup?.customDocumentProperty?.verifiedAllMutatingCases !== true
      || c01?.carrierRollup?.customXmlManifest?.survivedAllMutatingCases !== false
      || c01?.selectedAuthorityCarrier?.carrier !== 'customDocumentProperty') {
      add('RTK_V4_E12_CUSTOMXML_C01_INVALID', 'boundEvidence.c01PhysicalCarrierLab', 'C01 must physically prove customDocumentProperty survival and customXml mutating loss.');
    }
    if (c02?.selectedAuthorityCarrier !== 'customDocumentProperty'
      || c02?.selectedAuthorityCarrierPropertyName !== 'YRTK_C01_AUTH'
      || c02?.physicalEvidenceBinding?.customDocumentPropertySurvivedAllMutatingCases !== true
      || c02?.physicalEvidenceBinding?.customXmlManifestSurvivedAllMutatingCases !== false
      || c02?.runtimeClaims?.automaticApplyExpanded !== false
      || c02?.runtimeClaims?.parserWriteAuthorityAdded !== false) {
      add('RTK_V4_E12_CUSTOMXML_C02_INVALID', 'boundEvidence.c02ParserCarrier', 'C02 must integrate only the customDocumentProperty parser carrier without writer authority.');
    }
    if (e03?.precedingEvidence?.selectedPayloadCarrier !== 'customDocumentProperty'
      || e03?.implementedCore?.hashCycleForbidden !== true
      || e03?.runtimeClaims?.automaticApplyExpanded !== false
      || e03?.runtimeClaims?.parserAuthorityIntegrated !== false) {
      add('RTK_V4_E12_CUSTOMXML_E03_INVALID', 'boundEvidence.e03Yrtk2Core', 'E03 must bind YRTK2 core over the selected carrier without runtime parser authority expansion.');
    }
  }

  const resolved = new Set(Array.isArray(receipt.resolvedLimitations) ? receipt.resolvedLimitations : []);
  const remaining = new Set(Array.isArray(receipt.remainingWordLimitations) ? receipt.remainingWordLimitations : []);
  if (!resolved.has(RESOLVED_LIMITATION)) add('RTK_V4_E12_CUSTOMXML_RESOLUTION_MISSING', 'resolvedLimitations', 'customXml mutating loss must be explicitly resolved by reroute.');
  if (remaining.has(RESOLVED_LIMITATION)) add('RTK_V4_E12_CUSTOMXML_STILL_ACTIVE', 'remainingWordLimitations', 'Resolved customXml limitation cannot remain active.');
  for (const id of ['MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION', 'AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED']) {
    if (!remaining.has(id)) add('RTK_V4_E12_CUSTOMXML_REMAINING_LIMITATION_MISSING', `remainingWordLimitations.${id}`, 'Remaining Word limitation must stay explicit.');
  }

  const runtime = receipt.runtimeClaims || {};
  if (runtime.productRuntimeChanged !== false
    || runtime.uiChanged !== false
    || runtime.networkDependencyAdded !== false
    || runtime.newDependencyAdded !== false
    || runtime.writerAuthorityAdded !== false
    || runtime.automaticApplyExpanded !== false
    || runtime.customXmlAuthorityAllowed !== false) {
    add('RTK_V4_E12_CUSTOMXML_RUNTIME_OVERCLAIM', 'runtimeClaims', 'Followup cannot add product runtime, UI, network, dependency, writer, apply, or customXml authority.');
  }
  const veto = receipt.vetoMetrics || {};
  for (const [key, value] of Object.entries(veto)) {
    if (Number(value) !== 0) add('RTK_V4_E12_CUSTOMXML_VETO_NONZERO', `vetoMetrics.${key}`, 'All customXml followup veto metrics must be zero.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    selectedAuthorityCarrier: decision.selectedAuthorityCarrier || '',
    customXmlAuthorityAllowed: decision.customXmlAuthorityAllowed === true,
    saturated: receipt.saturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E12CustomXmlAuthorityFollowup({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_CUSTOMXML_AUTHORITY_FOLLOWUP=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
