'use strict';

// R2.4 SEC0 implementation mutation suite for the path capability law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'io', 'path-capability-v1.cjs');

const MUTANTS = [
  {
    id: 'escape-check-removed',
    find: '  return { ok: false, reason: \'E_CAP_ESCAPE\', detail: candidateReal };',
    replace: '  return { ok: true, canonicalPath: candidateReal, root: canonicalRoots[0] };',
  },
  {
    id: 'nofollow-skip',
    find: '    if (stat.isSymbolicLink()) {',
    replace: '    if (false) {',
  },
  {
    id: 'traversal-check-removed',
    find: "  if (normalizedInput.split('/').some((segment) => segment === '..') && !WINDOWS_DRIVE_ABS_RE.test(normalizedInput)) {",
    replace: '  if (false) {',
  },
  {
    id: 'alias-ambiguous-tolerated',
    find: '  if (matches.length > 1) {',
    replace: '  if (false) {',
  },
  {
    id: 'alias-mismatch-tolerated',
    find: '  if (matches.length === 1 && matches[0] !== base) {',
    replace: '  if (false) {',
  },
  {
    id: 'toctou-drift-tolerated',
    find: '  if (identity(before) !== identity(after)) {',
    replace: '  if (false) {',
  },
  {
    id: 'root-not-canonicalized',
    find: '  const canonical = realpathOrResolve(resolved);',
    replace: '  const canonical = resolved;',
  },
];

function killOracle(module) {
  const {
    PathCapabilityError,
    assertAliasSafe,
    resolveWithinCapabilityRoots,
    withStableIdentity,
  } = module;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-sec0m-root-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-sec0m-out-')));
  fs.writeFileSync(path.join(outside, 's.txt'), 'x');
  fs.mkdirSync(path.join(root, 'p'), { recursive: true });
  fs.writeFileSync(path.join(root, 'p', 'ok.txt'), 'ok');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'p', 'ok.txt'), [root], { noFollow: true }).ok, true);
  assert.equal(resolveWithinCapabilityRoots(path.join(outside, 's.txt'), [root]).ok, false);

  fs.symlinkSync(outside, path.join(root, 'p', 'link'), 'dir');
  assert.equal(resolveWithinCapabilityRoots(path.join(root, 'p', 'link', 's.txt'), [root], { noFollow: true }).ok, false);
  assert.equal(resolveWithinCapabilityRoots(path.join(root, '..', 'esc.txt'), [root]).ok, false);
  assert.equal(
    resolveWithinCapabilityRoots(`${root}/p/../p/ok.txt`, [root]).ok,
    false,
    'interior traversal must be refused even when resolution lands back inside',
  );
  const rootAlias = path.join(fs.realpathSync(os.tmpdir()), `r24-sec0m-alias-${process.pid}`);
  fs.symlinkSync(root, rootAlias, 'dir');
  assert.equal(
    resolveWithinCapabilityRoots(path.join(rootAlias, 'p', 'ok.txt'), [rootAlias], { noFollow: false }).ok,
    true,
    'a symlink-spelled root must be canonicalized before containment',
  );

  const nfc = 'caf\u00e9.txt';
  const nfd = 'cafe\u0301.txt';
  fs.writeFileSync(path.join(root, 'p', nfc), '1');
  fs.writeFileSync(path.join(root, 'p', nfd), '2');
  const physical = fs.readdirSync(path.join(root, 'p')).filter((name) => name.startsWith('caf'));
  if (physical.length === 2) {
    assert.throws(
      () => assertAliasSafe(path.join(root, 'p', nfc)),
      (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_ALIAS_AMBIGUOUS',
    );
  } else {
    assert.equal(physical.length, 1, 'volume physics: aliases either dedupe to one entry or coexist as two');
    assert.throws(
      () => assertAliasSafe(path.join(root, 'p', nfc), { readDirFn: () => [nfc, nfd] }),
      (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_ALIAS_AMBIGUOUS',
    );
  }
  assert.throws(
    () => assertAliasSafe(path.join(root, 'p', 'ok.txt'), { readDirFn: () => ['OK.txt'] }),
    (e) => e instanceof PathCapabilityError && e.code === 'E_CAP_CASE_MISMATCH',
  );

  const target = path.join(root, 'p', 'ok.txt');
  assert.equal(withStableIdentity(target, () => fs.readFileSync(target, 'utf8')), 'ok');
  let calls = 0;
  assert.throws(
    () => withStableIdentity(target, () => {
      calls += 1;
      if (calls === 1) { fs.rmSync(target); fs.writeFileSync(target, 'y'); }
      return 1;
    }),
    (e) => e.code === 'E_CAP_TOCTOU_DRIFT',
  );

  const linkRoot = path.join(root, 'root-link');
  fs.symlinkSync(outside, linkRoot, 'dir');
  assert.equal(resolveWithinCapabilityRoots(path.join(linkRoot, 's.txt'), [outside], { noFollow: true }).ok, false);
}

test('SEC0 path capability law: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-sec0-mutant-'));
    const target = path.join(dir, 'path-capability-v1.cjs');
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
  console.log(`R24_SEC0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
