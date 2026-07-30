import { stableJson } from './reviewTransportCore.mjs';

export const RTK_TRANSPORT_MANIFEST_V2_SCHEMA = 'yalken.rtk.transport-manifest.v2';
export const RTK_TRANSPORT_MANIFEST_SIGNATURE_ALG = 'HMAC-SHA256';
export const RTK_TRANSPORT_MANIFEST_AUTHORITY_SIGNAL = 'signed-scene-block-baseline-v1';
export const RTK_TRANSPORT_MANIFEST_PLACEMENT_SIGNAL_AUTHORITIES = Object.freeze([
  'placement-signal-only',
  'word-native-placement-signal-only',
  'manual-recovery-signal-only',
]);

const SHA256_RE = /^[a-f0-9]{64}$/u;
const SIGNED_SHA256_RE = /^sha256:[a-f0-9]{64}$/u;
const HMAC_RE = /^hmac-sha256:[a-f0-9]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function normalizeDigest(value) {
  const text = rawString(value).trim().toLowerCase();
  if (SHA256_RE.test(text)) return `sha256:${text}`;
  if (SIGNED_SHA256_RE.test(text)) return text;
  return '';
}

function normalizeLocatorSignals(signals = []) {
  return (Array.isArray(signals) ? signals : [])
    .filter(isPlainObject)
    .map((signal) => ({
      signalId: rawString(signal.signalId),
      kind: rawString(signal.kind),
      authority: rawString(signal.authority),
      value: cloneJsonSafe(signal.value ?? {}),
    }))
    .sort((left, right) => rawString(left.signalId).localeCompare(rawString(right.signalId)));
}

function normalizeSceneSnapshots(scenes = []) {
  return (Array.isArray(scenes) ? scenes : [])
    .filter(isPlainObject)
    .map((scene) => ({
      sceneId: rawString(scene.sceneId),
      sceneRevision: rawString(scene.sceneRevision),
      rawSha256: normalizeDigest(scene.rawSha256),
      blocks: (Array.isArray(scene.blocks) ? scene.blocks : [])
        .filter(isPlainObject)
        .map((block) => ({
          blockId: rawString(block.blockId),
          paragraphId: rawString(block.paragraphId),
          canonicalTextSha256: normalizeDigest(block.canonicalTextSha256),
          canonicalMarksSha256: normalizeDigest(block.canonicalMarksSha256),
          locatorSignals: normalizeLocatorSignals(block.locatorSignals),
        }))
        .sort((left, right) => rawString(left.blockId).localeCompare(rawString(right.blockId))),
    }))
    .sort((left, right) => rawString(left.sceneId).localeCompare(rawString(right.sceneId)));
}

function normalizePayload(input = {}) {
  return {
    schemaVersion: RTK_TRANSPORT_MANIFEST_V2_SCHEMA,
    profileId: rawString(input.profileId),
    manifestId: rawString(input.manifestId),
    projectId: rawString(input.projectId),
    roundId: rawString(input.roundId),
    exportId: rawString(input.exportId),
    exportedAtUtc: rawString(input.exportedAtUtc),
    sceneSnapshots: normalizeSceneSnapshots(input.sceneSnapshots),
  };
}

function resolveCryptoPort(port = {}) {
  return {
    sha256Json: typeof port.sha256Json === 'function' ? port.sha256Json.bind(port) : null,
    hmacSha256Json: typeof port.hmacSha256Json === 'function' ? port.hmacSha256Json.bind(port) : null,
  };
}

function validatePayload(payload) {
  const reasons = [];
  for (const key of ['profileId', 'manifestId', 'projectId', 'roundId', 'exportId', 'exportedAtUtc']) {
    if (!rawString(payload[key])) reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', key, 'Transport manifest field is required.'));
  }
  if (!Array.isArray(payload.sceneSnapshots) || payload.sceneSnapshots.length === 0) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', 'sceneSnapshots', 'At least one scene snapshot is required.'));
  }
  for (const [sceneIndex, scene] of payload.sceneSnapshots.entries()) {
    if (!scene.sceneId) reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', `sceneSnapshots.${sceneIndex}.sceneId`, 'Scene id is required.'));
    if (!scene.sceneRevision) reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', `sceneSnapshots.${sceneIndex}.sceneRevision`, 'Scene revision is required.'));
    if (!SIGNED_SHA256_RE.test(scene.rawSha256)) {
      reasons.push(reason('RTK_TRANSPORT_MANIFEST_DIGEST_INVALID', `sceneSnapshots.${sceneIndex}.rawSha256`, 'Scene raw hash must be a full lowercase sha256 digest.'));
    }
    if (!Array.isArray(scene.blocks) || scene.blocks.length === 0) {
      reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', `sceneSnapshots.${sceneIndex}.blocks`, 'At least one block snapshot is required.'));
    }
    for (const [blockIndex, block] of scene.blocks.entries()) {
      if (!block.blockId) reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', `sceneSnapshots.${sceneIndex}.blocks.${blockIndex}.blockId`, 'Block id is required.'));
      if (!block.paragraphId) reasons.push(reason('RTK_TRANSPORT_MANIFEST_FIELD_REQUIRED', `sceneSnapshots.${sceneIndex}.blocks.${blockIndex}.paragraphId`, 'Paragraph id is required.'));
      for (const digestField of ['canonicalTextSha256', 'canonicalMarksSha256']) {
        if (!SIGNED_SHA256_RE.test(block[digestField])) {
          reasons.push(reason('RTK_TRANSPORT_MANIFEST_DIGEST_INVALID', `sceneSnapshots.${sceneIndex}.blocks.${blockIndex}.${digestField}`, 'Block digest must be a full lowercase sha256 digest.'));
        }
      }
      const authoritySignals = block.locatorSignals.filter((signal) => signal.authority === 'required-apply-authority');
      if (authoritySignals.length !== 1 || authoritySignals[0]?.kind !== RTK_TRANSPORT_MANIFEST_AUTHORITY_SIGNAL) {
        reasons.push(reason(
          'RTK_TRANSPORT_MANIFEST_SIGNED_LOCATOR_REQUIRED',
          `sceneSnapshots.${sceneIndex}.blocks.${blockIndex}.locatorSignals`,
          'Exactly one signed scene/block/baseline locator must be present as required apply authority.',
        ));
      }
      for (const signal of block.locatorSignals) {
        if (
          signal.authority !== 'required-apply-authority'
          && !RTK_TRANSPORT_MANIFEST_PLACEMENT_SIGNAL_AUTHORITIES.includes(signal.authority)
        ) {
          reasons.push(reason('RTK_TRANSPORT_MANIFEST_SIGNAL_AUTHORITY_INVALID', `sceneSnapshots.${sceneIndex}.blocks.${blockIndex}.locatorSignals.${signal.signalId}`, 'Locator signal authority is not recognized.'));
        }
      }
    }
  }
  return reasons;
}

function unsignedManifestPayload(manifest = {}) {
  return {
    schemaVersion: manifest.schemaVersion,
    profileId: manifest.profileId,
    manifestId: manifest.manifestId,
    projectId: manifest.projectId,
    roundId: manifest.roundId,
    exportId: manifest.exportId,
    exportedAtUtc: manifest.exportedAtUtc,
    sceneSnapshots: normalizeSceneSnapshots(manifest.sceneSnapshots),
  };
}

export function createReviewTransportManifestV2(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const reasons = [];
  if (!cryptoPort.sha256Json || !cryptoPort.hmacSha256Json) {
    return {
      ok: false,
      status: 'blocked',
      code: 'RTK_TRANSPORT_MANIFEST_CRYPTO_PORT_REQUIRED',
      exactAuthority: false,
      reasons: [reason('RTK_TRANSPORT_MANIFEST_CRYPTO_PORT_REQUIRED', 'cryptoPort', 'CryptoPort must provide sha256Json and hmacSha256Json.')],
    };
  }
  const payload = normalizePayload(input);
  reasons.push(...validatePayload(payload));
  const hmacSecret = rawString(input.hmacSecret);
  if (!hmacSecret) reasons.push(reason('RTK_TRANSPORT_MANIFEST_HMAC_SECRET_REQUIRED', 'hmacSecret', 'Local HMAC secret is required and must not be embedded.'));
  if (reasons.length > 0) {
    return {
      ok: false,
      status: 'blocked',
      code: reasons[0].code,
      exactAuthority: false,
      reasons,
    };
  }
  const payloadDigest = cryptoPort.sha256Json(payload);
  const hmac = cryptoPort.hmacSha256Json(payload, hmacSecret);
  return {
    ok: true,
    status: 'created',
    code: 'RTK_TRANSPORT_MANIFEST_CREATED',
    exactAuthority: true,
    manifest: {
      ...payload,
      payloadDigest,
      signature: {
        alg: RTK_TRANSPORT_MANIFEST_SIGNATURE_ALG,
        keyId: rawString(input.keyId) || 'local-yalken-export-secret-v1',
        value: `hmac-sha256:${rawString(hmac).replace(/^hmac-sha256:/u, '')}`,
        secretEmbedded: false,
      },
    },
    reasons: [],
  };
}

export function verifyReviewTransportManifestV2(manifest = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const reasons = [];
  if (!cryptoPort.sha256Json || !cryptoPort.hmacSha256Json) {
    return {
      ok: false,
      status: 'blocked',
      code: 'RTK_TRANSPORT_MANIFEST_CRYPTO_PORT_REQUIRED',
      exactAuthority: false,
      reasons: [reason('RTK_TRANSPORT_MANIFEST_CRYPTO_PORT_REQUIRED', 'cryptoPort', 'CryptoPort must provide sha256Json and hmacSha256Json.')],
    };
  }
  const payload = unsignedManifestPayload(manifest);
  reasons.push(...validatePayload(payload));
  if (manifest.schemaVersion !== RTK_TRANSPORT_MANIFEST_V2_SCHEMA) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_SCHEMA_INVALID', 'schemaVersion', 'Transport manifest schema is not Review Transport Manifest v2.'));
  }
  if (manifest.signature?.alg !== RTK_TRANSPORT_MANIFEST_SIGNATURE_ALG) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_SIGNATURE_ALG_INVALID', 'signature.alg', 'Transport manifest signature algorithm is unsupported.'));
  }
  if (manifest.signature?.secretEmbedded !== false) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_SECRET_EMBEDDED', 'signature.secretEmbedded', 'HMAC secret must never be embedded in the DOCX manifest.'));
  }
  if (!SIGNED_SHA256_RE.test(rawString(manifest.payloadDigest))) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_PAYLOAD_DIGEST_INVALID', 'payloadDigest', 'Payload digest must be a full lowercase sha256 digest.'));
  }
  if (!HMAC_RE.test(rawString(manifest.signature?.value))) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_SIGNATURE_INVALID', 'signature.value', 'Transport manifest HMAC must be present as a full lowercase hmac-sha256 digest.'));
  }
  const hmacSecret = rawString(ports.hmacSecret);
  if (!hmacSecret) reasons.push(reason('RTK_TRANSPORT_MANIFEST_HMAC_SECRET_REQUIRED', 'hmacSecret', 'Local HMAC secret is required to verify apply authority.'));

  const expectedPayloadDigest = cryptoPort.sha256Json(payload);
  if (manifest.payloadDigest && manifest.payloadDigest !== expectedPayloadDigest) {
    reasons.push(reason('RTK_TRANSPORT_MANIFEST_PAYLOAD_DIGEST_MISMATCH', 'payloadDigest', 'Transport manifest payload digest mismatch.'));
  }
  if (hmacSecret) {
    const expectedHmac = `hmac-sha256:${rawString(cryptoPort.hmacSha256Json(payload, hmacSecret)).replace(/^hmac-sha256:/u, '')}`;
    if (manifest.signature?.value !== expectedHmac) {
      reasons.push(reason('RTK_TRANSPORT_MANIFEST_HMAC_MISMATCH', 'signature.value', 'Transport manifest HMAC mismatch.'));
    }
  }

  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'verified' : 'blocked',
    code: reasons.length === 0 ? 'RTK_TRANSPORT_MANIFEST_VERIFIED' : reasons[0].code,
    exactAuthority: reasons.length === 0,
    payloadDigest: expectedPayloadDigest,
    reasons,
  };
}

export function createManualOnlyLocatorSignal(input = {}) {
  return {
    signalId: rawString(input.signalId),
    kind: rawString(input.kind) || 'prefix-suffix-text-fingerprint-v1',
    authority: 'manual-recovery-signal-only',
    value: cloneJsonSafe(input.value ?? {}),
  };
}

export { stableJson as stableTransportManifestJson };
