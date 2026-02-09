const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('M7 next kickoff keeps SoT and checks doc aligned', () => {
  const sot = JSON.parse(fs.readFileSync('docs/OPS/STATUS/SECTOR_M.json', 'utf8'));
  const checksDoc = fs.readFileSync('docs/OPS/STATUS/SECTOR_M_CHECKS.md', 'utf8');

  assert.equal(sot.phase, 'M7');
  assert.equal(sot.goTag, 'GO:SECTOR_M_M7_NEXT_DONE');
  assert.ok(Array.isArray(sot.m7NextDeliverables));
  assert.ok(sot.m7NextDeliverables.includes('src/renderer/editor.js'));

  assert.ok(checksDoc.includes('CHECK_M7_FLOW_UX'));
  assert.ok(checksDoc.includes('CHECK_M7_NEXT'));
});
