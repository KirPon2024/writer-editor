const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runPerf() {
  const result = spawnSync(process.execPath, ['scripts/ops/perf-run.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `perf-run failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

test('perf thresholds contract: thresholds schema is valid and perf-run stays under limits', () => {
  const thresholdsPath = path.join(process.cwd(), 'scripts', 'perf', 'perf-thresholds.json');
  const thresholdsDoc = JSON.parse(fs.readFileSync(thresholdsPath, 'utf8'));
  assert.equal(thresholdsDoc.schemaVersion, 'perf-thresholds.v1');
  assert.ok(thresholdsDoc.metrics && typeof thresholdsDoc.metrics === 'object');
  assert.ok(Number.isFinite(thresholdsDoc.metrics.command_dispatch_p95_ms) && thresholdsDoc.metrics.command_dispatch_p95_ms > 0);
  assert.ok(Number.isFinite(thresholdsDoc.metrics.open_median_ms) && thresholdsDoc.metrics.open_median_ms > 0);
  assert.ok(Number.isFinite(thresholdsDoc.metrics.save_median_ms) && thresholdsDoc.metrics.save_median_ms > 0);

  const run = runPerf();
  const metrics = run.metrics || {};
  const limits = run.thresholds || {};

  assert.equal(run.verdict, 'PASS');
  assert.ok(Number.isFinite(metrics.command_dispatch_p95_ms));
  assert.ok(Number.isFinite(metrics.open_median_ms));
  assert.ok(Number.isFinite(metrics.save_median_ms));
  assert.ok(Number.isFinite(limits.command_dispatch_p95_ms));
  assert.ok(Number.isFinite(limits.open_median_ms));
  assert.ok(Number.isFinite(limits.save_median_ms));
  assert.ok(metrics.command_dispatch_p95_ms <= limits.command_dispatch_p95_ms);
  assert.ok(metrics.open_median_ms <= limits.open_median_ms);
  assert.ok(metrics.save_median_ms <= limits.save_median_ms);
});
