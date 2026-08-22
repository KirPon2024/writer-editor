'use strict';

// R2.4 R3 — the selected bounded durable recovery ledger.
// Append-only, digest-chained entries with a monotonic sequence fence; a
// torn tail is truncated on open, never silently read; growth is bounded
// by a typed compaction law; replay produces the recovery view. The ledger
// is derived recovery evidence: the atomic commit marker remains the
// commit truth, and a ledger failure after ACK never fails a commit.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { durableSaveTransaction } = require('./save-coordinator-v1.cjs');

const RECOVERY_LEDGER_SCHEMA_VERSION = 'yalken.recoveryLedger.v1';
const LEDGER_BASENAME = 'recovery-ledger.v1.jsonl';
const GENESIS_DIGEST = '0'.repeat(64);
const DEFAULT_MAX_ENTRIES = 512;

const LEDGER_ENTRY_KINDS = Object.freeze([
  'scene.commit',
  'scene.save.protected',
  'scene.save.at_risk',
  'ledger.compaction',
]);

class RecoveryLedgerError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const sha256hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function entryDigest(entry) {
  const { seq, kind, subject, revision, prevDigest, payload } = entry;
  return sha256hex(Buffer.from(JSON.stringify({ seq, kind, subject, revision, prevDigest, payload }), 'utf8'));
}

function normalizeEntry(entry, expectedSeq, prevDigest) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new RecoveryLedgerError('E_LEDGER_ENTRY_SHAPE');
  if (!LEDGER_ENTRY_KINDS.includes(entry.kind)) throw new RecoveryLedgerError('E_LEDGER_ENTRY_KIND', String(entry.kind));
  if (entry.seq !== expectedSeq) throw new RecoveryLedgerError('E_LEDGER_SEQ_REGRESSION', `seq=${entry.seq} expected=${expectedSeq}`);
  if (entry.prevDigest !== prevDigest) throw new RecoveryLedgerError('E_LEDGER_CHAIN_MISMATCH', `seq=${entry.seq}`);
  if (entryDigest(entry) !== entry.digest) throw new RecoveryLedgerError('E_LEDGER_DIGEST_MISMATCH', `seq=${entry.seq}`);
  return entry;
}

// Parse the raw ledger text into validated entries; the first invalid line
// is the torn tail: recovery truncates there, and the torn bytes are
// reported, never silently absorbed.
function parseLedgerText(raw) {
  const entries = [];
  let expectedSeq = 1;
  let prevDigest = GENESIS_DIGEST;
  let tornTail = false;
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    let parsed = null;
    try { parsed = JSON.parse(line); } catch { parsed = null; }
    try {
      entries.push(normalizeEntry(parsed, expectedSeq, prevDigest));
    } catch {
      tornTail = true;
      break;
    }
    prevDigest = entries[entries.length - 1].digest;
    expectedSeq += 1;
  }
  return { entries, tornTail };
}

function readLedgerFile(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return { entries: [], tornTail: false };
  return parseLedgerText(fs.readFileSync(ledgerPath, 'utf8'));
}

function serializeEntries(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length > 0 ? '\n' : '');
}

// Open the ledger, truncating a torn tail atomically (via the P2 durable
// transaction so the truncation itself is crash-safe).
async function openRecoveryLedger(dir, { maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 8) throw new RecoveryLedgerError('E_LEDGER_BOUND_INVALID', String(maxEntries));
  fs.mkdirSync(dir, { recursive: true });
  const ledgerPath = path.join(dir, LEDGER_BASENAME);
  const { entries, tornTail } = readLedgerFile(ledgerPath);
  if (tornTail) {
    await durableSaveTransaction({ filePath: ledgerPath, content: serializeEntries(entries) });
  }

  const state = { entries, maxEntries };
  return Object.freeze({
    ledgerPath,
    tornTailTruncated: tornTail,
    size: () => state.entries.length,
    headDigest: () => (state.entries.length > 0 ? state.entries[state.entries.length - 1].digest : GENESIS_DIGEST),

    async append({ kind, subject = '', revision = null, payload = null }) {
      if (!LEDGER_ENTRY_KINDS.includes(kind)) throw new RecoveryLedgerError('E_LEDGER_ENTRY_KIND', String(kind));
      if (state.entries.length >= state.maxEntries) {
        throw new RecoveryLedgerError('E_LEDGER_COMPACTION_REQUIRED', `${state.entries.length}>=${state.maxEntries}`);
      }
      const entry = {
        seq: state.entries.length + 1,
        kind,
        subject: typeof subject === 'string' ? subject : '',
        revision: Number.isInteger(revision) ? revision : null,
        prevDigest: state.entries.length > 0 ? state.entries[state.entries.length - 1].digest : GENESIS_DIGEST,
        payload,
      };
      entry.digest = entryDigest(entry);
      // Atomic append: rewrite via the durable transaction; the ledger is
      // bounded so a full rewrite stays cheap and crash-safe.
      const nextEntries = [...state.entries, entry];
      await durableSaveTransaction({ filePath: ledgerPath, content: serializeEntries(nextEntries), revision: entry.seq });
      state.entries = nextEntries;
      return Object.freeze({ ...entry });
    },

    // Typed compaction: fold all entries into one compaction record with
    // the folded head digest carried as payload, then continue the chain.
    async compact() {
      if (state.entries.length === 0) throw new RecoveryLedgerError('E_LEDGER_COMPACTION_EMPTY');
      const foldedHead = state.entries[state.entries.length - 1].digest;
      const foldedCount = state.entries.length;
      const compaction = {
        seq: 1,
        kind: 'ledger.compaction',
        subject: 'ledger',
        revision: null,
        prevDigest: GENESIS_DIGEST,
        payload: { foldedHead, foldedCount },
      };
      compaction.digest = entryDigest(compaction);
      await durableSaveTransaction({ filePath: ledgerPath, content: serializeEntries([compaction]), revision: 1 });
      state.entries = [compaction];
      return Object.freeze({ foldedHead, foldedCount });
    },

    replay() {
      const bySubject = new Map();
      for (const entry of state.entries) {
        if (entry.kind === 'ledger.compaction') continue;
        bySubject.set(entry.subject, entry);
      }
      const lastBySubject = {};
      for (const [subject, entry] of bySubject) {
        lastBySubject[subject] = Object.freeze({ seq: entry.seq, kind: entry.kind, revision: entry.revision });
      }
      return Object.freeze({
        schemaVersion: RECOVERY_LEDGER_SCHEMA_VERSION,
        entries: state.entries.length,
        subjects: bySubject.size,
        lastBySubject: Object.freeze(lastBySubject),
        headDigest: state.entries.length > 0 ? state.entries[state.entries.length - 1].digest : GENESIS_DIGEST,
      });
    },
  });
}

module.exports = Object.freeze({
  RECOVERY_LEDGER_SCHEMA_VERSION,
  LEDGER_BASENAME,
  LEDGER_ENTRY_KINDS,
  GENESIS_DIGEST,
  RecoveryLedgerError,
  openRecoveryLedger,
  parseLedgerText,
});
