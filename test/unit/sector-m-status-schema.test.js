const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('SECTOR_M.json has valid schema fields for any sector phase', () => {
  const filePath = path.join(process.cwd(), 'docs', 'OPS', 'STATUS', 'SECTOR_M.json');
  assert.equal(fs.existsSync(filePath), true, 'SECTOR_M.json must exist');

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(parsed.schemaVersion, 'sector-m-status.v1');
  assert.ok(['NOT_STARTED', 'IN_PROGRESS', 'DONE'].includes(parsed.status), 'status domain mismatch');
  assert.ok(['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'DONE'].includes(parsed.phase), 'phase domain mismatch');
  assert.ok([
    '',
    'GO:SECTOR_M_M0_DONE',
    'GO:SECTOR_M_M1_DONE',
    'GO:SECTOR_M_M2_DONE',
    'GO:SECTOR_M_M3_DONE',
    'GO:SECTOR_M_M4_DONE',
    'GO:SECTOR_M_M5_DONE',
    'GO:SECTOR_M_M6_DONE',
    'GO:SECTOR_M_M7_DONE',
    'GO:SECTOR_M_M7_NEXT_DONE',
    'GO:SECTOR_M_M8_KICKOFF_DONE',
    'GO:SECTOR_M_M8_DONE',
    'GO:SECTOR_M_DONE',
  ].includes(parsed.goTag), 'goTag domain mismatch');
  assert.match(String(parsed.baselineSha || ''), /^[0-9a-f]{7,}$/i);
});
