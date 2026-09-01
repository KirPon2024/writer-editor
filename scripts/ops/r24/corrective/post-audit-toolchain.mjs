#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const fail = (code, detail = '') => { const error = new Error(`${code}${detail ? `:${detail}` : ''}`); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export const EXPECTED = Object.freeze({
  node: '22.12.0',
  npm: '10.9.0',
  packageManager: 'npm@10.9.0',
  nodeEngine: '>=22.12.0 <23.0.0',
  npmEngine: '>=10.9.0 <11.0.0',
  electron: '41.10.3',
  editorBundleSha256: 'b0b287b15698df9f7b3fb63215900983c3ec8604177325969cc4cbb0a833d770',
  preloadBundleSha256: '361a55245fbdee46691953b5a8fabf495c7db45e0aa6edd36597342136596561'
});

function npmVersion() {
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm --version'] : ['--version'];
  return execFileSync(executable, args, { encoding: 'utf8', windowsHide: true }).trim();
}

export function verifyToolchain({ verifyRuntime = true, verifyBundles = true } = {}) {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const electron = readJson('node_modules/electron/package.json');
  assert(fs.readFileSync('.node-version', 'utf8') === `${EXPECTED.node}\n`, 'E_NODE_PIN', '.node-version');
  assert(pkg.packageManager === EXPECTED.packageManager, 'E_PACKAGE_MANAGER_PIN', pkg.packageManager);
  assert(pkg.engines?.node === EXPECTED.nodeEngine && pkg.engines?.npm === EXPECTED.npmEngine, 'E_ENGINE_CONTRACT', JSON.stringify(pkg.engines));
  assert(pkg.scripts?.['r24:test-inventory'] === 'node scripts/ops/r24/test-inventory.mjs --check docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json', 'E_INVENTORY_SCRIPT', pkg.scripts?.['r24:test-inventory']);
  assert(lock.lockfileVersion === 3, 'E_LOCKFILE_VERSION', lock.lockfileVersion);
  assert(lock.packages?.['']?.engines?.node === EXPECTED.nodeEngine && lock.packages?.['']?.engines?.npm === EXPECTED.npmEngine, 'E_LOCK_ROOT_ENGINES', JSON.stringify(lock.packages?.['']?.engines));
  assert(lock.packages?.['']?.devDependencies?.electron === EXPECTED.electron, 'E_LOCK_ELECTRON_ROOT', lock.packages?.['']?.devDependencies?.electron);
  assert(electron.version === EXPECTED.electron, 'E_ELECTRON_VERSION', electron.version);
  if (verifyRuntime) {
    assert(process.versions.node === EXPECTED.node, 'E_NODE_RUNTIME', process.versions.node);
    assert(npmVersion() === EXPECTED.npm, 'E_NPM_RUNTIME', npmVersion());
  }
  if (verifyBundles) {
    assert(sha256(fs.readFileSync('src/renderer/editor.bundle.js')) === EXPECTED.editorBundleSha256, 'E_EDITOR_BUNDLE_DIGEST');
    assert(sha256(fs.readFileSync('src/preload.bundle.cjs')) === EXPECTED.preloadBundleSha256, 'E_PRELOAD_BUNDLE_DIGEST');
  }
  return { schemaVersion: 'POST_AUDIT_TOOLCHAIN_RESULT_V1', status: 'PASS', ...EXPECTED };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(verifyToolchain({ verifyRuntime: !process.argv.includes('--no-runtime') }))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
