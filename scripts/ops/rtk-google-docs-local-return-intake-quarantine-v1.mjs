#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localReturnIntake.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localReturnIntakeQuarantine.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED';
export const RESULT = 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-return-intake-quarantine.contract.test.js';

const REAL_GOOGLE_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';
const NEXT_LOCAL_CONTOUR = 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1';
const ALLOWED_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_RETURNED_ARTIFACTS = 8;
const MAX_AGGREGATE_BYTES = 64 * 1024;

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
  sourceFence: `sha256:${sha256Text('google-docs-local-return-intake-source-fence-v1')}`,
});

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

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status === 0) return String(result.stdout || '').trim();
  return '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withoutKey(objectValue, keyToRemove) {
  const next = {};
  for (const [key, value] of Object.entries(objectValue || {})) {
    if (key !== keyToRemove) next[key] = value;
  }
  return next;
}

function hasOwnTrue(objectValue, keys) {
  if (!isObjectRecord(objectValue)) return '';
  return keys.find((key) => objectValue[key] === true) || '';
}

function failure(code, field, message, packet) {
  const returnedArtifacts = Array.isArray(packet?.returnedArtifacts) ? packet.returnedArtifacts : [];
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
    realAccountE2E: REAL_GOOGLE_E2E,
    packetDigest: packet && typeof packet === 'object' ? sha256Json(packet) : '',
    counts: {
      returnedArtifacts: returnedArtifacts.length,
      quarantinedArtifacts: 0,
      trustedProviderCases: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

function expectedManifestBody(returnedArtifacts, sourceBinding) {
  return {
    manifestId: 'synthetic-google-docs-return-intake-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(sourceBinding))}`,
    artifactBindings: returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    quarantineClass: 'LOCAL_RETURN_INTAKE_QUARANTINE_ONLY',
  };
}

function withDigest(body, digestKey) {
  return {
    ...body,
    [digestKey]: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function expectedOracleBody(returnedArtifacts, manifest) {
  return {
    oracleId: 'synthetic-google-docs-return-intake-oracle-v1',
    expectedAction: 'QUARANTINE_ONLY',
    expectedTrustedProviderCases: 0,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    expectedArtifactCount: returnedArtifacts.length,
    manifestSha256: manifest.manifestSha256,
  };
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic return intake source binding does not match fixture identity'];
    }
  }
  return null;
}

function validateArtifacts(packet) {
  const artifacts = packet.returnedArtifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return ['GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', 'returnedArtifacts', 'at least one returned artifact is required'];
  }
  if (artifacts.length > MAX_RETURNED_ARTIFACTS) {
    return ['GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', 'returnedArtifacts', 'too many returned artifacts for the local synthetic envelope'];
  }

  const artifactIds = new Set();
  const payloadDigests = new Set();
  let aggregateBytes = 0;
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    if (!isObjectRecord(artifact)) {
      return ['GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', `returnedArtifacts.${index}`, 'artifact must be an object'];
    }
    if (typeof artifact.artifactId !== 'string' || artifact.artifactId.length === 0) {
      return ['GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', `returnedArtifacts.${index}.artifactId`, 'artifactId is required'];
    }
    if (artifactIds.has(artifact.artifactId)) {
      return ['GOOGLE_RETURN_INTAKE_REPLAY_REJECTED', `returnedArtifacts.${index}.artifactId`, 'duplicate returned artifact id is a replay signal'];
    }
    artifactIds.add(artifact.artifactId);

    if (artifact.mediaType !== ALLOWED_MEDIA_TYPE) {
      return ['GOOGLE_RETURN_INTAKE_UNSUPPORTED_FORMAT_ABSTAIN', `returnedArtifacts.${index}.mediaType`, 'unsupported returned Google export format remains a typed limitation'];
    }
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) {
      return ['GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', `returnedArtifacts.${index}.payloadText`, 'synthetic returned payload text is required'];
    }
    const expectedPayloadSha256 = `sha256:${sha256Text(artifact.payloadText)}`;
    if (artifact.payloadSha256 !== expectedPayloadSha256) {
      return ['GOOGLE_RETURN_INTAKE_ARTIFACT_DIGEST_MISMATCH', `returnedArtifacts.${index}.payloadSha256`, 'returned artifact payload digest mismatch'];
    }
    const expectedSize = Buffer.byteLength(artifact.payloadText, 'utf8');
    if (artifact.sizeBytes !== expectedSize) {
      return ['GOOGLE_RETURN_INTAKE_ARTIFACT_DIGEST_MISMATCH', `returnedArtifacts.${index}.sizeBytes`, 'returned artifact byte size mismatch'];
    }
    if (payloadDigests.has(artifact.payloadSha256)) {
      return ['GOOGLE_RETURN_INTAKE_REPLAY_REJECTED', `returnedArtifacts.${index}.payloadSha256`, 'duplicate returned bytes are replay/transplant evidence, not diversity'];
    }
    payloadDigests.add(artifact.payloadSha256);
    aggregateBytes += expectedSize;
  }
  if (aggregateBytes > MAX_AGGREGATE_BYTES) {
    return ['GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', 'returnedArtifacts', 'aggregate returned payload exceeds local synthetic envelope'];
  }
  return null;
}

function validateManifest(packet) {
  const manifest = packet.quarantineManifest;
  if (!isObjectRecord(manifest)) {
    return ['GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH', 'quarantineManifest', 'quarantine manifest is required'];
  }
  const expectedBody = expectedManifestBody(packet.returnedArtifacts, packet.sourceBinding);
  const actualBody = withoutKey(manifest, 'manifestSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH', 'quarantineManifest', 'quarantine manifest must bind actual source and returned artifact bytes'];
  }
  const expectedDigest = `sha256:${sha256Text(stableJson(expectedBody))}`;
  if (manifest.manifestSha256 !== expectedDigest) {
    return ['GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH', 'quarantineManifest.manifestSha256', 'quarantine manifest digest mismatch'];
  }
  return null;
}

function validateOracle(packet) {
  const oracle = packet.quarantineOracle;
  if (!isObjectRecord(oracle)) {
    return ['GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH', 'quarantineOracle', 'quarantine oracle is required'];
  }
  if (oracle.expectedTrustedProviderCases !== 0
    || oracle.expectedApplyAdmitted !== 0
    || oracle.expectedProductMutations !== 0) {
    return ['GOOGLE_RETURN_INTAKE_ORACLE_OVERCLAIM', 'quarantineOracle', 'local return intake oracle cannot trust provider evidence, apply, or mutate product state'];
  }
  const expectedBody = expectedOracleBody(packet.returnedArtifacts, packet.quarantineManifest);
  const actualBody = withoutKey(oracle, 'oracleSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH', 'quarantineOracle', 'quarantine oracle must bind actual manifest and zero-authority expectations'];
  }
  const expectedDigest = `sha256:${sha256Text(stableJson(expectedBody))}`;
  if (oracle.oracleSha256 !== expectedDigest) {
    return ['GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH', 'quarantineOracle.oracleSha256', 'quarantine oracle digest mismatch'];
  }
  return null;
}

export function buildSyntheticGoogleDocsLocalReturnIntakePacket(overrides = {}) {
  const returnedArtifacts = overrides.returnedArtifacts || [buildReturnedArtifact()];
  const source = overrides.sourceBinding || { ...EXPECTED_SYNTHETIC_SOURCE };
  const manifest = overrides.quarantineManifest || withDigest(
    expectedManifestBody(returnedArtifacts, source),
    'manifestSha256',
  );
  const oracle = overrides.quarantineOracle || withDigest(
    expectedOracleBody(returnedArtifacts, manifest),
    'oracleSha256',
  );
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-return-intake-office-mode-docx-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_RETURN_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    returnMode: 'LOCAL_SYNTHETIC_RETURNED_DOCX',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    inheritedEvidenceProfileId: '',
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      returnIntakeTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: source,
    returnedArtifacts,
    quarantineManifest: manifest,
    quarantineOracle: oracle,
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'RETURN_INTAKE_LOCAL_QUARANTINE_ONLY',
      'NO_GOOGLE_RETURN_IMPORT_AUTHORITY',
      'NO_GOOGLE_RETURN_APPLY_AUTHORITY',
      'NO_ROUNDTRIP_SUPPORT_CLAIM',
    ],
  };
  return { ...packet, ...overrides };
}

function buildReturnedArtifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local returned-artifact synthetic fixture.',
    'Disposable only. No user document. No Google account.',
    'This payload is quarantined and never imported or applied.',
  ].join('\n');
  return {
    artifactId: 'google-docs-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-returned-office-mode.docx',
    mediaType: ALLOWED_MEDIA_TYPE,
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    returnedContentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

export function evaluateGoogleDocsLocalReturnIntakeQuarantine(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_RETURN_INTAKE_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google return intake cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_RETURN_INTAKE_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
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
    'returnIntakeTrusted',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_RETURN_INTAKE_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local return intake cannot claim support, provider E2E, import, roundtrip, apply, or mutation authority', packet);
  }
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_RETURN_INTAKE_SCHEMA_INVALID', 'limitations', 'typed limitations are required', packet);
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_RETURN_INTAKE_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }

  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const artifactError = validateArtifacts(packet);
  if (artifactError) return failure(...artifactError, packet);
  const manifestError = validateManifest(packet);
  if (manifestError) return failure(...manifestError, packet);
  const oracleError = validateOracle(packet);
  if (oracleError) return failure(...oracleError, packet);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_RETURN_INTAKE_QUARANTINED',
    action: 'QUARANTINE_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    returnMode: packet.returnMode,
    realAccountE2E: REAL_GOOGLE_E2E,
    localQuarantineOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    returnIntakeTrusted: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    manifestDigest: packet.quarantineManifest.manifestSha256,
    oracleDigest: packet.quarantineOracle.oracleSha256,
    counts: {
      returnedArtifacts: packet.returnedArtifacts.length,
      quarantinedArtifacts: packet.returnedArtifacts.length,
      trustedProviderCases: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalReturnIntakeQuarantineReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsLocalReturnIntakePacket();
  const result = evaluateGoogleDocsLocalReturnIntakeQuarantine(packet);
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
    realAccountE2E: REAL_GOOGLE_E2E,
    resourceCeilings: {
      maxReturnedArtifacts: MAX_RETURNED_ARTIFACTS,
      maxAggregatePayloadBytes: MAX_AGGREGATE_BYTES,
      userDocumentsAllowed: false,
      googleAccountAllowed: false,
      networkRuntimeAllowed: false,
    },
    nonClaims: {
      googleDocsReady: false,
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      returnIntakeTrusted: false,
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
      returnIntakeTrust: 'DENY_UNTIL_REAL_GOOGLE_PROVIDER_E2E',
    },
    rollback: {
      type: 'REVERT_THIS_CONTOUR_ONLY',
      preservesPreviousG00Verdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
    },
  };
}

function upsertDiscoveryHead(registry, row) {
  const discoveryHeads = Array.isArray(registry.discoveryHeads) ? registry.discoveryHeads : [];
  const next = discoveryHeads.filter((item) => item.path !== row.path);
  next.push(row);
  next.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return { ...registry, discoveryHeads: next };
}

function updateRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (row?.cellId !== 'google.authenticatedReturnIntakeQuarantine') return row;
    return {
      ...row,
      currentTerminalClass: 'TYPED_QUARANTINE_LOCAL_ONLY',
      userFacingAuthority: 'NO_RETURN_IMPORT_OR_APPLY_AUTHORITY',
      physicalEvidence: false,
      reasonCode: 'GOOGLE_RETURN_INTAKE_QUARANTINE_LOCAL_ONLY_NO_REAL_GOOGLE_E2E',
      requiredNextContour: NEXT_LOCAL_CONTOUR,
      blocksGoogleStage: true,
    };
  });
}

function updateGoogleCurrentState(current) {
  return {
    ...(isObjectRecord(current) ? current : {}),
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    automaticApplyCertified: 0,
    googleStageDone: false,
    localCompatibilityVerdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
    realAccountE2E: REAL_GOOGLE_E2E,
    nextLocalContour: NEXT_LOCAL_CONTOUR,
  };
}

function updateCurrentRealityAudit(current) {
  return {
    ...(isObjectRecord(current) ? current : {}),
    quarantine: 'NOT_WIRED',
    realAccountE2E: REAL_GOOGLE_E2E,
  };
}

export function writeGoogleDocsLocalReturnIntakeQuarantineArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalReturnIntakeQuarantineReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localReturnIntakeQuarantine = {
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
    returnIntakeTrusted: false,
    applyAuthority: false,
    realAccountE2E: REAL_GOOGLE_E2E,
  };

  for (const relativePath of [G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    const current = readJson(repoRoot, relativePath);
    writeJson(repoRoot, relativePath, {
      ...current,
      rows: updateRows(current.rows),
      currentRealityAudit: updateCurrentRealityAudit(current.currentRealityAudit),
      googleCurrentState: updateGoogleCurrentState(current.googleCurrentState),
      nextLocalContour: NEXT_LOCAL_CONTOUR,
      localReturnIntakeQuarantine,
    });
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with local return intake quarantine binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with local return intake quarantine binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'Local returned-artifact intake quarantine receipt — synthetic quarantine evidence only, not Google support/import/roundtrip/apply evidence.',
    },
  ]) {
    registry = upsertDiscoveryHead(registry, row);
  }
  writeJson(repoRoot, REGISTRY_PATH, registry);

  let catalog = readJson(repoRoot, RTK_CATALOG_PATH);
  const contractBasenames = Array.isArray(catalog.contractBasenames) ? [...catalog.contractBasenames] : [];
  if (!contractBasenames.includes(CONTRACT_BASENAME)) contractBasenames.push(CONTRACT_BASENAME);
  contractBasenames.sort();
  catalog = {
    ...catalog,
    contractBasenames,
    currentTruthBinding: {
      ...(isObjectRecord(catalog.currentTruthBinding) ? catalog.currentTruthBinding : {}),
      googleStage: 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E',
      googleLocalReturnIntakeQuarantine: STATUS,
    },
  };
  writeJson(repoRoot, RTK_CATALOG_PATH, catalog);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    realAccountE2E: REAL_GOOGLE_E2E,
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
    ? writeGoogleDocsLocalReturnIntakeQuarantineArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalReturnIntakeQuarantine(buildSyntheticGoogleDocsLocalReturnIntakePacket()),
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
