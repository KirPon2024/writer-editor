const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { aggregateInputs } = require('../fixtures/r24-wp801-pulse-ledger-fixtures.js');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wp801-mutant-'));

async function seeded() {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const dir = temp();
  const ledger = await openPulseLedger(dir);
  await ledger.appendReceipt({ idempotencyKey: 'mutant-seed', expectedSequence: 0, receipt: createPulseAggregateReceipt(aggregateInputs[0]) });
  return { dir, ledger, openPulseLedger };
}

const mutateFirst = (file, mutate) => {
  const rows = fs.readFileSync(file, 'utf8').trimEnd().split('\n').map(JSON.parse);
  mutate(rows[0]);
  fs.writeFileSync(file, `${rows.map(JSON.stringify).join('\n')}\n`);
};

for (const [label, target, mutation, code] of [
  ['sequence', 'ledger', (row) => { row.sequence = 2; }, 'E_WP801_LEDGER_CORRUPT'],
  ['previous digest', 'ledger', (row) => { row.previousEntryDigest = '1'.repeat(64); }, 'E_WP801_LEDGER_CHAIN'],
  ['entry digest', 'ledger', (row) => { row.entryDigest = '2'.repeat(64); }, 'E_WP801_LEDGER_ENTRY_DIGEST'],
  ['receipt digest', 'ledger', (row) => { row.receiptDigest = '3'.repeat(64); }, 'E_WP801_LEDGER_RECEIPT_DIGEST'],
  ['intent receipt', 'intents', (row) => { row.receipt.aggregates[0].value += 1; }, 'E_WP800_RECEIPT_DIGEST'],
  ['outbox entry', 'outbox', (row) => { row.entryDigest = '4'.repeat(64); }, 'E_WP801_OUTBOX_LOG_DIVERGENCE'],
]) {
  test(`WP801 rejects ${label} mutant`, async () => {
    const { dir, ledger, openPulseLedger } = await seeded();
    mutateFirst(ledger.paths[target], mutation);
    await assert.rejects(openPulseLedger(dir), new RegExp(code, 'u'));
  });
}

test('WP801 rejects missing canonical final LF instead of calling it a torn tail', async () => {
  const { dir, ledger, openPulseLedger } = await seeded();
  const content = fs.readFileSync(ledger.paths.ledger, 'utf8');
  fs.writeFileSync(ledger.paths.ledger, content.slice(0, -1));
  await assert.rejects(openPulseLedger(dir), /E_WP801_LEDGER_CORRUPT:missing-final-lf/u);
});

test('WP801 rejects a valid corrupt record in the middle', async () => {
  const { dir, ledger, openPulseLedger } = await seeded();
  const content = fs.readFileSync(ledger.paths.outbox, 'utf8');
  fs.writeFileSync(ledger.paths.outbox, `{\"bad\":true}\n${content}`);
  await assert.rejects(openPulseLedger(dir), /E_WP801_OUTBOX_LOG_CORRUPT/u);
});
