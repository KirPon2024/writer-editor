const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadBindingMap(items) {
  const map = new Map();
  for (const item of items) {
    assert.equal(typeof item.commandId, 'string');
    assert.equal(typeof item.capabilityId, 'string');
    assert.ok(item.commandId.length > 0);
    assert.ok(item.capabilityId.length > 0);
    assert.equal(map.has(item.commandId), false, `duplicate commandId in binding: ${item.commandId}`);
    map.set(item.commandId, item.capabilityId);
  }
  return map;
}

async function loadProjectModule() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src', 'renderer', 'commands', 'projectCommands.mjs')).href;
  return import(moduleUrl);
}

async function loadCapabilityPolicyModule() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs')).href;
  return import(moduleUrl);
}

test('command capability binding covers all baseline domain-mutating commands', async () => {
  const bindingPath = path.join(process.cwd(), 'docs', 'OPS', 'STATUS', 'COMMAND_CAPABILITY_BINDING.json');
  const binding = readJson(bindingPath);
  assert.equal(binding.schemaVersion, 1);
  assert.ok(Array.isArray(binding.items));

  const bindingMap = loadBindingMap(binding.items);
  const project = await loadProjectModule();
  const capabilityPolicy = await loadCapabilityPolicyModule();

  const requiredCommandIds = [
    'project.create',
    'project.applyTextEdit',
    ...Object.values(project.COMMAND_IDS),
  ];

  for (const commandId of requiredCommandIds) {
    assert.equal(bindingMap.has(commandId), true, `missing capability binding for command: ${commandId}`);
  }

  for (const [commandId, capabilityId] of Object.entries(capabilityPolicy.CAPABILITY_BINDING)) {
    assert.equal(bindingMap.get(commandId), capabilityId, `runtime/docs capability binding drift on ${commandId}`);
  }
});
