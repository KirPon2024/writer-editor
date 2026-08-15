#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localExportPacket.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localExportPacketQuarantine.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1_LOCAL_VERIFIED';
export const RESULT = 'QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';

const ALLOWED_PROFILE_IDS = Object.freeze([
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
]);

const EXPECTED_SYNTHETIC_SOURCE = Object.freeze({
  projectId: 'synthetic-google-docs-project',
  rootId: 'synthetic-google-docs-root',
  documentId: 'synthetic-google-docs-document',
  canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
  workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
  generation: 1,
});

const ALLOWED_MEDIA_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value), 'utf8'));
}

function sha256Json(value) {
  return `sha256:${sha256Text(stableJson(value))}`;
}

function sha256File(absPath) {
  return sha256Buffer(fs.readFileSync(absPath));
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(repoRoot, relativePath, value) {
  const absPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`);
}

function failure(code, field, message, packet) {
  return {
    ok: false,
    status: 'FAIL_CLOSED',
    result: 'FAIL_CLOSED',
    code,
    field,
    message,
    action: 'DENY',
    provider: typeof packet?.provider === 'string' ? packet.provider : '',
    profileId: typeof packet?.profileId === 'string' ? packet.profileId : '',
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
    packetDigest: packet && typeof packet === 'object' ? sha256Json(packet) : '',
    counts: {
      totalArtifacts: Array.isArray(packet?.artifacts) ? packet.artifacts.length : 0,
      quarantinedArtifacts: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnTrue(objectValue, keys) {
  if (!isObjectRecord(objectValue)) return '';
  return keys.find((key) => objectValue[key] === true) || '';
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_EXPORT_PACKET_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_EXPORT_PACKET_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic packet source binding does not match quarantine fixture identity'];
    }
  }
  return null;
}

function validateArtifacts(packet) {
  if (!Array.isArray(packet.artifacts) || packet.artifacts.length === 0) {
    return ['GOOGLE_EXPORT_PACKET_SCHEMA_INVALID', 'artifacts', 'at least one local artifact is required'];
  }
  for (let index = 0; index < packet.artifacts.length; index += 1) {
    const artifact = packet.artifacts[index];
    if (!isObjectRecord(artifact)) {
      return ['GOOGLE_EXPORT_PACKET_SCHEMA_INVALID', `artifacts.${index}`, 'artifact must be an object'];
    }
    if (!ALLOWED_MEDIA_TYPES.has(String(artifact.mediaType || ''))) {
      return ['GOOGLE_EXPORT_PACKET_UNSUPPORTED_FORMAT_ABSTAIN', `artifacts.${index}.mediaType`, 'unsupported local export format remains an abstain/limitation, not pass'];
    }
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) {
      return ['GOOGLE_EXPORT_PACKET_SCHEMA_INVALID', `artifacts.${index}.payloadText`, 'synthetic artifact payload text is required'];
    }
    const expectedPayloadSha256 = `sha256:${sha256Text(artifact.payloadText)}`;
    if (artifact.payloadSha256 !== expectedPayloadSha256) {
      return ['GOOGLE_EXPORT_PACKET_ARTIFACT_DIGEST_MISMATCH', `artifacts.${index}.payloadSha256`, 'artifact payload digest mismatch'];
    }
    const expectedSize = Buffer.byteLength(artifact.payloadText, 'utf8');
    if (artifact.sizeBytes !== expectedSize) {
      return ['GOOGLE_EXPORT_PACKET_ARTIFACT_DIGEST_MISMATCH', `artifacts.${index}.sizeBytes`, 'artifact byte size mismatch'];
    }
  }
  return null;
}

export function buildSyntheticGoogleDocsLocalExportPacket(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local export synthetic fixture.',
    'Disposable only. No user document. No Google account.',
  ].join('\n');
  const payloadSha256 = sha256Text(payloadText);
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-office-mode-docx-basic-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_EXPORT_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    exportMode: 'OFFICE_MODE_DOCX_EXPORT',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: { ...EXPECTED_SYNTHETIC_SOURCE },
    artifacts: [
      {
        artifactId: 'google-docs-office-mode-export-docx',
        fileName: 'synthetic-google-docs-office-mode.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        payloadText,
        payloadSha256: `sha256:${payloadSha256}`,
        sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
        contentClasses: ['plainText', 'paragraphBreaks'],
      },
    ],
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_GOOGLE_PROVIDER_BUILD_PIN',
      'NO_IMPORT_APPLY_AUTHORITY',
      'NO_ROUNDTRIP_SUPPORT_CLAIM',
    ],
  };
  return { ...packet, ...overrides };
}

export function evaluateGoogleDocsLocalExportPacketQuarantine(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_EXPORT_PACKET_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_EXPORT_PACKET_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_EXPORT_PACKET_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google export quarantine cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_EXPORT_PACKET_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
  }
  const packetOverclaim = hasOwnTrue(packet, [
    'googleAccountUsed',
    'networkRuntimeUsed',
    'productRuntimeWired',
    'physicalGoogleEvidence',
    'userDocument',
  ]);
  const claimOverclaim = hasOwnTrue(packet.claims, [
    'supportProven',
    'importProven',
    'roundtripProven',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_EXPORT_PACKET_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local quarantine packet cannot claim support, provider E2E, runtime wiring, apply, or mutation authority', packet);
  }
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_EXPORT_PACKET_SCHEMA_INVALID', 'limitations', 'typed limitations are required', packet);
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_EXPORT_PACKET_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }

  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const artifactError = validateArtifacts(packet);
  if (artifactError) return failure(...artifactError, packet);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_EXPORT_PACKET_QUARANTINED',
    action: 'QUARANTINE_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    exportMode: packet.exportMode,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
    localQuarantineOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    counts: {
      totalArtifacts: packet.artifacts.length,
      quarantinedArtifacts: packet.artifacts.length,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalExportPacketQuarantineReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsLocalExportPacket();
  const result = evaluateGoogleDocsLocalExportPacketQuarantine(packet);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: '2026-08-15T00:00:00.000Z',
    originMainSha,
    localHeadSha,
    localQuarantineOnly: true,
    noProductMutation: true,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
    nonClaims: {
      googleDocsReady: false,
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      applyAuthority: false,
      physicalGoogleEvidence: false,
      productRuntimeWired: false,
      userDocumentsUsed: false,
      googleAccountUsed: false,
      networkRuntimeUsed: false,
      wordEvidenceTransferred: false,
    },
    samplePacket: {
      packet,
      result,
    },
    profileBoundary: {
      acceptedProfiles: [...ALLOWED_PROFILE_IDS],
      wordEvidenceTransferToGoogleDocs: 'DENY',
      unsupportedFormatsRemain: 'ABSTAIN_TYPED_LIMITATION_NOT_PASS',
    },
    rollback: {
      type: 'REVERT_THIS_CONTOUR_ONLY',
      preservesPreviousG00Verdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
    },
  };
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status === 0) return String(result.stdout || '').trim();
  return '';
}

function upsertDiscoveryHead(registry, row) {
  const discoveryHeads = Array.isArray(registry.discoveryHeads) ? registry.discoveryHeads : [];
  const next = discoveryHeads.filter((item) => item.path !== row.path);
  next.push(row);
  next.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return { ...registry, discoveryHeads: next };
}

export function writeGoogleDocsLocalExportPacketQuarantineArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalExportPacketQuarantineReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localExportPacketQuarantine = {
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    localQuarantineOnly: true,
    noProductMutation: true,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthority: false,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
  };

  for (const relativePath of [G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    const current = readJson(repoRoot, relativePath);
    writeJson(repoRoot, relativePath, {
      ...current,
      localExportPacketQuarantine,
    });
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with G01 local export packet quarantine binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with G01 local export packet quarantine binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'G01 local export packet quarantine receipt — local synthetic quarantine evidence only, not Google support/import/roundtrip/apply evidence.',
    },
  ]) {
    registry = upsertDiscoveryHead(registry, row);
  }
  writeJson(repoRoot, REGISTRY_PATH, registry);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
  };
}

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    json: args.has('--json'),
    write: args.has('--write'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.write
    ? writeGoogleDocsLocalExportPacketQuarantineArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalExportPacketQuarantine(buildSyntheticGoogleDocsLocalExportPacket()),
      };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`STATUS=${result.status}\nRESULT=${result.result}\n`);
  }
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) main();
