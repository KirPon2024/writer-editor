const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMENTS_HISTORY_DIR = path.join(process.cwd(), 'src', 'derived', 'commentsHistory');
const FORBIDDEN_PATTERNS = [
  /from\s+['"][^'"]*\/(?:io|recovery)[^'"]*['"]/u,
  /\bbackupManager\b/u,
  /\brecovery\b/u,
];

test('comments/history derived layer is recovery-safe and does not depend on IO side effects', () => {
  const files = fs.readdirSync(COMMENTS_HISTORY_DIR).filter((entry) => entry.endsWith('.mjs')).sort();
  assert.deepEqual(files, ['deriveComments.mjs', 'deriveHistory.mjs', 'index.mjs']);
  for (const fileName of files) {
    const text = fs.readFileSync(path.join(COMMENTS_HISTORY_DIR, fileName), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(pattern.test(text), false, `forbidden recovery/io dependency in ${fileName}: ${pattern.source}`);
    }
  }
});
