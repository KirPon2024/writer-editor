#!/usr/bin/env node
import fs from 'node:fs';

const MATRIX_PATH = 'docs/OPS/CAPABILITIES_MATRIX.json';
const BINDING_PATH = 'docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json';

function readJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildBindingMap(bindingDoc) {
  const map = new Map();
  const items = Array.isArray(bindingDoc && bindingDoc.items) ? bindingDoc.items : [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const commandId = typeof item.commandId === 'string' ? item.commandId.trim() : '';
    const capabilityId = typeof item.capabilityId === 'string' ? item.capabilityId.trim() : '';
    if (!commandId || !capabilityId) continue;
    if (!map.has(commandId)) map.set(commandId, capabilityId);
  }
  return map;
}

function buildPlatformMap(matrixDoc) {
  const map = new Map();
  const items = Array.isArray(matrixDoc && matrixDoc.items) ? matrixDoc.items : [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const platformId = typeof item.platformId === 'string' ? item.platformId.trim() : '';
    if (!platformId) continue;
    const capabilities = item.capabilities && typeof item.capabilities === 'object' && !Array.isArray(item.capabilities)
      ? item.capabilities
      : {};
    if (!map.has(platformId)) map.set(platformId, capabilities);
  }
  return map;
}

export function evaluatePlatformCapabilityResolver(input = {}) {
  const matrix = readJson(MATRIX_PATH);
  const binding = readJson(BINDING_PATH);
  const matrixPresent = matrix ? 1 : 0;
  const bindingPresent = binding ? 1 : 0;

  if (!matrix || !binding) {
    return {
      ok: 0,
      failReason: 'CAPABILITY_RESOLVER_MISSING_SOURCE',
      matrixPresent,
      bindingPresent,
      platformId: '',
      commandId: '',
      capabilityId: '',
      capabilityEnabled: 0,
    };
  }

  const bindingMap = buildBindingMap(binding);
  const platformMap = buildPlatformMap(matrix);
  const platformId = typeof input.platformId === 'string' && input.platformId.trim()
    ? input.platformId.trim()
    : 'node';
  const commandId = typeof input.commandId === 'string' && input.commandId.trim()
    ? input.commandId.trim()
    : '';

  if (!platformId) {
    return {
      ok: 0,
      failReason: 'E_PLATFORM_ID_REQUIRED',
      matrixPresent,
      bindingPresent,
      platformId,
      commandId,
      capabilityId: '',
      capabilityEnabled: 0,
    };
  }

  const capabilities = platformMap.get(platformId);
  if (!capabilities) {
    return {
      ok: 0,
      failReason: 'E_UNSUPPORTED_PLATFORM',
      matrixPresent,
      bindingPresent,
      platformId,
      commandId,
      capabilityId: '',
      capabilityEnabled: 0,
    };
  }

  if (!commandId) {
    return {
      ok: 1,
      failReason: '',
      matrixPresent,
      bindingPresent,
      platformId,
      commandId,
      capabilityId: '',
      capabilityEnabled: 1,
    };
  }

  const capabilityId = bindingMap.get(commandId) || '';
  if (!capabilityId) {
    return {
      ok: 0,
      failReason: 'E_CAPABILITY_ENFORCEMENT_MISSING',
      matrixPresent,
      bindingPresent,
      platformId,
      commandId,
      capabilityId,
      capabilityEnabled: 0,
    };
  }

  if (!(capabilityId in capabilities)) {
    return {
      ok: 0,
      failReason: 'E_CAPABILITY_MISSING',
      matrixPresent,
      bindingPresent,
      platformId,
      commandId,
      capabilityId,
      capabilityEnabled: 0,
    };
  }

  return {
    ok: capabilities[capabilityId] === true ? 1 : 0,
    failReason: capabilities[capabilityId] === true ? '' : 'E_CAPABILITY_DISABLED_FOR_COMMAND',
    matrixPresent,
    bindingPresent,
    platformId,
    commandId,
    capabilityId,
    capabilityEnabled: capabilities[capabilityId] === true ? 1 : 0,
  };
}

function parseArgs(argv) {
  const out = { platformId: '', commandId: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--platform-id') {
      out.platformId = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--command-id') {
      out.commandId = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    }
  }
  return out;
}

function printTokens(state) {
  console.log(`CAPABILITY_PLATFORM_RESOLVER_PLATFORM_ID=${state.platformId}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_COMMAND_ID=${state.commandId}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_CAPABILITY_ID=${state.capabilityId}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_MATRIX_PRESENT=${state.matrixPresent}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_BINDING_PRESENT=${state.bindingPresent}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_CAPABILITY_ENABLED=${state.capabilityEnabled}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_OK=${state.ok}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluatePlatformCapabilityResolver({
    platformId: args.platformId,
    commandId: args.commandId,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.ok === 1 ? 0 : 1);
}

main();
