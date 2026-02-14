#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadAndValidateThemeConfig } = require('../../src/renderer/theme/theme-config-validator.js');

function readArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  const next = process.argv[idx + 1];
  return typeof next === 'string' ? next : '';
}

const configPathArg = readArgValue('--config-path');
const schemaPathArg = readArgValue('--schema-path');
const jsonMode = process.argv.includes('--json');

const state = loadAndValidateThemeConfig({
  configPath: configPathArg ? path.resolve(configPathArg) : undefined,
  schemaPath: schemaPathArg ? path.resolve(schemaPathArg) : undefined,
});

const payload = {
  ok: Boolean(state && state.ok),
  THEME_CONFIG_OK: state && state.ok ? 1 : 0,
  failReason: state && state.ok ? '' : String(state && state.failReason ? state.failReason : 'Theme config validation failed.'),
  errors: Array.isArray(state && state.errors) ? state.errors : [],
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(`THEME_CONFIG_OK=${payload.THEME_CONFIG_OK}\n`);
  if (!payload.ok) {
    process.stdout.write(`THEME_CONFIG_FAIL_REASON=${payload.failReason}\n`);
  }
}

process.exit(payload.ok ? 0 : 1);
