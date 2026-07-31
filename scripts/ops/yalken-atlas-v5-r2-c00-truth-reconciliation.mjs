import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

const FILES = {
  editor: 'src/renderer/editor.js',
  main: 'src/main.js',
  styles: 'src/renderer/styles.css',
  html: 'src/renderer/index.html',
  erC04Contract: 'test/contracts/yalken-atlas-v5-er-c04-product-vertical-journeys-graph-workbench.contract.test.js',
  erC06Audit: 'scripts/ops/yalken-atlas-v5-er-c06-atlas-rail-responsive-audit.mjs',
  erC07Runner: 'scripts/ops/yalken-atlas-v5-er-c07-stage-revalidation-handoff.mjs',
  e11C03Receipt: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json',
  efinalReceipt: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_PROGRAM_DOD_RECEIPT.json',
  continuityLedger: 'src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs',
  relationDossier: 'src/derived/atlas/deriveAtlasRelationDossier.mjs',
};

function readRel(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start < 0) return '';
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

function ok(id, severity, reproduced, summary, evidence = {}) {
  return { id, severity, reproduced: reproduced === true, summary, evidence };
}

export function evaluateR2C00TruthReconciliation() {
  const editor = readRel(FILES.editor);
  const main = readRel(FILES.main);
  const styles = readRel(FILES.styles);
  const html = readRel(FILES.html);
  const erC04Contract = readRel(FILES.erC04Contract);
  const erC06Audit = readRel(FILES.erC06Audit);
  const erC07Runner = readRel(FILES.erC07Runner);
  const e11C03Receipt = readRel(FILES.e11C03Receipt);
  const efinalReceipt = readRel(FILES.efinalReceipt);
  const continuityLedger = readRel(FILES.continuityLedger);
  const relationDossier = readRel(FILES.relationDossier);

  const manualMapRender = sliceBetween(editor, 'function renderManualMapWorkbenchState()', 'async function refreshManualMapWorkbench()');
  const productBridge = sliceBetween(main, 'async function dispatchProductCommandBridge(commandId, payload = {})', 'function buildFontSubmenu(config)');
  const narrowCss = sliceBetween(styles, '@media (max-width: 899px)', '@media (max-width: 599px)');
  const rightAside = sliceBetween(html, '<aside class="sidebar sidebar--right"', '</aside>');

  const findings = [
    ok(
      'F01_NO_REAL_MANUAL_MAP_GRAPH_WORKBENCH',
      'P0',
      manualMapRender.includes('right-rail-atlas-overview-metrics')
        && manualMapRender.includes('right-rail-manual-map-list')
        && !/createElement\(['"](?:svg|canvas)['"]\)/u.test(manualMapRender)
        && !manualMapRender.includes('manualMapViewportPlanner')
        && !manualMapRender.includes('manualMapLayoutScheduler')
        && !manualMapRender.includes('manualMapInteraction')
        && !/item\.addEventListener\(['"](?:click|keydown)/u.test(manualMapRender),
      'Renderer Manual Map path is metrics, command buttons, and an inert list; no SVG/canvas graph adapter or ViewState/viewport/layout scheduler is wired into the visible user path.',
      {
        source: FILES.editor,
        function: 'renderManualMapWorkbenchState',
        graphAdapterPresent: /createElement\(['"](?:svg|canvas)['"]\)/u.test(manualMapRender),
        listRowsHaveClickOrKeydown: /item\.addEventListener\(['"](?:click|keydown)/u.test(manualMapRender),
      },
    ),
    ok(
      'F02_UNSAFE_FIRST_OBJECT_SEMANTIC_ACTIONS',
      'P0',
      manualMapRender.includes("label: currentDocumentTitle || 'Node'")
        && manualMapRender.includes("fromNodeId: nodes[0]?.id || ''")
        && manualMapRender.includes("toNodeId: nodes[1]?.id || ''")
        && manualMapRender.includes("nodeId: nodes[0]?.id || ''")
        && manualMapRender.includes("edgeId: edges[0]?.id || ''")
        && manualMapRender.includes("groupId: groups[0]?.id || ''")
        && !manualMapRender.includes('confirm(')
        && !manualMapRender.includes('impact preview')
        && !manualMapRender.includes('selectedManualMap'),
      'Manual Map add/edit/delete buttons dispatch immediately using document title or first node/edge/group fallbacks, without explicit selection, form input, impact preview, or confirmation.',
      {
        source: FILES.editor,
        firstNodeFallback: manualMapRender.includes("nodeId: nodes[0]?.id || ''"),
        firstEdgeFallback: manualMapRender.includes("edgeId: edges[0]?.id || ''"),
        firstGroupFallback: manualMapRender.includes("groupId: groups[0]?.id || ''"),
      },
    ),
    ok(
      'F03_ACCEPTANCE_CHAIN_FALSE_GREEN',
      'P0',
      /assert\.match\(source/u.test(erC04Contract)
        && /invokeUiCommandBridge/u.test(erC07Runner)
        && /screenshotProof: png\.length > 1000/u.test(erC07Runner)
        && /tabletNotClipped|screenshotBytes|png\.length|bytes/u.test(erC06Audit)
        && /EFINAL_PROGRAM_DOD_CERTIFIED|PROGRAM_DOD/u.test(efinalReceipt),
      'Current acceptance chain still relies on reducer/source contracts, direct IPC command calls, and screenshot byte/projection aggregation rather than a black-box visible UI journey.',
      {
        sources: [FILES.erC04Contract, FILES.erC06Audit, FILES.erC07Runner, FILES.efinalReceipt],
        directIpcRunner: /invokeUiCommandBridge/u.test(erC07Runner),
        screenshotByteProof: /screenshotProof: png\.length > 1000/u.test(erC07Runner),
      },
    ),
    ok(
      'F04_NARROW_DESKTOP_ATLAS_UNREACHABLE',
      'P1',
      narrowCss.includes('.sidebar--right')
        && /display:\s*none/u.test(narrowCss)
        && rightAside.includes('data-right-rail-collapse')
        && !html.includes('data-right-rail-opener')
        && !html.includes('data-right-rail-global-opener'),
      'At max-width 899px the right rail is hidden while the only right-rail control is inside that hidden aside; no permanent external opener exists for 768/900 supported desktop reachability.',
      {
        sources: [FILES.styles, FILES.html],
        hideRulePresent: /display:\s*none/u.test(narrowCss),
        openerInsideRightAside: rightAside.includes('data-right-rail-collapse'),
      },
    ),
    ok(
      'F05_AUTHORITY_SIDE_CAPABILITY_REVALIDATION_MISSING',
      'P1',
      productBridge.includes('getProductCommandRecord(commandId)')
        && productBridge.includes('runtime.reduceCoreState')
        && productBridge.includes('persistProjectManifestAtPath')
        && !/capability.*(?:denied|disabled|snapshot|matrix|resolve|revalidat)/iu.test(productBridge),
      'dispatchProductCommandBridge resolves command metadata, reduces Core state, and persists manifest without authority-side capability revalidation before reducer/persistence.',
      {
        source: FILES.main,
        reducerBeforeCapabilityGuard: productBridge.indexOf('runtime.reduceCoreState') > -1,
        persistenceBeforeCapabilityGuard: productBridge.indexOf('persistProjectManifestAtPath') > -1,
      },
    ),
    ok(
      'F06_DESIGN_RESEARCH_METADATA_IN_RUNTIME_PAYLOADS',
      'P2',
      /lazyweb|uiCraft|referenceCompanies|jobber|sentry|jira|docusign|mixpanel|google-analytics|relativity/iu.test(continuityLedger)
        && /lazyweb|referenceCompanies|docusign|mixpanel|google-analytics|relativity/iu.test(relationDossier),
      'Lazyweb, UI Craft, external product references, and tool-failure metadata are present in derived Atlas runtime payload builders.',
      {
        sources: [FILES.continuityLedger, FILES.relationDossier],
        continuityDigest: sha256(continuityLedger),
        relationDigest: sha256(relationDossier),
      },
    ),
  ];

  const supportedViewportMatrix = [
    { width: 1440, height: 900, classification: 'SUPPORTED_DESKTOP', acceptance: 'VISIBLE_UI_BLACK_BOX_REQUIRED' },
    { width: 1024, height: 768, classification: 'SUPPORTED_DESKTOP', acceptance: 'VISIBLE_UI_BLACK_BOX_REQUIRED' },
    { width: 900, height: 768, classification: 'SUPPORTED_DESKTOP', acceptance: 'VISIBLE_UI_BLACK_BOX_REQUIRED' },
    { width: 768, height: 1024, classification: 'SUPPORTED_DESKTOP', acceptance: 'VISIBLE_UI_BLACK_BOX_REQUIRED' },
    { width: 390, height: 844, classification: 'ADVISORY_MOBILE_FALLBACK_ONLY', acceptance: 'MUST_NOT_GREEN_DESKTOP_RESPONSIVE_PASS_BY_HIDING_ATLAS' },
  ];

  const invalidatedContours = [
    'ER_C04_PRODUCT_VERTICAL_JOURNEYS_AND_GRAPH_WORKBENCH',
    'ER_C06_ATLAS_RAIL_RESPONSIVE_ACCESSIBILITY',
    'ER_C07_STAGE_REVALIDATION_AND_HANDOFF',
    'E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
    'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD',
  ];

  const retainedEvidence = [
    'Manual Map Product Core reducers and author truth model remain valid implementation evidence.',
    'Manual Map graph projection, ViewState, viewport planner, layout scheduler, export/import modules remain valid lower-layer evidence.',
    'Atlas model, Command Kernel registry, recovery, Unicode anchors, deterministic derived caches, and no-network runtime evidence remain retained unless directly contradicted by a repair contour.',
  ];

  return {
    schemaVersion: 'yalken.atlas.v5.r2.c00.truthReconciliation.v1',
    taskId: 'YALKEN_ATLAS_V5_POST_FINAL_PRODUCT_OUTCOME_REPAIR_001',
    contourId: 'R2_C00_TRUTH_RECONCILIATION',
    generatedAtUtc: new Date().toISOString(),
    auditedSha: 'e018a7c5e168cf24da73418645ee653b112aa5a2',
    evaluatedHeadSourceDigest: sha256(JSON.stringify(Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, sha256(readRel(rel))])))),
    verdict: findings.every((finding) => finding.reproduced) ? 'REPRODUCED_FALSE_GREEN_PROGRAM_DOD_REJECTED' : 'REPRODUCTION_INCOMPLETE',
    executionStatusRequired: 'IN_PROGRESS',
    programDodVerdict: 'NOT_READY',
    invalidatedContours,
    retainedEvidence,
    supportedViewportMatrix,
    blackBoxAcceptanceRequired: {
      route: 'visible packaged/local Electron UI only',
      forbiddenAsReadinessProof: [
        'direct IPC command calls',
        'source regex alone',
        'reducer-only journey',
        'PNG byte size alone',
        'hidden mobile fallback as desktop responsive PASS',
      ],
      requiredJourney: [
        'create or open manual map through visible UI',
        'select arbitrary node edge group through pointer and keyboard/list parity',
        'create edit delete with explicit forms preview confirmation and cancel proof',
        'pan zoom fit layout search filter pins minimap inspector',
        'save quit reopen recovery export repeat import',
        'verify persisted model and rendered hit-testable graph outcome',
      ],
    },
    findings,
    pass: findings.every((finding) => finding.reproduced),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateR2C00TruthReconciliation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.pass ? 0 : 1);
}
