#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadAndValidateMenuConfig } = require('./menu-config-validator.js');

function readArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  const next = process.argv[idx + 1];
  return typeof next === 'string' ? next : '';
}

const configPathArg = readArgValue('--config-path');
const schemaPathArg = readArgValue('--schema-path');
const jsonMode = process.argv.includes('--json');

const state = loadAndValidateMenuConfig({
  configPath: configPathArg ? path.resolve(configPathArg) : undefined,
  schemaPath: schemaPathArg ? path.resolve(schemaPathArg) : undefined
});

const payload = {
  ok: state.ok,
  MENU_CONFIG_SCHEMA_VALID_OK: state.ok ? 1 : 0,
  failReason: state.failReason || '',
  errors: Array.isArray(state.errors) ? state.errors : []
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(`MENU_CONFIG_SCHEMA_VALID_OK=${payload.MENU_CONFIG_SCHEMA_VALID_OK}\n`);
  if (!payload.ok) {
    process.stdout.write(`MENU_CONFIG_FAIL_REASON=${payload.failReason}\n`);
  }
}

process.exit(payload.ok ? 0 : 1);
