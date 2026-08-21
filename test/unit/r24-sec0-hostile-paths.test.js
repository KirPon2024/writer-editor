'use strict';

// R2.4 SEC0 hostile corpus: real on-disk adversarial cases and the
// isAllowedFilePath adoption proof.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveWithinCapabilityRoots } = require('../../src/core/io/path-capability-v1.cjs');

const realTmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-sec0h-')));

function makeTree() {
  const root = realTmp();
  const outside = realTmp();
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'classified');
  fs.mkdirSync(path.join(root, 'project'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project', 'scene.txt'), 'text');
  return { root, outside };
}

test('symlinked directory escape is refused on real disk', () => {
  const { root, outside } = makeTree();
  fs.symlinkSync(outside, path.join(root, 'project', 'link-out'), 'dir');
  const verdict = resolveWithinCapabilityRoots(path.join(root, 'project', 'link-out', 'secret.txt'), [root], { noFollow: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_NOFOLLOW_SYMLINK');
});

test('symlinked file escape is refused on real disk', () => {
  const { root, outside } = makeTree();
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'project', 'link-file.txt'), 'file');
  const verdict = resolveWithinCapabilityRoots(path.join(root, 'project', 'link-file.txt'), [root], { noFollow: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_NOFOLLOW_SYMLINK');
});

test('root cannot be a symlinked alias of an outside directory', () => {
  const { root, outside } = makeTree();
  const aliasRoot = path.join(root, 'alias-of-outside');
  fs.symlinkSync(outside, aliasRoot, 'dir');
  const verdict = resolveWithinCapabilityRoots(path.join(aliasRoot, 'secret.txt'), [outside], { noFollow: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_NOFOLLOW_SYMLINK');
});

test('traversal forms are refused in every spelling', () => {
  const { root } = makeTree();
  for (const candidate of [
    `${root}/../x.txt`,
    `${root}/project/../../x.txt`,
    `${root}/project//../../x.txt`,
  ]) {
    const verdict = resolveWithinCapabilityRoots(candidate, [root]);
    assert.equal(verdict.ok, false, candidate);
    assert.equal(verdict.reason, 'E_CAP_TRAVERSAL');
  }
  // lexically pre-normalized traversal escapes containment instead
  const preNormalized = resolveWithinCapabilityRoots(path.join(root, '..', 'x.txt'), [root]);
  assert.equal(preNormalized.ok, false);
  assert.equal(preNormalized.reason, 'E_CAP_ESCAPE');
});


test('isAllowedFilePath adoption: the capability law is wired through the core admission policy', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  // R2.4 K1: the policy module is the seam; main delegates to it.
  assert.ok(main.includes("require('./core/io/file-path-allowlist-v1.cjs')"));
  const fnStart = main.indexOf('function isAllowedFilePath');
  assert.ok(fnStart !== -1);
  const fnEnd = main.indexOf('\nfunction ', fnStart + 1);
  const body = main.slice(fnStart, fnEnd === -1 ? main.length : fnEnd);
  assert.ok(body.includes('isAllowedFilePathByLaw(candidatePath, getFilePathAllowlistRoots())'));
  assert.equal(body.includes('isPathInside(rootPath, resolvedPath)'), false, 'lexical prefix containment is gone');
  // The capability law sits exactly one hop behind the policy seam.
  const policy = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'io', 'file-path-allowlist-v1.cjs'), 'utf8');
  assert.ok(policy.includes("require('./path-capability-v1.cjs')"));
  assert.ok(policy.includes('resolveWithinCapabilityRoots(resolvedPath, [rootPath], { noFollow: true })'));
});

test('isAllowedFilePath behavior differential: legit inside passes, symlink escape fails', () => {
  // The adoption is proven at the module level with the same law the
  // function delegates to: inside-root real paths pass; escapes refuse.
  const { root, outside } = makeTree();
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'project', 'scene.txt'), [root], { noFollow: true }).ok, true);
  fs.symlinkSync(outside, path.join(root, 'project', 'escape'), 'dir');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'project', 'escape', 'secret.txt'), [root], { noFollow: true }).ok, false);
});

test('windows drive and unc-style forms are refused or contained, never misrouted', () => {
  const { root } = makeTree();
  const verdict = resolveWithinCapabilityRoots('C:/Windows/System32/drivers/etc/hosts', [root]);
  assert.equal(verdict.ok, false);
  const unc = resolveWithinCapabilityRoots('//server/share/file.txt', [root]);
  assert.equal(unc.ok, false);
});
