const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CANON_DOC_PATH = path.join(
  process.cwd(),
  'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.12.md',
);

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAnchorPaths(docText, sectionHeading) {
  const input = String(docText || '');
  const startRe = new RegExp(`^###\\s+${escapeRegExp(sectionHeading)}\\s*$`, 'm');
  const startMatch = startRe.exec(input);
  assert.ok(startMatch, `section not found: ${sectionHeading}`);

  const afterStart = input.slice(startMatch.index + startMatch[0].length);
  const nextHeadingMatch = /\n###\s+/u.exec(afterStart);
  const sectionBody = nextHeadingMatch
    ? afterStart.slice(0, nextHeadingMatch.index)
    : afterStart;

  const paths = [];
  const lineRe = /^\s*-\s+`([^`]+)`\s*$/gmu;
  let match = null;
  while ((match = lineRe.exec(sectionBody)) !== null) {
    const filePath = String(match[1] || '').trim();
    if (filePath) paths.push(filePath);
  }

  return paths;
}

function missingPaths(paths) {
  return paths.filter((filePath) => !fs.existsSync(path.join(process.cwd(), filePath)));
}

test('ssot anchor reality: all B1/B2 anchors from canon exist in repository', () => {
  const docText = fs.readFileSync(CANON_DOC_PATH, 'utf8');
  const b1 = extractAnchorPaths(docText, 'B1) ALWAYS_ON (SSOT ANCHORS)');
  const b2 = extractAnchorPaths(docText, 'B2) STAGE_GATED');

  assert.ok(b1.length > 0, 'B1 anchor list must not be empty');
  assert.ok(b2.length > 0, 'B2 anchor list must not be empty');

  const missing = missingPaths([...b1, ...b2]);
  assert.deepEqual(
    missing,
    [],
    `Missing SSOT anchor path(s): ${JSON.stringify(missing)}`,
  );
});

test('ssot anchor reality negative: validator fails when any declared anchor path is missing', () => {
  const mutated = [
    'docs/OPS/TOKENS/TOKEN_CATALOG.json',
    'docs/OPS/STATUS/__missing_anchor__.json',
  ];
  const missing = missingPaths(mutated);
  assert.ok(missing.length > 0, 'must detect missing anchor path');
  assert.ok(missing.includes('docs/OPS/STATUS/__missing_anchor__.json'));
});
