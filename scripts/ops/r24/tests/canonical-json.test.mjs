import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalize,
  canonicalDigest,
  sha256hex,
  readJsonBounded,
  writeJsonAtomic,
  classifyWriteArtifacts,
  R24Error,
} from '../canonical-json.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-canon-'));

test('canonicalization is deterministic regardless of key order', () => {
  const a = { b: 1, a: [2, { d: 'x', c: null }], z: true };
  const b = { z: true, a: [2, { c: null, d: 'x' }], b: 1 };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(canonicalDigest(a), canonicalDigest(b));
  assert.equal(canonicalize(a), '{"a":[2,{"c":null,"d":"x"}],"b":1,"z":true}');
});

test('canonical digest differs for different content', () => {
  assert.notEqual(canonicalDigest({ a: 1 }), canonicalDigest({ a: 2 }));
});

test('bounded read rejects oversize and missing files', () => {
  const dir = tmp();
  const big = path.join(dir, 'big.json');
  fs.writeFileSync(big, JSON.stringify({ pad: 'x'.repeat(2048) }));
  assert.throws(() => readJsonBounded(big, { maxBytes: 128 }), (e) => e instanceof R24Error && e.code === 'E_R24_READ_TOO_LARGE');
  assert.throws(() => readJsonBounded(path.join(dir, 'missing.json')), (e) => e.code === 'E_R24_READ_MISSING');
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{not json');
  assert.throws(() => readJsonBounded(bad), (e) => e.code === 'E_R24_JSON_PARSE');
});

test('atomic write round-trips with digest proof and cleans intent', () => {
  const dir = tmp();
  const file = path.join(dir, 'state.json');
  const value = { a: 1, nested: { b: ['x', 'y'] } };
  const write = writeJsonAtomic(file, value);
  assert.equal(write.sha256, sha256hex(fs.readFileSync(file)));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value);
  const names = fs.readdirSync(dir);
  assert.equal(names.filter((n) => n.includes('r24-intent')).length, 0);
  assert.equal(names.filter((n) => n.includes('r24-tmp-')).length, 0);
  const cls = classifyWriteArtifacts(file, { expectedNewDigest: write.sha256 });
  assert.equal(cls.classification, 'NEW_COMMITTED');
  const clsOther = classifyWriteArtifacts(file, { expectedNewDigest: sha256hex('different') });
  assert.equal(clsOther.classification, 'OLD_COMMITTED');
});

test('crash classification is total: intent without commit resumes or rolls back', () => {
  const dir = tmp();
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '{"v":1}\n');
  const intentPath = path.join(dir, '.state.json.r24-intent');
  fs.writeFileSync(intentPath, `${JSON.stringify({ target: 'state.json', sha256: sha256hex('{"v":2}\n') })}\n`);
  let cls = classifyWriteArtifacts(file);
  assert.equal(cls.classification, 'ROLLBACK_REQUIRED');
  const tmpSibling = path.join(dir, '.state.json.r24-tmp-1-abcdef');
  fs.writeFileSync(tmpSibling, '{"v":2}\n');
  cls = classifyWriteArtifacts(file);
  assert.equal(cls.classification, 'RESUMABLE_PREPARED');
  fs.writeFileSync(file, '{"v":2}\n');
  cls = classifyWriteArtifacts(file);
  assert.equal(cls.classification, 'NEW_COMMITTED');
  fs.unlinkSync(intentPath);
  fs.unlinkSync(tmpSibling);
  cls = classifyWriteArtifacts(file);
  assert.equal(cls.classification, 'OLD_OR_NEW_COMMITTED');
  fs.unlinkSync(file);
  cls = classifyWriteArtifacts(file);
  assert.equal(cls.classification, 'ROLLBACK_REQUIRED');
});
