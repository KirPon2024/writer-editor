import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifySourceBinding } from '../../source-binding.mjs';

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function makeTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-q0-sb-'));
  fs.mkdirSync(path.join(dir, 'bound'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bound', 'a.txt'), 'alpha\n');
  fs.writeFileSync(path.join(dir, 'bound', 'b.txt'), 'beta\n');
  return dir;
}

const manifestFor = (dir, extras = {}) => {
  const files = ['bound/a.txt', 'bound/b.txt'].map((rel) => ({ path: rel, sha256: sha(path.join(dir, rel)) }));
  const manifest = { schemaVersion: 'yalken.source-binding.v1', files, ...extras };
  const file = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest));
  return file;
};

test('exact binding passes and detects digest drift', () => {
  const dir = makeTree();
  const manifest = manifestFor(dir, { closedDirectories: ['bound'] });
  assert.equal(verifySourceBinding(dir, 'manifest.json').ok, true);
  fs.writeFileSync(path.join(dir, 'bound', 'a.txt'), 'tampered\n');
  const result = verifySourceBinding(dir, 'manifest.json');
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f === 'E_SOURCE_BINDING_DIGEST_DRIFT:bound/a.txt'));
});

test('missing declared file and extra undeclared file fail closed', () => {
  const dir = makeTree();
  manifestFor(dir, { closedDirectories: ['bound'] });
  fs.unlinkSync(path.join(dir, 'bound', 'b.txt'));
  let result = verifySourceBinding(dir, 'manifest.json');
  assert.ok(result.failures.some((f) => f === 'E_SOURCE_BINDING_MISSING:bound/b.txt'));
  const dir2 = makeTree();
  manifestFor(dir2, { closedDirectories: ['bound'] });
  fs.writeFileSync(path.join(dir2, 'bound', 'c.txt'), 'gamma\n');
  result = verifySourceBinding(dir2, 'manifest.json');
  assert.ok(result.failures.some((f) => f === 'E_SOURCE_BINDING_EXTRA:bound/c.txt'));
});

test('invalid entries and duplicate paths fail closed', () => {
  const dir = makeTree();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    schemaVersion: 'yalken.source-binding.v1',
    files: [
      { path: '../escape.txt', sha256: 'a'.repeat(64) },
      { path: 'bound/a.txt', sha256: 'not-a-digest' },
      { path: 'bound/a.txt', sha256: 'a'.repeat(64) },
    ],
  }));
  const result = verifySourceBinding(dir, 'manifest.json');
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_SOURCE_BINDING_PATH_INVALID')));
  assert.ok(result.failures.some((f) => f.startsWith('E_SOURCE_BINDING_DIGEST_INVALID')));
  assert.ok(result.failures.some((f) => f === 'E_SOURCE_BINDING_DUPLICATE:bound/a.txt'));
});
