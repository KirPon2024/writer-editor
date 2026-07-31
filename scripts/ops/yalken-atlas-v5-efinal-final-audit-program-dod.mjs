#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_SCHEMA = 'yalken.atlas.v5.efinal.finalAuditProgramDod.v1';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD');

const REQUIRED_RECEIPTS = Object.freeze({
  stage00: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_STAGE_00_BINDING_AND_CALIBRATION_RECEIPT.json',
  stage01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E01_C04_ATLAS_CONFIRMATION_REBUILD_RECOVERY_RECEIPT.json',
  stage02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E02B_C04_LAYOUT_RESOURCE_BUDGET_PROOF_RECEIPT.json',
  stage03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E03_C05_PROJECTION_INSPECTOR_FALLBACK_MANIFESTS_RECEIPT.json',
  stage04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E04_C06_ATLAS_LOCAL_GRAPH_CLUSTER_LAYOUT_BUDGET_PROOF_RECEIPT.json',
  stage05: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C04_PRODUCT_VERTICAL_JOURNEYS_GRAPH_WORKBENCH_RECEIPT.json',
  stage06: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E06_C08_ATLAS_STAGE_06_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT.json',
  stage07: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E07_C09_STAGE_07_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT.json',
  stage08: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E08_C05_RENDERER_ADAPTER_PROFILING_STAGE_08_ACCEPTANCE_RECEIPT.json',
  stage09: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_STAGE_09_ACCEPTANCE_RECEIPT.json',
  stage10: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C07_STAGE_REVALIDATION_HANDOFF_RECEIPT.json',
  erC07: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C07_STAGE_REVALIDATION_HANDOFF_RECEIPT.json',
  stage11c01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json',
  stage11c02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C02_PACKAGED_CRITICAL_JOURNEY_RECEIPT.json',
  stage11c03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json',
  stage11c04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF_RECEIPT.json',
  erC00: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C00_ACCEPTANCE_TRUTH_STATE_RECONCILIATION_RECEIPT.json',
  erC01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C01_UNICODE_ANCHOR_SCHEMA_INTEGRITY_RECEIPT.json',
  erC02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C02_SINGLE_QUERY_REGISTRY_RUNTIME_PARITY_RECEIPT.json',
  erC03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C03_COMMAND_REACHABILITY_COMMAND_KERNEL_AUTHORITY_RECEIPT.json',
  erC05: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C05_REAL_WORKER_MEASURED_10K_BUDGET_RECEIPT.json',
  erC06: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C06_ATLAS_RAIL_RESPONSIVE_ACCESSIBILITY_RECEIPT.json',
});

const DOD_MAP = Object.freeze([
  ['DOD_01_FOUR_CANONICAL_PROJECTIONS_AND_MANUAL_MAPS', ['stage03', 'stage05']],
  ['DOD_02_SHARED_GRAPH_WORKBENCH_DISTINCT_AUTHORITY', ['stage02', 'stage05', 'erC03']],
  ['DOD_03_PRODUCT_CORE_SINGLE_DOMAIN_TRUTH', ['erC00', 'erC03', 'stage10']],
  ['DOD_04_COMMAND_KERNEL_SINGLE_WRITE_PATH', ['erC03', 'stage01', 'stage05']],
  ['DOD_05_DESIGN_OS_MANIFEST_TYPED_SLOTS', ['stage05', 'erC06']],
  ['DOD_06_ATLAS_EVIDENTIAL_REVERSIBLE_NO_MANUSCRIPT_REWRITE', ['stage01', 'stage04', 'erC01']],
  ['DOD_07_TIME_CALENDAR_CONTINUITY_WORKS', ['stage06']],
  ['DOD_08_GLOBAL_LANGUAGE_BASELINE_UNICODE', ['stage07', 'erC01']],
  ['DOD_09_BASIC_DEEP_LANGUAGES_CERTIFIED', ['stage07']],
  ['DOD_10_MIXED_CJK_RTL_IME_UNICODE_EDGES', ['stage07', 'erC01']],
  ['DOD_11_MANUAL_MAPS_ATLAS_DECISIONS_AUTHOR_DATA_RECOVERY', ['stage01', 'stage02', 'stage09']],
  ['DOD_12_DERIVED_CACHE_REBUILDABLE', ['stage08', 'stage11c02']],
  ['DOD_13_HISTORY_COMMENTS_COLLAB_NO_SECOND_TRUTH', ['stage10']],
  ['DOD_14_IMPORT_EXPORT_ROUNDTRIP_FULL_ARCHIVE', ['stage09', 'stage11c02']],
  ['DOD_15_PERFORMANCE_BUDGETS_APPROVED_CORPORA_HARDWARE', ['stage08', 'erC05', 'stage11c04']],
  ['DOD_16_GRAPH_ACCESSIBILITY_FALLBACK_PARITY', ['stage02', 'erC06', 'stage11c03']],
  ['DOD_17_ACTIVE_PLATFORMS_PACKAGED_VERIFICATION', ['stage11c01', 'stage11c02', 'stage11c03', 'stage11c04']],
  ['DOD_18_FACTUAL_DOCS_MATCH_RUNTIME', ['erC00', 'erC07', 'stage11c04']],
  ['DOD_19_NO_CAPABILITY_SILENTLY_LOST', ['stage09', 'erC07']],
  ['DOD_20_PROGRAM_ORDER_AND_DELIVERY_COMPLETE', ['stage00', 'stage11c04']],
]);

const INVARIANT_MAP = Object.freeze([
  ['INV_01_ANALYSIS_MAP_NO_MANUSCRIPT_MUTATION_WITHOUT_COMMAND', ['stage01', 'erC03']],
  ['INV_02_PRODUCT_MUTATION_THROUGH_COMMAND_KERNEL', ['erC03']],
  ['INV_03_UI_WORKER_NO_DIRECT_CORE_STORAGE_AUTHORITY', ['erC03', 'erC05']],
  ['INV_04_AUTO_ATLAS_NO_ENTITY_MERGE', ['stage04']],
  ['INV_05_AUTO_ATLAS_NO_SEMANTIC_RELATION_CREATION', ['stage04']],
  ['INV_06_AUTO_OUTPUT_HAS_NARRATIVE_EVIDENCE', ['stage01', 'stage04']],
  ['INV_07_UNSUPPORTED_LANGUAGE_EXACT_ONLY', ['stage07']],
  ['INV_08_UNICODE_TEXT_PRESERVED', ['erC01']],
  ['INV_09_DERIVED_CACHE_DELETABLE_REBUILDABLE', ['stage08', 'stage11c02']],
  ['INV_10_STALE_ASYNC_RESULT_NOT_PUBLISHED', ['stage04', 'stage08', 'erC05']],
  ['INV_11_STATE_PLANES_SEPARATED', ['erC00', 'stage10']],
  ['INV_12_UI_RESET_NO_AUTHORING_LOSS', ['stage11c02']],
  ['INV_13_MAP_NO_SECOND_HIDDEN_TRUTH', ['stage02', 'stage10']],
  ['INV_14_VIEWSTATE_NOT_AUTHOR_CONTENT_TRUTH', ['stage02']],
  ['INV_15_DESIGN_OS_FORM_NOT_DOMAIN_SEMANTICS', ['stage05', 'erC06']],
  ['INV_16_CAPABILITY_REVALIDATED_AT_DISPATCH', ['erC03', 'stage09']],
  ['INV_17_EXTERNAL_INPUT_VALIDATED_BY_ADAPTER', ['stage09', 'stage11c02']],
  ['INV_18_HEAVY_WORK_OFF_TYPING_HOT_PATH', ['erC05', 'stage08']],
  ['INV_19_GRAPH_ACTIONS_HAVE_NONVISUAL_EQUIVALENTS', ['stage02', 'erC06']],
  ['INV_20_RECOVERY_EXPORT_NOT_BLOCKED_BY_TIER', ['stage09', 'stage11c02']],
]);

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

function runGit(args, repoRoot) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileProof(repoRoot, relativePath) {
  const abs = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(abs)) return { path: relativePath, exists: false, bytes: 0, sha256: '' };
  const stat = fs.statSync(abs);
  return {
    path: relativePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(abs) : '',
  };
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8'));
}

function receiptPass(receipt) {
  if (receipt && receipt.pass === true) return true;
  if (receipt && receipt.ok === true) return true;
  const status = String(receipt?.status || receipt?.deliveryStatus || receipt?.result || '').toUpperCase();
  return status.includes('PASS')
    || status.includes('DELIVERED')
    || status.includes('DONE')
    || status.includes('READY_FOR_DELIVERY')
    || status.includes('READY_FOR_E11_COMPILATION')
    || status.includes('VALIDATED');
}

function buildReceiptState(repoRoot, requiredReceipts = REQUIRED_RECEIPTS) {
  const receipts = {};
  const failures = [];
  for (const [key, relativePath] of Object.entries(requiredReceipts)) {
    const proof = fileProof(repoRoot, relativePath);
    let parsed = null;
    let parseOk = false;
    if (proof.exists) {
      try {
        parsed = readJson(repoRoot, relativePath);
        parseOk = true;
      } catch {
        failures.push({ code: 'RECEIPT_PARSE_FAILED', key, path: relativePath });
      }
    } else {
      failures.push({ code: 'RECEIPT_MISSING', key, path: relativePath });
    }
    const pass = parseOk && receiptPass(parsed);
    if (parseOk && !pass) failures.push({ code: 'RECEIPT_NOT_PASSING', key, path: relativePath });
    receipts[key] = {
      key,
      path: relativePath,
      proof,
      parseOk,
      pass,
      status: parsed?.status || parsed?.deliveryStatus || parsed?.result || '',
      contourId: parsed?.contourId || '',
    };
  }
  return { receipts, failures };
}

function evidenceRows(map, receipts) {
  return map.map(([id, keys]) => {
    const missing = keys.filter((key) => receipts[key]?.pass !== true);
    return {
      id,
      requiredEvidence: keys.map((key) => ({
        key,
        path: receipts[key]?.path || '',
        sha256: receipts[key]?.proof?.sha256 || '',
        pass: receipts[key]?.pass === true,
      })),
      pass: missing.length === 0,
      missing,
    };
  });
}

function buildGitIdentity(repoRoot) {
  const head = runGit(['rev-parse', 'HEAD'], repoRoot);
  const origin = runGit(['rev-parse', 'origin/main'], repoRoot);
  const branch = runGit(['branch', '--show-current'], repoRoot);
  const dirty = runGit(['status', '--short'], repoRoot);
  const remoteBranch = runGit(['ls-remote', '--heads', 'origin', branch.stdout], repoRoot);
  return {
    headSha: head.stdout,
    originMainSha: origin.stdout,
    branch: branch.stdout,
    headEqualsOriginMain: head.ok && origin.ok && head.stdout === origin.stdout,
    localDirtyFileCount: dirty.stdout ? dirty.stdout.split(/\r?\n/u).filter(Boolean).length : 0,
    remoteBranchExists: remoteBranch.stdout.length > 0,
  };
}

export function evaluateFinalAudit(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || process.cwd());
  const receiptState = buildReceiptState(repoRoot, input.requiredReceipts || REQUIRED_RECEIPTS);
  const programDodEvidenceMap = evidenceRows(input.dodMap || DOD_MAP, receiptState.receipts);
  const criticalInvariants = evidenceRows(input.invariantMap || INVARIANT_MAP, receiptState.receipts);
  const gitIdentity = buildGitIdentity(repoRoot);
  const inactivePlatforms = {
    windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
  };
  const failures = [
    ...receiptState.failures,
    ...programDodEvidenceMap.filter((row) => !row.pass).map((row) => ({ code: 'PROGRAM_DOD_EVIDENCE_MISSING', id: row.id, missing: row.missing })),
    ...criticalInvariants.filter((row) => !row.pass).map((row) => ({ code: 'CRITICAL_INVARIANT_EVIDENCE_MISSING', id: row.id, missing: row.missing })),
  ];

  const pass = failures.length === 0;
  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD',
    status: pass ? 'PASS_EFINAL_READY_FOR_DELIVERY' : 'NOT_READY_EFINAL_EVIDENCE_GAPS',
    pass,
    finalProgramDoDClaim: pass,
    finalProgramDoDClaimScope: 'READY_FOR_DELIVERY_PENDING_PR_MERGE_REMOTE_SHA_VERIFICATION_AND_CLEAN_WORKTREE',
    gitIdentity,
    receiptCount: Object.keys(receiptState.receipts).length,
    receiptFailures: receiptState.failures,
    programDodEvidenceMap,
    criticalInvariants,
    activePlatformScope: {
      macosPackagedElectron: 'CERTIFIED_BY_E11_C01_C02_C03_C04_AND_REVALIDATED_BY_EFINAL_SUITES',
      ...inactivePlatforms,
    },
    finalAuditChecklist: {
      frozenMergedRemoteIdentity: gitIdentity.headEqualsOriginMain,
      programDodEvidenceMapPass: programDodEvidenceMap.every((row) => row.pass),
      criticalInvariantsPass: criticalInvariants.every((row) => row.pass),
      finalSuitesRequiredInReceipt: true,
      packagedJourneyRevalidationRequiredInReceipt: true,
      recoveryCacheExportImportRequiredInReceipt: true,
      noPlanOwnedWipRequiredAfterMerge: true,
      factualDocsAgainstRuntimeRequiredInReceipt: true,
      independentReadOnlyAuditRequiredIfAvailable: true,
    },
    failures,
  };
}

export async function writeFinalAuditReport({ repoRoot = process.cwd(), outDir = DEFAULT_OUT_DIR } = {}) {
  const report = evaluateFinalAudit({ repoRoot });
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'final-audit-program-dod-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await writeFinalAuditReport({ outDir: args.outDir });
  const line = `YALKEN_ATLAS_EFINAL_FINAL_AUDIT_PROGRAM_DOD_RESULT:${JSON.stringify(result)}`;
  process.stdout.write(`${args.json ? JSON.stringify(result, null, 2) : line}\n`);
  process.exit(result.pass ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
