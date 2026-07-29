import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCTRINE_PATH = 'docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md';
const DOCTRINE_REF = 'YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md';

export const REQUIRED_REFERENCE_PATHS = Object.freeze([
  'agents.md',
  'CANON.md',
  'README.md',
  'docs/AGENT_START_PROMPT.md',
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
]);

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
  'FEATURE_INTEGRATION_MANIFEST_V1',
  'SURFACE_MANIFEST_V1',
]);

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

  const command = packageJson?.scripts?.['design-os:doctrine'];
  if (command !== 'node scripts/check-design-os-integration-doctrine.mjs') {
    errors.push({ code: 'E_DOCTRINE_CHECK_SCRIPT_UNBOUND' });
  }

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function readTextMap(repoRoot) {
  const paths = [DOCTRINE_PATH, ...REQUIRED_REFERENCE_PATHS];
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
