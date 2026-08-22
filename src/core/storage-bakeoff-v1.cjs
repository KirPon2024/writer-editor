'use strict';

// R2.4 R2 — storage candidate bakeoff under the owner-approved
// STORAGE_AUTHORITY_ADR. Four candidates are compared only after hard
// safety filters and without adopting any dependency. Every evaluation
// runs in a disposable sandbox directory; the live storage path is never
// touched. The dossier is deterministic and selection-free: WP-203 selects.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { durableSaveTransaction, classifySaveArtifacts } = require('./save-coordinator-v1.cjs');

const STORAGE_BAKEOFF_SCHEMA_VERSION = 'yalken.storageBakeoff.v1';

class StorageBakeoffError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const sha256hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// --- Candidate sandbox models -------------------------------------------

// atomic-file: the live P2 durable transaction per scene file.
function createAtomicFileModel(dir) {
  const file = path.join(dir, 'scene.txt');
  let bytesWritten = 0;
  return {
    async write(revision, payload, { crashBeforeCommit = false } = {}) {
      bytesWritten += Buffer.byteLength(payload, 'utf8');
      if (crashBeforeCommit) {
        // Partial publication physics: the temp file exists, the rename
        // never happened — a crash between TEMP_WRITE and ATOMIC_PUBLISH.
        const tempPath = `${file}.p2-crash.tmp`;
        fs.writeFileSync(tempPath, payload);
        throw new StorageBakeoffError('E_SIMULATED_CRASH', `rev=${revision}`);
      }
      await durableSaveTransaction({ filePath: file, content: payload, revision });
    },
    async recover() {
      const artifacts = classifySaveArtifacts(file);
      const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const complete = content === '' || /^rev:\d+$/u.test(content);
      return {
        tornStateDetected: !complete,
        classification: artifacts.classification,
        residueFiles: artifacts.leftovers.length,
        recoveredRevision: complete && content ? Number(content.slice(4)) : 0,
        readable: complete,
      };
    },
    async readBack() {
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    },
    metrics: () => ({ bytesWritten }),
  };
}

// append-ledger: JSONL log with per-entry digest and monotonic revision.
function createAppendLedgerModel(dir) {
  const ledger = path.join(dir, 'journal.log');
  let bytesWritten = 0;
  let lastRevision = 0;
  const encode = (record) => `${JSON.stringify(record)}\n`;
  return {
    async write(revision, payload, { crashBeforeCommit = false } = {}) {
      if (revision <= lastRevision) throw new StorageBakeoffError('E_LEDGER_FENCE_REGRESSION', `${revision}<=${lastRevision}`);
      const body = { revision, payload };
      const entry = { ...body, digest: sha256hex(Buffer.from(JSON.stringify(body), 'utf8')) };
      const encoded = encode(entry);
      bytesWritten += Buffer.byteLength(encoded, 'utf8');
      if (crashBeforeCommit) {
        // Torn tail: only part of the entry reaches disk.
        fs.appendFileSync(ledger, encoded.slice(0, Math.max(1, Math.floor(encoded.length / 2))));
        throw new StorageBakeoffError('E_SIMULATED_CRASH', `rev=${revision}`);
      }
      fs.appendFileSync(ledger, encoded);
      lastRevision = revision;
    },
    async recover() {
      if (!fs.existsSync(ledger)) return { tornStateDetected: false, recoveredRevision: 0, readable: true, truncatedTail: false };
      const raw = fs.readFileSync(ledger, 'utf8');
      const lines = raw.split('\n');
      let recoveredRevision = 0;
      let truncatedTail = false;
      let tornStateDetected = false;
      const complete = [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === '') continue;
        let entry = null;
        try { entry = JSON.parse(line); } catch { entry = null; }
        const valid = entry
          && Number.isInteger(entry.revision)
          && typeof entry.payload === 'string'
          && entry.digest === sha256hex(Buffer.from(JSON.stringify({ revision: entry.revision, payload: entry.payload }), 'utf8'))
          && entry.revision > recoveredRevision;
        if (valid) {
          complete.push(entry);
          recoveredRevision = entry.revision;
          continue;
        }
        // First invalid line is the torn tail: truncate there; anything
        // after a torn tail is unreachable garbage, never silently read.
        tornStateDetected = true;
        truncatedTail = true;
        break;
      }
      return { tornStateDetected, recoveredRevision, readable: true, truncatedTail, entries: complete.length };
    },
    async readBack() {
      const rec = await this.recover();
      return `rev:${rec.recoveredRevision}`;
    },
    metrics: () => ({ bytesWritten, ledgerBytes: fs.existsSync(ledger) ? fs.statSync(ledger).size : 0 }),
  };
}

// hybrid: journal for intent, atomic manifest snapshot for truth.
function createHybridModel(dir) {
  const manifest = path.join(dir, 'manifest.json');
  const journal = path.join(dir, 'journal.log');
  let bytesWritten = 0;
  return {
    async write(revision, payload, { crashBeforeCommit = false } = {}) {
      const intent = `${JSON.stringify({ revision })}\n`;
      fs.appendFileSync(journal, intent);
      bytesWritten += Buffer.byteLength(intent, 'utf8') + Buffer.byteLength(payload, 'utf8');
      if (crashBeforeCommit) {
        throw new StorageBakeoffError('E_SIMULATED_CRASH', `rev=${revision}`);
      }
      const snapshot = JSON.stringify({ revision, payload });
      await durableSaveTransaction({ filePath: manifest, content: snapshot, revision });
    },
    async recover() {
      if (!fs.existsSync(manifest)) return { tornStateDetected: false, recoveredRevision: 0, readable: true };
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const journalRevisions = fs.existsSync(journal)
        ? fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).revision)
        : [];
      const journalAhead = journalRevisions.filter((rev) => rev > parsed.revision);
      return {
        tornStateDetected: false,
        recoveredRevision: parsed.revision,
        readable: true,
        journalAheadCount: journalAhead.length,
        replayable: journalAhead.length > 0,
      };
    },
    async readBack() {
      if (!fs.existsSync(manifest)) return '';
      return `rev:${JSON.parse(fs.readFileSync(manifest, 'utf8')).revision}`;
    },
    metrics: () => ({ bytesWritten }),
  };
}

// --- Registry, filters, benchmark, dossier --------------------------------

const CANDIDATE_REGISTRY = Object.freeze({
  'atomic-file': Object.freeze({
    id: 'atomic-file',
    requiresDependency: false,
    requiresNetwork: false,
    destructiveMigration: false,
    model: createAtomicFileModel,
  }),
  'append-ledger': Object.freeze({
    id: 'append-ledger',
    requiresDependency: false,
    requiresNetwork: false,
    destructiveMigration: false,
    model: createAppendLedgerModel,
  }),
  sqlite: Object.freeze({
    id: 'sqlite',
    requiresDependency: true,
    requiresNetwork: false,
    destructiveMigration: false,
    model: null,
  }),
  hybrid: Object.freeze({
    id: 'hybrid',
    requiresDependency: false,
    requiresNetwork: false,
    destructiveMigration: false,
    model: createHybridModel,
  }),
});

// Hard safety filters run before any benchmark. Elimination is typed and
// recorded; it is evidence, not an error path.
function applyHardSafetyFilters(candidate) {
  if (!candidate || typeof candidate !== 'object') throw new StorageBakeoffError('E_CANDIDATE_SHAPE');
  if (candidate.requiresDependency) {
    return Object.freeze({ admitted: false, code: 'E_CANDIDATE_DEPENDENCY', candidateId: candidate.id });
  }
  if (candidate.requiresNetwork) {
    return Object.freeze({ admitted: false, code: 'E_CANDIDATE_NETWORK', candidateId: candidate.id });
  }
  if (candidate.destructiveMigration) {
    return Object.freeze({ admitted: false, code: 'E_CANDIDATE_DESTRUCTIVE', candidateId: candidate.id });
  }
  if (typeof candidate.model !== 'function') {
    return Object.freeze({ admitted: false, code: 'E_CANDIDATE_NO_MODEL', candidateId: candidate.id });
  }
  return Object.freeze({ admitted: true, code: '', candidateId: candidate.id });
}

// The deterministic operation sequence: 8 writes, crash after revision 5's
// commit and a crashing 6th write, then recovery. Identical per candidate.
async function runCandidateBenchmark(candidate, sandboxDir) {
  const admission = applyHardSafetyFilters(candidate);
  if (!admission.admitted) {
    return Object.freeze({ candidateId: candidate.id, admitted: false, filterCode: admission.code });
  }
  const dir = path.join(sandboxDir, candidate.id);
  fs.mkdirSync(dir, { recursive: true });
  const model = candidate.model(dir);
  let crashSeen = false;
  for (let revision = 1; revision <= 8; revision += 1) {
    const crashing = revision === 6;
    try {
      await model.write(revision, `rev:${revision}`, { crashBeforeCommit: crashing });
    } catch (error) {
      if (error instanceof StorageBakeoffError && error.code === 'E_SIMULATED_CRASH' && crashing) {
        crashSeen = true;
        continue;
      }
      throw error;
    }
  }
  if (!crashSeen) throw new StorageBakeoffError('E_BENCHMARK_CRASH_NOT_INJECTED', candidate.id);
  const recovery = await model.recover();
  const readBack = await model.readBack();
  const metrics = model.metrics();
  return Object.freeze({
    candidateId: candidate.id,
    admitted: true,
    filterCode: '',
    crashInjected: crashSeen,
    recoveredRevision: recovery.recoveredRevision,
    tornStateDetected: recovery.tornStateDetected === true,
    recoveryReadable: recovery.readable === true,
    readBack,
    bytesWritten: metrics.bytesWritten,
  });
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function compileDossier(results, evaluatedWithHeadSha) {
  if (!Array.isArray(results) || results.length === 0) throw new StorageBakeoffError('E_DOSSIER_EMPTY');
  const rows = results.map((row) => canonicalize({ ...row }));
  rows.sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
  return canonicalize({
    schemaVersion: STORAGE_BAKEOFF_SCHEMA_VERSION,
    headSha: evaluatedWithHeadSha,
    candidates: rows,
    selection: 'DEFERRED_TO_WP-203',
  });
}

module.exports = Object.freeze({
  STORAGE_BAKEOFF_SCHEMA_VERSION,
  StorageBakeoffError,
  CANDIDATE_REGISTRY,
  applyHardSafetyFilters,
  runCandidateBenchmark,
  compileDossier,
});
