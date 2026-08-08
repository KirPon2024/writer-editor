import { stableJson } from './reviewTransportCore.mjs';

export const RTK_WORD_V4_CORE_MANIFEST_SCHEMA = 'yalken.rtk.word-v4.core-manifest.v1';
export const RTK_WORD_V4_EXPORT_MAP_SCHEMA = 'yalken.rtk.word-v4.export-map.v1';
export const RTK_WORD_V4_YRTK2_TOKEN_SCHEMA = 'yalken.rtk.word-v4.yrtk2-token.v1';
export const RTK_WORD_V4_YRTK2_MAGIC_ASCII = 'YRT2';
export const RTK_WORD_V4_YRTK2_VERSION = 1;
export const RTK_WORD_V4_YRTK2_TOKEN_LENGTH = 135;
export const RTK_WORD_V4_YRTK2_PAYLOAD_BYTES = 69;
export const RTK_WORD_V4_YRTK2_TOTAL_BYTES = 101;
export const RTK_WORD_V4_YRTK2_MAC_DOMAIN = 'YALKEN_RTK_WORD_V4_YRTK2_MAC_INPUT_V1';

const HEX_16_BYTES_RE = /^[a-f0-9]{32}$/u;
const HEX_32_BYTES_RE = /^[a-f0-9]{64}$/u;
const SIGNED_SHA256_RE = /^sha256:[a-f0-9]{64}$/u;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/u;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

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

function normalizeSha256(value) {
  const text = rawString(value).trim().toLowerCase();
  if (HEX_32_BYTES_RE.test(text)) return `sha256:${text}`;
  if (SIGNED_SHA256_RE.test(text)) return text;
  return '';
}

function normalizeHex(value, bytes) {
  const text = rawString(value).trim().toLowerCase();
  if (bytes === 16 && HEX_16_BYTES_RE.test(text)) return text;
  if (bytes === 32 && HEX_32_BYTES_RE.test(text)) return text;
  return '';
}

function shaHex(value) {
  return rawString(value).replace(/^sha256:/u, '').toLowerCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

// CANON-01: domain-separated bottom-up hash tree recipe over the ORDERED export map.
// Block digest <- domainBlock {sceneId, sceneOrdinal, documentParagraphIndex, blockId,
//   paragraphId, canonicalTextSha256, canonicalMarksSha256, formatIr}.
// Scene digest <- domainScene {projectId, sceneId, sceneOrdinal, sceneRevision, rawSha256,
//   ordered blockDigests [{blockId, digest}]}.
// Root digest <- domainRoot {sceneDigests [{sceneId, digest}]}.
// This single builder is used both by producers (full-manuscript / single-scene) and by
// validateCoreManifestPayload recomputation, so an honest tree always reconciles and a
// fabricated tree of constant digests is rejected.
export const RTK_WORD_V4_DOMAIN_BLOCK = 'domainBlock';
export const RTK_WORD_V4_DOMAIN_SCENE = 'domainScene';
export const RTK_WORD_V4_DOMAIN_ROOT = 'domainRoot';

export function buildWordV4ManifestHashTree(exportMap, projectId, cryptoPort) {
  const port = cryptoPort || {};
  const sha256Json = typeof port.sha256Json === 'function' ? port.sha256Json.bind(port) : null;
  if (!sha256Json) {
    return {
      ok: false,
      status: 'blocked',
      code: 'RTK_V4_CORE_MANIFEST_CRYPTO_PORT_REQUIRED',
      reasons: [reason('RTK_V4_CORE_MANIFEST_CRYPTO_PORT_REQUIRED', 'cryptoPort.sha256Json', 'Hash tree builder requires CryptoPort.sha256Json.')],
    };
  }
  const normOrdinal = (value) => (Number.isSafeInteger(value) ? value : null);
  const scenes = Array.isArray(exportMap?.scenes) ? exportMap.scenes : [];
  const blockDigests = [];
  const blockDigestByBlockId = new Map();
  for (const scene of scenes) {
    const sceneId = rawString(scene.sceneId);
    const sceneOrdinal = normOrdinal(scene.sceneOrdinal);
    for (const block of Array.isArray(scene.blocks) ? scene.blocks : []) {
      const blockId = rawString(block.blockId);
      const documentParagraphIndex = normOrdinal(block.documentParagraphIndex);
      const entry = {
        sceneId,
        sceneOrdinal,
        documentParagraphIndex,
        blockId,
        digest: sha256Json({
          domain: RTK_WORD_V4_DOMAIN_BLOCK,
          sceneId,
          sceneOrdinal,
          documentParagraphIndex,
          blockId,
          paragraphId: rawString(block.paragraphId),
          canonicalTextSha256: normalizeSha256(block.canonicalTextSha256),
          canonicalMarksSha256: normalizeSha256(block.canonicalMarksSha256),
          formatIr: cloneJsonSafe(block.formatIr ?? null),
        }),
      };
      blockDigests.push(entry);
      blockDigestByBlockId.set(blockId, entry.digest);
    }
  }
  const sceneDigests = scenes.map((scene) => {
    const sceneId = rawString(scene.sceneId);
    const sceneOrdinal = normOrdinal(scene.sceneOrdinal);
    const digest = sha256Json({
      domain: RTK_WORD_V4_DOMAIN_SCENE,
      projectId: rawString(projectId),
      sceneId,
      sceneOrdinal,
      sceneRevision: rawString(scene.sceneRevision),
      rawSha256: normalizeSha256(scene.rawSha256),
      blockDigests: (Array.isArray(scene.blocks) ? scene.blocks : []).map((block) => ({
        blockId: rawString(block.blockId),
        digest: blockDigestByBlockId.get(rawString(block.blockId)) || '',
      })),
    });
    return { sceneId, sceneOrdinal, digest };
  });
  return {
    ok: true,
    status: 'created',
    code: 'RTK_V4_CORE_MANIFEST_HASH_TREE_BUILT',
    rootDigest: sha256Json({
      domain: RTK_WORD_V4_DOMAIN_ROOT,
      sceneDigests: sceneDigests.map((entry) => ({ sceneId: entry.sceneId, digest: entry.digest })),
    }),
    sceneDigests,
    blockDigests,
    reasons: [],
  };
}

function normalizeHashTree(input = {}) {
  return {
    treeAlg: rawString(input.treeAlg) || 'sha256-stable-json-v1',
    rootDigest: normalizeSha256(input.rootDigest),
    // CANON-01 P0-02: ORDERED projection — preserve producer scene/block order. Sorting by id
    // erased order swaps (C2); the canonical projection now carries ordinals and keeps order.
    sceneDigests: list(input.sceneDigests).map((scene) => ({
      sceneId: rawString(scene.sceneId),
      sceneOrdinal: Number.isSafeInteger(scene.sceneOrdinal) ? scene.sceneOrdinal : undefined,
      digest: normalizeSha256(scene.digest),
    })),
    blockDigests: list(input.blockDigests).map((block) => ({
      sceneId: rawString(block.sceneId),
      sceneOrdinal: Number.isSafeInteger(block.sceneOrdinal) ? block.sceneOrdinal : undefined,
      documentParagraphIndex: Number.isSafeInteger(block.documentParagraphIndex) ? block.documentParagraphIndex : undefined,
      blockId: rawString(block.blockId),
      digest: normalizeSha256(block.digest),
    })),
  };
}

// CANON-01 F-02/P0-02: closed ordered export-map projection. Preserves producer order of
// scenes/blocks/wordSignals (NO id/kind sort), carries scope + sceneOrdinal + blockOrdinal
// (paragraphOrdinal) + documentParagraphIndex + formatIr into the digest. Ordinals and
// formatIr participate as canonical values: their presence/absence/reorder changes the
// digest (C2/C3/C4), but absence is a distinct canonical value rather than a hard rejection,
// matching the canon01 spec (C3 keeps ok:true with differing digests when ordinals drop).
// Replacing the order-preserving projection with an id sort re-introduces the C1/C2/C3/C4
// collisions the contract kills.
function normalizeExportMap(input = {}) {
  const scenes = list(input.scenes).map((scene) => {
    const sceneOrdinalRaw = scene.sceneOrdinal;
    return {
      sceneId: rawString(scene.sceneId),
      sceneOrdinal: Number.isSafeInteger(sceneOrdinalRaw) ? sceneOrdinalRaw : null,
      sceneRevision: rawString(scene.sceneRevision),
      rawSha256: normalizeSha256(scene.rawSha256),
      blocks: list(scene.blocks).map((block) => {
        const documentParagraphIndexRaw = block.documentParagraphIndex;
        const paragraphOrdinalRaw = block.paragraphOrdinal;
        return {
          blockId: rawString(block.blockId),
          paragraphId: rawString(block.paragraphId),
          documentParagraphIndex: Number.isSafeInteger(documentParagraphIndexRaw)
            ? documentParagraphIndexRaw
            : null,
          paragraphOrdinal: Number.isSafeInteger(paragraphOrdinalRaw)
            ? paragraphOrdinalRaw
            : null,
          canonicalTextSha256: normalizeSha256(block.canonicalTextSha256),
          canonicalMarksSha256: normalizeSha256(block.canonicalMarksSha256),
          // CANON-01 C4: formatIr participates in the digest; closed form is the cloned object.
          formatIr: cloneJsonSafe(block.formatIr ?? null),
          wordSignals: list(block.wordSignals).map((signal) => ({
            kind: rawString(signal.kind),
            value: cloneJsonSafe(signal.value ?? {}),
            applyAuthority: signal.applyAuthority === true,
          })),
        };
      }),
    };
  });
  return {
    schemaVersion: RTK_WORD_V4_EXPORT_MAP_SCHEMA,
    exportMapId: rawString(input.exportMapId),
    profileId: rawString(input.profileId),
    // CANON-01 C1: scope participates in the digest; previously dropped, colliding full-manuscript
    // and scene scopes over identical block payloads.
    scope: rawString(input.scope),
    roundId: rawString(input.roundId),
    scenes,
  };
}

function validateExportMap(map) {
  const reasons = [];
  for (const key of ['exportMapId', 'profileId', 'roundId']) {
    if (!map[key]) reasons.push(reason('RTK_V4_EXPORT_MAP_FIELD_REQUIRED', key, 'ExportMap field is required.'));
  }
  if (map.scenes.length === 0) {
    reasons.push(reason('RTK_V4_EXPORT_MAP_SCENE_REQUIRED', 'scenes', 'ExportMap needs at least one scene.'));
  }
  for (const [sceneIndex, scene] of map.scenes.entries()) {
    if (!scene.sceneId) reasons.push(reason('RTK_V4_EXPORT_MAP_FIELD_REQUIRED', `scenes.${sceneIndex}.sceneId`, 'Scene id is required.'));
    if (!scene.sceneRevision) reasons.push(reason('RTK_V4_EXPORT_MAP_FIELD_REQUIRED', `scenes.${sceneIndex}.sceneRevision`, 'Scene revision is required.'));
    if (!SIGNED_SHA256_RE.test(scene.rawSha256)) reasons.push(reason('RTK_V4_EXPORT_MAP_DIGEST_INVALID', `scenes.${sceneIndex}.rawSha256`, 'Scene raw hash must be a full lowercase sha256 digest.'));
    if (scene.blocks.length === 0) reasons.push(reason('RTK_V4_EXPORT_MAP_BLOCK_REQUIRED', `scenes.${sceneIndex}.blocks`, 'Scene needs at least one block.'));
    for (const [blockIndex, block] of scene.blocks.entries()) {
      for (const key of ['blockId', 'paragraphId']) {
        if (!block[key]) reasons.push(reason('RTK_V4_EXPORT_MAP_FIELD_REQUIRED', `scenes.${sceneIndex}.blocks.${blockIndex}.${key}`, 'Block field is required.'));
      }
      for (const key of ['canonicalTextSha256', 'canonicalMarksSha256']) {
        if (!SIGNED_SHA256_RE.test(block[key])) reasons.push(reason('RTK_V4_EXPORT_MAP_DIGEST_INVALID', `scenes.${sceneIndex}.blocks.${blockIndex}.${key}`, 'Block digest must be full lowercase sha256.'));
      }
      if (block.wordSignals.some((signal) => signal.applyAuthority === true)) {
        reasons.push(reason('RTK_V4_EXPORT_MAP_WORD_SIGNAL_AUTHORITY_FORBIDDEN', `scenes.${sceneIndex}.blocks.${blockIndex}.wordSignals`, 'Word-native signals cannot provide apply authority in E03.'));
      }
    }
  }
  return reasons;
}

function resolveCryptoPort(port = {}) {
  return {
    sha256Json: typeof port.sha256Json === 'function' ? port.sha256Json.bind(port) : null,
    hmacSha256Text: typeof port.hmacSha256Text === 'function' ? port.hmacSha256Text.bind(port) : null,
  };
}

function manifestWithoutDigest(input = {}) {
  return {
    schemaVersion: RTK_WORD_V4_CORE_MANIFEST_SCHEMA,
    profileId: rawString(input.profileId),
    projectId: rawString(input.projectId),
    roundId: rawString(input.roundId),
    exportArtifactId: rawString(input.exportArtifactId),
    semanticReturnId: rawString(input.semanticReturnId),
    createdAtUtc: rawString(input.createdAtUtc),
    compileIrDigest: normalizeSha256(input.compileIrDigest),
    actualBaselineDigest: normalizeSha256(input.actualBaselineDigest),
    parserProfileDigest: normalizeSha256(input.parserProfileDigest),
    capabilityProfileDigest: normalizeSha256(input.capabilityProfileDigest),
    exportMap: normalizeExportMap(input.exportMap),
    hashTree: normalizeHashTree(input.hashTree),
    artifactIdentities: {
      provisionalDocxSha256: normalizeSha256(input.artifactIdentities?.provisionalDocxSha256),
      finalDocxSha256: '',
      returnArtifactId: rawString(input.artifactIdentities?.returnArtifactId),
      applyId: rawString(input.artifactIdentities?.applyId),
      effectIds: (Array.isArray(input.artifactIdentities?.effectIds) ? input.artifactIdentities.effectIds : [])
        .map(rawString)
        .filter(Boolean)
        .sort(),
    },
    roundState: rawString(input.roundState) || 'EXPORT_PREPARED_NOT_RETURNED',
  };
}

function validateCoreManifestPayload(payload, originalInput = {}, cryptoPort = null) {
  const reasons = [];
  for (const key of ['profileId', 'projectId', 'roundId', 'exportArtifactId', 'createdAtUtc']) {
    if (!payload[key]) reasons.push(reason('RTK_V4_CORE_MANIFEST_FIELD_REQUIRED', key, 'CoreManifest field is required.'));
  }
  for (const key of ['compileIrDigest', 'actualBaselineDigest', 'parserProfileDigest', 'capabilityProfileDigest']) {
    if (!SIGNED_SHA256_RE.test(payload[key])) reasons.push(reason('RTK_V4_CORE_MANIFEST_DIGEST_INVALID', key, 'CoreManifest digest must be full lowercase sha256.'));
  }
  if (originalInput.finalDocxSha256 || originalInput.artifactIdentities?.finalDocxSha256) {
    reasons.push(reason('RTK_V4_CORE_MANIFEST_HASH_CYCLE_FORBIDDEN', 'finalDocxSha256', 'CoreManifest cannot contain raw hash of final DOCX.'));
  }
  reasons.push(...validateExportMap(payload.exportMap));
  if (!SIGNED_SHA256_RE.test(payload.hashTree.rootDigest)) {
    reasons.push(reason('RTK_V4_CORE_MANIFEST_HASH_TREE_ROOT_INVALID', 'hashTree.rootDigest', 'Hash tree root must be a full lowercase sha256 digest.'));
  }
  // CANON-01 C5/C8: bottom-up recompute over the ORDERED export map. The single shared builder
  // is used here, so a tree of fabricated constant digests is rejected while an honestly-built
  // canonical tree reconciles. Recompute runs only after the payload-level digest checks, so
  // an invalid rootDigest still produces its typed code first.
  if (SIGNED_SHA256_RE.test(payload.hashTree.rootDigest)) {
    const recomputed = buildWordV4ManifestHashTree(payload.exportMap, payload.projectId, { sha256Json: cryptoPort?.sha256Json });
    if (recomputed.ok && (
      recomputed.rootDigest !== payload.hashTree.rootDigest
      || !treeDigestsMatch(recomputed.sceneDigests, payload.hashTree.sceneDigests)
      || !treeDigestsMatch(recomputed.blockDigests, payload.hashTree.blockDigests)
    )) {
      reasons.push(reason(
        'RTK_V4_CORE_MANIFEST_HASH_TREE_RECOMPUTE_MISMATCH',
        'hashTree',
        'Hash tree does not reconcile with the bottom-up recomputation over the ordered export map.',
        { provided: payload.hashTree.rootDigest, recomputed: recomputed.rootDigest },
      ));
    }
  }
  if (!SIGNED_SHA256_RE.test(payload.artifactIdentities.provisionalDocxSha256)) {
    reasons.push(reason('RTK_V4_CORE_MANIFEST_PROVISIONAL_DOCX_HASH_REQUIRED', 'artifactIdentities.provisionalDocxSha256', 'Provisional DOCX hash is required for double self-parse binding.'));
  }
  return reasons;
}

function treeDigestsMatch(recomputed, provided) {
  if (!Array.isArray(recomputed) || !Array.isArray(provided) || recomputed.length !== provided.length) {
    return false;
  }
  const providedByKey = new Map();
  for (const entry of provided) {
    const key = entry.blockId ? `${entry.sceneId}:${entry.blockId}` : entry.sceneId;
    providedByKey.set(key, normalizeSha256(entry.digest));
  }
  for (const entry of recomputed) {
    const key = entry.blockId ? `${entry.sceneId}:${entry.blockId}` : entry.sceneId;
    if (providedByKey.get(key) !== normalizeSha256(entry.digest)) return false;
  }
  return true;
}

export function createWordV4CoreManifest(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  if (!cryptoPort.sha256Json) {
    return {
      ok: false,
      status: 'blocked',
      code: 'RTK_V4_CORE_MANIFEST_CRYPTO_PORT_REQUIRED',
      reasons: [reason('RTK_V4_CORE_MANIFEST_CRYPTO_PORT_REQUIRED', 'cryptoPort.sha256Json', 'CoreManifest requires CryptoPort.sha256Json.')],
    };
  }
  const payload = manifestWithoutDigest(input);
  const reasons = validateCoreManifestPayload(payload, input, { sha256Json: cryptoPort.sha256Json });
  if (reasons.length > 0) {
    return {
      ok: false,
      status: 'blocked',
      code: reasons[0].code,
      reasons,
    };
  }
  const coreManifestDigest = cryptoPort.sha256Json(payload);
  return {
    ok: true,
    status: 'created',
    code: 'RTK_V4_CORE_MANIFEST_CREATED',
    manifest: {
      ...payload,
      coreManifestDigest,
    },
    coreManifestDigest,
    reasons: [],
  };
}

function hexToBytes(hex) {
  const out = [];
  for (let index = 0; index < hex.length; index += 2) {
    out.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return out;
}

function asciiToBytes(value) {
  return rawString(value).split('').map((char) => char.charCodeAt(0) & 0xff);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncodeBytes(bytes) {
  let output = '';
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index++];
    const second = index < bytes.length ? bytes[index++] : undefined;
    const third = index < bytes.length ? bytes[index++] : undefined;
    output += BASE64URL_ALPHABET[first >> 2];
    output += BASE64URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second === undefined) break;
    output += BASE64URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    if (third === undefined) break;
    output += BASE64URL_ALPHABET[third & 0x3f];
  }
  return output;
}

function base64UrlDecodeToBytes(token) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of rawString(token)) {
    const value = BASE64URL_ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function yrtk2PayloadBytes({ keyIdHex, roundIdHex, coreManifestDigest }) {
  return [
    ...asciiToBytes(RTK_WORD_V4_YRTK2_MAGIC_ASCII),
    RTK_WORD_V4_YRTK2_VERSION,
    ...hexToBytes(keyIdHex),
    ...hexToBytes(roundIdHex),
    ...hexToBytes(shaHex(coreManifestDigest)),
  ];
}

function macInputHex(payloadBytes) {
  return `${RTK_WORD_V4_YRTK2_MAC_DOMAIN}:${bytesToHex(payloadBytes)}`;
}

function normalizeHmacHex(value) {
  return rawString(value).replace(/^hmac-sha256:/u, '').toLowerCase();
}

export function createYrtk2RoundLocatorToken(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const reasons = [];
  if (!cryptoPort.hmacSha256Text) {
    reasons.push(reason('RTK_V4_YRTK2_CRYPTO_PORT_REQUIRED', 'cryptoPort.hmacSha256Text', 'YRTK2 requires CryptoPort.hmacSha256Text.'));
  }
  const keyIdHex = normalizeHex(input.keyIdHex, 16);
  const roundIdHex = normalizeHex(input.roundIdHex, 16);
  const coreManifestDigest = normalizeSha256(input.coreManifestDigest);
  const secret = rawString(input.hmacSecret);
  if (!keyIdHex) reasons.push(reason('RTK_V4_YRTK2_KEY_ID_INVALID', 'keyIdHex', 'YRTK2 key id must be 16 bytes lowercase hex.'));
  if (!roundIdHex) reasons.push(reason('RTK_V4_YRTK2_ROUND_ID_INVALID', 'roundIdHex', 'YRTK2 round id must be 16 bytes lowercase hex.'));
  if (!SIGNED_SHA256_RE.test(coreManifestDigest)) reasons.push(reason('RTK_V4_YRTK2_CORE_DIGEST_INVALID', 'coreManifestDigest', 'CoreManifest digest must be a full lowercase sha256 digest.'));
  if (!secret) reasons.push(reason('RTK_V4_YRTK2_SECRET_REQUIRED', 'hmacSecret', 'YRTK2 local HMAC secret is required and must not be embedded.'));
  if (input.secretEmbeddedInDocx === true) reasons.push(reason('RTK_V4_YRTK2_SECRET_EMBEDDED', 'secretEmbeddedInDocx', 'YRTK2 secret must never be embedded in DOCX.'));
  if (reasons.length > 0) {
    return { ok: false, status: 'blocked', code: reasons[0].code, exactAuthority: false, reasons };
  }
  const payloadBytes = yrtk2PayloadBytes({ keyIdHex, roundIdHex, coreManifestDigest });
  const macHex = normalizeHmacHex(cryptoPort.hmacSha256Text(macInputHex(payloadBytes), secret));
  if (!HEX_32_BYTES_RE.test(macHex)) {
    return {
      ok: false,
      status: 'blocked',
      code: 'RTK_V4_YRTK2_HMAC_INVALID',
      exactAuthority: false,
      reasons: [reason('RTK_V4_YRTK2_HMAC_INVALID', 'cryptoPort.hmacSha256Text', 'YRTK2 HMAC must return a 32-byte lowercase hex digest.')],
    };
  }
  const tokenBytes = [...payloadBytes, ...hexToBytes(macHex)];
  const token = base64UrlEncodeBytes(tokenBytes);
  return {
    ok: true,
    status: 'created',
    code: 'RTK_V4_YRTK2_CREATED',
    schemaVersion: RTK_WORD_V4_YRTK2_TOKEN_SCHEMA,
    token,
    tokenLength: token.length,
    keyIdHex,
    roundIdHex,
    coreManifestDigest,
    secretEmbeddedInDocx: false,
    exactAuthority: false,
    reasons: [],
  };
}

export function verifyYrtk2RoundLocatorToken(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const reasons = [];
  const token = rawString(input.token);
  const secret = rawString(input.hmacSecret);
  if (!cryptoPort.hmacSha256Text) reasons.push(reason('RTK_V4_YRTK2_CRYPTO_PORT_REQUIRED', 'cryptoPort.hmacSha256Text', 'YRTK2 requires CryptoPort.hmacSha256Text.'));
  if (!BASE64URL_RE.test(token) || token.length !== RTK_WORD_V4_YRTK2_TOKEN_LENGTH) {
    reasons.push(reason('RTK_V4_YRTK2_TOKEN_SHAPE_INVALID', 'token', 'YRTK2 token must be 135 base64url ASCII characters.'));
  }
  if (!secret) reasons.push(reason('RTK_V4_YRTK2_SECRET_REQUIRED', 'hmacSecret', 'YRTK2 local HMAC secret is required to verify authority.'));
  const decoded = BASE64URL_RE.test(token) ? base64UrlDecodeToBytes(token) : null;
  if (!decoded || decoded.length !== RTK_WORD_V4_YRTK2_TOTAL_BYTES) {
    reasons.push(reason('RTK_V4_YRTK2_TOKEN_BYTES_INVALID', 'token', 'YRTK2 token decoded byte length must be 101.'));
  }
  const bytes = decoded || [];
  const magic = bytes.slice(0, 4).map((value) => String.fromCharCode(value)).join('');
  const version = bytes[4];
  const keyIdHex = bytesToHex(bytes.slice(5, 21));
  const roundIdHex = bytesToHex(bytes.slice(21, 37));
  const coreManifestDigest = `sha256:${bytesToHex(bytes.slice(37, 69))}`;
  const macHex = bytesToHex(bytes.slice(69, 101));
  if (magic !== RTK_WORD_V4_YRTK2_MAGIC_ASCII) reasons.push(reason('RTK_V4_YRTK2_MAGIC_INVALID', 'token.magic', 'YRTK2 magic bytes mismatch.'));
  if (version !== RTK_WORD_V4_YRTK2_VERSION) reasons.push(reason('RTK_V4_YRTK2_VERSION_INVALID', 'token.version', 'YRTK2 version mismatch.'));
  if (input.expectedKeyIdHex && keyIdHex !== normalizeHex(input.expectedKeyIdHex, 16)) reasons.push(reason('RTK_V4_YRTK2_KEY_ID_MISMATCH', 'expectedKeyIdHex', 'YRTK2 key id mismatch.'));
  if (input.expectedRoundIdHex && roundIdHex !== normalizeHex(input.expectedRoundIdHex, 16)) reasons.push(reason('RTK_V4_YRTK2_ROUND_ID_MISMATCH', 'expectedRoundIdHex', 'YRTK2 round id mismatch.'));
  if (input.expectedCoreManifestDigest && coreManifestDigest !== normalizeSha256(input.expectedCoreManifestDigest)) {
    reasons.push(reason('RTK_V4_YRTK2_CORE_DIGEST_MISMATCH', 'expectedCoreManifestDigest', 'YRTK2 CoreManifest digest mismatch.'));
  }
  if (secret && decoded?.length === RTK_WORD_V4_YRTK2_TOTAL_BYTES) {
    const payloadBytes = bytes.slice(0, RTK_WORD_V4_YRTK2_PAYLOAD_BYTES);
    const expectedMacHex = normalizeHmacHex(cryptoPort.hmacSha256Text(macInputHex(payloadBytes), secret));
    if (macHex !== expectedMacHex) reasons.push(reason('RTK_V4_YRTK2_HMAC_MISMATCH', 'token.hmac', 'YRTK2 HMAC mismatch.'));
  }
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'verified' : 'blocked',
    code: reasons.length === 0 ? 'RTK_V4_YRTK2_VERIFIED' : reasons[0].code,
    exactAuthority: reasons.length === 0,
    keyIdHex,
    roundIdHex,
    coreManifestDigest,
    tokenLength: token.length,
    reasons,
  };
}

export function evaluateWordV4DoubleSelfParse(input = {}) {
  const reasons = [];
  const manifestDigest = normalizeSha256(input.coreManifest?.coreManifestDigest);
  if (!SIGNED_SHA256_RE.test(manifestDigest)) {
    reasons.push(reason('RTK_V4_DOUBLE_SELF_PARSE_CORE_DIGEST_REQUIRED', 'coreManifest.coreManifestDigest', 'CoreManifest digest is required.'));
  }
  if (normalizeSha256(input.provisionalSelfParse?.actualBaselineDigest) !== normalizeSha256(input.coreManifest?.actualBaselineDigest)) {
    reasons.push(reason('RTK_V4_DOUBLE_SELF_PARSE_BASELINE_MISMATCH', 'provisionalSelfParse.actualBaselineDigest', 'Provisional self-parse must bind actual baseline.'));
  }
  if (normalizeSha256(input.finalSelfParse?.coreManifestDigest) !== manifestDigest) {
    reasons.push(reason('RTK_V4_DOUBLE_SELF_PARSE_FINAL_CORE_MISMATCH', 'finalSelfParse.coreManifestDigest', 'Final self-parse must recover the same CoreManifest digest.'));
  }
  if (input.finalSelfParse?.semanticEquivalent !== true) {
    reasons.push(reason('RTK_V4_DOUBLE_SELF_PARSE_SEMANTIC_EQUIVALENCE_REQUIRED', 'finalSelfParse.semanticEquivalent', 'Final self-parse must prove semantic equivalence.'));
  }
  if (input.yrtk2Verification?.ok !== true || input.yrtk2Verification?.coreManifestDigest !== manifestDigest) {
    reasons.push(reason('RTK_V4_DOUBLE_SELF_PARSE_YRTK2_REQUIRED', 'yrtk2Verification', 'Verified YRTK2 must bind the CoreManifest digest.'));
  }
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'pass' : 'blocked',
    code: reasons.length === 0 ? 'RTK_V4_DOUBLE_SELF_PARSE_PASS' : reasons[0].code,
    publishAllowed: reasons.length === 0,
    reasons,
  };
}
