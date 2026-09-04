import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const defaultAsarCandidates = [
  path.resolve('dist/mac-arm64/Yalken.app/Contents/Resources/app.asar'),
  path.resolve('dist/mac-arm64/Craftsman.app/Contents/Resources/app.asar'),
];

const requiredRuntimeResourceEntries = [
  'docs/OPERATIONS/ABOUT_LICENSE_TEXT.md',
  'docs/OPS/ARTIFACTS/menu/menu.normalized.json',
  'docs/OPS/CAPABILITIES_MATRIX.json',
  'docs/OPS/LOCKS/MENU_ARTIFACT_LOCK.json',
  'docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json',
  'docs/OPS/STATUS/COMMAND_VISIBILITY_MATRIX.json',
  'docs/OPS/STATUS/ENABLEDWHEN_DSL_CANON.json',
  'docs/OPS/STATUS/MENU_ARTIFACT_VERIFY_CANON.json',
  'docs/OPS/STATUS/MENU_CONFIG_NORMALIZATION_SPEC_v1.json',
  'docs/OPS/STATUS/MENU_OVERLAY_STACK_CANON_v1.json',
  'docs/OPS/STATUS/MENU_RUNTIME_CONTEXT_CANON_v1.json',
  'docs/OPS/STATUS/PLUGIN_MENU_OVERLAY_POLICY_v1.json',
].map((source) => ({
  source,
  packaged: `src/runtime-governance/${source}`,
}));
const requiredEntries = [
  'src/renderer/index.html',
  'src/renderer/editor.bundle.js',
  'src/renderer/flags.js',
  ...requiredRuntimeResourceEntries.map((entry) => entry.packaged),
];
const requiredRuntimeScriptPath = '<script src="./editor.bundle.js"></script>';
const explicitAppAsarPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
const appAsarPath = explicitAppAsarPath || defaultAsarCandidates.find((candidate) => fs.existsSync(candidate)) || '';

function listSharedSearchRoots() {
  const projectRoot = process.cwd();
  const parentDir = path.dirname(projectRoot);
  const roots = [projectRoot];
  const preferredSiblingRoots = [
    path.join(parentDir, 'writer-editor-codex'),
    path.join(parentDir, 'writer-editor-contour-00ab-isolation-001'),
  ];

  for (const root of preferredSiblingRoots) {
    if (root !== projectRoot && fs.existsSync(root)) {
      roots.push(root);
    }
  }

  try {
    const siblingRoots = fs.readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('writer-editor'))
      .map((entry) => path.join(parentDir, entry.name));
    for (const root of siblingRoots) {
      if (!roots.includes(root)) {
        roots.push(root);
      }
    }
  } catch {
    // Ignore sibling discovery failures and fall back to explicit roots only.
  }

  return roots;
}

function resolveOptionalPackage(packageName) {
  for (const searchRoot of listSharedSearchRoots()) {
    try {
      const resolvedPath = require.resolve(packageName, { paths: [searchRoot] });
      return require(resolvedPath);
    } catch {
      // Continue scanning sibling worktrees for the shared toolchain install.
    }
  }
  return null;
}

function validateRuntimeEntrypointAtRepoLevel() {
  const missing = requiredEntries.filter((entry) => !fs.existsSync(path.resolve(entry)));
  if (missing.length > 0) {
    console.error(`REPO_RUNTIME_ENTRYPOINT_MISSING: missing=${missing.join(',')}`);
    process.exit(3);
  }

  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');
  if (!indexHtml.includes(requiredRuntimeScriptPath)) {
    console.error('INDEX_HTML_RUNTIME_BUNDLE_PATH_MISSING');
    process.exit(4);
  }

  const packageDoc = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const packagedFilePatterns = Array.isArray(packageDoc?.build?.files) ? packageDoc.build.files : [];
  if (!packagedFilePatterns.includes('src/**/*')) {
    console.error('PACKAGE_RUNTIME_RESOURCE_DECLARATION_MISSING: missing=src/**/*');
    process.exit(8);
  }
  const forbiddenDocPatterns = packagedFilePatterns.filter((entry) => entry === 'docs' || entry.startsWith('docs/'));
  if (forbiddenDocPatterns.length > 0) {
    console.error(`PACKAGE_RUNTIME_RESOURCE_DOCS_STAGING_FORBIDDEN: entries=${forbiddenDocPatterns.join(',')}`);
    process.exit(8);
  }

  const driftedMirrors = requiredRuntimeResourceEntries.filter(({ source, packaged }) => (
    !fs.readFileSync(path.resolve(source)).equals(fs.readFileSync(path.resolve(packaged)))
  ));
  if (driftedMirrors.length > 0) {
    console.error(`REPO_RUNTIME_RESOURCE_MIRROR_DRIFT: entries=${driftedMirrors.map((entry) => entry.source).join(',')}`);
    process.exit(8);
  }

  const distBundlePath = path.resolve('dist/renderer/editor.bundle.js');
  if (!fs.existsSync(distBundlePath)) {
    console.error(`DIST_RUNTIME_BUNDLE_MISSING: ${distBundlePath}`);
    process.exit(5);
  }

  const sourceBundle = fs.readFileSync(path.resolve('src/renderer/editor.bundle.js'), 'utf8');
  const distBundle = fs.readFileSync(distBundlePath, 'utf8');
  if (sourceBundle !== distBundle) {
    console.error('RUNTIME_BUNDLE_SOURCE_DIST_DRIFT');
    process.exit(6);
  }

  console.log('BUNDLE_ENTRYPOINT_PROOF_MODE=repo-level');
  console.log('REPO_RUNTIME_ENTRYPOINT_CHECK_PASS');
}

if (!appAsarPath) {
  validateRuntimeEntrypointAtRepoLevel();
  process.exit(0);
}

if (!fs.existsSync(appAsarPath)) {
  console.error(`APP_ASAR_MISSING: ${appAsarPath}`);
  process.exit(2);
}

const asar = resolveOptionalPackage('@electron/asar');
if (!asar) {
  console.error('APP_ASAR_READER_MISSING');
  process.exit(7);
}

const list = asar.listPackage(appAsarPath);
const missing = requiredEntries
  .map((entry) => `/${entry}`)
  .filter((entry) => !list.includes(entry));
if (missing.length > 0) {
  console.error(`APP_ASAR_BUNDLE_CHECK_FAIL: missing=${missing.join(',')}`);
  process.exit(3);
}

const indexHtml = asar.extractFile(appAsarPath, 'src/renderer/index.html').toString('utf8');
if (!indexHtml.includes(requiredRuntimeScriptPath)) {
  console.error('INDEX_HTML_RUNTIME_BUNDLE_PATH_MISSING');
  process.exit(4);
}

for (const entry of requiredRuntimeResourceEntries) {
  const sourceBytes = fs.readFileSync(path.resolve(entry.source));
  const packagedBytes = asar.extractFile(appAsarPath, entry.packaged);
  if (!sourceBytes.equals(packagedBytes)) {
    console.error(`APP_ASAR_RUNTIME_RESOURCE_BYTES_DRIFT: entry=${entry.source}`);
    process.exit(8);
  }
}

console.log('BUNDLE_ENTRYPOINT_PROOF_MODE=packaged');
console.log(`APP_ASAR_RUNTIME_RESOURCES_EXACT=${requiredRuntimeResourceEntries.length}`);
console.log('APP_ASAR_BUNDLE_CHECK_PASS');
