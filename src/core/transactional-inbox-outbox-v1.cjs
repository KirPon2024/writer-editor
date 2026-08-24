'use strict';

// R2.4 R4 — transactional inbox/outbox: accepted intent, durable state
// transition and external effects bound by idempotency and replay laws.
//
// Inbox: an intent is admitted durably by idempotency key before any execution;
// direct re-admission is a typed refusal, the same key carrying different
// command meaning is a typed conflict, and execution is recorded exactly once.
// Outbox: every external effect of a committed transition is recorded pending
// before publication and marked published after; a crash between commit and
// publication leaves an exact recoverable pending set.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { durableSaveTransaction } = require('./save-coordinator-v1.cjs');

const INBOX_OUTBOX_SCHEMA_VERSION = 'yalken.transactionalInboxOutbox.v1';
const INBOX_BASENAME = 'transactional-inbox.v1.jsonl';
const OUTBOX_BASENAME = 'transactional-outbox.v1.jsonl';
const DIRECTORY_MUTATION_TAILS = new Map();

class InboxOutboxError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const sha256hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
const isHexDigest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function normalizeJsonValue(value, pathHint = '$', seen = new Set()) {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InboxOutboxError('E_JSON_PAYLOAD_INVALID', pathHint);
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new InboxOutboxError('E_JSON_PAYLOAD_INVALID', `${pathHint}:cycle`);
    seen.add(value);
    const normalized = value.map((item, index) => normalizeJsonValue(item, `${pathHint}[${index}]`, seen));
    seen.delete(value);
    return normalized;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) throw new InboxOutboxError('E_JSON_PAYLOAD_INVALID', `${pathHint}:cycle`);
    seen.add(value);
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined || typeof child === 'function' || typeof child === 'symbol') {
        throw new InboxOutboxError('E_JSON_PAYLOAD_INVALID', `${pathHint}.${key}`);
      }
      normalized[key] = normalizeJsonValue(child, `${pathHint}.${key}`, seen);
    }
    seen.delete(value);
    return normalized;
  }
  if (value === undefined) return null;
  throw new InboxOutboxError('E_JSON_PAYLOAD_INVALID', pathHint);
}

function canonicalJson(value) {
  return JSON.stringify(normalizeJsonValue(value === undefined ? null : value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function immutableJsonValue(value) {
  return deepFreeze(normalizeJsonValue(value === undefined ? null : value));
}

function payloadHash(payload) {
  return sha256hex(Buffer.from(canonicalJson(payload), 'utf8'));
}

function normalizeRequiredText(value, code) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new InboxOutboxError(code);
  return text;
}

function serializeJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length > 0 ? '\n' : '');
}

function validateInboxRecord(record) {
  if (!isPlainObject(record)) throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'record-shape');
  if (record.schemaVersion !== INBOX_OUTBOX_SCHEMA_VERSION) throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'schema');
  if (typeof record.intentId !== 'string' || record.intentId.trim() !== record.intentId || record.intentId.length === 0) {
    throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'intentId');
  }
  if (typeof record.kind !== 'string' || record.kind.trim() !== record.kind || record.kind.length === 0) {
    throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'kind');
  }
  if (!isHexDigest(record.payloadHash)) throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'payloadHash');
  if (record.status !== 'ADMITTED' && record.status !== 'EXECUTED') throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'status');
  if (record.status === 'ADMITTED' && record.outcome !== null) throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'admitted-outcome');
  if (record.status === 'EXECUTED') normalizeJsonValue(record.outcome, '$.outcome');
}

function validateOutboxRecord(record) {
  if (!isPlainObject(record)) throw new InboxOutboxError('E_OUTBOX_LOG_CORRUPT', 'record-shape');
  if (record.schemaVersion !== INBOX_OUTBOX_SCHEMA_VERSION) throw new InboxOutboxError('E_OUTBOX_LOG_CORRUPT', 'schema');
  if (typeof record.intentId !== 'string' || record.intentId.trim() !== record.intentId || record.intentId.length === 0) {
    throw new InboxOutboxError('E_OUTBOX_LOG_CORRUPT', 'intentId');
  }
  if (typeof record.effectId !== 'string' || record.effectId.trim() !== record.effectId || record.effectId.length === 0) {
    throw new InboxOutboxError('E_OUTBOX_LOG_CORRUPT', 'effectId');
  }
  if (typeof record.kind !== 'string' || record.kind.trim() !== record.kind || record.kind.length === 0) {
    throw new InboxOutboxError('E_OUTBOX_LOG_CORRUPT', 'kind');
  }
  if (record.status !== 'PENDING' && record.status !== 'PUBLISHED') throw new InboxOutboxError('E_OUTBOX_LOG_CORRUPT', 'status');
  normalizeJsonValue(record.detail, '$.detail');
}

async function readJsonl(filePath, validateRecord, corruptCode, saveTransaction = durableSaveTransaction) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length === 0) return [];
  const lines = content.split('\n');
  const records = [];
  let repaired = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') {
      if (index === lines.length - 1) continue;
      throw new InboxOutboxError(corruptCode, 'empty-line');
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (index === lines.length - 1) {
        repaired = true;
        break;
      }
      throw new InboxOutboxError(corruptCode, 'invalid-json');
    }
    validateRecord(parsed);
    records.push(parsed);
  }
  if (repaired) {
    await saveTransaction({ filePath, content: serializeJsonl(records), revision: records.length });
  }
  return records;
}

function assertUnique(records, key, code) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record[key])) throw new InboxOutboxError(code, record[key]);
    seen.add(record[key]);
  }
}

async function rewriteJsonl(filePath, records, revision, saveTransaction) {
  await saveTransaction({ filePath, content: serializeJsonl(records), revision });
}

function publicIntent(record) {
  return Object.freeze({
    intentId: record.intentId,
    kind: record.kind,
    payloadHash: record.payloadHash,
    status: record.status,
    outcome: immutableJsonValue(record.outcome),
  });
}

function publicEffect(effect) {
  return Object.freeze({
    intentId: effect.intentId,
    effectId: effect.effectId,
    kind: effect.kind,
    detail: immutableJsonValue(effect.detail),
    status: effect.status,
  });
}

async function openTransactionalInboxOutbox(dir, { saveTransaction = durableSaveTransaction } = {}) {
  if (typeof saveTransaction !== 'function') throw new InboxOutboxError('E_SAVE_TRANSACTION_REQUIRED');
  fs.mkdirSync(dir, { recursive: true });
  const directoryKey = fs.realpathSync(dir);
  const inboxPath = path.join(directoryKey, INBOX_BASENAME);
  const outboxPath = path.join(directoryKey, OUTBOX_BASENAME);
  const state = {
    inbox: await readJsonl(inboxPath, validateInboxRecord, 'E_INBOX_LOG_CORRUPT', saveTransaction),
    outbox: await readJsonl(outboxPath, validateOutboxRecord, 'E_OUTBOX_LOG_CORRUPT', saveTransaction),
  };
  const findIntent = (intentId) => state.inbox.find((record) => record.intentId === intentId) || null;
  const assertStateIntegrity = () => {
    assertUnique(state.inbox, 'intentId', 'E_INBOX_LOG_DUPLICATE_INTENT');
    assertUnique(state.outbox, 'effectId', 'E_OUTBOX_LOG_DUPLICATE_EFFECT');
    for (const effect of state.outbox) {
      const record = findIntent(effect.intentId);
      if (!record || record.status !== 'EXECUTED') throw new InboxOutboxError('E_OUTBOX_ORPHAN_EFFECT', effect.effectId);
    }
  };
  assertStateIntegrity();

  const refreshState = async () => {
    const [inbox, outbox] = await Promise.all([
      readJsonl(inboxPath, validateInboxRecord, 'E_INBOX_LOG_CORRUPT', saveTransaction),
      readJsonl(outboxPath, validateOutboxRecord, 'E_OUTBOX_LOG_CORRUPT', saveTransaction),
    ]);
    state.inbox = inbox;
    state.outbox = outbox;
    assertStateIntegrity();
  };
  const enqueueMutation = (operation) => {
    const predecessor = DIRECTORY_MUTATION_TAILS.get(directoryKey) || Promise.resolve();
    const result = predecessor.then(async () => {
      await refreshState();
      return operation();
    });
    const settled = result.catch(() => {});
    DIRECTORY_MUTATION_TAILS.set(directoryKey, settled);
    settled.then(() => {
      if (DIRECTORY_MUTATION_TAILS.get(directoryKey) === settled) DIRECTORY_MUTATION_TAILS.delete(directoryKey);
    });
    return result;
  };
  const persistAndPublish = async (channel, nextRecords) => {
    const filePath = channel === 'inbox' ? inboxPath : outboxPath;
    const validateRecord = channel === 'inbox' ? validateInboxRecord : validateOutboxRecord;
    const corruptCode = channel === 'inbox' ? 'E_INBOX_LOG_CORRUPT' : 'E_OUTBOX_LOG_CORRUPT';
    try {
      await rewriteJsonl(filePath, nextRecords, nextRecords.length, saveTransaction);
      state[channel] = nextRecords;
    } catch (writeError) {
      try {
        state[channel] = await readJsonl(filePath, validateRecord, corruptCode, saveTransaction);
        assertStateIntegrity();
      } catch (reconcileError) {
        const error = new InboxOutboxError(
          'E_DURABLE_STATE_RECONCILIATION_FAILED',
          `${channel}:${writeError.code || writeError.message}:${reconcileError.code || reconcileError.message}`,
        );
        error.cause = reconcileError;
        error.writeError = writeError;
        throw error;
      }
      throw writeError;
    }
  };

  const api = {
    inboxPath,
    outboxPath,

    async admitIntent({ intentId, kind, payload = null }) {
      return enqueueMutation(async () => {
        const id = normalizeRequiredText(intentId, 'E_INTENT_ID_REQUIRED');
        const intentKind = normalizeRequiredText(kind, 'E_INTENT_KIND_REQUIRED');
        const digest = payloadHash(payload);
        const existing = findIntent(id);
        if (existing) {
          if (existing.payloadHash !== digest || existing.kind !== intentKind) {
            throw new InboxOutboxError('E_INTENT_CONFLICT', id);
          }
          throw new InboxOutboxError('E_INTENT_DUPLICATE', id);
        }
        const record = {
          schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
          intentId: id,
          kind: intentKind,
          payloadHash: digest,
          status: 'ADMITTED',
          outcome: null,
        };
        const nextInbox = [...state.inbox, record];
        await persistAndPublish('inbox', nextInbox);
        return publicIntent(record);
      });
    },

    async ensureIntentAdmitted({ intentId, kind, payload = null }) {
      return enqueueMutation(async () => {
        const id = normalizeRequiredText(intentId, 'E_INTENT_ID_REQUIRED');
        const intentKind = normalizeRequiredText(kind, 'E_INTENT_KIND_REQUIRED');
        const digest = payloadHash(payload);
        const existing = findIntent(id);
        if (existing) {
          if (existing.payloadHash !== digest || existing.kind !== intentKind) {
            throw new InboxOutboxError('E_INTENT_CONFLICT', id);
          }
          return publicIntent(existing);
        }
        const record = {
          schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
          intentId: id,
          kind: intentKind,
          payloadHash: digest,
          status: 'ADMITTED',
          outcome: null,
        };
        const nextInbox = [...state.inbox, record];
        await persistAndPublish('inbox', nextInbox);
        return publicIntent(record);
      });
    },

    async markExecuted(intentId, outcome = null) {
      return enqueueMutation(async () => {
        const id = normalizeRequiredText(intentId, 'E_INTENT_ID_REQUIRED');
        const record = findIntent(id);
        if (!record) throw new InboxOutboxError('E_INTENT_UNKNOWN', id);
        if (record.status === 'EXECUTED') throw new InboxOutboxError('E_INTENT_ALREADY_EXECUTED', id);
        const executed = {
          ...record,
          status: 'EXECUTED',
          outcome: normalizeJsonValue(outcome === undefined ? null : outcome, '$.outcome'),
        };
        const nextInbox = state.inbox.map((entry) => entry === record ? executed : entry);
        await persistAndPublish('inbox', nextInbox);
        return publicIntent(executed);
      });
    },

    isExecuted(intentId) {
      const id = typeof intentId === 'string' ? intentId.trim() : '';
      const record = id ? findIntent(id) : null;
      return Boolean(record && record.status === 'EXECUTED');
    },

    isAdmitted(intentId) {
      const id = typeof intentId === 'string' ? intentId.trim() : '';
      return Boolean(id && findIntent(id));
    },

    async stageEffect({ intentId, effectId, kind, detail = null }) {
      return enqueueMutation(async () => {
        const id = normalizeRequiredText(intentId, 'E_INTENT_ID_REQUIRED');
        const effectKey = normalizeRequiredText(effectId, 'E_EFFECT_ID_REQUIRED');
        const effectKind = normalizeRequiredText(kind, 'E_EFFECT_KIND_REQUIRED');
        const record = findIntent(id);
        if (!record || record.status !== 'EXECUTED') throw new InboxOutboxError('E_INTENT_NOT_EXECUTED', id);
        if (state.outbox.some((effect) => effect.effectId === effectKey)) {
          throw new InboxOutboxError('E_EFFECT_ALREADY_STAGED', effectKey);
        }
        const effect = {
          schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
          intentId: record.intentId,
          effectId: effectKey,
          kind: effectKind,
          detail: normalizeJsonValue(detail, '$.detail'),
          status: 'PENDING',
        };
        const nextOutbox = [...state.outbox, effect];
        await persistAndPublish('outbox', nextOutbox);
        return publicEffect(effect);
      });
    },

    async markEffectPublished(effectId) {
      return enqueueMutation(async () => {
        const effectKey = normalizeRequiredText(effectId, 'E_EFFECT_ID_REQUIRED');
        const effect = state.outbox.find((entry) => entry.effectId === effectKey);
        if (!effect) throw new InboxOutboxError('E_EFFECT_UNKNOWN', effectKey);
        if (effect.status === 'PUBLISHED') throw new InboxOutboxError('E_EFFECT_ALREADY_PUBLISHED', effectKey);
        const published = { ...effect, status: 'PUBLISHED' };
        const nextOutbox = state.outbox.map((entry) => entry === effect ? published : entry);
        await persistAndPublish('outbox', nextOutbox);
        return publicEffect(published);
      });
    },

    pendingEffects() {
      return Object.freeze(state.outbox.filter((effect) => effect.status === 'PENDING').map(publicEffect));
    },

    replay() {
      return Object.freeze({
        schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
        intents: Object.freeze(state.inbox.map((record) => Object.freeze({
          intentId: record.intentId,
          kind: record.kind,
          status: record.status,
        }))),
        effects: Object.freeze(state.outbox.map((effect) => Object.freeze({
          effectId: effect.effectId,
          intentId: effect.intentId,
          status: effect.status,
        }))),
        inboxDigest: sha256hex(Buffer.from(serializeJsonl(state.inbox), 'utf8')),
        outboxDigest: sha256hex(Buffer.from(serializeJsonl(state.outbox), 'utf8')),
      });
    },
  };
  return Object.freeze(api);
}

module.exports = Object.freeze({
  INBOX_OUTBOX_SCHEMA_VERSION,
  INBOX_BASENAME,
  OUTBOX_BASENAME,
  InboxOutboxError,
  openTransactionalInboxOutbox,
});
