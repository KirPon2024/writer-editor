import crypto from 'node:crypto';

import {
  RTK_PACKAGE_REWRITE_REPORT_V2_SCHEMA,
  RTK_REASON_CODES,
  RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
  RTK_REVIEW_IR_V2_SCHEMA,
  RTK_V6_BUDGETS,
  RTK_WORKER_CAPABILITY_V1_SCHEMA,
  buildRedactedPackageRewriteReportV2,
  buildReviewIRV2,
  buildWorkerCapabilityAdapterV1,
  stableJson,
} from './reviewTransportCore.mjs';

export {
  RTK_PACKAGE_REWRITE_REPORT_V2_SCHEMA,
  RTK_REASON_CODES,
  RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
  RTK_REVIEW_IR_V2_SCHEMA,
  RTK_V6_BUDGETS,
  RTK_WORKER_CAPABILITY_V1_SCHEMA,
};

export const REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA = RTK_REVIEW_IR_V2_SCHEMA;
export const REVISION_BRIDGE_W2_WORKER_CAPABILITY_SCHEMA = RTK_WORKER_CAPABILITY_V1_SCHEMA;
export const REVISION_BRIDGE_W2_PACKAGE_REWRITE_REPORT_SCHEMA =
  RTK_PACKAGE_REWRITE_REPORT_V2_SCHEMA;
export const REVISION_BRIDGE_W2_REASON_CODES = RTK_REASON_CODES;

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function nodeByteLength(value) {
  return Buffer.byteLength(rawString(value), 'utf8');
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32Bytes(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePartValue(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
  }
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8');
  return rawString(value);
}

function normalizePartMap(parts = {}) {
  if (parts instanceof Map) return Object.fromEntries(parts.entries());
  if (Array.isArray(parts)) {
    return Object.fromEntries(parts
      .filter((part) => part && typeof part === 'object' && !Array.isArray(part))
      .map((part) => [rawString(part.name), part.value]));
  }
  return parts && typeof parts === 'object' && !Array.isArray(parts) ? parts : {};
}

function normalizePartsForCore(parts = {}) {
  return Object.fromEntries(Object.entries(normalizePartMap(parts)).map(([name, value]) => {
    if (Array.isArray(value)) return [name, value.map(decodePartValue).join('')];
    return [name, decodePartValue(value)];
  }));
}

export function createNodeCryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    byteLength: nodeByteLength,
    crc32(value) {
      return crc32Bytes(Buffer.from(rawString(value), 'utf8'));
    },
  };
}

export function w2Crc32(value) {
  if (Buffer.isBuffer(value)) return crc32Bytes(value);
  return crc32Bytes(Buffer.from(rawString(value), 'utf8'));
}

export function buildW2WorkerCapabilityAdapter(capabilities = {}) {
  return buildWorkerCapabilityAdapterV1(capabilities);
}

export function buildW2ReviewIr(input = {}) {
  return buildReviewIRV2({
    ...input,
    parts: normalizePartsForCore(input.parts),
  }, {
    cryptoPort: createNodeCryptoPort(),
  });
}

export function buildW2RedactedPackageRewriteReport(input = {}) {
  return buildRedactedPackageRewriteReportV2(input, {
    cryptoPort: createNodeCryptoPort(),
  });
}
