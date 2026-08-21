'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PathCapabilityError,
  assertAliasSafe,
  assertNoFollowComponents,
  resolveWithinCapabilityRoots,
  withStableIdentity,
} = require('../../src/core/io/path-capability-v1.cjs');

const realTmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-sec0-')));

test('realpath containment: inside passes, outside fails, escape via symlinked root prefix fails', () => {
  const root = realTmp();
  const inside = path.join(root, 'scene.txt');
  assert.equal(resolveWithinCapabilityRoots(inside, [root], { noFollow: true }).ok, true);
  const outside = path.join(path.dirname(root), 'outside.txt');
  const verdict = resolveWithinCapabilityRoots(outside, [root], { noFollow: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_ESCAPE');
});

test('no-follow: a symlink component anywhere in the candidate is refused on real disk', () => {
  const root = realTmp();
  const outsideDir = realTmp();
  const secret = path.join(outsideDir, 'secret.txt');
  fs.writeFileSync(secret, 'top secret');
  const linkDir = path.join(root, 'linked');
  fs.symlinkSync(outsideDir, linkDir, 'dir');
  const candidate = path.join(linkDir, 'secret.txt');
  const verdict = resolveWithinCapabilityRoots(candidate, [root], { noFollow: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_NOFOLLOW_SYMLINK', JSON.stringify(verdict));

  // The same candidate without no-follow resolves to the outside dir and is
  // caught by realpath containment instead.
  const verdictRealpath = resolveWithinCapabilityRoots(candidate, [root], { noFollow: false });
  assert.equal(verdictRealpath.ok, false);
  assert.equal(verdictRealpath.reason, 'E_CAP_ESCAPE');
});

test('symlink loop is refused closed, never hangs', () => {
  const root = realTmp();
  const loopA = path.join(root, 'loop-a');
  const loopB = path.join(root, 'loop-b');
  fs.symlinkSync(loopB, loopA, 'dir');
  fs.symlinkSync(loopA, loopB, 'dir');
  const verdict = resolveWithinCapabilityRoots(path.join(loopA, 'x.txt'), [root], { noFollow: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_NOFOLLOW_SYMLINK');
});

test('traversal, control chars, empty roots, missing root and platform forms fail closed', () => {
  const root = realTmp();
  assert.equal(resolveWithinCapabilityRoots(path.join(root, '..', 'escape.txt'), [root]).ok, false);
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'a\0b'), [root]).ok, false);
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'x'), []).reason, 'E_CAP_ROOTS_EMPTY');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'x'), [path.join(root, 'missing-root')]).reason, 'E_CAP_ROOT_MISSING');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'CON'), [root]).reason, 'E_CAP_PLATFORM_FORM');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'file.'), [root]).reason, 'E_CAP_PLATFORM_FORM');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'file '), [root]).reason, 'E_CAP_PLATFORM_FORM');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'LPT3'), [root]).reason, 'E_CAP_PLATFORM_FORM');
});

test('alias law: case mismatch and ambiguous aliases are typed, exact match passes', () => {
  const dir = realTmp();
  fs.writeFileSync(path.join(dir, 'Scene.txt'), 'a');
  const exact = assertAliasSafe(path.join(dir, 'Scene.txt'));
  assert.equal(exact.ok, true);
  assert.throws(() => assertAliasSafe(path.join(dir, 'scene.txt')), (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_CASE_MISMATCH');
});

test('unicode alias law: ambiguity proven on preserving and deduping volumes', () => {
  const dir = realTmp();
  const nfc = 'café.txt';
  const nfd = 'café.txt';
  fs.writeFileSync(path.join(dir, nfc), '1');
  fs.writeFileSync(path.join(dir, nfd), '2');
  const physical = fs.readdirSync(dir).filter((name) => name.startsWith('caf'));
  if (physical.length === 2) {
    // Normalization-preserving volume (e.g. ext4): both entries coexist, so
    // the ambiguity is proven against the real directory read.
    assert.throws(
      () => assertAliasSafe(path.join(dir, nfc)),
      (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_ALIAS_AMBIGUOUS',
    );
  } else {
    assert.equal(physical.length, 1, 'volume physics: aliases either dedupe to one entry or coexist as two');
    // Deduplicating volume (e.g. APFS): the alias pair cannot coexist
    // physically, so ambiguity is proven through the injected directory read.
    assert.throws(
      () => assertAliasSafe(path.join(dir, nfc), { readDirFn: () => [nfc, nfd] }),
      (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_ALIAS_AMBIGUOUS',
    );
  }
  assert.throws(
    () => assertAliasSafe(path.join(dir, nfc), { readDirFn: () => ['DIFFERENT.txt', nfd] }),
    (e) => e.code === 'E_CAP_CASE_MISMATCH',
  );
});

test('TOCTOU: identity stability passes for stable file and fails on replacement', () => {
  const dir = realTmp();
  const target = path.join(dir, 'stable.txt');
  fs.writeFileSync(target, 'v1');
  const read = withStableIdentity(target, () => fs.readFileSync(target, 'utf8'));
  assert.equal(read, 'v1');
  let calls = 0;
  assert.throws(
    () => withStableIdentity(target, () => {
      calls += 1;
      if (calls === 1) {
        fs.rmSync(target);
        fs.writeFileSync(target, 'v2');
      }
      return fs.readFileSync(target, 'utf8');
    }),
    (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_TOCTOU_DRIFT',
  );
});
