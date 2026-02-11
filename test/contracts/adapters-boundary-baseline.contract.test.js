const test = require('node:test');
const assert = require('node:assert/strict');
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
