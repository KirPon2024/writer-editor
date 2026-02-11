const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COLLAB_DIR = path.join(process.cwd(), 'src', 'collab');
const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:net['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]ws['"]/u,
  /from\s+['"]electron['"]/u,
  /\bWebSocket\b/u,
  /\bfetch\s*\(/u,
  /\bXMLHttpRequest\b/u,
  /from\s+['"][^'"]*\/core\/[^'"]*['"]/u,
  /from\s+['"][^'"]*\/renderer\/[^'"]*['"]/u,
];

test('collab infra has no network wiring and no core/renderer bypass imports', () => {
  const files = fs.readdirSync(COLLAB_DIR).filter((entry) => entry.endsWith('.mjs')).sort();
  assert.deepEqual(files, ['applyEventLog.mjs', 'conflictEnvelope.mjs', 'eventLog.mjs', 'index.mjs', 'mergePolicy.mjs', 'replayDeterminism.mjs']);
  for (const fileName of files) {
    const text = fs.readFileSync(path.join(COLLAB_DIR, fileName), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(pattern.test(text), false, `forbidden pattern in ${fileName}: ${pattern.source}`);
    }
  }
});
