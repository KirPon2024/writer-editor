const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMENTS_HISTORY_DIR = path.join(process.cwd(), 'src', 'derived', 'commentsHistory');
const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:fs['"]/u,
  /from\s+['"]node:child_process['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]node:net['"]/u,
  /from\s+['"]electron['"]/u,
  /\bwriteFile(?:Sync)?\s*\(/u,
  /\bappendFile(?:Sync)?\s*\(/u,
  /\bmkdir(?:Sync)?\s*\(/u,
  /\brename(?:Sync)?\s*\(/u,
  /\bunlink(?:Sync)?\s*\(/u,
  /\brm(?:Sync)?\s*\(/u,
  /\blocalStorage\b/u,
  /\bsessionStorage\b/u,
  /\bindexedDB\b/u,
];

test('comments/history derived layer has no second SoT primitives or platform wiring', () => {
  const files = fs.readdirSync(COMMENTS_HISTORY_DIR).filter((entry) => entry.endsWith('.mjs')).sort();
  assert.deepEqual(files, ['deriveComments.mjs', 'deriveHistory.mjs', 'index.mjs']);
  for (const fileName of files) {
    const text = fs.readFileSync(path.join(COMMENTS_HISTORY_DIR, fileName), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(pattern.test(text), false, `forbidden pattern in ${fileName}: ${pattern.source}`);
    }
  }
});
