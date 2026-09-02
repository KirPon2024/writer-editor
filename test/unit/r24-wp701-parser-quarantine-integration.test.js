'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildZip, minimalOoxml } = require('../fixtures/r24-wp701-parser-quarantine-fixtures.js');

const loadParser = () => import('../../src/core/parser-quarantine-v1.mjs');
const loadIr = () => import('../../src/core/interchange-ir-v1.mjs');

function identity() {
  return { entityId: 'quarantine-001', generation: 1, projectId: 'project-001', sourceRevision: 'revision-701' };
}

test('WP701 admitted projection composes through the WP700 immutable IR envelope', async () => {
  const parser = await loadParser();
  const ir = await loadIr();
  const parsed = parser.inspectParserQuarantine({ bytes: minimalOoxml(), format: 'OOXML', budgets: {} });
  assert.equal(parsed.ok, true);
  const envelope = ir.createInterchangeIrEnvelope({ familyId: 'DOCUMENT', identity: identity(), payload: parsed.value });
  assert.equal(envelope.ok, true);
  const replay = ir.parseInterchangeIrEnvelope(envelope.bytes);
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.value.body.payload, parsed.value);
  assert.equal(replay.value.body.payload.schemaVersion, parser.PARSER_QUARANTINE_SCHEMA_VERSION);
  assert.equal(Object.isFrozen(replay.value), true);
});

test('WP701 physical local-file roundtrip preserves bytes without granting production file authority', async () => {
  const parser = await loadParser();
  const source = minimalOoxml();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp701-'));
  const file = path.join(directory, 'sample.docx');
  try {
    fs.writeFileSync(file, source, { flag: 'wx' });
    const physical = fs.readFileSync(file);
    assert.deepEqual(physical, source);
    const result = parser.inspectParserQuarantine({ bytes: physical, format: 'AUTO', budgets: {} });
    assert.equal(result.ok, true);
    assert.equal(result.value.input.byteLength, source.length);
    assert.equal(result.value.input.sha256.length, 64);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  const sourceText = fs.readFileSync(path.resolve(__dirname, '../../src/core/parser-quarantine-v1.mjs'), 'utf8');
  for (const forbidden of ["node:fs", 'fetch(', 'http.request', 'https.request', 'child_process', 'electron', 'projectStore', 'commandKernel']) {
    assert.equal(sourceText.includes(forbidden), false, forbidden);
  }
});

test('WP701 hostile corpus is deterministic and complete with no partial projection on rejection', async () => {
  const parser = await loadParser();
  const corpus = [
    { id: 'valid-ooxml', bytes: minimalOoxml(), format: 'OOXML', status: 'ADMITTED' },
    { id: 'valid-xml', bytes: Buffer.from('<root>café</root>'), format: 'XML', status: 'ADMITTED' },
    { id: 'dtd', bytes: Buffer.from('<!DOCTYPE x><x/>'), format: 'XML', status: 'REJECTED' },
    { id: 'nested', bytes: buildZip([{ name: 'nested.zip', data: 'x' }]), format: 'ZIP', status: 'REJECTED' },
    { id: 'external', bytes: minimalOoxml({ rootRels: '<Relationships><Relationship Id="r" Type="hyperlink" Target="https://private.invalid/token" TargetMode="External"/></Relationships>' }), format: 'OOXML', status: 'QUARANTINED' },
    { id: 'active-binary', bytes: minimalOoxml({ extra: [{ name: 'word/activeX/activeX1.bin', data: 'x' }] }), format: 'OOXML', status: 'QUARANTINED' },
  ];
  const first = corpus.map((fixture) => {
    const result = parser.inspectParserQuarantine({ bytes: fixture.bytes, format: fixture.format, budgets: {} });
    assert.equal(result.status, fixture.status, fixture.id);
    if (result.status !== 'ADMITTED') assert.equal(Object.hasOwn(result, 'value'), false, fixture.id);
    return { id: fixture.id, status: result.status, digest: result.sha256 ?? null, code: result.error?.code ?? null };
  });
  const second = corpus.map((fixture) => {
    const result = parser.inspectParserQuarantine({ bytes: Buffer.from(fixture.bytes), format: fixture.format, budgets: {} });
    return { id: fixture.id, status: result.status, digest: result.sha256 ?? null, code: result.error?.code ?? null };
  });
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(first).includes('private.invalid'), false);
});

test('WP701 quarantine loss ledger has a complete privacy-safe disposition denominator', async () => {
  const parser = await loadParser();
  const bytes = minimalOoxml({
    rootRels: '<Relationships><Relationship Id="r1" Type="attachedTemplate" Target="file:///Users/private/template.dotm" TargetMode="External"/></Relationships>',
    extra: [{ name: 'word/vbaProject.bin', data: 'macro' }],
  });
  const result = parser.inspectParserQuarantine({ bytes, format: 'OOXML', budgets: {} });
  assert.equal(result.status, 'QUARANTINED');
  assert.equal(result.report.partDenominator, 4);
  assert.equal(result.report.lossLedgerDenominator, result.report.lossLedger.length);
  assert.equal(result.report.lossLedgerDenominator, 3);
  assert.deepEqual(result.report.lossLedger.map((record) => record.disposition), ['QUARANTINED', 'QUARANTINED', 'QUARANTINED']);
  for (const record of result.report.lossLedger) {
    assert.deepEqual(Object.keys(record).sort(), ['code', 'disposition', 'partSha256']);
    assert.match(record.partSha256, /^[0-9a-f]{64}$/u);
  }
  assert.equal(JSON.stringify(result).includes('/Users/private'), false);
});

test('WP701 parser has zero project-state, renderer, effect, network or provider mutation exports', async () => {
  const parser = await loadParser();
  assert.deepEqual(Object.keys(parser).sort(), [
    'PARSER_QUARANTINE_INTERNALS_FOR_TEST',
    'PARSER_QUARANTINE_LIMITS',
    'PARSER_QUARANTINE_SCHEMA_VERSION',
    'inspectParserQuarantine',
  ]);
  const result = parser.inspectParserQuarantine({ bytes: Buffer.from('not a format'), format: 'AUTO', budgets: {} });
  assert.equal(result.error.code, 'E_PQ_FORMAT_UNRECOGNIZED');
  assert.equal(result.status, 'REJECTED');
});
