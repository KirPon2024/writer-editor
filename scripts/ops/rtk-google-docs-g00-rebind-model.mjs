#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const MATRIX_REF = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const RECEIPT_REF = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const PROFILE_REF = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const EVIDENCE_STATUS_REF = 'docs/OPS/STATUS/REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json';
const TERMINAL_REF = 'docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json';
const EVALUATOR_REF = 'scripts/ops/rtk-google-docs-g00-discovery-binding.mjs';

const STATUS = 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E';
const RESULT = 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE';
const REAL_ACCOUNT_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';
const GOOGLE_BLOCKERS = Object.freeze([
  'GOOGLE_PROFILE_DECLARED:google-docs-native-conversion-post-d1-v1',
  'GOOGLE_PROFILE_DECLARED:google-docs-office-mode-post-d1-v1',
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function independentOracle({ matrix, receipt, googleProfiles, googleEvidenceStatus, terminal }) {
  const reasons = [];
  const add = (code) => reasons.push(code);

  const profiles = list(googleProfiles?.profiles);
  if (profiles.length !== 2) add('ORACLE_PROFILE_SET');
  for (const profile of profiles) {
    if (profile.provider !== 'google-docs'
      || profile.class !== 'DECLARED'
      || list(profile.evidenceHeads).length !== 0
      || list(profile.ladder?.completedRungs).length !== 0) {
      add('ORACLE_PROFILE_ESCALATED');
    }
  }

  if (matrix.status !== STATUS || matrix.result !== RESULT) add('ORACLE_MATRIX_STATUS');
  if (matrix.currentWordBoundary?.evidenceTransferToGoogleDocs !== 'DENY'
    || matrix.currentWordBoundary?.terminalPassClaimed !== false
    || matrix.currentWordBoundary?.wordScopeReady !== true) {
    add('ORACLE_WORD_INHERITANCE');
  }
  if (matrix.counts?.totalCells !== 13
    || matrix.counts?.componentProven !== 1
    || matrix.counts?.physicalGoogleEvidence !== 0
    || matrix.counts?.productRuntimeWired !== 0
    || matrix.counts?.automaticApplyCertified !== 0
    || matrix.counts?.blocksGoogleStage !== 12
    || matrix.counts?.externalActivationRequired !== 1) {
    add('ORACLE_COUNTS');
  }
  if (matrix.existingGoogleTruth?.evidenceClaimStatus !== googleEvidenceStatus.status
    || matrix.existingGoogleTruth?.supportClaimed !== false
    || matrix.existingGoogleTruth?.importClaimed !== false
    || matrix.existingGoogleTruth?.roundtripClaimed !== false
    || matrix.existingGoogleTruth?.googleApiIntegrationClaimed !== false
    || matrix.existingGoogleTruth?.networkAccessAdded !== false
    || matrix.existingGoogleTruth?.applyAuthorityClaimed !== false) {
    add('ORACLE_GOOGLE_CLAIM_ESCALATED');
  }
  if (matrix.currentRealityAudit?.localCompatibilityVerdict !== RESULT
    || matrix.currentRealityAudit?.realAdapterExists !== false
    || matrix.currentRealityAudit?.identityRevisionFence !== 'NOT_ADMITTED_FOR_GOOGLE_RUNTIME'
    || matrix.currentRealityAudit?.quarantine !== 'NOT_WIRED'
    || matrix.currentRealityAudit?.realAccountE2E !== REAL_ACCOUNT_E2E
    || matrix.currentRealityAudit?.roundtripLossMatrix?.officeMode !== 'ABSTAIN_NO_SIGNED_IN_E2E'
    || matrix.currentRealityAudit?.roundtripLossMatrix?.nativeConversion !== 'ABSTAIN_LOSSY_BY_DEFAULT_UNTIL_EVIDENCE') {
    add('ORACLE_AUDIT_ESCALATED');
  }
  if (receipt.status !== STATUS
    || receipt.result !== RESULT
    || receipt.googleCurrentState?.supportClaimed !== false
    || receipt.googleCurrentState?.importClaimed !== false
    || receipt.googleCurrentState?.roundtripClaimed !== false
    || receipt.googleCurrentState?.applyAuthorityClaimed !== false
    || receipt.googleCurrentState?.physicalGoogleEvidence !== 0
    || receipt.googleCurrentState?.productRuntimeWired !== 0
    || receipt.googleCurrentState?.googleStageDone !== false
    || receipt.googleCurrentState?.realAccountE2E !== REAL_ACCOUNT_E2E) {
    add('ORACLE_RECEIPT_ESCALATED');
  }
  const googleClaims = list(terminal?.claims).filter((claim) => String(claim?.evidenceBinding?.profileId || '').startsWith('google-docs-'));
  if (googleClaims.length !== 2 || googleClaims.some((claim) => claim.claimClass !== 'NOT_CLAIMED_BLOCKED')) {
    add('ORACLE_TERMINAL_CLAIM_ESCALATED');
  }
  for (const blocker of GOOGLE_BLOCKERS) {
    if (!list(terminal?.terminalRollup?.blockers).includes(blocker)) add('ORACLE_TERMINAL_BLOCKER_MISSING');
  }

  return { ok: reasons.length === 0, reasons };
}

function baseFixture() {
  return {
    matrix: readJson(MATRIX_REF),
    receipt: readJson(RECEIPT_REF),
    googleProfiles: readJson(PROFILE_REF),
    googleEvidenceStatus: readJson(EVIDENCE_STATUS_REF),
    terminal: readJson(TERMINAL_REF),
  };
}

function caseSpec(name, mutate, expectedEvaluatorCode) {
  return { name, mutate, expectedEvaluatorCode };
}

async function main() {
  const { evaluateGoogleDocsG00DiscoveryBinding } = await import(pathToFileURL(path.join(REPO_ROOT, EVALUATOR_REF)).href);
  const base = baseFixture();
  const cases = [
    caseSpec('baseline-current-local-compatibility-audit', (fixture) => fixture, null),
    caseSpec('false-support-claim', (fixture) => {
      fixture.matrix.existingGoogleTruth.supportClaimed = true;
      fixture.matrix.existingGoogleTruth.roundtripClaimed = true;
      return fixture;
    }, 'GOOGLE_G00_FALSE_SUPPORT_CLAIM'),
    caseSpec('physical-evidence-count-forged', (fixture) => {
      fixture.matrix.counts.physicalGoogleEvidence = 1;
      fixture.receipt.googleCurrentState.physicalGoogleEvidence = 1;
      return fixture;
    }, 'GOOGLE_G00_MATRIX_COUNTS_INVALID'),
    caseSpec('runtime-wired-forged', (fixture) => {
      fixture.matrix.counts.productRuntimeWired = 1;
      fixture.receipt.googleCurrentState.productRuntimeWired = 1;
      return fixture;
    }, 'GOOGLE_G00_MATRIX_COUNTS_INVALID'),
    caseSpec('word-evidence-inheritance', (fixture) => {
      fixture.matrix.currentWordBoundary.evidenceTransferToGoogleDocs = 'ALLOW';
      return fixture;
    }, 'GOOGLE_G00_WORD_INHERITANCE_ATTEMPT'),
    caseSpec('terminal-pass-forged', (fixture) => {
      fixture.matrix.currentWordBoundary.terminalPassClaimed = true;
      return fixture;
    }, 'GOOGLE_G00_WORD_INHERITANCE_ATTEMPT'),
    caseSpec('office-mode-pass-forged', (fixture) => {
      fixture.matrix.currentRealityAudit.roundtripLossMatrix.officeMode = 'PASS';
      return fixture;
    }, 'GOOGLE_G00_CURRENT_REALITY_AUDIT_INVALID'),
    caseSpec('native-conversion-pass-forged', (fixture) => {
      fixture.matrix.currentRealityAudit.roundtripLossMatrix.nativeConversion = 'PASS';
      return fixture;
    }, 'GOOGLE_G00_CURRENT_REALITY_AUDIT_INVALID'),
    caseSpec('profile-evidence-head-forged', (fixture) => {
      fixture.googleProfiles.profiles[0].class = 'COMPETING_NOT_SATURATED';
      fixture.googleProfiles.profiles[0].evidenceHeads = [{ path: 'forged', sha256: `sha256:${'0'.repeat(64)}` }];
      return fixture;
    }, 'GOOGLE_G00_PROFILE_NOT_DECLARED_EMPTY'),
    caseSpec('terminal-google-claim-escalated', (fixture) => {
      fixture.terminal.claims.find((claim) => claim.claimId === 'claim-google-office-mode').claimClass = 'USER_FACING_BOUNDED_SUPPORTED';
      return fixture;
    }, 'GOOGLE_G00_TERMINAL_CLAIM_ESCALATION'),
  ];

  const observations = [];
  let survivors = 0;
  let mismatches = 0;
  for (const spec of cases) {
    const fixture = spec.mutate(clone(base));
    const oracle = independentOracle(fixture);
    const evaluator = evaluateGoogleDocsG00DiscoveryBinding(fixture);
    const expectedOk = spec.expectedEvaluatorCode === null;
    const evaluatorHasCode = spec.expectedEvaluatorCode === null
      || evaluator.issues.some((issue) => issue.code === spec.expectedEvaluatorCode);
    if (evaluator.ok !== expectedOk) mismatches += 1;
    if (oracle.ok !== expectedOk) mismatches += 1;
    if (!evaluatorHasCode) mismatches += 1;
    if (spec.expectedEvaluatorCode !== null && evaluator.ok) survivors += 1;
    observations.push({
      name: spec.name,
      oracle: oracle.ok ? 'PASS' : 'FAIL',
      evaluator: evaluator.status,
      expectedEvaluatorCode: spec.expectedEvaluatorCode || 'NONE',
      evaluatorHasExpectedCode: evaluatorHasCode,
    });
  }

  const result = {
    ok: mismatches === 0 && survivors === 0,
    finiteCases: cases.length,
    hostileCases: cases.length - 1,
    semanticMutants: cases.length - 1,
    survivors,
    mismatches,
    observations,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exit(1);
});
