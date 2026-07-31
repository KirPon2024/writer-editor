#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const V4_SPEC_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_FINAL_V4.md');
const C01_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C01_LOCATOR_CARRIER_RECEIPT.json');
const C01_LAB_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-saturation-c01-locator-carrier-lab.mjs');
const E02_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E02_LOCATOR_STACK_SURVIVAL_RECEIPT.json');

const EXPECTED_V4_SHA = 'b2a66d1d65d71f25438b54a91160a260d6a2c7ba521496761361bbe4df6c07b4';
const EXPECTED_SELECTED_CARRIER = 'customDocumentProperty';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function issue(issues, code, field, message) {
  issues.push({ code, field, message });
}

export async function evaluateV4E02LocatorStackSurvival(input = {}) {
  const receipt = input.receipt || readJson(E02_RECEIPT_PATH);
  const c01Receipt = input.c01Receipt || readJson(C01_RECEIPT_PATH);
  const c01Lab = await import(pathToFileURL(C01_LAB_PATH).href);
  const c01Evaluation = c01Lab.evaluateC01LocatorCarrierReceipt(c01Receipt);
  const issues = [];

  if (sha256File(V4_SPEC_PATH) !== EXPECTED_V4_SHA) {
    issue(issues, 'V4_E02_SPEC_DIGEST_MISMATCH', 'canonicalSpec.sha256', 'V4 canonical bytes changed.');
  }
  if (receipt.status !== 'PASS_READY_FOR_DELIVERY_CHAIN') {
    issue(issues, 'V4_E02_STATUS_NOT_PASS', 'status', 'E02 receipt must be locally verified before delivery.');
  }
  if (receipt.stageId !== 'EXECUTION_02_LOCATOR_STACK_SURVIVAL_LAB') {
    issue(issues, 'V4_E02_STAGE_MISMATCH', 'stageId', 'Receipt is not bound to EXECUTION_02.');
  }
  if (receipt.canonicalSpec?.sha256 !== EXPECTED_V4_SHA) {
    issue(issues, 'V4_E02_RECEIPT_SPEC_MISMATCH', 'canonicalSpec.sha256', 'Receipt does not bind the exact V4 spec digest.');
  }
  if (receipt.physicalEvidence?.sourceReceiptSha256 !== sha256File(C01_RECEIPT_PATH)) {
    issue(issues, 'V4_E02_C01_RECEIPT_HASH_MISMATCH', 'physicalEvidence.sourceReceiptSha256', 'E02 source C01 receipt hash is stale.');
  }
  if (!c01Evaluation.ok) {
    issue(issues, 'V4_E02_C01_EVIDENCE_NOT_OK', 'physicalEvidence.sourceReceiptPath', 'Referenced physical C01 locator evidence does not verify.');
  }
  if (receipt.physicalEvidence?.sourceStageId !== 'C01_WORD_SATURATION_LOCATOR_AUTHORITY_CARRIER_AB') {
    issue(issues, 'V4_E02_SOURCE_STAGE_MISMATCH', 'physicalEvidence.sourceStageId', 'Source physical evidence must be the C01 carrier lab.');
  }
  if (receipt.physicalEvidence?.caseCount < 5 || receipt.physicalEvidence?.mutatingCaseCount < 4) {
    issue(issues, 'V4_E02_PHYSICAL_CASE_COVERAGE_TOO_SMALL', 'physicalEvidence.caseCount', 'Physical carrier evidence does not cover the committed C01 matrix.');
  }
  if (receipt.selectedCarrier?.carrier !== EXPECTED_SELECTED_CARRIER) {
    issue(issues, 'V4_E02_SELECTED_CARRIER_NOT_C01_VIABLE', 'selectedCarrier.carrier', 'Only the C01-verified custom document property carrier is selected.');
  }
  if (receipt.selectedCarrier?.authorityRole !== 'SIGNED_LOCATOR_PAYLOAD_CARRIER_NOT_PLACEMENT_AUTHORITY') {
    issue(issues, 'V4_E02_AUTHORITY_ROLE_OVERCLAIM', 'selectedCarrier.authorityRole', 'Carrier may hold signed payload, but does not become placement authority.');
  }
  if (receipt.selectedCarrier?.requiresYrtk2BeforeRuntimeAuthority !== true) {
    issue(issues, 'V4_E02_YRTK2_GATE_MISSING', 'selectedCarrier.requiresYrtk2BeforeRuntimeAuthority', 'Runtime authority must wait for YRTK2 and key lifecycle.');
  }
  for (const rejected of receipt.rejectedAuthorityCarriers || []) {
    if (rejected.authorityAllowed !== false) {
      issue(issues, 'V4_E02_REJECTED_CARRIER_ALLOWED', `rejectedAuthorityCarriers.${rejected.carrier}`, 'Rejected carriers must not retain authority.');
    }
  }
  const customXml = (receipt.rejectedAuthorityCarriers || []).find((item) => item.carrier === 'customXmlManifest');
  if (customXml?.reasonCode !== 'V4_E02_CUSTOM_XML_DROPPED_AFTER_MUTATING_WORD_SAVE') {
    issue(issues, 'V4_E02_CUSTOM_XML_LIMITATION_MISSING', 'rejectedAuthorityCarriers.customXmlManifest', 'customXml mutating-save loss must remain explicit.');
  }
  for (const signal of receipt.placementSignals || []) {
    if (signal.applyAuthority !== false) {
      issue(issues, 'V4_E02_PLACEMENT_SIGNAL_HAS_APPLY_AUTHORITY', `placementSignals.${signal.signal}`, 'Placement signals cannot gain apply authority.');
    }
  }
  if (receipt.runtimeClaims?.automaticApplyExpanded !== false || receipt.runtimeClaims?.productRuntimeChanged !== false) {
    issue(issues, 'V4_E02_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E02 must not widen runtime or automatic apply.');
  }
  if (receipt.runtimeClaims?.uiChanged !== false || receipt.runtimeClaims?.networkDependencyAdded !== false) {
    issue(issues, 'V4_E02_PRODUCT_SURFACE_OVERCLAIM', 'runtimeClaims', 'E02 must not add UI or network capability.');
  }
  if (receipt.vetoMetrics?.falseExact !== 0 || receipt.vetoMetrics?.wrongSceneRouting !== 0 || receipt.vetoMetrics?.silentApply !== 0 || receipt.vetoMetrics?.replayFailure !== 0) {
    issue(issues, 'V4_E02_VETO_METRICS_INVALID', 'vetoMetrics', 'Zero false exact, wrong scene, silent apply, and replay failure are mandatory.');
  }
  if (receipt.sequencing?.googleDocsOpened !== false || receipt.sequencing?.wordSaturationCurrentFocus !== true) {
    issue(issues, 'V4_E02_SEQUENCE_DRIFT', 'sequencing', 'Word saturation remains current focus before Google Docs.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    selectedCarrier: receipt.selectedCarrier?.carrier || '',
    sourceC01Status: c01Evaluation.status,
    issues,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  evaluateV4E02LocatorStackSurvival().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
