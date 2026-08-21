'use strict';

// R2.4 K1 unit law tests for the core file-path admission policy.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const policy = require(path.join(__dirname, '..', '..', 'src', 'core', 'io', 'file-path-allowlist-v1.cjs'));

const realTmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-k1-')));

test('resolveExistingPath validates and resolves; invalid candidates fail closed', () => {
  const dir = realTmp();
  assert.equal(typeof policy.resolveExistingPath(dir), 'string');
  assert.notEqual(policy.resolveExistingPath(dir), '');
  for (const bad of ['', '   ', null, undefined, 42, {}, []]) {
    assert.equal(policy.resolveExistingPath(bad), '', String(bad));
  }
  assert.equal(policy.resolveExistingPath('control\tchar.txt'), '', 'control characters are refused');
});

test('computeFilePathAllowlistRoots dedupes identical spellings and drops invalid sources', () => {
  const dir = realTmp();
  const roots = policy.computeFilePathAllowlistRoots([dir, dir, '', null, 'control\tchar.txt']);
  assert.deepEqual(roots, [policy.resolveExistingPath(dir)]);
  assert.deepEqual(policy.computeFilePathAllowlistRoots([]), []);
  assert.deepEqual(policy.computeFilePathAllowlistRoots(null), []);
  assert.deepEqual(policy.computeFilePathAllowlistRoots('not-an-array'), []);
});

test('admission: inside passes, outside and empty roots fail closed', () => {
  const root = realTmp();
  const outside = realTmp();
  fs.writeFileSync(path.join(root, 'scene.txt'), 'draft');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'classified');
  const roots = policy.computeFilePathAllowlistRoots([root]);
  assert.equal(policy.isAllowedFilePathByLaw(path.join(root, 'scene.txt'), roots), true);
  assert.equal(policy.isAllowedFilePathByLaw(path.join(outside, 'secret.txt'), roots), false);
  assert.equal(policy.isAllowedFilePathByLaw(path.join(root, 'scene.txt'), []), false, 'empty root set admits nothing');
  assert.equal(policy.isAllowedFilePathByLaw(path.join(root, 'scene.txt'), null), false);
  assert.equal(policy.isAllowedFilePathByLaw('', roots), false);
});

test('admission: symlink escape and in-root symlink are refused by the SEC0 law', () => {
  const root = realTmp();
  const outside = realTmp();
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'classified');
  fs.writeFileSync(path.join(root, 'real.txt'), 'real');
  fs.symlinkSync(outside, path.join(root, 'link-out'), 'dir');
  fs.symlinkSync(path.join(root, 'real.txt'), path.join(root, 'link-in.txt'), 'file');
  const roots = policy.computeFilePathAllowlistRoots([root]);
  assert.equal(policy.isAllowedFilePathByLaw(path.join(root, 'link-out', 'secret.txt'), roots), false);
  assert.equal(policy.isAllowedFilePathByLaw(path.join(root, 'link-in.txt'), roots), false, 'no-follow refuses symlink components even when the target is inside');
});

test('launch boundary containment: inside and exact pass, escape and absolute tail fail', () => {
  const root = realTmp();
  assert.equal(policy.isPathInsideLaunchBoundary(root, root), true);
  assert.equal(policy.isPathInsideLaunchBoundary(root, path.join(root, 'sub', 'file.txt')), true);
  assert.equal(policy.isPathInsideLaunchBoundary(root, path.join(root, '..', 'escape.txt')), false);
  assert.equal(policy.isPathInsideLaunchBoundary(root, '/etc/passwd'), false);
  assert.equal(policy.isPathInsideLaunchBoundary(root, `${root}-sibling/file.txt`), false, 'prefix siblings are not inside');
});

test('main.js keeps only the Electron source acquisition adapter', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.ok(main.includes("require('./core/io/file-path-allowlist-v1.cjs')"));
  const fnStart = main.indexOf('function getFilePathAllowlistRoots');
  const fnEnd = main.indexOf('\nfunction ', fnStart + 1);
  const body = main.slice(fnStart, fnEnd);
  assert.ok(body.includes('computeFilePathAllowlistRoots(['));
  assert.ok(body.includes("app ? app.getPath('userData') : ''"), 'the Electron source stays in the main adapter');
  assert.equal(body.includes('new Set()'), false, 'the set policy moved to the core module');
});
