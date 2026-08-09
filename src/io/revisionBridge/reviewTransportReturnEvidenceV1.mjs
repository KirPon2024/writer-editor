// EVID-01 (Pass 2): ReturnEvidencePacket V1 — bounded transport module.
//
// This bounded module owns the immutable evidence packet emitted by the
// secret-free DOCX return intake worker and verified by the main process.
// It is the single source of truth for the packet schema, the canonical
// packetDigest, and the typed forged-packet rejection. It mirrors the style
// of the neighbouring bounded modules (ZipEvidenceV1 / WordBookmarkV1):
// node builtins only, stable canonical JSON digest, frozen shapes, no silent
// widening, and an explicit reason-code surface.
//
// Authority separation (EVID-01 doctrine):
//   * The worker parse lane is SECRET-FREE. It emits a packet that carries
//     unverifiedCarrierEvidence WITHOUT a verified verdict (V2).
//   * Carrier binding (YRTK2 round-locator HMAC verification) happens in
//     main, against the local secret store, AFTER the packet integrity
//     (schema + artifact digest + packetDigest) has been verified (V7).
//   * The packet therefore NEVER carries canApply / exactAuthority /
//     semanticReady authority fields — those are computed in main from the
//     verified packet + the local authority store, never in the worker.

import crypto from 'node:crypto';

export const RTK_RETURN_EVIDENCE_V1_SCHEMA = 'yalken.interop.return-evidence.v1';

// Typed forged-packet rejection code. Declared in this bounded module (not in
// reviewTransportCore.mjs) because the core module is outside the EVID-01
// write-set and the packet is the single consumer of this code today.
export const RTK_RETURN_EVIDENCE_PACKET_INVALID = 'RTK_RETURN_EVIDENCE_PACKET_INVALID';

// Required packet body fields (the signed surface). packetDigest is computed
// over exactly these fields, in canonical order. The frozen list mirrors the
// contract REQUIRED_PACKET_FIELDS so the schema cannot drift from the test.
const PACKET_BODY_FIELDS = Object.freeze([
  'requestId',
  'artifactSha256',
  'effectiveBudgets',
  'effectiveBudgetDigest',
  'resourceReceipt',
  'packageInventoryDigest',
  'unverifiedCarrierEvidence',
  'returnedProjection',
  'projectionDigest',
  'diagnostics',
  'workerBuildDigest',
]);

// Authority fields that the packet must NEVER carry. They are computed in main
// from the verified packet + local authority store; their presence on the
// worker-emitted packet is an authority leak (V2 doctrine).
const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  'canApply',
  'exactAuthority',
  'semanticReady',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Stable canonical JSON — same algorithm as the neighbouring revision-bridge
// modules (sorted keys, recursive) so the digest is reproducible across
// worker/main/test boundaries and never depends on insertion order.
function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeDigest(value) {
  const text = normalizeString(value);
  if (!text) return '';
  // Accept both bare hex and the `sha256:` prefixed form. The packet always
  // serializes the canonical `sha256:<hex>` form.
  const hex = text.startsWith('sha256:') ? text.slice('sha256:'.length) : text;
  if (!/^[0-9a-f]{64}$/u.test(hex)) return '';
  return `sha256:${hex}`;
}

// Canonical packetDigest over the unsigned packet body. The body excludes the
// packetDigest field itself (it is the signature over the rest). Stable JSON
// guarantees the digest is independent of object key insertion order.
export function packetDigestFor(unsignedBody) {
  const canonical = {};
  for (const field of PACKET_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(unsignedBody || {}, field)) {
      canonical[field] = unsignedBody[field];
    }
  }
  return `sha256:${sha256Hex(stableJson(canonical))}`;
}

// Build a frozen ReturnEvidencePacket V1 from the worker-emitted evidence.
//
// Inputs are produced by the secret-free worker parse lane:
//   * requestId / artifactSha256 — intake identity (from the message).
//   * effectiveBudgets / effectiveBudgetDigest — the budget fact observed by
//     the worker (the min-clamped object + its digest travel in the message).
//   * resourceReceipt — the actual/limit budget fact from the parser output.
//   * packageInventoryDigest — digest over the parser packageInventory.
//   * unverifiedCarrierEvidence — the parser authorityCarrier WITHOUT a
//     verified verdict (carrier verification moves to main).
//   * returnedProjection — the parser ReviewIR (immutable, no write authority).
//   * projectionDigest — supportedSemanticDigest (or analysisDigest fallback).
//   * diagnostics — parser reasons + laneCompleteness.
//   * workerBuildDigest — parserProfileDigest (the parser build identity).
//
// Rejects (throws TypeError) if a forbidden authority field is present in the
// inputs — the worker must never emit authority verdicts.
export function buildReturnEvidencePacketV1(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('buildReturnEvidencePacketV1: input must be an object');
  }
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new TypeError(
        `buildReturnEvidencePacketV1: forbidden authority field ${field} (carrier verification happens in main)`,
      );
    }
  }
  const requestId = normalizeString(input.requestId);
  const artifactSha256 = normalizeString(input.artifactSha256);
  const effectiveBudgets = isPlainObject(input.effectiveBudgets) ? input.effectiveBudgets : {};
  const effectiveBudgetDigest = normalizeDigest(input.effectiveBudgetDigest);
  const resourceReceipt = isPlainObject(input.resourceReceipt) ? input.resourceReceipt : {};
  const packageInventoryDigest = normalizeDigest(input.packageInventoryDigest);
  const unverifiedCarrierEvidence = isPlainObject(input.unverifiedCarrierEvidence)
    ? input.unverifiedCarrierEvidence
    : {};
  const returnedProjection = isPlainObject(input.returnedProjection) ? input.returnedProjection : {};
  const projectionDigest = normalizeDigest(input.projectionDigest);
  const diagnostics = Array.isArray(input.diagnostics) ? input.diagnostics : [];
  const workerBuildDigest = normalizeDigest(input.workerBuildDigest);

  const unsignedBody = {
    requestId,
    artifactSha256,
    effectiveBudgets,
    effectiveBudgetDigest,
    resourceReceipt,
    packageInventoryDigest,
    unverifiedCarrierEvidence,
    returnedProjection,
    projectionDigest,
    diagnostics,
    workerBuildDigest,
  };
  const packetDigest = packetDigestFor(unsignedBody);
  return Object.freeze({
    schemaVersion: RTK_RETURN_EVIDENCE_V1_SCHEMA,
    ...unsignedBody,
    packetDigest,
  });
}

// Verify a ReturnEvidencePacket V1 in main before any downstream consumption.
//
// Checks (all must pass):
//   1. schemaVersion === RTK_RETURN_EVIDENCE_V1_SCHEMA
//   2. artifactSha256 === expectedArtifactSha256 (the re-computed sha256 of
//      the DOCX bytes the user dropped — tampered/mismatched artifact rejected)
//   3. packetDigest recompute over the unsigned body matches the carried
//      packetDigest (any field tampering after worker emission is rejected)
//
// Returns { ok: true } on success, or
// { ok: false, code: RTK_RETURN_EVIDENCE_PACKET_INVALID, reason, status } on
// any failure. The caller MUST stop all downstream consumption on !ok.
export function verifyReturnEvidencePacketV1(packet = {}, options = {}) {
  if (!isPlainObject(packet)) {
    return {
      ok: false,
      code: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      reason: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      status: 'blocked',
      detail: 'packet-not-an-object',
    };
  }
  if (packet.schemaVersion !== RTK_RETURN_EVIDENCE_V1_SCHEMA) {
    return {
      ok: false,
      code: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      reason: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      status: 'blocked',
      detail: 'packet-schema-version-mismatch',
      actualSchemaVersion: normalizeString(packet.schemaVersion),
    };
  }
  const expectedArtifactSha256 = normalizeString(options.expectedArtifactSha256);
  const actualArtifactSha256 = normalizeString(packet.artifactSha256);
  if (expectedArtifactSha256 && actualArtifactSha256 !== expectedArtifactSha256) {
    return {
      ok: false,
      code: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      reason: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      status: 'blocked',
      detail: 'artifact-sha256-mismatch',
      expectedArtifactSha256,
      actualArtifactSha256,
    };
  }
  const unsignedBody = {};
  for (const field of PACKET_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(packet, field)) {
      unsignedBody[field] = packet[field];
    }
  }
  const expectedPacketDigest = packetDigestFor(unsignedBody);
  const actualPacketDigest = normalizeString(packet.packetDigest);
  if (actualPacketDigest !== expectedPacketDigest) {
    return {
      ok: false,
      code: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      reason: RTK_RETURN_EVIDENCE_PACKET_INVALID,
      status: 'blocked',
      detail: 'packet-digest-mismatch',
      expectedPacketDigest,
      actualPacketDigest,
    };
  }
  return { ok: true };
}
