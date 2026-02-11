const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DERIVED_DIR = path.join(process.cwd(), 'src', 'derived');
const FORBIDDEN_PATTERNS = [
  /\bwriteFile(?:Sync)?\s*\(/u,
  /\bappendFile(?:Sync)?\s*\(/u,
  /\bmkdir(?:Sync)?\s*\(/u,
  /\brename(?:Sync)?\s*\(/u,
  /\bunlink(?:Sync)?\s*\(/u,
  /\brm(?:Sync)?\s*\(/u,
  /\blocalStorage\b/u,
  /\bsessionStorage\b/u,
  /\bindexedDB\b/u,
  /from\s+['"]node:fs['"]/u,
];

function listDerivedFiles() {
  return fs.readdirSync(DERIVED_DIR)
    .filter((entry) => entry.endsWith('.mjs'))
    .sort();
}

test('derived views contract: no second SoT storage primitives', () => {
  for (const fileName of listDerivedFiles()) {
    assert.equal(/(model|store)\.[^/]+$/iu.test(fileName), false, `forbidden file name in derived layer: ${fileName}`);
    const text = fs.readFileSync(path.join(DERIVED_DIR, fileName), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(
        pattern.test(text),
        false,
        `forbidden second-SoT pattern in ${fileName}: ${pattern.source}`,
      );
    }
  }
});
