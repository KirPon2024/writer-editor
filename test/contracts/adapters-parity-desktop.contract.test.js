const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function fixturePath() {
  return path.join(process.cwd(), 'test', 'fixtures', 'adapters', 'desktop-parity-fixtures.json');
}

function loadFixture() {
  return JSON.parse(fs.readFileSync(fixturePath(), 'utf8'));
}

async function loadAdapterModule() {
  const root = process.cwd();
  const moduleUrl = pathToFileURL(path.join(root, 'src', 'adapters', 'desktop', 'desktopPortsAdapter.mjs')).href;
  return import(moduleUrl);
}

function buildElectronApi(apiSpec = {}) {
  const methodNames = ['readFileText', 'writeFileText', 'fileExists', 'openFile', 'saveFile'];
  const out = {};
  for (const methodName of methodNames) {
    const spec = apiSpec[methodName];
    if (!spec || spec.kind === 'missing') continue;
    if (spec.kind === 'throw') {
      out[methodName] = async () => {
        throw new Error(String(spec.value || 'adapter failure'));
      };
      continue;
    }
    out[methodName] = async () => spec.value;
  }
  return out;
}

function makeEnvelope({ code, op, reason, portId, commandId }) {
  const details = {
    platformId: 'node',
    portId,
  };
  if (commandId) details.commandId = commandId;
  return {
    code,
    op,
    reason,
    details,
  };
}

function wrapReferenceMethod(fn, { op, portId, commandId }) {
  if (!fn) {
    return async () => {
      throw makeEnvelope({
        code: 'E_PORT_METHOD_UNAVAILABLE',
        op,
        reason: 'PORT_METHOD_UNAVAILABLE',
        portId,
        commandId,
      });
    };
  }
  return async (...args) => {
    try {
      return await fn(...args);
    } catch {
      throw makeEnvelope({
        code: 'E_PORT_METHOD_FAILED',
        op,
        reason: 'PORT_METHOD_FAILED',
        portId,
        commandId,
      });
    }
  };
}

function createReferencePorts(api, commandId) {
  return {
    fileSystemPort: {
      read: wrapReferenceMethod(api.readFileText, {
        op: 'filesystem.read',
        portId: 'FileSystemPort',
        commandId,
      }),
      write: wrapReferenceMethod(api.writeFileText, {
        op: 'filesystem.write',
        portId: 'FileSystemPort',
        commandId,
      }),
      exists: wrapReferenceMethod(api.fileExists, {
        op: 'filesystem.exists',
        portId: 'FileSystemPort',
        commandId,
      }),
    },
    dialogPort: {
      openFile: wrapReferenceMethod(api.openFile, {
        op: 'dialog.openFile',
        portId: 'DialogPort',
        commandId,
      }),
      saveFile: wrapReferenceMethod(api.saveFile, {
        op: 'dialog.saveFile',
        portId: 'DialogPort',
        commandId,
      }),
    },
    platformInfoPort: {
      getPlatformId() {
        return 'node';
      },
    },
  };
}

async function invokeCase(ports, item) {
  try {
    const value = await ports[item.invoke.port][item.invoke.method](...(item.invoke.args || []));
    return {
      id: item.id,
      kind: 'value',
      value,
    };
  } catch (error) {
    return {
      id: item.id,
      kind: 'error',
      code: error && error.code,
      op: error && error.op,
      reason: error && error.reason,
      details: error && error.details ? {
        platformId: error.details.platformId,
        portId: error.details.portId,
        commandId: error.details.commandId,
      } : undefined,
    };
  }
}

test('desktop adapter parity fixture pack matches direct port contract outputs', async () => {
  const fixture = loadFixture();
  const { createDesktopPortsAdapter } = await loadAdapterModule();
  const adapterResults = [];
  const referenceResults = [];
  const expectedResults = [];

  for (const item of fixture.cases) {
    const api = buildElectronApi(item.api);
    const adapter = createDesktopPortsAdapter(api, { commandId: fixture.commandId });
    const reference = createReferencePorts(api, fixture.commandId);

    const adapterResult = await invokeCase(adapter, item);
    const referenceResult = await invokeCase(reference, item);
    adapterResults.push(adapterResult);
    referenceResults.push(referenceResult);

    const expected = { id: item.id, ...item.expected };
    expectedResults.push(expected);
    assert.deepEqual(adapterResult, expected);
    assert.deepEqual(referenceResult, expected);
  }

  assert.deepEqual(adapterResults, referenceResults);
  assert.equal(JSON.stringify(adapterResults), JSON.stringify(referenceResults));
});

test('desktop adapter parity fixture pack is deterministic over repeated runs', async () => {
  const fixture = loadFixture();
  const { createDesktopPortsAdapter } = await loadAdapterModule();

  async function runPack() {
    const out = [];
    for (const item of fixture.cases) {
      const api = buildElectronApi(item.api);
      const adapter = createDesktopPortsAdapter(api, { commandId: fixture.commandId });
      out.push(await invokeCase(adapter, item));
    }
    return out;
  }

  const first = await runPack();
  const second = await runPack();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
