import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCTRINE_PATH = 'docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md';
const DOCTRINE_REF = 'YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md';

export const REQUIRED_REFERENCE_PATHS = Object.freeze([
  'AGENTS.md',
  'CANON.md',
  'README.md',
  'docs/AGENT_START_PROTOCOL.md',
  'docs/ARCHITECTURE_ONE_PAGE.md',
  'docs/BIBLE.md',
  'docs/CONTEXT.md',
  'docs/HANDOFF.md',
  'docs/PROCESS.md',
  'docs/YALKEN_DESIGN_OS_CHANGE_GUIDE_V2_2.md',
  'docs/corex/COREX.md',
  'docs/templates/CODEX_TZ_CHECKLIST.md',
  'docs/templates/EDITOR_CORE_TZ.md',
  'docs/templates/FEATURE_TZ.md',
  'docs/templates/hard-tz.md',
  'docs/tasks/README.md',
  'src/contracts/README.md',
  'src/core/README.md',
]);

export const REQUIRED_CANON_ORDER = Object.freeze({
  'AGENTS.md': ['CANON_STATUS.json', 'CANON.md', 'COREX.md', 'BIBLE.md'],
  'README.md': ['CANON_STATUS.json', 'CANON.md', 'COREX.md', 'BIBLE.md'],
  'docs/AGENT_START_PROTOCOL.md': ['CANON_STATUS.json', 'CANON.md', 'COREX.md', 'BIBLE.md'],
  'docs/CONTEXT.md': ['CANON_STATUS.json', 'CANON.md', 'COREX.md', 'BIBLE.md'],
  'docs/HANDOFF.md': ['CANON_STATUS.json', 'CANON.md', 'COREX.md', 'BIBLE.md'],
  'docs/PROCESS.md': ['CANON_STATUS.json', 'CANON.md', 'COREX.md', 'BIBLE.md'],
  'docs/corex/COREX.md': ['CANON_STATUS.json', 'CANON.md', 'docs/corex/COREX.md', 'BIBLE.md'],
  'docs/templates/EDITOR_CORE_TZ.md': ['CANON_STATUS.json', 'CANON.md', 'COREX', 'BIBLE.md'],
  'docs/templates/FEATURE_TZ.md': ['CANON_STATUS.json', 'CANON.md', 'COREX', 'BIBLE.md'],
  'docs/templates/hard-tz.md': ['CANON_STATUS.json', 'CANON.md', 'COREX', 'BIBLE'],
  'docs/tasks/README.md': ['CANON_STATUS.json', 'CANON.md', 'COREX', 'BIBLE'],
});

export const REQUIRED_OUTPUT_POLICY_PATHS = Object.freeze([
  'AGENTS.md',
  'docs/templates/CODEX_TZ_CHECKLIST.md',
  'docs/templates/EDITOR_CORE_TZ.md',
  'docs/templates/FEATURE_TZ.md',
  'docs/templates/hard-tz.md',
]);

export const REQUIRED_INDIRECT_ENTRYPOINTS = Object.freeze({
  'docs/AGENT_START_PROMPT.md': [
    'AGENTS.md',
    'AGENT_START_PROTOCOL.md',
    'npm run agent:bootstrap',
  ],
});

export const REQUIRED_DOCTRINE_MARKERS = Object.freeze([
  'DOCTRINE_ID: YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1',
  'DUAL_PLANE_LAW: EVERY_FEATURE_HAS_PRODUCT_PLANE_AND_INTERFACE_PLANE',
  'PRODUCT_AUTHORITY: DATA_SEMANTICS_OPERATIONS_STORAGE_RECOVERY',
  'COMMAND_AUTHORITY: ACTION_MEANING_AVAILABILITY_ROUTING',
  'DESIGN_AUTHORITY: FORM_VISIBILITY_LAYOUT_PROJECTION_FALLBACK',
  'COMMAND_LAW: EVERY_PRODUCT_MUTATION_GOES_THROUGH_CANONICAL_COMMAND_AUTHORITY',
  'PROJECTION_LAW: UI_CONSUMES_PROJECTIONS_AND_NEVER_INVENTS_PRODUCT_TRUTH',
  'SURFACE_LAW: EVERY_UI_ZONE_IS_A_MANIFEST_DRIVEN_SURFACE',
  'SLOT_LAW: NEW_UI_ENTERS_ONLY_THROUGH_TYPED_SLOTS',
  'PERSISTENCE_LAW: PROJECT_PERSISTENCE_AND_SHELL_PERSISTENCE_NEVER_SHARE_AUTHORITY',
  'HOT_PATH_LAW: TYPING_NEVER_RUNS_FULL_ANALYSIS_LAYOUT_OR_PERSISTENCE',
  'CURRENT_REALITY_LAW: TARGET_ARCHITECTURE_MUST_NOT_BE_REPORTED_AS_LIVE_RUNTIME',
  'PORT_DIRECTION_LAW: CATALOG_AND_PROJECTION_ARE_READ_ONLY_DISPATCH_IS_INTENT_ONLY',
  'CAPABILITY_LAW: VISIBILITY_NEVER_ENFORCES_CAPABILITY_COMMAND_KERNEL_REVALIDATES_ON_DISPATCH',
  'MANIFEST_MATERIALIZATION_LAW: CONTRACT_FIRST_NO_SPECULATIVE_RUNTIME_REGISTRY',
  'AUTHORING_STATE_LAW: UNSAVED_TEXT_IS_NOT_SHELL_STATE_AND_UI_RESET_MUST_NOT_DROP_IT',
  'IDENTITY_LAW: ASYNC_RESULTS_BIND_TO_PROJECT_ENTITY_REVISION_AND_GENERATION',
  'LEGACY_TOUCH_LAW: TOUCHED_LEGACY_SEAMS_MUST_NOT_WIDEN_BYPASS_OR_AUTHORITY_LEAK',
  'EXTERNAL_INPUT_LAW: EXTERNAL_BYTES_AND_PAYLOADS_ARE_UNTRUSTED_UNTIL_VALIDATED_NORMALIZED_AND_BOUNDED',
  'FEATURE_INTEGRATION_MANIFEST_V1',
  'SURFACE_MANIFEST_V1',
]);

function tokensAreOrdered(text, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const index = text.indexOf(token, cursor + 1);
    if (index === -1 || index <= cursor) return false;
    cursor = index;
  }
  return true;
}

export function evaluateDoctrineTextMap(textByPath, packageJson) {
  const errors = [];
  const doctrine = String(textByPath[DOCTRINE_PATH] || '');

  if (!doctrine) {
    errors.push({ code: 'E_DOCTRINE_MISSING', path: DOCTRINE_PATH });
  }

  for (const marker of REQUIRED_DOCTRINE_MARKERS) {
    if (!doctrine.includes(marker)) {
      errors.push({ code: 'E_DOCTRINE_MARKER_MISSING', marker });
    }
  }

  for (const relativePath of REQUIRED_REFERENCE_PATHS) {
    const text = String(textByPath[relativePath] || '');
    if (!text) {
      errors.push({ code: 'E_DOCTRINE_REFERENCE_FILE_MISSING', path: relativePath });
      continue;
    }
    if (!text.includes(DOCTRINE_REF)) {
      errors.push({ code: 'E_DOCTRINE_REFERENCE_MISSING', path: relativePath });
    }
  }

  for (const [relativePath, tokens] of Object.entries(REQUIRED_CANON_ORDER)) {
    const text = String(textByPath[relativePath] || '');
    if (!tokensAreOrdered(text, tokens)) {
      errors.push({ code: 'E_CANON_SOURCE_ORDER_INVALID', path: relativePath, tokens });
    }
  }

  for (const [relativePath, tokens] of Object.entries(REQUIRED_INDIRECT_ENTRYPOINTS)) {
    const text = String(textByPath[relativePath] || '');
    if (!tokensAreOrdered(text, tokens)) {
      errors.push({ code: 'E_AGENT_ENTRYPOINT_ROUTING_INVALID', path: relativePath, tokens });
    }
  }

  for (const relativePath of REQUIRED_OUTPUT_POLICY_PATHS) {
    const text = String(textByPath[relativePath] || '');
    if (!text.includes('CHANGED_BASENAMES')) {
      errors.push({ code: 'E_OUTPUT_POLICY_BASENAMES_MISSING', path: relativePath });
    }
    if (text.includes('список + ссылки `path:line`')) {
      errors.push({ code: 'E_OUTPUT_POLICY_PATH_LINE_CONFLICT', path: relativePath });
    }
  }

  const command = packageJson?.scripts?.['design-os:doctrine'];
  if (command !== 'node scripts/check-design-os-integration-doctrine.mjs') {
    errors.push({ code: 'E_DOCTRINE_CHECK_SCRIPT_UNBOUND' });
  }

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function readTextMap(repoRoot) {
  const paths = [
    DOCTRINE_PATH,
    ...REQUIRED_REFERENCE_PATHS,
    ...Object.keys(REQUIRED_INDIRECT_ENTRYPOINTS),
  ];
  return Object.fromEntries(paths.map((relativePath) => [
    relativePath,
    fs.existsSync(path.join(repoRoot, relativePath))
      ? fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
      : '',
  ]));
}

function run() {
  const repoRoot = process.cwd();
  const packagePath = path.join(repoRoot, 'package.json');
  const packageJson = fs.existsSync(packagePath)
    ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    : {};
  const result = evaluateDoctrineTextMap(readTextMap(repoRoot), packageJson);

  if (!result.ok) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  console.log('YALKEN_DESIGN_OS_INTEGRATION_DOCTRINE_OK=1');
  console.log(`YALKEN_DESIGN_OS_INTEGRATION_DOCTRINE_REFERENCES=${REQUIRED_REFERENCE_PATHS.length}`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  run();
}
