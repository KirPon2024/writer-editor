const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function phaseAtLeastM7(phase) {
  if (phase === 'DONE') return true;
  const match = /^M(\d+)$/u.exec(String(phase || ''));
  if (!match) return false;
  return Number(match[1]) >= 7;
}

test('M7 kickoff artifacts remain aligned for M7+ phases', () => {
  const sot = JSON.parse(fs.readFileSync('docs/OPS/STATUS/SECTOR_M.json', 'utf8'));
  const checksDoc = fs.readFileSync('docs/OPS/STATUS/SECTOR_M_CHECKS.md', 'utf8');

  assert.equal(phaseAtLeastM7(sot.phase), true, `phase must be M7+ for this test: ${sot.phase}`);
  assert.ok([
    'GO:SECTOR_M_M7_NEXT_DONE',
    'GO:SECTOR_M_M8_KICKOFF_DONE',
    'GO:SECTOR_M_M8_DONE',
    'GO:SECTOR_M_M8_NEXT_DONE',
    'GO:SECTOR_M_M9_KICKOFF_DONE',
    'GO:SECTOR_M_M9_CORE_DONE',
    'GO:SECTOR_M_M9_NEXT_DONE',
    'GO:SECTOR_M_M9_DONE',
    'GO:SECTOR_M_DONE',
  ].includes(sot.goTag));
  assert.ok(Array.isArray(sot.m7NextDeliverables));
  assert.ok(sot.m7NextDeliverables.includes('src/renderer/editor.js'));

  if (sot.phase === 'M8') {
    assert.ok(Array.isArray(sot.m8KickoffDeliverables));
    assert.ok(sot.m8KickoffDeliverables.includes('src/renderer/commands/flowMode.mjs'));
    assert.ok(checksDoc.includes('CHECK_M8_CORE'));
  }

  assert.ok(checksDoc.includes('CHECK_M7_FLOW_UX'));
  assert.ok(checksDoc.includes('CHECK_M7_NEXT'));
});
