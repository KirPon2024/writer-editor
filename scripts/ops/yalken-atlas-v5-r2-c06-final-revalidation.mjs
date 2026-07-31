#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R2_C06_FINAL_REVALIDATION');
const RESULT_PREFIX = 'YALKEN_ATLAS_R2_C06_FINAL_REVALIDATION_RESULT:';

export const R2_RECEIPTS = Object.freeze({
  c00: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C00_TRUTH_RECONCILIATION_RECEIPT.json',
  c01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C01_REAL_GRAPH_WORKBENCH_RECEIPT.json',
  c02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C02_SAFE_SEMANTIC_INTERACTIONS_RECEIPT.json',
  c03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C03_RESPONSIVE_ACCESSIBLE_REACHABILITY_RECEIPT.json',
  c04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C04_AUTHORITY_RUNTIME_HYGIENE_RECEIPT.json',
  c05: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C05_HONEST_BLACK_BOX_ACCEPTANCE_RECEIPT.json',
});

export const STALE_FINAL_RECEIPTS = Object.freeze({
  e11c03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json',
  efinal: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_PROGRAM_DOD_RECEIPT.json',
});

const R2_READY_STATUS = /^LOCAL_VALIDATION_PASS/u;

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function readJson(relativePath, root = repoRoot) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function fileProof(relativePath, root = repoRoot) {
  const absolutePath = path.resolve(root, relativePath);
  if (!fs.existsSync(absolutePath)) return { path: relativePath, exists: false, bytes: 0, sha256: '' };
  const stat = fs.statSync(absolutePath);
  return {
    path: relativePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(absolutePath) : '',
  };
}

function runGit(args, root = repoRoot) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function gitIdentity(root = repoRoot) {
  const head = runGit(['rev-parse', 'HEAD'], root);
  const originMain = runGit(['rev-parse', 'origin/main'], root);
  const branch = runGit(['branch', '--show-current'], root);
  const status = runGit(['status', '--short'], root);
  const originMainAncestorOfHead = head.ok && originMain.ok
    ? runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], root).ok
    : false;
  const headEqualsOriginMain = head.ok && originMain.ok && head.stdout === originMain.stdout;
  return {
    branch: branch.stdout,
    headSha: head.stdout,
    originMainSha: originMain.stdout,
    headEqualsOriginMain,
    originMainAncestorOfHead,
    remoteIdentityMode: headEqualsOriginMain
      ? 'EXACT_ORIGIN_MAIN'
      : (originMainAncestorOfHead ? 'PR_HEAD_DESCENDS_FROM_ORIGIN_MAIN' : 'DIVERGED_FROM_ORIGIN_MAIN'),
    dirtyFileCount: status.stdout ? status.stdout.split(/\r?\n/u).filter(Boolean).length : 0,
  };
}

function validationPass(receipt, matcher) {
  const rows = Array.isArray(receipt?.validation) ? receipt.validation : [];
  return rows.some((row) => String(row?.result || '').startsWith('PASS') && matcher(row));
}

function allObjectValuesTrue(value) {
  return Boolean(value) && Object.values(value).every((item) => item === true);
}

function receiptFacts(receipts) {
  const c00 = receipts.c00?.doc;
  const c01 = receipts.c01?.doc;
  const c02 = receipts.c02?.doc;
  const c03 = receipts.c03?.doc;
  const c04 = receipts.c04?.doc;
  const c05 = receipts.c05?.doc;
  return {
    r2C00FalseGreenInvalidationAnchor: c00?.status === 'NOT_READY_FALSE_GREEN_REPRODUCED'
      && c00?.programDodVerdict === 'REJECTED_UNTIL_R2_REVALIDATION',
    r2C01RealGraphWorkbench: c01?.deliveredScope?.centralPlanWorkspace === true
      && c01?.deliveredScope?.truthSeparation?.viewStatePersistentTruth === false
      && c01?.deliveredScope?.semanticTargeting?.firstNodeFallbackRemoved === true,
    r2C02SafeSemanticInteractions: c02?.deliveredScope?.semanticActionsUseDraftForm === true
      && c02?.deliveredScope?.cancelNoopProof === true
      && c02?.deliveredScope?.firstObjectFallbackRemoved === true,
    r2C03ResponsiveReachability: Array.isArray(c03?.deliveredScope?.supportedDesktopWidths)
      && [1440, 1024, 900, 768].every((width) => c03.deliveredScope.supportedDesktopWidths.includes(width))
      && c03?.deliveredScope?.horizontalOverflowRejected === true
      && c03?.deliveredScope?.handset390Classification === 'ADVISORY_FALLBACK_NOT_RESPONSIVE_PASS',
    r2C04AuthorityRuntimeHygiene: c04?.deliveredScope?.authoritySideCapabilityRevalidationBeforeReducer === true
      && c04?.deliveredScope?.directIpcCapabilityDenialFailClosed === true
      && c04?.deliveredScope?.noSecondRegistry === true
      && c04?.deliveredScope?.noRuntimeNetwork === true,
    r2C05HonestBlackBoxAcceptance: c05?.blackBoxAcceptance?.status === 'PASS_VISIBLE_UI_BLACK_BOX_ACCEPTANCE'
      && allObjectValuesTrue(c05?.blackBoxAcceptance?.accepted)
      && c05?.deliveredScope?.directIpcJourneyAccepted === false
      && c05?.deliveredScope?.manualMapVisibleResultRequiresAuthorityOk === true,
    r2C05FullRunnerPass: validationPass(c05, (row) => row.id === 'full-runner' && /798 tests, 734 pass, 0 fail, 64 skipped/u.test(row.summary || '')),
    r2C05TestOpsPass: validationPass(c05, (row) => row.id === 'test-ops-pre-pr' && /CURRENT_WAVE_STOP_CONDITION_OK=1/u.test(row.summary || '')),
  };
}

function loadReceipts(root = repoRoot) {
  return Object.fromEntries(Object.entries(R2_RECEIPTS).map(([key, relativePath]) => {
    const proof = fileProof(relativePath, root);
    const doc = proof.exists ? readJson(relativePath, root) : null;
    return [key, { key, path: relativePath, proof, doc }];
  }));
}

function staleReceiptFacts(currentHeadSha, root = repoRoot) {
  return Object.fromEntries(Object.entries(STALE_FINAL_RECEIPTS).map(([key, relativePath]) => {
    const proof = fileProof(relativePath, root);
    const doc = proof.exists ? readJson(relativePath, root) : null;
    const receiptHead = doc?.headShaAtReceiptGeneration || doc?.git?.remoteMergeSha || doc?.baseSha || '';
    return [key, {
      path: relativePath,
      proof,
      receiptHead,
      staleAgainstCurrentHead: receiptHead !== currentHeadSha,
      rejectedAsCurrentReadiness: receiptHead !== currentHeadSha,
    }];
  }));
}

export function evaluateR2FinalRevalidation(input = {}) {
  const root = input.repoRoot ? path.resolve(input.repoRoot) : repoRoot;
  const git = input.gitIdentity || gitIdentity(root);
  const receipts = input.receipts || loadReceipts(root);
  const facts = receiptFacts(receipts);
  const staleFinalReceipts = input.staleFinalReceipts || staleReceiptFacts(git.headSha, root);
  const readyRows = Object.entries(receipts).map(([key, entry]) => {
    const status = String(entry.doc?.status || '');
    const ready = key === 'c00'
      ? facts.r2C00FalseGreenInvalidationAnchor
      : R2_READY_STATUS.test(status);
    return {
      key,
      path: entry.path,
      sha256: entry.proof.sha256,
      status,
      ready,
    };
  });
  const allR2ReceiptsReady = readyRows.every((row) => row.ready);
  const allFactsReady = Object.values(facts).every(Boolean);
  const staleFinalRejected = Object.values(staleFinalReceipts).every((row) => row.rejectedAsCurrentReadiness === true);
  const remoteIdentityReady = git.headEqualsOriginMain === true || git.originMainAncestorOfHead === true;
  const pass = allR2ReceiptsReady && allFactsReady && staleFinalRejected && remoteIdentityReady;
  return {
    schemaVersion: 'yalken.atlas.v5.r2.c06.finalRevalidation.v1',
    taskId: 'YALKEN_ATLAS_V5_POST_FINAL_PRODUCT_OUTCOME_REPAIR_001',
    contourId: 'R2_C06_FINAL_REVALIDATION',
    programStage: 'R2_POST_FINAL_PRODUCT_OUTCOME_REPAIR_2026_07_31',
    status: pass ? 'PASS_READY_FOR_E11_REVALIDATION' : 'NOT_READY_R2_FINAL_REVALIDATION_GAP',
    pass,
    programDodVerdict: 'NOT_READY_E11_AND_EFINAL_REVALIDATION_REQUIRED',
    git,
    r2ReceiptReadiness: readyRows,
    repairedFacts: facts,
    staleFinalReceipts,
    certifiedStageOutcomes: pass
      ? [
        'E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME_BLACK_BOX_CERTIFIED',
        'R2_REPAIR_MACRO_STAGE_READY_FOR_E11_REVALIDATION',
      ]
      : [],
    unsatisfiedStageOutcomes: [
      'E11_STAGE_11_ACTIVE_MACOS_PACKAGED_ELECTRON_REVALIDATION',
      'EFINAL_PROGRAM_DOD_REVALIDATION',
    ],
    deliveredVersusAdvisory: {
      delivered: [
        'R2_C01_REAL_GRAPH_WORKBENCH_STRUCTURAL_REPAIR',
        'R2_C02_SAFE_SEMANTIC_INTERACTIONS',
        'R2_C03_RESPONSIVE_ACCESSIBLE_REACHABILITY',
        'R2_C04_AUTHORITY_RUNTIME_HYGIENE',
        'R2_C05_VISIBLE_UI_BLACK_BOX_MANUAL_MAP_JOURNEY',
      ],
      advisoryOnly: [
        'old_E11_C03_receipt_until_revalidated_on_current_head',
        'old_EFINAL_program_dod_receipt_until_revalidated_on_current_head',
        'inactive_windows_linux_web_ios_android_platform_claims',
      ],
    },
    negativeAssertions: {
      completedContourCountCanCertifyProgramDod: false,
      staleFinalReceiptCanCertifyCurrentHead: false,
      directIpcJourneyCanSatisfyBlackBoxAcceptance: false,
      hiddenOpenerCanPassResponsiveAcceptance: false,
      canceledDestructiveActionCanMutate: false,
      deniedCapabilityCanReachReducerOrPersistence: false,
      lazywebOrUiCraftCanBecomeRuntimeReadinessToken: false,
      inactivePlatformCanCreateHoldOrPass: false,
      programDoneClaim: false,
    },
    nextContour: 'E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION',
  };
}

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateR2FinalRevalidation({ repoRoot });
  fs.mkdirSync(args.outDir, { recursive: true });
  const reportPath = path.join(args.outDir, 'r2-c06-final-revalidation-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  const output = {
    status: result.status,
    pass: result.pass,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
  if (args.json) console.log(JSON.stringify(output, null, 2));
  else console.log(`${RESULT_PREFIX}${JSON.stringify(output)}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
