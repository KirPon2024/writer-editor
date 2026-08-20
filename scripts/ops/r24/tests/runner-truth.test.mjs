import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTruthful, parseTapSummary } from '../runner-truth.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-runner-'));

const TAP_OK = 'TAP version 13\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const TAP_SKIP = 'TAP version 13\n# tests 3\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 2\n# todo 0\n';
const TAP_ZERO = 'TAP version 13\n# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('TAP summary parser handles both reporter forms', () => {
  const tap = parseTapSummary(TAP_OK);
  assert.equal(tap.pass, 2);
  assert.equal(tap.skipped, 0);
  const spec = parseTapSummary('ℹ pass 5\nℹ skipped 1\n');
  assert.equal(spec.pass, 5);
  assert.equal(spec.skipped, 1);
});

test('unnamed run is refused before execution', () => {
  assert.throws(() => runTruthful({ runId: '', cmd: 'true' }), (e) => e.code === 'E_RUNNER_TRUTH_UNNAMED');
});

test('passing command with clean TAP yields PASS receipt bound to repo', () => {
  const dir = tmp();
  const script = path.join(dir, 'ok.cjs');
  fs.writeFileSync(script, `console.log(${JSON.stringify(TAP_OK)});`);
  const { receipt } = runTruthful({ runId: 'RUN-OK', cmd: process.execPath, args: [script], cwd: dir });
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.executedDenominator, 2);
  assert.equal(receipt.tap.skipped, 0);
});

test('zero executed denominator fails closed', () => {
  const dir = tmp();
  const script = path.join(dir, 'zero.cjs');
  fs.writeFileSync(script, `console.log(${JSON.stringify(TAP_ZERO)});`);
  const { receipt } = runTruthful({ runId: 'RUN-ZERO', cmd: process.execPath, args: [script], cwd: dir });
  assert.equal(receipt.verdict, 'FAIL');
  assert.ok(receipt.failures.some((f) => f.startsWith('E_ZERO_DENOMINATOR')));
});

test('skipped evidence fails closed when failOnSkip', () => {
  const dir = tmp();
  const script = path.join(dir, 'skip.cjs');
  fs.writeFileSync(script, `console.log(${JSON.stringify(TAP_SKIP)});`);
  const { receipt } = runTruthful({ runId: 'RUN-SKIP', cmd: process.execPath, args: [script], cwd: dir });
  assert.equal(receipt.verdict, 'FAIL');
  assert.ok(receipt.failures.some((f) => f.startsWith('E_SKIPPED_EVIDENCE')));
  const allowed = runTruthful({ runId: 'RUN-SKIP-2', cmd: process.execPath, args: [script], cwd: dir, failOnSkip: false });
  assert.equal(allowed.receipt.verdict, 'PASS');
});

test('missing TAP summary fails closed when required', () => {
  const dir = tmp();
  const script = path.join(dir, 'notap.cjs');
  fs.writeFileSync(script, 'console.log("hello");');
  const { receipt } = runTruthful({ runId: 'RUN-NOTAP', cmd: process.execPath, args: [script], cwd: dir });
  assert.equal(receipt.verdict, 'FAIL');
  assert.ok(receipt.failures.includes('E_TAP_SUMMARY_MISSING'));
});

test('nonzero exit is recorded and fails the receipt', () => {
  const dir = tmp();
  const script = path.join(dir, 'boom.cjs');
  fs.writeFileSync(script, 'process.exit(3);');
  const { receipt } = runTruthful({ runId: 'RUN-BOOM', cmd: process.execPath, args: [script], cwd: dir, requireTap: false });
  assert.equal(receipt.exitCode, 3);
  assert.equal(receipt.verdict, 'FAIL');
  assert.ok(receipt.failures.includes('E_COMMAND_NONZERO_EXIT:3'));
});

test('artifact digests bind exact bytes; missing artifact fails closed', () => {
  const dir = tmp();
  const artifact = path.join(dir, 'artifact.json');
  fs.writeFileSync(artifact, '{"a":1}\n');
  const script = path.join(dir, 'ok.cjs');
  fs.writeFileSync(script, `console.log(${JSON.stringify(TAP_OK)});`);
  const { receipt } = runTruthful({ runId: 'RUN-ART', cmd: process.execPath, args: [script], cwd: dir, artifactPaths: ['artifact.json'] });
  assert.equal(receipt.verdict, 'PASS');
  assert.match(receipt.artifacts[0].sha256, /^[0-9a-f]{64}$/);
  const missing = runTruthful({ runId: 'RUN-ART-2', cmd: process.execPath, args: [script], cwd: dir, artifactPaths: ['nope.json'] });
  assert.equal(missing.receipt.verdict, 'FAIL');
  assert.ok(missing.receipt.failures.some((f) => f.startsWith('E_ARTIFACT_MISSING')));
});
