const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const profile = require('../../src/core/writer-local-profile-v1.cjs');
const productRegistry = require('../../src/shared/productCommandRegistry.cjs');
const workspaceRegistry = require('../../src/shared/workspaceQueryRegistry.cjs');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('WP307 optional domain and query cut remains exhaustive against live registries', () => {
  const optionalDomains = new Set(profile.OPTIONAL_PRODUCT_DOMAINS);
  for (const record of productRegistry.PRODUCT_COMMAND_RECORDS) {
    assert.equal(optionalDomains.has(record.domain), true, `${record.id} escaped WRITER_LOCAL_V1`);
  }

  const optionalQueryIds = new Set(profile.OPTIONAL_QUERY_IDS);
  for (const record of workspaceRegistry.WORKSPACE_QUERY_RECORDS) {
    const optional = record.owner !== 'main'
      || record.id === workspaceRegistry.WORKSPACE_QUERY_IDS.COLLAB_SCOPE_LOCAL
      || record.id === workspaceRegistry.WORKSPACE_QUERY_IDS.REVIEW_SURFACE
      || record.id === workspaceRegistry.WORKSPACE_QUERY_IDS.STAGE10_PRODUCT_STATE;
    assert.equal(optionalQueryIds.has(record.id), optional, record.id);
  }
});

test('WP307 main revalidates profile before command/query dispatch and package load', () => {
  const source = read('src/main.js');
  for (const token of [
    "require('./core/writer-local-profile-v1.cjs')",
    'profile: getWriterLocalRuntimeProfile(),',
    'evaluateWriterLocalCommandAccess({',
    'evaluateWriterLocalQueryAccess({',
    'function dispatchMenuCommand(commandId, payload = {}, options = {}) {',
    'if (getWriterLocalRuntimeProfile().active) return false;',
    'PRODUCT_PROFILE: writerLocalProfile.profileId,',
    'isPackaged: app.isPackaged === true,',
    'platform: process.platform,',
  ]) {
    assert.equal(source.includes(token), true, token);
  }
  assert.doesNotMatch(source, /WRITER_LOCAL_V1.*process\.env/u);
});

test('WP307 flags projection removes optional controls from keyboard and accessibility paths', () => {
  const flags = read('src/renderer/flags.js');
  assert.match(flags, /qs\.get\('PRODUCT_PROFILE'\) === 'WRITER_LOCAL_V1'/u);
  for (const token of [
    'const applyWriterLocalPresentationCut = () => {',
    "'[data-mode=\"plan\"]'",
    "'[data-mode=\"review\"]'",
    "'[data-right-tab=\"comments\"]'",
    "'[data-right-tab=\"atlas\"]'",
    "element.setAttribute('aria-hidden', 'true');",
    "element.style.setProperty('display', 'none', 'important');",
    "document.addEventListener('DOMContentLoaded', applyWriterLocalPresentationCut, { once: true });",
  ]) {
    assert.equal(flags.includes(token), true, token);
  }
});

test('WP307 preserves its historical wording hash and follows the admitted WP503 and WP504 append-only successors', () => {
  const editor = read('src/renderer/editor.js');
  const registry = JSON.parse(read('docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json'));
  const wp307SuccessorBytes = read('docs/OPS/R24/CORRECTIVE/WP307_EDITOR_WORDING_SUCCESSOR_V1.json');
  const wp503SuccessorBytes = read('docs/OPS/R24/CORRECTIVE/WP503_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json');
  const wp504Successor = JSON.parse(read('docs/OPS/R24/CORRECTIVE/WP504_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json'));
  const wp307Successor = JSON.parse(wp307SuccessorBytes);
  const wp503Successor = JSON.parse(wp503SuccessorBytes);
  const surface = registry.wordingSurfaces.find((entry) => entry.path === 'src/renderer/editor.js');
  assert.ok(surface);
  const digest = `sha256:${crypto.createHash('sha256').update(editor).digest('hex')}`;
  assert.equal(surface.sha256, 'sha256:5d443aca3c441c831ee9a47a3e7445a836730d0c602cf95136afc76ce47af320');
  assert.equal(wp307Successor.historicalRegistry.sha256, crypto.createHash('sha256').update(read('docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json')).digest('hex'));
  assert.equal(wp307Successor.historicalRegistry.editorSourceSha256, surface.sha256);
  assert.equal(wp307Successor.successor.scope, 'WP503_READ_ONLY_ATLAS_SURFACE_RENDERER_WIRING');
  assert.equal(wp503Successor.predecessorSuccessor.sha256, crypto.createHash('sha256').update(wp307SuccessorBytes).digest('hex'));
  assert.equal(wp504Successor.predecessorSuccessor.sha256, crypto.createHash('sha256').update(wp503SuccessorBytes).digest('hex'));
  assert.equal(wp504Successor.surfaceOverrides.find((entry) => entry.path === 'src/renderer/editor.js').sha256, digest);
  assert.equal(wp307Successor.programDone, false);
  assert.equal(wp503Successor.programDone, false);
  assert.equal(wp504Successor.programDone, false);
});

test('WP307 profile contract carries no persistence, network or external authority', () => {
  const source = read('src/core/writer-local-profile-v1.cjs');
  for (const forbidden of [
    'node:fs',
    'ipcMain',
    'ipcRenderer',
    'fetch(',
    'http://',
    'https://',
    'writeFile',
    'localStorage',
    'process.env',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
