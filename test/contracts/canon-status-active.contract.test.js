const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CANON_STATUS_PATH = path.join(
  process.cwd(),
  'docs/OPS/STATUS/CANON_STATUS.json',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractDocStatus(docText) {
  const match = /^STATUS:\s*([A-Z_ ]+)\s*$/mu.exec(String(docText || ''));
  assert.ok(match, 'STATUS line must exist in canonical document');
  return String(match[1] || '').trim();
}

test('canon status: ACTIVE_CANON record is present and synchronized with canonical doc header', () => {
  const statusDoc = readJson(CANON_STATUS_PATH);
  const canonicalDocPath = path.join(process.cwd(), String(statusDoc.canonicalDocPath || ''));
  assert.ok(fs.existsSync(canonicalDocPath), `canonical doc path must exist: ${statusDoc.canonicalDocPath}`);

  const canonicalDocText = fs.readFileSync(canonicalDocPath, 'utf8');
  const docStatus = extractDocStatus(canonicalDocText);

  assert.equal(statusDoc.status, 'ACTIVE_CANON');
  assert.equal(docStatus, 'ACTIVE_CANON');
  assert.equal(statusDoc.canonVersion, 'v3.13a-final');
  assert.match(String(statusDoc.upgradeDate || ''), /^\d{4}-\d{2}-\d{2}T/u);
  assert.match(String(statusDoc.upgradeCommitSha || ''), /^[0-9a-f]{40}$/u);
});

test('canon status: P0 closure pack is complete in upgrade record', () => {
  const statusDoc = readJson(CANON_STATUS_PATH);
  const closed = new Set(
    Array.isArray(statusDoc.p0PackClosed)
      ? statusDoc.p0PackClosed.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
  );

  for (const required of [
    'stage_axis_lock',
    'prompt_layer_single_source',
    'command_surface_bus_only',
    'failsignal_token_wiring',
    'dev_fast_lane',
  ]) {
    assert.equal(closed.has(required), true, `p0PackClosed missing ${required}`);
  }
});
