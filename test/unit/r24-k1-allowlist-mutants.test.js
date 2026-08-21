'use strict';

// R2.4 K1 implementation mutation suite for the file-path admission policy.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'io', 'file-path-allowlist-v1.cjs');

const MUTANTS = [
  {
    id: 'empty-roots-admit',
    find: '  if (!Array.isArray(allowlistRoots) || allowlistRoots.length === 0) return false;',
    replace: '  if (!Array.isArray(allowlistRoots) || allowlistRoots.length === 0) return true;',
  },
  {
    id: 'nofollow-disabled',
    find: 'resolveWithinCapabilityRoots(resolvedPath, [rootPath], { noFollow: true })',
    replace: 'resolveWithinCapabilityRoots(resolvedPath, [rootPath], { noFollow: false })',
  },
  {
    id: 'validation-swallowed',
    find: "    return resolveValidatedPath(normalized, { mode: 'any' });",
    replace: '    return normalized;',
  },
  {
    id: 'invalid-source-kept',
    find: '    if (resolved) {',
    replace: '    if (true) {',
  },
  {
    id: 'launch-escape-allowed',
    find: "  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));",
    replace: "  return relative === '' || (!!relative && !path.isAbsolute(relative));",
  },
];

function killOracle(module) {
  const {
    resolveExistingPath,
    computeFilePathAllowlistRoots,
    isPathInsideLaunchBoundary,
    isAllowedFilePathByLaw,
  } = module;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-k1m-root-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-k1m-out-')));
  fs.writeFileSync(path.join(root, 'ok.txt'), 'ok');
  fs.writeFileSync(path.join(outside, 's.txt'), 'x');

  // Validation is real: hostile input fails closed, never passes through.
  assert.equal(resolveExistingPath('control\tchar.txt'), '');
  assert.notEqual(resolveExistingPath(root), '');

  // Invalid sources drop out; identical spellings dedupe.
  assert.deepEqual(computeFilePathAllowlistRoots([root, root, '']), [resolveExistingPath(root)]);
  assert.deepEqual(computeFilePathAllowlistRoots(['']), []);

  // Admission: inside passes; outside, missing candidate and empty roots refuse.
  const roots = computeFilePathAllowlistRoots([root]);
  assert.equal(isAllowedFilePathByLaw(path.join(root, 'ok.txt'), roots), true);
  assert.equal(isAllowedFilePathByLaw(path.join(outside, 's.txt'), roots), false);
  assert.equal(isAllowedFilePathByLaw(path.join(root, 'ok.txt'), []), false);
  assert.equal(isAllowedFilePathByLaw('', roots), false);

  // No-follow reaches the decision through the policy seam.
  fs.symlinkSync(path.join(root, 'ok.txt'), path.join(root, 'link-in.txt'), 'file');
  assert.equal(isAllowedFilePathByLaw(path.join(root, 'link-in.txt'), roots), false);

  // Launch boundary: escape and absolute tail refuse.
  assert.equal(isPathInsideLaunchBoundary(root, path.join(root, 'sub')), true);
  assert.equal(isPathInsideLaunchBoundary(root, path.join(root, '..', 'x')), false);
  assert.equal(isPathInsideLaunchBoundary(root, '/etc/passwd'), false);
}

test('K1 file-path admission policy: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-k1-mutant-'));
    // The module resolves ./path-boundary and ./path-capability-v1.cjs next
    // to itself, so the mutant must live at the same layout depth.
    fs.mkdirSync(path.join(dir, 'io'), { recursive: true });
    for (const dep of ['path-boundary.js', 'path-capability-v1.cjs']) {
      fs.copyFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'io', dep), path.join(dir, 'io', dep));
    }
    const target = path.join(dir, 'io', 'file-path-allowlist-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_K1_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
