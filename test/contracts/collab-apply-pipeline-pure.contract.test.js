const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const FILE_PATH = 'src/collab/applyEventLog.mjs';
const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:fs['"]/u,
  /from\s+['"]node:child_process['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]node:net['"]/u,
  /from\s+['"]electron['"]/u,
  /\bDate\.now\s*\(/u,
  /\bnew\s+Date\s*\(/u,
  /\bMath\.random\s*\(/u,
  /\bcrypto\.randomUUID\s*\(/u,
  /\bsetTimeout\s*\(/u,
  /\bsetInterval\s*\(/u,
  /\bperformance\.now\s*\(/u,
];

test('collab apply pipeline module is pure (no io/timers/random/network)', () => {
  const text = fs.readFileSync(FILE_PATH, 'utf8');
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.equal(pattern.test(text), false, `forbidden pattern in ${FILE_PATH}: ${pattern.source}`);
  }
});
