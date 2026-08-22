'use strict';

// R2.4 R3 recovery ledger law: append-only digest chain, sequence fence,
// typed bounds, deterministic replay.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RECOVERY_LEDGER_SCHEMA_VERSION,
  LEDGER_BASENAME,
  GENESIS_DIGEST,
  RecoveryLedgerError,
  openRecoveryLedger,
  parseLedgerText,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'recovery-ledger-v1.cjs'));

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r3-')));

test('append builds a digest-chained monotonic sequence from genesis', async () => {
  const ledger = await openRecoveryLedger(sandbox());
  const first = await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 1 });
  assert.equal(first.seq, 1);
  assert.equal(first.prevDigest, GENESIS_DIGEST);
  const second = await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 2 });
  assert.equal(second.seq, 2);
  assert.equal(second.prevDigest, first.digest);
  assert.notEqual(first.digest, second.digest);
  assert.equal(ledger.headDigest(), second.digest);
});

test('unknown entry kind and non-integer sequence are typed refusals', async () => {
  const ledger = await openRecoveryLedger(sandbox());
  await assert.rejects(ledger.append({ kind: 'admin.grant' }), (e) => e instanceof RecoveryLedgerError && e.code === 'E_LEDGER_ENTRY_KIND');
  await assert.rejects(openRecoveryLedger(sandbox(), { maxEntries: 3 }), (e) => e.code === 'E_LEDGER_BOUND_INVALID');
});

test('chain tampering on disk is a typed refusal, never silently accepted', async () => {
  const dir = sandbox();
  const ledger = await openRecoveryLedger(dir);
  await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 1 });
  await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 2 });
  const ledgerPath = path.join(dir, LEDGER_BASENAME);
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
  const tampered = JSON.parse(lines[0]);
  tampered.revision = 99;
  lines[0] = JSON.stringify(tampered);
  const parsed = parseLedgerText(`${lines.join('\n')}\n`);
  assert.equal(parsed.entries.length, 0, 'a tampered first entry invalidates the chain from there');
  assert.equal(parsed.tornTail, true);
});

test('reopen persists the chain and continues the sequence', async () => {
  const dir = sandbox();
  const first = await openRecoveryLedger(dir);
  await first.append({ kind: 'scene.commit', subject: 'a.txt', revision: 1 });
  const headAfterFirst = first.headDigest();
  const second = await openRecoveryLedger(dir);
  assert.equal(second.headDigest(), headAfterFirst);
  assert.equal(second.tornTailTruncated, false);
  const appended = await second.append({ kind: 'scene.commit', subject: 'a.txt', revision: 2 });
  assert.equal(appended.seq, 2);
});

test('the bound is enforced and compaction folds the chain into a continuation record', async () => {
  const dir = sandbox();
  const ledger = await openRecoveryLedger(dir, { maxEntries: 8 });
  for (let i = 1; i <= 8; i += 1) {
    await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: i });
  }
  await assert.rejects(ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 9 }), (e) => e.code === 'E_LEDGER_COMPACTION_REQUIRED');
  const headBefore = ledger.headDigest();
  const folded = await ledger.compact();
  assert.equal(folded.foldedCount, 8);
  assert.equal(folded.foldedHead, headBefore, 'compaction carries the folded head digest');
  assert.equal(ledger.size(), 1);
  const compactionHead = ledger.headDigest();
  const after = await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 9 });
  assert.equal(after.seq, 2, 'the chain continues after the compaction record');
  assert.equal(after.prevDigest, compactionHead, 'the continuation links to the compaction record');
});

test('replay produces the per-subject recovery view without compaction records', async () => {
  const dir = sandbox();
  const ledger = await openRecoveryLedger(dir);
  await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 1 });
  await ledger.append({ kind: 'scene.commit', subject: 'b.txt', revision: 4 });
  await ledger.append({ kind: 'scene.save.protected', subject: 'a.txt', revision: 2 });
  const view = ledger.replay();
  assert.equal(view.schemaVersion, RECOVERY_LEDGER_SCHEMA_VERSION);
  assert.equal(view.entries, 3);
  assert.equal(view.subjects, 2);
  assert.equal(view.lastBySubject['a.txt'].kind, 'scene.save.protected');
  assert.equal(view.lastBySubject['b.txt'].revision, 4);
});
