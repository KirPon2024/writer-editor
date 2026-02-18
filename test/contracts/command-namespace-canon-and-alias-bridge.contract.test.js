const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'COMMAND_NAMESPACE_CANON.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');
const MENU_CONFIG_VALIDATOR_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config-validator.js');

const REGISTRY_SCAN_FILES = Object.freeze([
  'src/renderer/commands/command-catalog.v1.mjs',
  'src/renderer/commands/projectCommands.mjs',
  'src/renderer/commands/registry.mjs',
]);

const SOURCE_SCAN_FOLDERS = Object.freeze([
  'src/menu',
  'src/renderer',
]);

const REQUIRED_ALIAS_KEYS = Object.freeze([
  'cmd.file.new',
  'cmd.file.open',
  'cmd.file.save',
  'cmd.file.saveAs',
  'cmd.file.close',
]);

let busModulePromise = null;
let resolverModulePromise = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectMatches(text, pattern) {
  const matches = [];
  pattern.lastIndex = 0;
  let match = null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(String(match[0] || ''));
  }
  return matches;
}

function collectFilesRecursive(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(absPath, out);
      continue;
    }
    if (entry.isFile()) out.push(absPath);
  }
  return out;
}

function toPosix(relPath) {
  return relPath.replaceAll(path.sep, '/');
}

function loadBusModule() {
  if (!busModulePromise) {
    busModulePromise = import(pathToFileURL(
      path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'commandBusGuard.mjs'),
    ).href);
  }
  return busModulePromise;
}

function loadResolverModule() {
  if (!resolverModulePromise) {
    resolverModulePromise = import(pathToFileURL(
      path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'commandNamespaceCanon.mjs'),
    ).href);
  }
  return resolverModulePromise;
}

function runValidatorWithTempV2(config, today) {
  const { loadAndValidateMenuConfig } = require(MENU_CONFIG_VALIDATOR_PATH);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-namespace-canon-'));
  const configPath = path.join(tmpDir, 'menu-config.v2.json');
  try {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return loadAndValidateMenuConfig({ configPath, today });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('command namespace canon-and-alias-bridge: ssot file exists and shape is valid', () => {
  assert.equal(fs.existsSync(CANON_PATH), true, 'missing docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json');
  const doc = readJson(CANON_PATH);
  assert.equal(doc.canonicalPrefix, 'cmd.project.');
  assert.deepEqual(doc.deprecatedPrefixes, ['cmd.file.']);
  assert.equal(doc.aliasPolicy.noNewDeprecatedCommandIds, true);
  assert.match(String(doc.aliasPolicy.allowDeprecatedInConfigsUntil || ''), /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(doc.aliasPolicy.resolutionRule, 'deprecated->canonical via aliasMap');
  for (const key of REQUIRED_ALIAS_KEYS) {
    assert.equal(typeof doc.aliasMap[key], 'string', `missing alias map key: ${key}`);
    assert.equal(doc.aliasMap[key].startsWith('cmd.project.'), true, `alias target must be canonical: ${key}`);
  }
});

test('command namespace canon-and-alias-bridge: registry and catalog do not declare cmd.file ids', () => {
  const violations = [];
  for (const relPath of REGISTRY_SCAN_FILES) {
    const absPath = path.join(REPO_ROOT, relPath);
    const text = fs.readFileSync(absPath, 'utf8');
    const found = collectMatches(text, /\bcmd\.file\.[a-zA-Z0-9._-]+/g);
    if (found.length > 0) {
      violations.push({ file: relPath, matches: found });
    }
  }
  assert.deepEqual(violations, []);
});

test('command namespace canon-and-alias-bridge: every cmd.file usage in src/menu and src/renderer has alias', () => {
  const doc = readJson(CANON_PATH);
  const aliasMap = doc.aliasMap || {};
  const usages = [];
  for (const folder of SOURCE_SCAN_FOLDERS) {
    const absRoot = path.join(REPO_ROOT, folder);
    const files = collectFilesRecursive(absRoot);
    for (const absPath of files) {
      if (!absPath.endsWith('.js') && !absPath.endsWith('.mjs') && !absPath.endsWith('.json')) continue;
      const relPath = toPosix(path.relative(REPO_ROOT, absPath));
      const text = fs.readFileSync(absPath, 'utf8');
      const matches = collectMatches(text, /\bcmd\.file\.[a-zA-Z0-9._-]+/g);
      for (const match of matches) {
        usages.push({ file: relPath, commandId: match });
      }
    }
  }

  const missingAliases = usages.filter((entry) => typeof aliasMap[entry.commandId] !== 'string');
  assert.deepEqual(missingAliases, []);
});

test('command namespace canon-and-alias-bridge: resolver maps deprecated ids through bus route', async () => {
  const { COMMAND_BUS_ROUTE, runCommandThroughBus } = await loadBusModule();
  let capturedCommandId = '';

  const result = await runCommandThroughBus(
    async (commandId) => {
      capturedCommandId = commandId;
      return { ok: true, value: { commandId } };
    },
    'cmd.file.save',
    {},
    { route: COMMAND_BUS_ROUTE },
  );

  assert.equal(result.ok, true);
  assert.equal(capturedCommandId, 'cmd.project.save');
});

test('command namespace canon-and-alias-bridge: deprecated id without alias is rejected', async () => {
  const { resolveCommandId } = await loadResolverModule();
  const state = resolveCommandId('cmd.file.__unknown__');
  assert.equal(state.ok, false);
  assert.equal(state.code, 'E_COMMAND_NAMESPACE_UNKNOWN');
  assert.equal(state.reason, 'COMMAND_NAMESPACE_ALIAS_MISSING');
});

test('command namespace canon-and-alias-bridge: menu validator accepts deprecated id before sunset and emits canonical', () => {
  const doc = readJson(CANON_PATH);
  const config = {
    version: 'v2',
    fonts: [
      { id: 'font-1', label: 'Serif', value: 'serif' },
    ],
    menus: [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            id: 'file-save',
            label: 'Save',
            command: 'cmd.file.save',
          },
        ],
      },
    ],
  };

  const state = runValidatorWithTempV2(config, doc.aliasPolicy.allowDeprecatedInConfigsUntil);
  assert.equal(state.ok, true, JSON.stringify(state.errors, null, 2));
  assert.equal(state.normalizedConfig.menus[0].items[0].command, 'cmd.project.save');
  assert.equal(state.normalizedConfig.menus[0].items[0].canonicalCmdId, 'cmd.project.save');
});

test('command namespace canon-and-alias-bridge: menu validator rejects deprecated id after sunset', () => {
  const config = {
    version: 'v2',
    fonts: [
      { id: 'font-1', label: 'Serif', value: 'serif' },
    ],
    menus: [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            id: 'file-open',
            label: 'Open',
            command: 'cmd.file.open',
          },
        ],
      },
    ],
  };

  const state = runValidatorWithTempV2(config, '2099-01-01');
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_MENU_COMMAND_NAMESPACE'));
});

test('command namespace canon-and-alias-bridge: required token set stays unchanged for advisory token', () => {
  const requiredSet = readJson(REQUIRED_SET_PATH);
  const release = (((requiredSet || {}).requiredSets || {}).release) || [];
  const active = (((requiredSet || {}).requiredSets || {}).active) || [];
  const freezeReady = (((requiredSet || {}).freezeReady || {}).requiredTokens) || [];
  assert.equal(release.includes('COMMAND_NAMESPACE_CANON_OK'), false);
  assert.equal(active.includes('COMMAND_NAMESPACE_CANON_OK'), false);
  assert.equal(freezeReady.includes('COMMAND_NAMESPACE_CANON_OK'), false);
});
