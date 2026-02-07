const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'guards', 'contour-c-c4-save-v1-proof.mjs');

test('contour-c c4 save v1 proof scenario passes', () => {
  const result = spawnSync(
    process.execPath,
    [SCRIPT],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^STEP_ID=SAVE_V1_MIN$/m);
  assert.match(result.stdout, /^SCENARIO_ID=SAVE_V1_ATOMIC_OVERWRITE$/m);
  assert.match(result.stdout, /^RESULT=PASS$/m);
});
