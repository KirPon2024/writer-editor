// Shared ZIP-01 evidence + effective-budget module (node builtins only).
//
// This bounded module owns three concerns used by both the package parser V2
// and the bridge intake path, so that CRC evidence and budget resolution are
// computed in ONE place instead of copy-pasted:
//
//   * crc32(bytes) — IEEE polynomial CRC-32, table-based, unsigned 32-bit.
//   * resolveEffectiveBudgets — min-clamped effective budget object with an
//     explicit list of clamped fields (never silent widening).
//   * effectiveBudgetDigest — sha256 canonical digest over the effective
//     budget object, using the same stable canonical JSON approach as the
//     neighbouring revision-bridge modules.
//   * evaluateZipCrcEvidence — shared CRC evidence evaluation used by both the
//     parser V2 evaluateZipInventory and the core evaluatePackageIntegrity
//     paths so the evidence-required + mismatch semantics cannot drift.

import crypto from 'node:crypto';

export const RTK_ZIP_EVIDENCE_V1_SCHEMA = 'yalken.rtk.zip-evidence.v1';

// Canonical V6 product profile defaults for the RTK return-intake path. These
// are the profileDefaults passed to resolveEffectiveBudgets for ordinary
// intake (V6 profile). They mirror RTK_V6_BUDGETS in reviewTransportCore.mjs
// but are declared independently here so the evidence module has no runtime
// dependency on the core module (kept to node builtins + this bounded module).
export const RTK_ZIP_PROFILE_DEFAULTS_V6 = Object.freeze({
  maxDocxBytes: 50 * 1024 * 1024,
  maxZipEntries: 512,
  maxInflatedPartBytes: 10 * 1024 * 1024,
  maxTotalInflatedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxXmlDepth: 64,
  maxAttributes: 128,
  maxAttributeBytes: 8 * 1024,
  maxBlocks: 5000,
  maxRevisions: 5000,
  maxComments: 2000,
  maxCandidates: 200,
  maxWorkerOutputBytes: 16 * 1024 * 1024,
  softTimeoutMs: 15_000,
  hardTimeoutMs: 30_000,
  memoryTargetBytes: 256 * 1024 * 1024,
});

// Declared ceilings for the product intake path. Caller requests above these
// are clamped (never silently widened). maxBlocks/maxRevisions/maxComments/
// maxCandidates cap at 50_000; maxWorkerOutputBytes caps at 64 MiB; the
// inflation/zip entry ceilings follow the declared product max.
export const RTK_ZIP_CEILING_DECLARED = Object.freeze({
  maxDocxBytes: 50 * 1024 * 1024,
  maxZipEntries: 50_000,
  maxInflatedPartBytes: 10 * 1024 * 1024,
  maxTotalInflatedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxXmlDepth: 64,
  maxAttributes: 128,
  maxAttributeBytes: 8 * 1024,
  maxBlocks: 50_000,
  maxRevisions: 50_000,
  maxComments: 50_000,
  maxCandidates: 50_000,
  maxWorkerOutputBytes: 64 * 1024 * 1024,
  softTimeoutMs: 15_000,
  hardTimeoutMs: 30_000,
  memoryTargetBytes: 256 * 1024 * 1024,
});

// Budget keys that participate in effective resolution. Declared here so the
// resolver and the digest are explicit about the canonical key surface.
const BUDGET_KEYS = Object.freeze([
  'maxDocxBytes',
  'maxZipEntries',
  'maxInflatedPartBytes',
  'maxTotalInflatedBytes',
  'maxCompressionRatio',
  'maxXmlDepth',
  'maxAttributes',
  'maxAttributeBytes',
  'maxBlocks',
  'maxRevisions',
  'maxComments',
  'maxCandidates',
  'maxWorkerOutputBytes',
  'softTimeoutMs',
  'hardTimeoutMs',
  'memoryTargetBytes',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// ---------------------------------------------------------------------------
// CRC32 (table-based, IEEE polynomial 0xedb88320) — unsigned 32-bit return.
// ---------------------------------------------------------------------------
const CRC32_TABLE = (() => {
  const table = new Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return Object.freeze(table);
})();

export function crc32(input) {
  const bytes = Buffer.isBuffer(input)
    ? input
    : (input instanceof Uint8Array
      ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
      : Buffer.from(input));
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Stable canonical JSON — same approach as reviewTransportContracts.mjs so
// digests match across sibling modules.
// ---------------------------------------------------------------------------
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return JSON.stringify(Buffer.from(value).toString('base64'));
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

// ---------------------------------------------------------------------------
// resolveEffectiveBudgets({ requested, profileDefaults, ceiling })
//
//   For each declared budget key: effective = min(requested ?? profileDefault,
//   ceiling). When `requested` is a finite non-negative integer and exceeds the
//   declared ceiling, the field is recorded in clampedFields (the clamp is
//   explicit, never a silent widen). When the caller omits a key, the profile
//   default is used and only clamped by the ceiling if it exceeds it.
//
// Returns:
//   { effective, clampedFields }
//     effective       — frozen budget object keyed by BUDGET_KEYS
//     clampedFields   — array of { field, requested, ceiling } entries
//                       (empty when nothing was clamped)
// ---------------------------------------------------------------------------
export function resolveEffectiveBudgets({
  requested = {},
  profileDefaults = {},
  ceiling = {},
} = {}) {
  const effective = {};
  const clampedFields = [];
  for (const key of BUDGET_KEYS) {
    const defaultValue = isFiniteNonnegativeInteger(profileDefaults[key])
      ? profileDefaults[key]
      : 0;
    const ceilingValue = isFiniteNonnegativeInteger(ceiling[key])
      ? ceiling[key]
      : defaultValue;
    const requestedValue = isFiniteNonnegativeInteger(requested[key])
      ? requested[key]
      : null;
    let chosen;
    if (requestedValue !== null) {
      chosen = requestedValue;
      if (ceilingValue > 0 && requestedValue > ceilingValue) {
        chosen = ceilingValue;
        clampedFields.push({ field: key, requested: requestedValue, ceiling: ceilingValue });
      }
    } else {
      chosen = defaultValue;
      if (ceilingValue > 0 && defaultValue > ceilingValue) {
        chosen = ceilingValue;
        clampedFields.push({ field: key, requested: defaultValue, ceiling: ceilingValue });
      }
    }
    effective[key] = chosen;
  }
  // Pass-through for legacy/non-canonical budget keys (e.g. maxChanges) so the
  // effective object preserves caller-supplied budget surface that predates the
  // canonical BUDGET_KEYS list. These keys are NOT clamped (no declared ceiling)
  // and do not participate in the digest clamp record, but they remain visible
  // to downstream budget consumers and parser-profile digests.
  if (isPlainObject(requested)) {
    for (const key of Object.keys(requested)) {
      if (BUDGET_KEYS.includes(key)) continue;
      if (isFiniteNonnegativeInteger(requested[key])) {
        effective[key] = requested[key];
      }
    }
  }
  return { effective: Object.freeze(effective), clampedFields };
}

// ---------------------------------------------------------------------------
// effectiveBudgetDigest(effective)
//
//   sha256:<64hex> digest over the stable canonical JSON of the effective
//   budget object. Used to pin the exact effective budget observed by the
//   parser alongside its analysis digest.
// ---------------------------------------------------------------------------
export function effectiveBudgetDigest(effective = {}) {
  return `sha256:${sha256Hex(stableJson(effective))}`;
}

// ---------------------------------------------------------------------------
// evaluateZipCrcEvidence(entry, admittedParts, crc32Fn)
//
//   Shared per-entry CRC evidence evaluation. Returns an array of reason
//   objects (empty when evidence is consistent and complete).
//
//   * central-vs-local divergence → RTK_ZIP_LOCAL_CENTRAL_MISMATCH
//   * missing central CRC evidence → RTK_ZIP_CRC_EVIDENCE_MISSING
//   * actual (recomputed) vs central mismatch → RTK_ZIP_CRC_MISMATCH
//
//   `crc32Fn` is the crc32 implementation from this module. It is injected so
//   callers can wire the shared cryptoPort.crc32 port (if present) or the
//   direct implementation. The actual recompute is REQUIRED — never skipped on
//   missing evidence (Z1/Z3 semantics).
// ---------------------------------------------------------------------------
function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

export function evaluateZipCrcEvidence(entry, admittedParts, crc32Fn) {
  const reasons = [];
  const partName = typeof entry?.name === 'string' ? entry.name : '';
  const centralCrc = Number.isSafeInteger(entry?.centralCrc32) ? entry.centralCrc32 : entry?.crc32;
  const localCrc = Number.isSafeInteger(entry?.localCrc32) ? entry.localCrc32 : centralCrc;

  if (Number.isSafeInteger(centralCrc) && Number.isSafeInteger(localCrc) && centralCrc !== localCrc) {
    reasons.push(reason('RTK_ZIP_LOCAL_CENTRAL_MISMATCH', `zip.${partName}.crc32`, 'ZIP local and central CRC metadata disagree.', { partName }));
  }

  if (!Number.isSafeInteger(centralCrc)) {
    // Missing CRC evidence is a rejection, never a silent skip (Z3).
    reasons.push(reason('RTK_ZIP_CRC_EVIDENCE_MISSING', `zip.${partName}.crc32`, 'ZIP entry is missing central CRC evidence.', { partName }));
    return reasons;
  }

  // Determine whether this part is genuinely empty. crc32 of an empty stream
  // is 0, so a zero central CRC is legitimate ONLY for a part with no bytes.
  // We consider both the declared entry byteSize and the admitted content: a
  // part is non-empty when it has admitted content (length > 0) OR a declared
  // byteSize > 0.
  const entryByteSize = Number.isSafeInteger(entry?.byteSize) ? entry.byteSize : null;
  const partContent = (admittedParts && Object.hasOwn(admittedParts, partName))
    ? admittedParts[partName]
    : null;
  const hasAdmittedContent = partContent !== null && String(partContent).length > 0;
  const hasDeclaredSize = entryByteSize !== null && entryByteSize > 0;
  const isNonEmptyPart = hasAdmittedContent || hasDeclaredSize;

  if (centralCrc === 0) {
    // A zero central CRC on NON-EMPTY content means CRC evidence is absent:
    // every real DOCX package carries a non-zero CRC for non-empty parts, and
    // crc32 of any non-empty stream is never 0. Treating zero as a "skip the
    // actual recompute" sentinel opened a bypass where forged
    // {centralCrc32:0, localCrc32:0} on tampered non-empty content passed
    // without a single reason. Empty parts (no bytes, byteSize 0) keep the
    // legit zero CRC. Spec §30.3: absence of evidence forbids an integrity PASS.
    if (isNonEmptyPart) {
      reasons.push(reason('RTK_ZIP_CRC_EVIDENCE_MISSING', `zip.${partName}.crc32`, 'ZIP entry has a zero central CRC on non-empty content; CRC evidence is absent.', { partName }));
    }
    return reasons;
  }

  // Non-zero central CRC: actual recompute is REQUIRED against the admitted
  // part bytes (never skipped). Z1 semantics: stale/divergent content is
  // rejected by recomputing the real CRC and comparing to central metadata.
  if (admittedParts && Object.hasOwn(admittedParts, partName)) {
    const actual = crc32Fn(admittedParts[partName]);
    if (actual !== centralCrc) {
      reasons.push(reason('RTK_ZIP_CRC_MISMATCH', `zip.${partName}.crc32`, 'Admitted part CRC does not match package metadata.', {
        partName,
        expected: centralCrc,
        actual,
      }));
    }
  }
  return reasons;
}
