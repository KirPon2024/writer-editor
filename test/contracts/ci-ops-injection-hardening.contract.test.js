const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('network-gate does not use shell interpolation', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'ops', 'network-gate.mjs');
  const source = fs.readFileSync(filePath, 'utf8');

  assert.equal(source.includes("['-lc'"), false);
  assert.equal(source.includes("spawnSync('sh'"), false);
  assert.equal(source.includes('spawnSync("sh"'), false);
});

test('smoke-a4 does not use execSync string commands', () => {
  const filePath = path.join(process.cwd(), 'scripts', 'smoke-a4.mjs');
  const source = fs.readFileSync(filePath, 'utf8');

  assert.equal(source.includes('execSync('), false);
});
