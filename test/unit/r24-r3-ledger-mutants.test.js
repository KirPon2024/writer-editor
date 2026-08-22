'use strict';

// R2.4 R3 implementation mutation suite for the recovery ledger law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'recovery-ledger-v1.cjs');

const MUTANTS = [
  {
    id: 'seq-fence-removed',
    find: "  if (entry.seq !== expectedSeq) throw new RecoveryLedgerError('E_LEDGER_SEQ_REGRESSION', `seq=${entry.seq} expected=${expectedSeq}`);",
    replace: "  if (false) { throw new RecoveryLedgerError('E_LEDGER_SEQ_REGRESSION', `seq=${entry.seq} expected=${expectedSeq}`); }",
  },
  {
    id: 'chain-check-removed',
    find: "  if (entry.prevDigest !== prevDigest) throw new RecoveryLedgerError('E_LEDGER_CHAIN_MISMATCH', `seq=${entry.seq}`);",
    replace: "  if (false) { throw new RecoveryLedgerError('E_LEDGER_CHAIN_MISMATCH', `seq=${entry.seq}`); }",
  },
  {
    id: 'digest-check-removed',
    find: "  if (entryDigest(entry) !== entry.digest) throw new RecoveryLedgerError('E_LEDGER_DIGEST_MISMATCH', `seq=${entry.seq}`);",
    replace: "  if (false) { throw new RecoveryLedgerError('E_LEDGER_DIGEST_MISMATCH', `seq=${entry.seq}`); }",
  },
  {
    id: 'bound-check-removed',
    find: "      if (state.entries.length >= state.maxEntries) {\n        throw new RecoveryLedgerError('E_LEDGER_COMPACTION_REQUIRED', `${state.entries.length}>=${state.maxEntries}`);\n      }",
    replace: "      if (false) {\n        throw new RecoveryLedgerError('E_LEDGER_COMPACTION_REQUIRED', `${state.entries.length}>=${state.maxEntries}`);\n      }",
  },
  {
    id: 'torn-tail-not-truncated',
    find: '  if (tornTail) {\n    await durableSaveTransaction({ filePath: ledgerPath, content: serializeEntries(entries) });\n  }',
    replace: '  if (false) {\n    await durableSaveTransaction({ filePath: ledgerPath, content: serializeEntries(entries) });\n  }',
  },
];

async function killOracle(module) {
  const {
    LEDGER_BASENAME,
    RecoveryLedgerError,
    openRecoveryLedger,
    parseLedgerText,
  } = module;
  const crypto = require('node:crypto');

  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r3m-')));
  const ledger = await openRecoveryLedger(dir, { maxEntries: 8 });
  await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 1 });
  const second = await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 2 });
  assert.equal(second.seq, 2);

  // Sequence fence: a replayed or out-of-order entry on disk is refused.
  const ledgerPath = path.join(dir, LEDGER_BASENAME);
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
  const dup = JSON.parse(lines[1]);
  lines.push(JSON.stringify(dup));
  const dupParsed = parseLedgerText(`${lines.join('\n')}\n`);
  assert.equal(dupParsed.entries.length, 2, 'a duplicated entry breaks the chain at its position');
  assert.equal(dupParsed.tornTail, true);

  // Sequence fence: a seq-skipped entry with an otherwise valid chain link
  // is refused — only the fence catches this shape.
  const skipped = JSON.parse(lines[1]);
  skipped.seq = 7;
  skipped.prevDigest = JSON.parse(lines[1]).digest;
  skipped.digest = crypto.createHash('sha256').update(JSON.stringify({ seq: skipped.seq, kind: skipped.kind, subject: skipped.subject, revision: skipped.revision, prevDigest: skipped.prevDigest, payload: skipped.payload ?? null }), 'utf8').digest('hex');
  const skippedParsed = parseLedgerText(`${[lines[0], lines[1]].join('\n')}\n${JSON.stringify(skipped)}\n`);
  assert.equal(skippedParsed.entries.length, 2, 'a seq-skipped entry is refused by the fence');
  assert.equal(skippedParsed.tornTail, true);

  // Chain law: a rewritten prevDigest is a mismatch.
  const tampered = JSON.parse(lines[1]);
  tampered.prevDigest = 'f'.repeat(64);
  const tamperedDigest = crypto.createHash('sha256').update(JSON.stringify({ seq: tampered.seq, kind: tampered.kind, subject: tampered.subject, revision: tampered.revision, prevDigest: tampered.prevDigest, payload: tampered.payload ?? null }), 'utf8').digest('hex');
  tampered.digest = tamperedDigest;
  const tamperParsed = parseLedgerText(`${lines[0]}\n${JSON.stringify(tampered)}\n`);
  assert.equal(tamperParsed.entries.length, 1);
  assert.equal(tamperParsed.tornTail, true);

  // Digest law: a payload tamper without recomputation is caught.
  const payloadTampered = JSON.parse(lines[0]);
  payloadTampered.revision = 99;
  const payloadParsed = parseLedgerText(`${JSON.stringify(payloadTampered)}\n`);
  assert.equal(payloadParsed.entries.length, 0);
  assert.equal(payloadParsed.tornTail, true);

  // Bound law: compaction required, then continuation.
  for (let i = 3; i <= 8; i += 1) {
    await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: i });
  }
  await assert.rejects(ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 9 }), (e) => e.code === 'E_LEDGER_COMPACTION_REQUIRED');
  await ledger.compact();
  const continued = await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 9 });
  assert.equal(continued.seq, 2);

  // Torn-tail truncation on open.
  fs.appendFileSync(ledgerPath, '{"seq":3,"kind":"scene.commit"');
  const reopened = await openRecoveryLedger(dir);
  assert.equal(reopened.tornTailTruncated, true);
  const onDisk = parseLedgerText(fs.readFileSync(ledgerPath, 'utf8'));
  assert.equal(onDisk.tornTail, false, 'the rewrite removed the torn bytes');
}

test('R3 recovery ledger: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r3-mutant-'));
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'),
      path.join(dir, 'save-coordinator-v1.cjs'),
    );
    const target = path.join(dir, 'recovery-ledger-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      await killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_R3_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
