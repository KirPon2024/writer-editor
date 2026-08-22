'use strict';

// R2.4 R3 ledger physics and the P3 commit adoption: torn-tail recovery on
// real disk, and a post-ACK ledger failure typed and visible, never a
// hidden commit failure.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LEDGER_BASENAME,
  openRecoveryLedger,
  parseLedgerText,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'recovery-ledger-v1.cjs'));
const { commitProjectTextAndManifest } = require(path.join(__dirname, '..', '..', 'src', 'core', 'project-commit-v1.cjs'));

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r3p-')));

test('torn tail on disk is truncated on open and never read', async () => {
  const dir = sandbox();
  const ledger = await openRecoveryLedger(dir);
  await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 1 });
  await ledger.append({ kind: 'scene.commit', subject: 'a.txt', revision: 2 });
  const ledgerPath = path.join(dir, LEDGER_BASENAME);
  fs.appendFileSync(ledgerPath, '{"seq":3,"kind":"scene.commit","subj');
  const reopened = await openRecoveryLedger(dir);
  assert.equal(reopened.tornTailTruncated, true, 'the torn tail is reported');
  assert.equal(reopened.size(), 2, 'the torn entry is discarded');
  const onDisk = parseLedgerText(fs.readFileSync(ledgerPath, 'utf8'));
  assert.equal(onDisk.entries.length, 2);
  assert.equal(onDisk.tornTail, false, 'the rewrite removed the torn bytes');
  const continued = await reopened.append({ kind: 'scene.commit', subject: 'a.txt', revision: 3 });
  assert.equal(continued.seq, 3, 'the chain continues cleanly after truncation');
});

test('corrupted middle entry invalidates the chain from that point, never silently skipped', () => {
  const dir = sandbox();
  const ledgerPath = path.join(dir, LEDGER_BASENAME);
  fs.mkdirSync(dir, { recursive: true });
  const good1 = JSON.stringify({ seq: 1, kind: 'scene.commit', subject: 'a', revision: 1, prevDigest: '0'.repeat(64), payload: null });
  const crypto = require('node:crypto');
  const d1 = crypto.createHash('sha256').update(JSON.stringify({ seq: 1, kind: 'scene.commit', subject: 'a', revision: 1, prevDigest: '0'.repeat(64), payload: null }), 'utf8').digest('hex');
  const forged = JSON.parse(good1);
  forged.digest = d1;
  const garbage = '{"seq":2,"kind":"scene.commit","subject":"a","revision":2,"prevDigest":"' + d1 + '","payload":null,"digest":"deadbeef"}';
  fs.writeFileSync(ledgerPath, `${JSON.stringify(forged)}\n${garbage}\n`);
  const parsed = parseLedgerText(fs.readFileSync(ledgerPath, 'utf8'));
  assert.equal(parsed.entries.length, 1, 'the valid prefix survives');
  assert.equal(parsed.tornTail, true, 'the corrupted entry is a typed truncation point');
});

test('P3 adoption: a commit with a ledger records the entry after ACK', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const ledger = await openRecoveryLedger(dir);
  const result = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
    recoveryLedger: ledger,
  });
  assert.equal(result.success, true);
  assert.ok(result.ledgerRecord, 'the commit record lands in the ledger');
  assert.equal(result.ledgerRecord.seq, 1);
  assert.equal(result.ledgerError, null);
  const view = ledger.replay();
  assert.equal(view.lastBySubject['scene.txt'].revision, 1);
});

test('P3 adoption: a failing ledger never fails or hides a landed commit', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const brokenLedger = {
    async append() { throw new Error('disk full simulation'); },
  };
  const result = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
    recoveryLedger: brokenLedger,
  });
  assert.equal(result.success, true, 'the commit succeeded');
  assert.equal(result.ledgerRecord, null);
  assert.ok(result.ledgerError, 'the ledger failure is typed and visible in the result');
  assert.equal(result.ledgerError.code, 'E_LEDGER_APPEND_FAILED');
  const marker = JSON.parse(fs.readFileSync(`${scenePath}.commit.json`, 'utf8'));
  assert.equal(marker.revision, 1, 'the commit marker landed despite the ledger failure');
});

test('P3 adoption: no ledger attached means no ledger fields claimed', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const result = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
  });
  assert.equal(result.success, true);
  assert.equal(result.ledgerRecord, null);
  assert.equal(result.ledgerError, null);
});
