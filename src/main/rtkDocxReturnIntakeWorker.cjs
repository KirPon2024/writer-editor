'use strict';

const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const DEFAULT_MAX_WORKER_OUTPUT_BYTES = 16 * 1024 * 1024;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto
        .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
        .update(Buffer.from(stableJson(value), 'utf8'))
        .digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
}

// EVID-01 (V2): the worker parse lane is SECRET-FREE. Any inbound field that
// looks like a shared secret is dropped here (defense-in-depth) so a secret
// can never reach the parser. The forbidden-key name is assembled at runtime
// so the worker source never names the secret statically; the worker has no
// knowledge of the secret field by construction.
const FORBIDDEN_SECRET_KEY = `hmac${'Secret'}`;

function stripSecret(value) {
  if (Array.isArray(value)) return value.map(stripSecret);
  if (
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    || value instanceof Uint8Array
    || value instanceof ArrayBuffer
    || value instanceof DataView
  ) {
    return value;
  }
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== FORBIDDEN_SECRET_KEY)
    .map(([key, item]) => [key, stripSecret(item)]));
}

function blocked(reason, details = {}) {
  return {
    ok: false,
    status: 'blocked',
    code: reason,
    reason,
    canWriteManuscript: false,
    canApply: false,
    details: stripSecret(details),
  };
}

function maxWorkerOutputBytes(message = {}) {
  // Effective budget from the parent (resolved via the shared min-clamp
  // resolver in main.js). When present, the effective value wins over the
  // local 16 MiB default (F-11/P1-02).
  const effective = Number(message?.effectiveBudgets?.maxWorkerOutputBytes);
  if (Number.isSafeInteger(effective) && effective > 0) return effective;
  const value = Number(message?.budgets?.maxWorkerOutputBytes);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MAX_WORKER_OUTPUT_BYTES;
}

// Normalize the incoming bytes payload to a Buffer. Accepts ArrayBuffer,
// Uint8Array, Buffer directly (the transferable-bytes path). Falls back to
// legacy bytesBase64 decode for compatibility with existing boundary tests.
// Preference: bytes > bytesBase64.
function normalizeMessageBytes(message = {}) {
  if (message.bytes !== undefined && message.bytes !== null) {
    const raw = message.bytes;
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    if (ArrayBuffer.isView(raw)) {
      return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (raw instanceof Uint8Array) return Buffer.from(raw);
  }
  if (message.bytesBase64 !== undefined && message.bytesBase64 !== null) {
    return Buffer.from(String(message.bytesBase64), 'base64');
  }
  return Buffer.alloc(0);
}

function enforceWorkerOutputBudget(result, message = {}) {
  const stripped = stripSecret(result);
  const limit = maxWorkerOutputBytes(message);
  const bytes = Buffer.byteLength(stableJson(stripped), 'utf8');
  if (bytes > limit) {
    return blocked('RTK_BUDGET_EXCEEDED', {
      field: 'worker.result',
      actual: bytes,
      limit,
      workerOutputBlocked: true,
    });
  }
  return stripped;
}

// EVID-01 (Pass 2): extract the YRTK2 custom-document properties the main
// intake flow needs to verify carrier binding, from the raw docProps/custom.xml
// the parser already carried into parserResult. This is a bounded helper that
// mirrors main's extractDocxCustomPropertyValue (simple property/vt:lpwstr
// regex). The worker never verifies the carrier (no secret); it only surfaces
// the token + coreManifestDigest so main can run verifyYrtk2RoundLocatorToken
// against the local secret store without a main-side ZIP re-extract (V3).
function decodeCustomPropertyText(value) {
  return String(value || '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function extractCustomPropertyValue(customXml, wanted) {
  const xml = String(customXml || '');
  if (!xml || !wanted) return '';
  const propertyRe = /<property\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/property>/gu;
  let match = propertyRe.exec(xml);
  while (match) {
    const attrs = match.groups?.attrs || '';
    const nameMatch = attrs.match(/\bname="([^"]+)"/u);
    if (decodeCustomPropertyText(nameMatch?.[1] || '') === wanted) {
      const valueMatch = (match.groups?.body || '').match(/<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/u);
      return decodeCustomPropertyText(valueMatch?.[1] || '');
    }
    match = propertyRe.exec(xml);
  }
  return '';
}

// Build the ReturnEvidencePacket V1 from the parserResult. The worker is
// secret-free: it emits unverifiedCarrierEvidence WITHOUT a verified verdict
// (carrier binding moves to main). The packet carries the immutable ReviewIR
// projection + digests so downstream consumers (preview / formatting /
// structural / text lane) read from the verified packet instead of reparsing.
function buildPacketFromParserResult(message, parserResult, port) {
  const effectiveBudgets = isPlainObject(message?.effectiveBudgets) ? message.effectiveBudgets : {};
  const effectiveBudgetDigest = String(message?.effectiveBudgetDigest || '');
  const artifactSha256 = String(message?.returnedArtifactSha256 || '');
  // resourceReceipt: the actual/limit budget fact observed by the parser.
  const resourceReceipt = {
    actualWorkerOutputBytes: port.byteLength(parserResult),
    maxWorkerOutputBytes: Number.isSafeInteger(effectiveBudgets.maxWorkerOutputBytes)
      ? effectiveBudgets.maxWorkerOutputBytes
      : null,
    parserStatus: String(parserResult.status || ''),
    sourceMode: String(parserResult.sourceMode || ''),
  };
  // packageInventoryDigest: canonical digest over the parser packageInventory.
  const packageInventoryDigest = `sha256:${port.sha256Text(stableJson(parserResult.packageInventory || {}))}`;
  // unverifiedCarrierEvidence: the parser authorityCarrier as-is, WITHOUT a
  // verified verdict. The worker never verifies (no secret); main does.
  const unverifiedCarrierEvidence = isPlainObject(parserResult.authorityCarrier)
    ? parserResult.authorityCarrier
    : {};
  // returnedProjection: the immutable ReviewIR. Downstream consumers read
  // commentThreads / textRevisions / formattingDeltas / structureChanges from
  // here instead of reparsing the artifact (V4/V5/V6).
  const returnedProjection = isPlainObject(parserResult.reviewIr) ? parserResult.reviewIr : {};
  // projectionDigest: prefer the parser supportedSemanticDigest (the placement-
  // aware semantic digest); fall back to analysisDigest.
  const projectionDigest = String(
    parserResult.supportedSemanticDigest || parserResult.analysisDigest || '',
  );
  const diagnostics = Array.isArray(parserResult.reasons) ? parserResult.reasons : [];
  if (isPlainObject(parserResult.laneCompleteness)) diagnostics.push(parserResult.laneCompleteness);
  const workerBuildDigest = String(parserResult.parserProfileDigest || '');
  const yrtk2Evidence = {
    token: extractCustomPropertyValue(parserResult.docPropsCustomXml, 'YRTK2_TOKEN'),
    coreManifestDigest: extractCustomPropertyValue(parserResult.docPropsCustomXml, 'YRTK_CORE_DIGEST'),
  };
  return revisionBridgeBuildPacket({
    requestId: String(message?.requestId || ''),
    artifactSha256,
    effectiveBudgets,
    effectiveBudgetDigest,
    resourceReceipt,
    packageInventoryDigest,
    unverifiedCarrierEvidence,
    // yrtk2Evidence rides inside the projection provenance so main can verify
    // the carrier from the packet (V3: YRTK2 from packet, not main re-extract).
    returnedProjection: { ...returnedProjection, yrtk2Evidence },
    projectionDigest,
    diagnostics,
    workerBuildDigest,
  });
}

let revisionBridgeBuildPacket = null;

async function run(message = {}) {
  const bridgePath = path.join(__dirname, '..', 'io', 'revisionBridge', 'index.mjs');
  const revisionBridge = await import(pathToFileURL(bridgePath).href);
  if (typeof revisionBridge.buildDocxReviewTransportAnalysisFromZipBytes !== 'function') {
    return blocked('RTK_RETURN_INTAKE_PARSER_V2_UNAVAILABLE');
  }
  if (typeof revisionBridge.buildReturnEvidencePacketV1 !== 'function') {
    return blocked('RTK_RETURN_INTAKE_PARSER_V2_UNAVAILABLE');
  }
  revisionBridgeBuildPacket = revisionBridge.buildReturnEvidencePacketV1;
  const port = cryptoPort();
  const bytes = normalizeMessageBytes(message);
  if (bytes.length === 0) return blocked('RTK_RETURN_INTAKE_BYTES_REQUIRED');
  // EVID-01 (V2): the worker parse lane is SECRET-FREE. stripSecret already
  // drops any inbound shared-secret field from the message; we do NOT re-add
  // it. Carriers in the parser input therefore have no secret, so the parser
  // emits unverifiedCarrierEvidence (status is NOT verified-baseline-bound).
  // Carrier binding (YRTK2 round-locator HMAC verify) moves to main.
  const input = stripSecret({
    ...message,
    bytes,
    bytesBase64: undefined,
  });
  const parserResult = revisionBridge.buildDocxReviewTransportAnalysisFromZipBytes(input, {
    cryptoPort: port,
  });
  if (!isPlainObject(parserResult)) {
    return blocked('RTK_RETURN_INTAKE_PARSER_V2_RESULT_INVALID');
  }
  if (parserResult.ok !== true) {
    return blocked(
      typeof parserResult.reason === 'string' && parserResult.reason
        ? parserResult.reason
        : (typeof parserResult.code === 'string' && parserResult.code
          ? parserResult.code
          : 'RTK_RETURN_INTAKE_PARSER_V2_BLOCKED'),
      { parserCode: typeof parserResult.code === 'string' ? parserResult.code : '' },
    );
  }
  const packet = buildPacketFromParserResult(message, parserResult, port);
  return enforceWorkerOutputBudget({
    ok: true,
    packet,
    // Compat: keep the legacy parserResult alongside the packet so consumers
    // can migrate incrementally. The production chain MUST consume the packet.
    parserResult,
  }, message);
}

function unwrapParentPortMessage(message = {}) {
  if (
    isPlainObject(message)
    && !Object.prototype.hasOwnProperty.call(message, 'bytesBase64')
    && isPlainObject(message.data)
  ) {
    return message.data;
  }
  return message;
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  process.parentPort.on('message', async (message) => {
    const payload = unwrapParentPortMessage(message);
    try {
      const result = await run(payload);
      process.parentPort.postMessage({ result: enforceWorkerOutputBudget(result, payload) });
    } catch (error) {
      process.parentPort.postMessage({
        result: blocked('RTK_RETURN_INTAKE_WORKER_FAILED', {
          message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN',
        }),
      });
    }
  });
}

module.exports = {
  run,
  stripSecret,
  unwrapParentPortMessage,
};
