#!/usr/bin/env node
// R2.4 E0 — immutable MissionContract parser, digest recompute and separate
// MissionApprovalReceipt binding. The sealed contract schema pins the
// pre-approval shape (ownerApproval.status is REQUIRED_AT_FRESH_G0 and
// approvedDigest is null by const/type law), so approval can never be
// smuggled into the sealed file; it exists only as a separate receipt whose
// approvedDigest must equal the recomputed contract digest. Any contract
// change invalidates approval; self-approval fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDigest, readJsonBounded, R24Error, HEX64_RE } from './canonical-json.mjs';
import { assertValidJson } from './json-schema-lite.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MISSION_CONTRACT_SCHEMA_PATH = path.join(MODULE_DIR, 'schemas', 'mission-contract-r2_4.schema.json');

const DIGEST_EXCLUDED_FIELDS = new Set(['missionDigest', 'ownerIntentRecord', 'ownerApproval']);

export const APPROVAL_RECEIPT_SCHEMA_VERSION = 'yalken.mission-approval-receipt.r24.v1';

export function computeMissionDigest(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new R24Error('E_MISSION_CONTRACT_SHAPE', 'contract must be a plain object');
  }
  const core = Object.fromEntries(Object.entries(contract).filter(([key]) => !DIGEST_EXCLUDED_FIELDS.has(key)));
  return canonicalDigest(core);
}

export function loadMissionContract(filePath) {
  const contract = readJsonBounded(filePath);
  const schema = readJsonBounded(MISSION_CONTRACT_SCHEMA_PATH);
  assertValidJson(contract, schema, 'E_MISSION_CONTRACT_SCHEMA');
  const digest = computeMissionDigest(contract);
  if (contract.missionDigest !== digest) {
    throw new R24Error('E_MISSION_DIGEST_INVALID', `declared=${String(contract.missionDigest)} recomputed=${digest}`);
  }
  return { contract, digest };
}

export function verifyApprovalReceipt(contract, receipt, { expectedDigest = null } = {}) {
  if (contract.approvalInvalidatesOnAnyChange !== true) {
    throw new R24Error('E_MISSION_APPROVAL_INVALIDATION_LAW_MISSING');
  }
  const digest = computeMissionDigest(contract);
  if (contract.missionDigest !== digest) {
    throw new R24Error('E_MISSION_DIGEST_INVALID', `declared=${String(contract.missionDigest)} recomputed=${digest}`);
  }
  if (expectedDigest !== null) {
    if (!HEX64_RE.test(String(expectedDigest))) throw new R24Error('E_MISSION_EXPECTED_DIGEST_SHAPE');
    if (digest !== expectedDigest) throw new R24Error('E_MISSION_DIGEST_MISMATCH', `expected=${expectedDigest} actual=${digest}`);
  }
  if (contract.ownerIntentRecord && contract.ownerIntentRecord.runtimeAuthority === true) {
    throw new R24Error('E_MISSION_INTENT_UPGRADED_TO_AUTHORITY');
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new R24Error('E_MISSION_APPROVAL_MISSING');
  if (receipt.schemaVersion !== APPROVAL_RECEIPT_SCHEMA_VERSION) throw new R24Error('E_MISSION_APPROVAL_SCHEMA');
  if (receipt.noSelfApproval !== true) throw new R24Error('E_MISSION_SELF_APPROVAL_LAW_MISSING');
  if (receipt.status !== 'APPROVED') throw new R24Error('E_MISSION_NOT_APPROVED', `status=${String(receipt.status)}`);
  if (typeof receipt.approvedBy !== 'string' || receipt.approvedBy.length === 0) throw new R24Error('E_MISSION_APPROVER_MISSING');
  if (typeof receipt.approvedAtUtc !== 'string' || !Number.isFinite(Date.parse(receipt.approvedAtUtc))) {
    throw new R24Error('E_MISSION_APPROVAL_TIME_INVALID');
  }
  for (const [field, value] of [['missionDigest', receipt.missionDigest], ['approvedDigest', receipt.approvedDigest]]) {
    if (!HEX64_RE.test(String(value))) throw new R24Error('E_MISSION_APPROVAL_DIGEST_SHAPE', field);
  }
  if (receipt.missionDigest !== digest) {
    throw new R24Error('E_MISSION_APPROVAL_BINDING_MISMATCH', `receiptMission=${receipt.missionDigest} recomputed=${digest}`);
  }
  if (receipt.approvedDigest !== digest) {
    throw new R24Error('E_MISSION_APPROVAL_BINDING_MISMATCH', `approved=${receipt.approvedDigest} recomputed=${digest}`);
  }
  return { digest, approved: true, approvedBy: receipt.approvedBy, approvedAtUtc: receipt.approvedAtUtc };
}

const parseArgs = (argv) => {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    const next = argv[i + 1];
    if (typeof next === 'string' && !next.startsWith('--')) {
      out.set(key, next);
      i += 1;
    } else {
      out.set(key, 'true');
    }
  }
  return out;
};

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const file = args.get('--file');
  if (!file || !fs.existsSync(file)) throw new R24Error('E_MISSION_FILE_REQUIRED');
  const { contract, digest } = loadMissionContract(file);
  const expected = args.get('--expected-digest') || null;
  const receiptPath = args.get('--approval-receipt') || null;
  let approval = { approved: false };
  let approvalError = '';
  if (receiptPath) {
    try {
      approval = verifyApprovalReceipt(contract, readJsonBounded(receiptPath), { expectedDigest: expected });
    } catch (error) {
      approvalError = error instanceof R24Error ? error.code : 'E_UNKNOWN';
    }
  } else if (args.has('--require-approval')) {
    approvalError = 'E_MISSION_APPROVAL_MISSING';
  }
  const result = {
    schemaVersion: 'yalken.mission-contract-check.r24',
    file: path.basename(file),
    missionDigest: digest,
    declaredDigest: contract.missionDigest || null,
    digestValid: contract.missionDigest === digest,
    expectedDigest: expected,
    approved: approval.approved === true,
    approvalError,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args.has('--require-approval') && !result.approved) throw new R24Error(approvalError || 'E_MISSION_NOT_APPROVED');
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    const code = error instanceof R24Error ? error.code : 'E_UNKNOWN';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exit(1);
  }
}
