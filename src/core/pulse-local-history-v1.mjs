import fs from 'node:fs';
import path from 'node:path';
import saveCoordinator from './save-coordinator-v1.cjs';
import { canonicalSerialize, hashCanonicalValue } from './browser-safe-hash.mjs';
import {
  PULSE_PRIVACY_EXPLANATION_SCHEMA,
  PULSE_PRIVACY_POLICY_V1,
} from './pulse-privacy-v1.mjs';
import { PULSE_AGGREGATE_VALUE_MAX, PULSE_METRIC_ALLOWLIST } from './pulse-policy-codec-v1.mjs';
import { PULSE_LEDGER_DEFAULT_MAX_ENTRIES, PULSE_LEDGER_ZERO_DIGEST } from './pulse-ledger-v1.mjs';

const { durableSaveTransaction } = saveCoordinator;

export const PULSE_LOCAL_HISTORY_STAGE_ID = 'WP-805_LOCAL_HISTORY';
export const PULSE_LOCAL_HISTORY_REVIEW_SCHEMA = 'yalken.r24.pulseLocalHistoryReview.v1';
export const PULSE_LOCAL_HISTORY_COMMAND_SCHEMA = 'yalken.r24.pulseLocalHistoryDecisionCommand.v1';
export const PULSE_LOCAL_HISTORY_DECISION_SCHEMA = 'yalken.r24.pulseLocalHistoryDecisionEntry.v1';
export const PULSE_LOCAL_HISTORY_MAX_ENTRIES = PULSE_LEDGER_DEFAULT_MAX_ENTRIES;
export const PULSE_LOCAL_HISTORY_MAX_FILE_BYTES = 8 * 1024 * 1024;

const DECISIONS_BASENAME = 'pulse-local-history-decisions.v1.jsonl';
const HEX64 = /^[0-9a-f]{64}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
const METRICS = new Set(PULSE_METRIC_ALLOWLIST);
const DECISIONS = new Set(['KEEP_OURS', 'KEEP_THEIRS', 'DEFER']);
const OPERATION_TAILS = new Map();

export class PulseLocalHistoryError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new PulseLocalHistoryError(code, detail); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
const cloneFrozen = value => deepFreeze(JSON.parse(JSON.stringify(value)));

function assertPlainData(value, depth = 0, budget = { remaining: 300_000 }, seen = new Set()) {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 24) fail('E_WP805_INPUT_BUDGET');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && !plain(value))) fail('E_WP805_INPUT_NOT_PLAIN_DATA');
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP805_INPUT_SYMBOL');
  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value) && (value.length > PULSE_LOCAL_HISTORY_MAX_ENTRIES || names.length !== value.length + 1
    || names.some(key => key !== 'length' && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)))) fail('E_WP805_ARRAY_BOUND');
  seen.add(value);
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP805_INPUT_ACCESSOR');
    if (!descriptor.enumerable && key !== 'length') fail('E_WP805_INPUT_HIDDEN_FIELD');
    assertPlainData(descriptor.value, depth + 1, budget, seen);
  }
  seen.delete(value);
}

function exactKeys(value, wanted, code) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...wanted].sort())) fail(code);
}
function ordinal(value, code, maximum = Number.MAX_SAFE_INTEGER, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}
function digest(value, code) {
  if (typeof value !== 'string' || !HEX64.test(value)) fail(code);
  return value;
}
function nullableValue(value, code) {
  if (value === null) return null;
  return ordinal(value, code, PULSE_AGGREGATE_VALUE_MAX);
}

function privacyStatePayload(state) {
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    collectionStatus: state.collectionStatus,
    lastCommandDigest: state.lastCommandDigest,
    policy: state.policy,
  };
}
function explanationPayload(value) {
  return {
    schemaVersion: value.schemaVersion,
    policy: value.policy,
    privacyState: value.privacyState,
    identity: value.identity,
    history: value.history,
  };
}
function validateExplanation(value, label) {
  assertPlainData(value);
  exactKeys(value, ['schemaVersion', 'policy', 'privacyState', 'identity', 'history', 'explanationDigest'], `E_WP805_${label}_SCHEMA`);
  if (value.schemaVersion !== PULSE_PRIVACY_EXPLANATION_SCHEMA) fail(`E_WP805_${label}_SCHEMA`);
  if (canonicalSerialize(value.policy) !== canonicalSerialize(PULSE_PRIVACY_POLICY_V1)) fail(`E_WP805_${label}_POLICY`);
  exactKeys(value.privacyState, ['schemaVersion', 'revision', 'collectionStatus', 'lastCommandDigest', 'policy', 'stateDigest'], `E_WP805_${label}_PRIVACY_STATE`);
  if (value.privacyState.schemaVersion !== 'yalken.r24.pulsePrivacyState.v1'
    || !['OPTED_IN', 'OPTED_OUT'].includes(value.privacyState.collectionStatus)
    || canonicalSerialize(value.privacyState.policy) !== canonicalSerialize(PULSE_PRIVACY_POLICY_V1)) fail(`E_WP805_${label}_PRIVACY_STATE`);
  ordinal(value.privacyState.revision, `E_WP805_${label}_PRIVACY_STATE`);
  digest(value.privacyState.lastCommandDigest, `E_WP805_${label}_PRIVACY_STATE`);
  digest(value.privacyState.stateDigest, `E_WP805_${label}_PRIVACY_STATE`);
  if (hashCanonicalValue(privacyStatePayload(value.privacyState)) !== value.privacyState.stateDigest) fail(`E_WP805_${label}_PRIVACY_STATE_TAMPER`);
  exactKeys(value.identity, ['ledgerSequence', 'ledgerHeadDigest', 'correctionSequence', 'correctionHeadDigest', 'privacyRevision', 'privacyStateDigest'], `E_WP805_${label}_IDENTITY`);
  ordinal(value.identity.ledgerSequence, `E_WP805_${label}_IDENTITY`, PULSE_LOCAL_HISTORY_MAX_ENTRIES);
  ordinal(value.identity.correctionSequence, `E_WP805_${label}_IDENTITY`, PULSE_LOCAL_HISTORY_MAX_ENTRIES);
  ordinal(value.identity.privacyRevision, `E_WP805_${label}_IDENTITY`);
  digest(value.identity.ledgerHeadDigest, `E_WP805_${label}_IDENTITY`);
  digest(value.identity.correctionHeadDigest, `E_WP805_${label}_IDENTITY`);
  digest(value.identity.privacyStateDigest, `E_WP805_${label}_IDENTITY`);
  if (value.identity.privacyRevision !== value.privacyState.revision || value.identity.privacyStateDigest !== value.privacyState.stateDigest) fail(`E_WP805_${label}_IDENTITY_STALE`);
  if (!Array.isArray(value.history) || value.history.length !== value.identity.ledgerSequence) fail(`E_WP805_${label}_HISTORY_LENGTH`);
  for (const [index, entry] of value.history.entries()) {
    exactKeys(entry, ['ledgerSequence', 'entryDigest', 'receiptDigest', 'sourceRevisionOrdinal', 'generation', 'effectiveAggregates'], `E_WP805_${label}_HISTORY_ENTRY`);
    if (entry.ledgerSequence !== index + 1) fail(`E_WP805_${label}_HISTORY_SEQUENCE`);
    digest(entry.entryDigest, `E_WP805_${label}_HISTORY_ENTRY`);
    digest(entry.receiptDigest, `E_WP805_${label}_HISTORY_ENTRY`);
    ordinal(entry.sourceRevisionOrdinal, `E_WP805_${label}_HISTORY_ENTRY`, Number.MAX_SAFE_INTEGER, 1);
    ordinal(entry.generation, `E_WP805_${label}_HISTORY_ENTRY`, Number.MAX_SAFE_INTEGER, 1);
    if (!Array.isArray(entry.effectiveAggregates) || entry.effectiveAggregates.length > METRICS.size) fail(`E_WP805_${label}_AGGREGATES`);
    const seenMetrics = new Set();
    for (const aggregate of entry.effectiveAggregates) {
      exactKeys(aggregate, ['metricId', 'originalValue', 'effectiveValue', 'correctionSequence'], `E_WP805_${label}_AGGREGATE`);
      if (!METRICS.has(aggregate.metricId) || seenMetrics.has(aggregate.metricId)) fail(`E_WP805_${label}_METRIC`);
      seenMetrics.add(aggregate.metricId);
      ordinal(aggregate.originalValue, `E_WP805_${label}_VALUE`, PULSE_AGGREGATE_VALUE_MAX);
      ordinal(aggregate.effectiveValue, `E_WP805_${label}_VALUE`, PULSE_AGGREGATE_VALUE_MAX);
      if (aggregate.correctionSequence !== null) ordinal(aggregate.correctionSequence, `E_WP805_${label}_CORRECTION`, value.identity.correctionSequence, 1);
    }
  }
  const expectedHead = value.history.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST;
  if (value.identity.ledgerHeadDigest !== expectedHead) fail(`E_WP805_${label}_LEDGER_HEAD`);
  digest(value.explanationDigest, `E_WP805_${label}_DIGEST`);
  if (hashCanonicalValue(explanationPayload(value)) !== value.explanationDigest) fail(`E_WP805_${label}_TAMPER`);
  return cloneFrozen(value);
}

function lineageRow(entry) {
  return {
    ledgerSequence: entry.ledgerSequence,
    entryDigest: entry.entryDigest,
    receiptDigest: entry.receiptDigest,
    sourceRevisionOrdinal: entry.sourceRevisionOrdinal,
    generation: entry.generation,
    aggregates: entry.effectiveAggregates.map(({ metricId, originalValue }) => ({ metricId, originalValue })),
  };
}
function assertAppendOnlyLineage(base, candidate, label) {
  if (candidate.history.length < base.history.length) fail(`E_WP805_${label}_HISTORY_REWIND`);
  for (let index = 0; index < base.history.length; index += 1) {
    if (canonicalSerialize(lineageRow(base.history[index])) !== canonicalSerialize(lineageRow(candidate.history[index]))) {
      fail(`E_WP805_${label}_LINEAGE_DRIFT`, String(index + 1));
    }
  }
}
function valueMap(explanation) {
  const values = new Map();
  for (const entry of explanation.history) for (const aggregate of entry.effectiveAggregates) {
    values.set(`${entry.entryDigest}:${aggregate.metricId}`, {
      ledgerSequence: entry.ledgerSequence,
      entryDigest: entry.entryDigest,
      metricId: aggregate.metricId,
      originalValue: aggregate.originalValue,
      effectiveValue: aggregate.effectiveValue,
    });
  }
  return values;
}
function identityOf(explanation) {
  return cloneFrozen({ explanationDigest: explanation.explanationDigest, ...explanation.identity });
}
function classify(baseValue, oursValue, theirsValue) {
  if (oursValue === baseValue && theirsValue === baseValue) return 'UNCHANGED';
  if (oursValue !== baseValue && theirsValue === baseValue) return 'OURS_ONLY';
  if (oursValue === baseValue && theirsValue !== baseValue) return 'THEIRS_ONLY';
  if (oursValue === theirsValue) return 'BOTH_IDENTICAL';
  return 'CONFLICT';
}

function normalizeReviewInput(input) {
  assertPlainData(input);
  exactKeys(input, ['base', 'ours', 'theirs'], 'E_WP805_REVIEW_INPUT_SCHEMA');
  const base = validateExplanation(input.base, 'BASE');
  const ours = validateExplanation(input.ours, 'OURS');
  const theirs = validateExplanation(input.theirs, 'THEIRS');
  assertAppendOnlyLineage(base, ours, 'OURS');
  assertAppendOnlyLineage(base, theirs, 'THEIRS');
  return cloneFrozen({ base, ours, theirs });
}

export function derivePulseLocalHistoryReview(input) {
  const { base, ours, theirs } = normalizeReviewInput(input);
  const maps = { base: valueMap(base), ours: valueMap(ours), theirs: valueMap(theirs) };
  const keys = [...new Set([...maps.base.keys(), ...maps.ours.keys(), ...maps.theirs.keys()])].sort();
  const changes = [];
  const conflicts = [];
  for (const key of keys) {
    const baseRow = maps.base.get(key) ?? null;
    const oursRow = maps.ours.get(key) ?? null;
    const theirsRow = maps.theirs.get(key) ?? null;
    const baseValue = baseRow?.effectiveValue ?? null;
    const oursValue = oursRow?.effectiveValue ?? null;
    const theirsValue = theirsRow?.effectiveValue ?? null;
    const classification = classify(baseValue, oursValue, theirsValue);
    if (classification === 'UNCHANGED') continue;
    const row = oursRow ?? theirsRow ?? baseRow;
    const changeIdentity = {
      entryDigest: row.entryDigest,
      metricId: row.metricId,
      baseValue,
      oursValue,
      theirsValue,
    };
    const changeId = hashCanonicalValue(changeIdentity);
    const conflictId = classification === 'CONFLICT' ? hashCanonicalValue({ reviewKind: 'PULSE_LOCAL_HISTORY_CONFLICT', ...changeIdentity }) : null;
    changes.push({
      changeId,
      ledgerSequence: row.ledgerSequence,
      entryDigest: row.entryDigest,
      metricId: row.metricId,
      originalValue: row.originalValue,
      baseValue,
      oursValue,
      theirsValue,
      classification,
      conflictId,
    });
    if (conflictId) conflicts.push({
      conflictId,
      changeId,
      ledgerSequence: row.ledgerSequence,
      entryDigest: row.entryDigest,
      metricId: row.metricId,
      baseValue,
      oursValue,
      theirsValue,
      status: 'REQUIRES_LOCAL_DECISION',
    });
  }
  const payload = {
    schemaVersion: PULSE_LOCAL_HISTORY_REVIEW_SCHEMA,
    stageId: PULSE_LOCAL_HISTORY_STAGE_ID,
    identity: { base: identityOf(base), ours: identityOf(ours), theirs: identityOf(theirs) },
    policy: {
      source: 'WP804_IMMUTABLE_PRIVACY_EXPLANATIONS',
      semanticDiff: 'THREE_WAY_EFFECTIVE_AGGREGATE_VALUES',
      review: 'LOCAL_ONLY',
      conflict: 'TYPED_EXPLICIT_DECISION_REQUIRED',
      appendOnlyLineage: 'REQUIRED',
      content: 'DENIED',
      identity: 'DENIED',
      path: 'DENIED',
      network: 'DENIED',
    },
    changes,
    conflicts,
    unresolvedConflictCount: conflicts.length,
    networkSyncStatus: conflicts.length === 0 ? 'READY_AFTER_LOCAL_REVIEW' : 'BLOCKED_PENDING_LOCAL_REVIEW',
  };
  return cloneFrozen({ ...payload, reviewDigest: hashCanonicalValue(payload) });
}

function decisionPayload(entry) {
  return {
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    previousEntryDigest: entry.previousEntryDigest,
    requestDigest: entry.requestDigest,
    reviewDigest: entry.reviewDigest,
    conflictId: entry.conflictId,
    decision: entry.decision,
    selectedValue: entry.selectedValue,
  };
}
function validateDecisionEntries(entries) {
  if (!Array.isArray(entries) || entries.length > PULSE_LOCAL_HISTORY_MAX_ENTRIES) fail('E_WP805_DECISION_CAPACITY');
  let previous = PULSE_LEDGER_ZERO_DIGEST;
  for (const [index, entry] of entries.entries()) {
    exactKeys(entry, ['schemaVersion', 'sequence', 'previousEntryDigest', 'requestDigest', 'reviewDigest', 'conflictId', 'decision', 'selectedValue', 'entryDigest'], 'E_WP805_DECISION_SCHEMA');
    if (entry.schemaVersion !== PULSE_LOCAL_HISTORY_DECISION_SCHEMA || entry.sequence !== index + 1) fail('E_WP805_DECISION_SEQUENCE');
    if (digest(entry.previousEntryDigest, 'E_WP805_DECISION_CHAIN') !== previous) fail('E_WP805_DECISION_CHAIN');
    digest(entry.requestDigest, 'E_WP805_DECISION_REQUEST');
    digest(entry.reviewDigest, 'E_WP805_DECISION_REVIEW');
    digest(entry.conflictId, 'E_WP805_DECISION_CONFLICT');
    if (!DECISIONS.has(entry.decision)) fail('E_WP805_DECISION_VALUE');
    nullableValue(entry.selectedValue, 'E_WP805_DECISION_SELECTED_VALUE');
    if ((entry.decision === 'DEFER') !== (entry.selectedValue === null)) fail('E_WP805_DECISION_SELECTED_VALUE');
    digest(entry.entryDigest, 'E_WP805_DECISION_DIGEST');
    if (hashCanonicalValue(decisionPayload(entry)) !== entry.entryDigest) fail('E_WP805_DECISION_TAMPER');
    previous = entry.entryDigest;
  }
  return entries;
}
function decisionSnapshot(entries) {
  return cloneFrozen({ sequence: entries.length, headDigest: entries.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST, entries });
}
function decodeUtf8(bytes, code) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(code); }
}
function readDecisions(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('E_WP805_DECISION_FILE');
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > PULSE_LOCAL_HISTORY_MAX_FILE_BYTES) fail('E_WP805_DECISION_BYTES');
  if (bytes.length === 0) return [];
  const text = decodeUtf8(bytes, 'E_WP805_DECISION_UTF8');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) fail('E_WP805_DECISION_CANONICAL');
  const entries = text.slice(0, -1).split('\n').map(line => {
    let parsed;
    try { parsed = JSON.parse(line); } catch { fail('E_WP805_DECISION_JSON'); }
    if (canonicalSerialize(parsed) !== line) fail('E_WP805_DECISION_CANONICAL');
    return parsed;
  });
  return validateDecisionEntries(entries);
}
const encodeDecisions = entries => entries.length === 0 ? '' : `${validateDecisionEntries(entries).map(canonicalSerialize).join('\n')}\n`;

function validateDecisionCommand(command) {
  assertPlainData(command);
  exactKeys(command, ['schemaVersion', 'type', 'requestId', 'expectedReviewDigest', 'expectedDecisionSequence', 'expectedDecisionHeadDigest', 'conflictId', 'decision'], 'E_WP805_COMMAND_SCHEMA');
  if (command.schemaVersion !== PULSE_LOCAL_HISTORY_COMMAND_SCHEMA || command.type !== 'DECIDE_CONFLICT') fail('E_WP805_COMMAND_TYPE');
  if (typeof command.requestId !== 'string' || !REQUEST_ID.test(command.requestId)) fail('E_WP805_REQUEST_ID');
  digest(command.expectedReviewDigest, 'E_WP805_EXPECTED_REVIEW');
  ordinal(command.expectedDecisionSequence, 'E_WP805_EXPECTED_DECISION_SEQUENCE', PULSE_LOCAL_HISTORY_MAX_ENTRIES);
  digest(command.expectedDecisionHeadDigest, 'E_WP805_EXPECTED_DECISION_HEAD');
  digest(command.conflictId, 'E_WP805_EXPECTED_CONFLICT');
  if (!DECISIONS.has(command.decision)) fail('E_WP805_DECISION_VALUE');
  return cloneFrozen({ ...command, requestDigest: hashCanonicalValue({ requestId: command.requestId }) });
}

function reviewWithDecisions(review, entries) {
  const latest = new Map();
  for (const entry of entries) if (entry.reviewDigest === review.reviewDigest) latest.set(entry.conflictId, entry);
  const conflicts = review.conflicts.map(conflict => {
    const decision = latest.get(conflict.conflictId) ?? null;
    return { ...conflict, status: decision && decision.decision !== 'DEFER' ? 'RESOLVED_LOCALLY' : 'REQUIRES_LOCAL_DECISION', decision: decision?.decision ?? null, selectedValue: decision?.selectedValue ?? null };
  });
  const unresolvedConflictCount = conflicts.filter(conflict => conflict.status !== 'RESOLVED_LOCALLY').length;
  return cloneFrozen({
    review,
    decisionSnapshot: decisionSnapshot(entries),
    conflicts,
    unresolvedConflictCount,
    networkSyncStatus: unresolvedConflictCount === 0 ? 'READY_AFTER_LOCAL_REVIEW' : 'BLOCKED_PENDING_LOCAL_REVIEW',
  });
}

export async function openPulseLocalHistoryController(directory, { saveTransaction = durableSaveTransaction } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('E_WP805_DIRECTORY_REQUIRED');
  if (typeof saveTransaction !== 'function') fail('E_WP805_PRODUCT_PORT_REQUIRED');
  fs.mkdirSync(directory, { recursive: true });
  const directoryKey = fs.realpathSync(directory);
  const decisionPath = path.join(directoryKey, DECISIONS_BASENAME);
  const enqueue = operation => {
    const predecessor = OPERATION_TAILS.get(directoryKey) ?? Promise.resolve();
    const result = predecessor.then(operation);
    const settled = result.catch(() => {});
    OPERATION_TAILS.set(directoryKey, settled);
    settled.finally(() => { if (OPERATION_TAILS.get(directoryKey) === settled) OPERATION_TAILS.delete(directoryKey); });
    return result;
  };
  return Object.freeze({
    async review(input) {
      const normalized = normalizeReviewInput(input);
      return enqueue(async () => reviewWithDecisions(derivePulseLocalHistoryReview(normalized), readDecisions(decisionPath)));
    },
    async appendDecision(input, commandInput) {
      const normalized = normalizeReviewInput(input);
      const command = validateDecisionCommand(commandInput);
      return enqueue(async () => {
        const review = derivePulseLocalHistoryReview(normalized);
        if (command.expectedReviewDigest !== review.reviewDigest) fail('E_WP805_REVIEW_IDENTITY_STALE');
        const entries = readDecisions(decisionPath);
        const snapshot = decisionSnapshot(entries);
        if (command.expectedDecisionSequence !== snapshot.sequence || command.expectedDecisionHeadDigest !== snapshot.headDigest) fail('E_WP805_DECISION_IDENTITY_STALE');
        if (entries.length >= PULSE_LOCAL_HISTORY_MAX_ENTRIES) fail('E_WP805_DECISION_CAPACITY_NO_AUTOCLEANUP');
        const conflict = review.conflicts.find(row => row.conflictId === command.conflictId);
        if (!conflict) fail('E_WP805_CONFLICT_ID_STALE');
        const selectedValue = command.decision === 'KEEP_OURS' ? conflict.oursValue
          : command.decision === 'KEEP_THEIRS' ? conflict.theirsValue : null;
        const payload = {
          schemaVersion: PULSE_LOCAL_HISTORY_DECISION_SCHEMA,
          sequence: snapshot.sequence + 1,
          previousEntryDigest: snapshot.headDigest,
          requestDigest: command.requestDigest,
          reviewDigest: review.reviewDigest,
          conflictId: command.conflictId,
          decision: command.decision,
          selectedValue,
        };
        const entry = cloneFrozen({ ...payload, entryDigest: hashCanonicalValue(payload) });
        const nextEntries = [...entries, entry];
        await saveTransaction({ filePath: decisionPath, content: encodeDecisions(nextEntries), revision: nextEntries.length });
        return cloneFrozen({ status: 'LOCAL_DECISION_APPENDED', entry, ...reviewWithDecisions(review, nextEntries) });
      });
    },
  });
}
