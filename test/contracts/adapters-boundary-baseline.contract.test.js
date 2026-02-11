const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadAdapterModule() {
  const root = process.cwd();
  const moduleUrl = pathToFileURL(path.join(root, 'src', 'adapters', 'desktop', 'desktopPortsAdapter.mjs')).href;
  return import(moduleUrl);
}

test('desktop adapter exposes FileSystemPort/DialogPort/PlatformInfoPort contracts', async () => {
  const { createDesktopPortsAdapter } = await loadAdapterModule();

  const calls = [];
  const adapter = createDesktopPortsAdapter({
    readFileText: async (p) => { calls.push(['read', p]); return 'content'; },
    writeFileText: async (p, d) => { calls.push(['write', p, d]); },
    fileExists: async (p) => { calls.push(['exists', p]); return true; },
    openFile: async () => { calls.push(['openFile']); return '/tmp/in.md'; },
    saveFile: async () => { calls.push(['saveFile']); return '/tmp/out.md'; },
  });

  assert.equal(adapter.contractsValid, true);
  assert.equal(await adapter.fileSystemPort.read('/tmp/a.md'), 'content');
  await adapter.fileSystemPort.write('/tmp/a.md', 'x');
  assert.equal(await adapter.fileSystemPort.exists('/tmp/a.md'), true);
  assert.equal(await adapter.dialogPort.openFile(), '/tmp/in.md');
  assert.equal(await adapter.dialogPort.saveFile(), '/tmp/out.md');
  assert.equal(adapter.platformInfoPort.getPlatformId(), 'node');
  assert.deepEqual(calls, [
    ['read', '/tmp/a.md'],
    ['write', '/tmp/a.md', 'x'],
    ['exists', '/tmp/a.md'],
    ['openFile'],
    ['saveFile'],
  ]);
});

test('desktop adapter returns deterministic typed error when method is unavailable', async () => {
  const { createDesktopPortsAdapter } = await loadAdapterModule();
  const adapter = createDesktopPortsAdapter({});

  await assert.rejects(
    adapter.fileSystemPort.read('/tmp/a.md'),
    {
      code: 'E_PORT_METHOD_UNAVAILABLE',
      op: 'filesystem.read',
      reason: 'PORT_METHOD_UNAVAILABLE',
      details: { platformId: 'node', portId: 'FileSystemPort' },
    },
  );
});

test('shared adapters layer contains no platform-specific imports/usages', () => {
  const root = process.cwd();
  const sharedRoot = path.join(root, 'src', 'adapters', 'shared');
  assert.equal(fs.existsSync(sharedRoot), true, 'src/adapters/shared must exist');

  const forbidden = [
    /\bipcRenderer\b/u,
    /\bipcMain\b/u,
    /\bBrowserWindow\b/u,
    /\bwindow\./u,
    /\bdocument\./u,
    /\bnavigator\./u,
    /from\s+['"]electron['"]/u,
    /require\(['"]electron['"]\)/u,
    /@electron\//u,
  ];

  const stack = [sharedRoot];
  const violations = [];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !/\.(mjs|cjs|js|ts)$/u.test(entry.name)) continue;
      const text = fs.readFileSync(fullPath, 'utf8');
      for (const re of forbidden) {
        if (re.test(text)) {
          violations.push({
            file: path.relative(root, fullPath),
            pattern: re.source,
          });
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
