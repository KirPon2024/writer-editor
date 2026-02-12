#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'collab-causal-queue-readiness-state.v1';
const DEFAULT_READINESS_PATH = 'docs/OPS/STATUS/COLLAB_CAUSAL_QUEUE_READINESS.json';
const SCHEMA_VERSION = 'collab-causal-queue-readiness.v1';
const CONFIG_POLICY_VERSION = 'collab-causal-queue-readiness-config.v1';
const STATUS_SET = new Set(['PLACEHOLDER', 'READY']);
const QUEUE_MODEL_SET = new Set(['FIFO', 'PER_ACTOR_FIFO', 'VECTOR_CLOCK_GATED', 'UNKNOWN']);
const ORDERING_KEY_SET = new Set(['(actorId,seq)', '(ts,eventId)', 'UNKNOWN']);
const CONFLICT_POLICY_SET = new Set(['REJECT', 'BUFFER', 'DETERMINISTIC_RESOLVE', 'UNKNOWN']);
const SHA_HEX_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function parseJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = {
    json: false,
    readinessPath: '',
    repoRoot: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--readiness-path') {
      out.readinessPath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--repo-root') {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function normalizeConfig(doc = {}) {
  const schemaVersion = typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const status = typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const design = doc && doc.design && typeof doc.design === 'object' && !Array.isArray(doc.design)
    ? doc.design
    : {};
  const proofRequirements = doc && doc.proofRequirements && typeof doc.proofRequirements === 'object' && !Array.isArray(doc.proofRequirements)
    ? doc.proofRequirements
    : {};

  return {
    policyVersion: CONFIG_POLICY_VERSION,
    schemaVersion,
    status,
    design: {
      queueModel: typeof design.queueModel === 'string' ? design.queueModel.trim().toUpperCase() : '',
      orderingKey: typeof design.orderingKey === 'string' ? design.orderingKey.trim() : '',
      conflictPolicy: typeof design.conflictPolicy === 'string' ? design.conflictPolicy.trim().toUpperCase() : '',
      noNetwork: design.noNetwork === true,
    },
    proofRequirements: {
      deterministicReplayRequired: proofRequirements.deterministicReplayRequired === true,
      typedRejectionEnvelopeRequired: proofRequirements.typedRejectionEnvelopeRequired === true,
      noSecondSotRequired: proofRequirements.noSecondSotRequired === true,
    },
  };
}

export function computeCollabCausalQueueReadinessConfigHash(doc = {}) {
  const baselineSha = typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  return sha256Hex(`${stableStringify(normalizeConfig(doc))}|${baselineSha}`);
}

export function evaluateCollabCausalQueueReadinessState(input = {}) {
  const repoRoot = String(input.repoRoot || process.cwd()).trim() || process.cwd();
  const readinessPath = String(input.readinessPath || DEFAULT_READINESS_PATH).trim() || DEFAULT_READINESS_PATH;
  const absolutePath = path.resolve(repoRoot, readinessPath);
  const fileSha256 = fs.existsSync(absolutePath)
    ? sha256Hex(fs.readFileSync(absolutePath))
    : '';
  const doc = parseJsonObject(absolutePath);
  const normalizedSpecHash = doc ? sha256Hex(stableStringify(doc)) : '';

  const failures = new Set();
  const missingFields = new Set();
  if (!doc) failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_JSON_INVALID');

  const schemaVersion = doc && typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const statusRaw = doc && typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const status = STATUS_SET.has(statusRaw) ? statusRaw : 'PLACEHOLDER';
  const baselineSha = doc && typeof doc.baselineSha === 'string' ? doc.baselineSha.trim().toLowerCase() : '';
  const design = doc && doc.design && typeof doc.design === 'object' && !Array.isArray(doc.design)
    ? doc.design
    : null;
  const proofRequirements = doc && doc.proofRequirements && typeof doc.proofRequirements === 'object' && !Array.isArray(doc.proofRequirements)
    ? doc.proofRequirements
    : null;
  const configHash = doc && typeof doc.configHash === 'string' ? doc.configHash.trim().toLowerCase() : '';

  if (schemaVersion !== SCHEMA_VERSION) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_SCHEMA_INVALID');
    missingFields.add('schemaVersion');
  }
  if (!STATUS_SET.has(statusRaw)) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_STATUS_INVALID');
    missingFields.add('status');
  }
  if (!SHA_HEX_RE.test(baselineSha)) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_BASELINE_SHA_INVALID');
    missingFields.add('baselineSha');
  }
  if (!design) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_DESIGN_INVALID');
    missingFields.add('design');
  }
  if (!proofRequirements) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_PROOF_REQUIREMENTS_INVALID');
    missingFields.add('proofRequirements');
  }

  const queueModel = design && typeof design.queueModel === 'string' ? design.queueModel.trim().toUpperCase() : '';
  const orderingKey = design && typeof design.orderingKey === 'string' ? design.orderingKey.trim() : '';
  const conflictPolicy = design && typeof design.conflictPolicy === 'string' ? design.conflictPolicy.trim().toUpperCase() : '';
  const noNetwork = design && typeof design.noNetwork === 'boolean' ? design.noNetwork : null;

  if (!QUEUE_MODEL_SET.has(queueModel)) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_QUEUE_MODEL_INVALID');
    missingFields.add('design.queueModel');
  }
  if (!ORDERING_KEY_SET.has(orderingKey)) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_ORDERING_KEY_INVALID');
    missingFields.add('design.orderingKey');
  }
  if (!CONFLICT_POLICY_SET.has(conflictPolicy)) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_CONFLICT_POLICY_INVALID');
    missingFields.add('design.conflictPolicy');
  }
  if (noNetwork === null) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_NO_NETWORK_INVALID');
    missingFields.add('design.noNetwork');
  }

  const deterministicReplayRequired = proofRequirements && typeof proofRequirements.deterministicReplayRequired === 'boolean'
    ? proofRequirements.deterministicReplayRequired
    : null;
  const typedRejectionEnvelopeRequired = proofRequirements && typeof proofRequirements.typedRejectionEnvelopeRequired === 'boolean'
    ? proofRequirements.typedRejectionEnvelopeRequired
    : null;
  const noSecondSotRequired = proofRequirements && typeof proofRequirements.noSecondSotRequired === 'boolean'
    ? proofRequirements.noSecondSotRequired
    : null;

  if (deterministicReplayRequired === null) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_DETERMINISTIC_REPLAY_REQUIRED_INVALID');
    missingFields.add('proofRequirements.deterministicReplayRequired');
  }
  if (typedRejectionEnvelopeRequired === null) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_TYPED_REJECTION_ENVELOPE_REQUIRED_INVALID');
    missingFields.add('proofRequirements.typedRejectionEnvelopeRequired');
  }
  if (noSecondSotRequired === null) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_NO_SECOND_SOT_REQUIRED_INVALID');
    missingFields.add('proofRequirements.noSecondSotRequired');
  }

  if (!SHA256_HEX_RE.test(configHash)) {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_CONFIG_HASH_INVALID');
    missingFields.add('configHash');
  }
  const configHashExpected = computeCollabCausalQueueReadinessConfigHash(doc || {});
  const configHashOk = SHA256_HEX_RE.test(configHash) && configHash === configHashExpected;
  if (!configHashOk) failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_CONFIG_HASH_MISMATCH');

  if (status !== 'READY') {
    failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_STATUS_NOT_READY');
  } else {
    if (noNetwork !== true) failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_NO_NETWORK_REQUIRED');
    if (queueModel === 'UNKNOWN') failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_QUEUE_MODEL_UNKNOWN');
    if (orderingKey === 'UNKNOWN') failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_ORDERING_KEY_UNKNOWN');
    if (deterministicReplayRequired !== true) {
      failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_DETERMINISTIC_REPLAY_REQUIRED');
    }
    if (typedRejectionEnvelopeRequired !== true) {
      failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_TYPED_REJECTION_ENVELOPE_REQUIRED');
    }
    if (noSecondSotRequired !== true) {
      failures.add('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_NO_SECOND_SOT_REQUIRED');
    }
  }

  const sortedFailures = [...failures].sort();
  const sortedMissingFields = [...missingFields].sort();
  const ok = sortedFailures.length === 0;
  const token = {
    COLLAB_CAUSAL_QUEUE_READINESS_OK: ok ? 1 : 0,
  };

  return {
    ok,
    status,
    failures: sortedFailures,
    missingFields: sortedMissingFields,
    evidence: {
      baselineSha,
      configHash,
      configHashExpected,
      schemaVersion,
    },
    token,
    COLLAB_CAUSAL_QUEUE_READINESS_OK: token.COLLAB_CAUSAL_QUEUE_READINESS_OK,
    toolVersion: TOOL_VERSION,
    readinessPath,
    fileSha256,
    normalizedSpecHash,
    configHashOk,
  };
}

function printTokens(state) {
  console.log(`COLLAB_CAUSAL_QUEUE_READINESS_OK=${state.COLLAB_CAUSAL_QUEUE_READINESS_OK}`);
  console.log(`COLLAB_CAUSAL_QUEUE_READINESS_STATUS=${state.status}`);
  if (state.failures.length > 0) console.log(`FAIL_REASON=${state.failures[0]}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCollabCausalQueueReadinessState({
    readinessPath: args.readinessPath,
    repoRoot: args.repoRoot,
  });

  if (args.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  else printTokens(state);
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
