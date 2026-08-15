#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localPreviewDecision.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localPreviewOnlyNoApply.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_LOCAL_VERIFIED';
export const RESULT = 'PREVIEW_ONLY_NO_APPLY_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-preview-only-no-apply.contract.test.js';

const REAL_GOOGLE_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';
const NEXT_LOCAL_CONTOUR = 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1';
const ALLOWED_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_RETURNED_ARTIFACTS = 8;
const MAX_AGGREGATE_BYTES = 64 * 1024;
const MAX_PREVIEW_CHARS = 4096;

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
  sourceFence: `sha256:${sha256Text('google-docs-local-preview-source-fence-v1')}`,
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
  const previewCandidates = Array.isArray(packet?.previewCandidates) ? packet.previewCandidates : [];
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
      previewCandidates: previewCandidates.length,
      trustedProviderCases: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

function expectedManifestBody(returnedArtifacts, sourceBinding) {
  return {
    manifestId: 'synthetic-google-docs-preview-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(sourceBinding))}`,
    artifactBindings: returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    previewClass: 'LOCAL_PREVIEW_ONLY_NO_APPLY',
  };
}

function withDigest(body, digestKey) {
  return {
    ...body,
    [digestKey]: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function expectedPreviewCandidateBody(artifact, sourceBinding) {
  const previewText = String(artifact.payloadText || '').split('\n').slice(0, 3).join('\n').slice(0, MAX_PREVIEW_CHARS);
  return {
    candidateId: 'google-docs-preview-candidate-1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(sourceBinding))}`,
    artifactId: artifact.artifactId,
    artifactSha256: artifact.payloadSha256,
    previewText,
    previewTextSha256: `sha256:${sha256Text(previewText)}`,
    decision: 'PREVIEW_ONLY',
    applyAuthority: 'DENY',
  };
}

function expectedOracleBody(returnedArtifacts, manifest, previewCandidates) {
  return {
    oracleId: 'synthetic-google-docs-preview-only-oracle-v1',
    expectedAction: 'PREVIEW_ONLY',
    expectedPreviewCandidates: previewCandidates.length,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    manifestSha256: manifest.manifestSha256,
    candidateSha256s: previewCandidates.map((candidate) => candidate.candidateSha256),
    artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
  };
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic preview source binding does not match fixture identity'];
    }
  }
  return null;
}

function validateArtifacts(packet) {
  const artifacts = packet.returnedArtifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return ['GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', 'returnedArtifacts', 'at least one returned artifact is required'];
  }
  if (artifacts.length > MAX_RETURNED_ARTIFACTS) {
    return ['GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', 'returnedArtifacts', 'too many returned artifacts for the local preview envelope'];
  }
  const artifactIds = new Set();
  const payloadDigests = new Set();
  let aggregateBytes = 0;
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    if (!isObjectRecord(artifact)) {
      return ['GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', `returnedArtifacts.${index}`, 'artifact must be an object'];
    }
    if (typeof artifact.artifactId !== 'string' || artifact.artifactId.length === 0) {
      return ['GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', `returnedArtifacts.${index}.artifactId`, 'artifactId is required'];
    }
    if (artifactIds.has(artifact.artifactId)) {
      return ['GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED', `returnedArtifacts.${index}.artifactId`, 'duplicate returned artifact id is a replay signal'];
    }
    artifactIds.add(artifact.artifactId);
    if (artifact.mediaType !== ALLOWED_MEDIA_TYPE) {
      return ['GOOGLE_PREVIEW_ONLY_UNSUPPORTED_FORMAT_ABSTAIN', `returnedArtifacts.${index}.mediaType`, 'unsupported returned Google export format remains a typed limitation'];
    }
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) {
      return ['GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', `returnedArtifacts.${index}.payloadText`, 'synthetic returned payload text is required'];
    }
    const expectedPayloadSha256 = `sha256:${sha256Text(artifact.payloadText)}`;
    if (artifact.payloadSha256 !== expectedPayloadSha256) {
      return ['GOOGLE_PREVIEW_ONLY_ARTIFACT_DIGEST_MISMATCH', `returnedArtifacts.${index}.payloadSha256`, 'returned artifact payload digest mismatch'];
    }
    const expectedSize = Buffer.byteLength(artifact.payloadText, 'utf8');
    if (artifact.sizeBytes !== expectedSize) {
      return ['GOOGLE_PREVIEW_ONLY_ARTIFACT_DIGEST_MISMATCH', `returnedArtifacts.${index}.sizeBytes`, 'returned artifact byte size mismatch'];
    }
    if (payloadDigests.has(artifact.payloadSha256)) {
      return ['GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED', `returnedArtifacts.${index}.payloadSha256`, 'duplicate returned bytes are replay/transplant evidence, not diversity'];
    }
    payloadDigests.add(artifact.payloadSha256);
    aggregateBytes += expectedSize;
  }
  if (aggregateBytes > MAX_AGGREGATE_BYTES) {
    return ['GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', 'returnedArtifacts', 'aggregate returned payload exceeds local preview envelope'];
  }
  return null;
}

function validateManifest(packet) {
  const manifest = packet.previewManifest;
  if (!isObjectRecord(manifest)) {
    return ['GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH', 'previewManifest', 'preview manifest is required'];
  }
  const expectedBody = expectedManifestBody(packet.returnedArtifacts, packet.sourceBinding);
  const actualBody = withoutKey(manifest, 'manifestSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH', 'previewManifest', 'preview manifest must bind actual source and returned artifact bytes'];
  }
  const expectedDigest = `sha256:${sha256Text(stableJson(expectedBody))}`;
  if (manifest.manifestSha256 !== expectedDigest) {
    return ['GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH', 'previewManifest.manifestSha256', 'preview manifest digest mismatch'];
  }
  return null;
}

function validatePreviewCandidates(packet) {
  const candidates = packet.previewCandidates;
  if (!Array.isArray(candidates) || candidates.length !== packet.returnedArtifacts.length) {
    return ['GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH', 'previewCandidates', 'one preview candidate per returned artifact is required'];
  }
  const candidateIds = new Set();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const artifact = packet.returnedArtifacts[index];
    if (!isObjectRecord(candidate)) {
      return ['GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH', `previewCandidates.${index}`, 'preview candidate must be an object'];
    }
    if (candidate.applyAuthority !== 'DENY') {
      return ['GOOGLE_PREVIEW_ONLY_CANDIDATE_APPLY_OVERCLAIM', `previewCandidates.${index}.applyAuthority`, 'local preview candidate cannot grant apply authority'];
    }
    if (candidate.decision !== 'PREVIEW_ONLY') {
      return ['GOOGLE_PREVIEW_ONLY_CANDIDATE_APPLY_OVERCLAIM', `previewCandidates.${index}.decision`, 'local preview candidate cannot become an apply decision'];
    }
    if (candidateIds.has(candidate.candidateId)) {
      return ['GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED', `previewCandidates.${index}.candidateId`, 'duplicate preview candidate id is a replay signal'];
    }
    candidateIds.add(candidate.candidateId);
    const expectedBody = expectedPreviewCandidateBody(artifact, packet.sourceBinding);
    const actualBody = withoutKey(candidate, 'candidateSha256');
    if (stableJson(actualBody) !== stableJson(expectedBody)) {
      return ['GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH', `previewCandidates.${index}`, 'preview candidate must bind source, artifact bytes, preview text, and DENY authority'];
    }
    const expectedDigest = `sha256:${sha256Text(stableJson(expectedBody))}`;
    if (candidate.candidateSha256 !== expectedDigest) {
      return ['GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH', `previewCandidates.${index}.candidateSha256`, 'preview candidate digest mismatch'];
    }
  }
  return null;
}

function validateOracle(packet) {
  const oracle = packet.previewOracle;
  if (!isObjectRecord(oracle)) {
    return ['GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH', 'previewOracle', 'preview oracle is required'];
  }
  if (oracle.expectedApplyAdmitted !== 0 || oracle.expectedProductMutations !== 0) {
    return ['GOOGLE_PREVIEW_ONLY_ORACLE_OVERCLAIM', 'previewOracle', 'local preview oracle cannot apply or mutate product state'];
  }
  const expectedBody = expectedOracleBody(packet.returnedArtifacts, packet.previewManifest, packet.previewCandidates);
  const actualBody = withoutKey(oracle, 'oracleSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH', 'previewOracle', 'preview oracle must bind manifest, candidates, artifacts, and zero-authority expectations'];
  }
  const expectedDigest = `sha256:${sha256Text(stableJson(expectedBody))}`;
  if (oracle.oracleSha256 !== expectedDigest) {
    return ['GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH', 'previewOracle.oracleSha256', 'preview oracle digest mismatch'];
  }
  return null;
}

function validateUpstream(packet) {
  const upstream = packet.upstreamLocalReturnIntake;
  if (!isObjectRecord(upstream)) {
    return ['GOOGLE_PREVIEW_ONLY_UPSTREAM_NOT_QUARANTINED', 'upstreamLocalReturnIntake', 'upstream local return-intake quarantine result is required'];
  }
  if (upstream.status !== 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED'
    || upstream.result !== 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E'
    || upstream.action !== 'QUARANTINE_ONLY'
    || upstream.applyAuthority !== 'DENY') {
    return ['GOOGLE_PREVIEW_ONLY_UPSTREAM_NOT_QUARANTINED', 'upstreamLocalReturnIntake', 'preview may only derive from already quarantined local return-intake evidence'];
  }
  return null;
}

export function buildSyntheticGoogleDocsLocalPreviewOnlyNoApplyPacket(overrides = {}) {
  const returnedArtifacts = overrides.returnedArtifacts || [buildReturnedArtifact()];
  const source = overrides.sourceBinding || { ...EXPECTED_SYNTHETIC_SOURCE };
  const previewManifest = overrides.previewManifest || withDigest(
    expectedManifestBody(returnedArtifacts, source),
    'manifestSha256',
  );
  const previewCandidates = overrides.previewCandidates || returnedArtifacts.map((artifact) => withDigest(
    expectedPreviewCandidateBody(artifact, source),
    'candidateSha256',
  ));
  const previewOracle = overrides.previewOracle || withDigest(
    expectedOracleBody(returnedArtifacts, previewManifest, previewCandidates),
    'oracleSha256',
  );
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-preview-office-mode-docx-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_PREVIEW_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    previewMode: 'LOCAL_SYNTHETIC_PREVIEW_ONLY',
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
      previewDecisionTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: source,
    returnedArtifacts,
    previewManifest,
    previewCandidates,
    previewOracle,
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'LOCAL_PREVIEW_ONLY',
      'NO_GOOGLE_RETURN_IMPORT_AUTHORITY',
      'NO_GOOGLE_RETURN_APPLY_AUTHORITY',
      'NO_PRODUCT_MUTATION_AUTHORITY',
    ],
    upstreamLocalReturnIntake: {
      status: 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED',
      result: 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E',
      action: 'QUARANTINE_ONLY',
      applyAuthority: 'DENY',
    },
  };
  return { ...packet, ...overrides };
}

function buildReturnedArtifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local preview synthetic returned artifact.',
    'Disposable only. No user document. No Google account.',
    'This payload can be previewed locally but cannot be imported or applied.',
  ].join('\n');
  return {
    artifactId: 'google-docs-preview-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-preview-returned-office-mode.docx',
    mediaType: ALLOWED_MEDIA_TYPE,
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    contentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

export function evaluateGoogleDocsLocalPreviewOnlyNoApply(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_PREVIEW_ONLY_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google preview cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_PREVIEW_ONLY_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
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
    'previewDecisionTrusted',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_PREVIEW_ONLY_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local Google preview cannot claim support, provider E2E, import, roundtrip, trusted preview, apply, or mutation authority', packet);
  }
  const upstreamError = validateUpstream(packet);
  if (upstreamError) return failure(...upstreamError, packet);
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID', 'limitations', 'typed limitations are required', packet);
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_PREVIEW_ONLY_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }
  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const artifactError = validateArtifacts(packet);
  if (artifactError) return failure(...artifactError, packet);
  const manifestError = validateManifest(packet);
  if (manifestError) return failure(...manifestError, packet);
  const candidateError = validatePreviewCandidates(packet);
  if (candidateError) return failure(...candidateError, packet);
  const oracleError = validateOracle(packet);
  if (oracleError) return failure(...oracleError, packet);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_PREVIEW_ONLY_NO_APPLY_DECISION',
    action: 'PREVIEW_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    previewMode: packet.previewMode,
    realAccountE2E: REAL_GOOGLE_E2E,
    localPreviewOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    returnIntakeTrusted: false,
    previewDecisionTrusted: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    manifestDigest: packet.previewManifest.manifestSha256,
    oracleDigest: packet.previewOracle.oracleSha256,
    counts: {
      returnedArtifacts: packet.returnedArtifacts.length,
      previewCandidates: packet.previewCandidates.length,
      trustedProviderCases: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalPreviewOnlyNoApplyReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsLocalPreviewOnlyNoApplyPacket();
  const result = evaluateGoogleDocsLocalPreviewOnlyNoApply(packet);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: '2026-08-15T00:00:00.000Z',
    originMainSha,
    localHeadSha,
    localPreviewOnly: true,
    noProductMutation: true,
    realAccountE2E: REAL_GOOGLE_E2E,
    resourceCeilings: {
      maxReturnedArtifacts: MAX_RETURNED_ARTIFACTS,
      maxAggregatePayloadBytes: MAX_AGGREGATE_BYTES,
      maxPreviewChars: MAX_PREVIEW_CHARS,
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
      previewDecisionTrusted: false,
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
      previewTrust: 'DENY_UNTIL_REAL_GOOGLE_PROVIDER_E2E_AND_COMMAND_KERNEL_CONTOUR',
      applyAuthority: 'DENY',
    },
    rollback: {
      type: 'REVERT_THIS_CONTOUR_ONLY',
      preservesPreviousG00Verdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
      restoresNextLocalContour: 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1',
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
    if (row?.cellId !== 'google.previewDecisionCommandApply') return row;
    return {
      ...row,
      currentTerminalClass: 'TYPED_PREVIEW_ONLY_LOCAL_NO_APPLY',
      userFacingAuthority: 'LOCAL_PREVIEW_ONLY_NO_APPLY_AUTHORITY',
      physicalEvidence: false,
      reasonCode: 'GOOGLE_PREVIEW_ONLY_NO_APPLY_LOCAL_ONLY_NO_REAL_GOOGLE_E2E',
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
    preview: 'LOCAL_SYNTHETIC_PREVIEW_ONLY_NOT_RUNTIME_WIRED',
    realAccountE2E: REAL_GOOGLE_E2E,
  };
}

export function writeGoogleDocsLocalPreviewOnlyNoApplyArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalPreviewOnlyNoApplyReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localPreviewOnlyNoApply = {
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    localPreviewOnly: true,
    noProductMutation: true,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    returnIntakeTrusted: false,
    previewDecisionTrusted: false,
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
      localPreviewOnlyNoApply,
    });
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with local preview-only no-apply binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with local preview-only no-apply binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'Local returned-artifact preview-only receipt — synthetic preview evidence only, not Google support/import/roundtrip/apply evidence.',
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
      googleLocalPreviewOnlyNoApply: STATUS,
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
    ? writeGoogleDocsLocalPreviewOnlyNoApplyArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalPreviewOnlyNoApply(buildSyntheticGoogleDocsLocalPreviewOnlyNoApplyPacket()),
      };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`STATUS=${result.status}\nRESULT=${result.result}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
