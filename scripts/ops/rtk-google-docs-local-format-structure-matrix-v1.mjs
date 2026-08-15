#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localFormatStructureMatrix.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localFormatStructureMatrix.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1_LOCAL_VERIFIED';
export const RESULT = 'FORMAT_STRUCTURE_MATRIX_ABSTAIN_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-format-structure-matrix.contract.test.js';

const ALLOWED_PROFILE_IDS = Object.freeze([
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
]);

const ALLOWED_FORMAT_KINDS = new Set([
  'bold',
  'italic',
  'underline',
  'heading',
  'list',
  'link',
]);

const ALLOWED_STRUCTURE_KINDS = new Set([
  'footnote',
  'table',
  'media',
  'stableId',
]);

const EXPECTED_SYNTHETIC_SOURCE = Object.freeze({
  projectId: 'synthetic-google-docs-project',
  rootId: 'synthetic-google-docs-root',
  documentId: 'synthetic-google-docs-document',
  canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
  workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
  generation: 1,
});

const ALLOWED_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const NEXT_LOCAL_CONTOUR = 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1';
const REAL_GOOGLE_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';

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

function hasOwnTrue(objectValue, keys) {
  if (!isObjectRecord(objectValue)) return '';
  return keys.find((key) => objectValue[key] === true) || '';
}

function failure(code, field, message, packet) {
  const cases = Array.isArray(packet?.cases) ? packet.cases : [];
  const formatCases = cases.filter((item) => item?.lane === 'formatting').length;
  const structureCases = cases.filter((item) => item?.lane === 'structure').length;
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
      formatCasesAdvertised: Number.isInteger(packet?.advertisedFormatCaseCount) ? Math.max(0, packet.advertisedFormatCaseCount) : 0,
      formatCasesObserved: formatCases,
      structureCasesAdvertised: Number.isInteger(packet?.advertisedStructureCaseCount) ? Math.max(0, packet.advertisedStructureCaseCount) : 0,
      structureCasesObserved: structureCases,
      trustedCases: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_FORMAT_STRUCTURE_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_FORMAT_STRUCTURE_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic format/structure packet source binding does not match fixture identity'];
    }
  }
  return null;
}

function validateFixture(packet) {
  const fixture = packet.fixture;
  if (!isObjectRecord(fixture)) {
    return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'fixture', 'fixture is required'];
  }
  if (fixture.mediaType !== ALLOWED_MEDIA_TYPE) {
    return ['GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_FORMAT_ABSTAIN', 'fixture.mediaType', 'unsupported local Google export format remains a typed limitation'];
  }
  if (typeof fixture.payloadText !== 'string' || fixture.payloadText.length === 0) {
    return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'fixture.payloadText', 'synthetic payload text is required'];
  }
  const expectedSha = `sha256:${sha256Text(fixture.payloadText)}`;
  if (fixture.payloadSha256 !== expectedSha) {
    return ['GOOGLE_FORMAT_STRUCTURE_FIXTURE_DIGEST_MISMATCH', 'fixture.payloadSha256', 'fixture payload digest mismatch'];
  }
  const expectedSize = Buffer.byteLength(fixture.payloadText, 'utf8');
  if (fixture.sizeBytes !== expectedSize) {
    return ['GOOGLE_FORMAT_STRUCTURE_FIXTURE_DIGEST_MISMATCH', 'fixture.sizeBytes', 'fixture byte size mismatch'];
  }
  return null;
}

function validateCases(packet) {
  if (!Number.isInteger(packet.advertisedFormatCaseCount) || packet.advertisedFormatCaseCount < 0) {
    return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'advertisedFormatCaseCount', 'advertised format case count must be a non-negative integer'];
  }
  if (!Number.isInteger(packet.advertisedStructureCaseCount) || packet.advertisedStructureCaseCount < 0) {
    return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'advertisedStructureCaseCount', 'advertised structure case count must be a non-negative integer'];
  }
  if (!Array.isArray(packet.cases)) {
    return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'cases', 'synthetic format/structure cases must be an array'];
  }

  const caseIds = new Set();
  const payloadDigests = new Set();
  const expectedDigests = new Set();
  let formatCount = 0;
  let structureCount = 0;

  for (let index = 0; index < packet.cases.length; index += 1) {
    const item = packet.cases[index];
    if (!isObjectRecord(item)) {
      return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', `cases.${index}`, 'case row must be an object'];
    }
    if (typeof item.caseId !== 'string' || item.caseId.length === 0) {
      return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', `cases.${index}.caseId`, 'caseId is required'];
    }
    if (caseIds.has(item.caseId)) {
      return ['GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH', `cases.${index}.caseId`, 'duplicate synthetic case ids are not accepted'];
    }
    caseIds.add(item.caseId);

    if (item.lane === 'formatting') {
      formatCount += 1;
      if (!ALLOWED_FORMAT_KINDS.has(item.kind)) {
        return ['GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN', `cases.${index}.kind`, 'formatting kind is outside the local typed vocabulary'];
      }
    } else if (item.lane === 'structure') {
      structureCount += 1;
      if (!ALLOWED_STRUCTURE_KINDS.has(item.kind)) {
        return ['GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN', `cases.${index}.kind`, 'structure kind is outside the local typed vocabulary'];
      }
    } else {
      return ['GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN', `cases.${index}.lane`, 'lane must be formatting or structure'];
    }

    if (typeof item.anchor !== 'string' || item.anchor.length === 0) {
      return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', `cases.${index}.anchor`, 'synthetic anchor is required'];
    }
    if (typeof item.payloadText !== 'string' || item.payloadText.length === 0) {
      return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', `cases.${index}.payloadText`, 'synthetic case payload text is required'];
    }
    if (typeof item.expectedText !== 'string' || item.expectedText.length === 0) {
      return ['GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', `cases.${index}.expectedText`, 'synthetic expected text is required'];
    }
    if (payloadDigests.has(item.payloadSha256) || expectedDigests.has(item.expectedSha256)) {
      return ['GOOGLE_FORMAT_STRUCTURE_PHANTOM_DIVERSITY_REJECTED', `cases.${index}.payloadSha256`, 'distinct normalized rows must not reuse fixture or oracle digests'];
    }
    payloadDigests.add(item.payloadSha256);
    expectedDigests.add(item.expectedSha256);
    if (item.payloadSha256 !== `sha256:${sha256Text(item.payloadText)}`) {
      return ['GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH', `cases.${index}.payloadSha256`, 'case payload digest mismatch'];
    }
    if (item.sizeBytes !== Buffer.byteLength(item.payloadText, 'utf8')) {
      return ['GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH', `cases.${index}.sizeBytes`, 'case byte size mismatch'];
    }
    if (item.expectedSha256 !== `sha256:${sha256Text(item.expectedText)}`) {
      return ['GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH', `cases.${index}.expectedSha256`, 'case oracle digest mismatch'];
    }
    if (item.localDisposition !== 'LOCAL_OBSERVED_UNTRUSTED') {
      return ['GOOGLE_FORMAT_STRUCTURE_UNKNOWN_ABSTAIN_NOT_PASS', `cases.${index}.localDisposition`, 'local cases cannot be promoted to trusted provider evidence'];
    }
  }

  if (formatCount !== packet.advertisedFormatCaseCount || structureCount !== packet.advertisedStructureCaseCount) {
    return ['GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH', 'cases', 'advertised format/structure counts must match observed synthetic case rows'];
  }
  return null;
}

function buildCase({ caseId, lane, kind, anchor, expectedText }) {
  const payloadText = [
    `case:${caseId}`,
    `lane:${lane}`,
    `kind:${kind}`,
    `anchor:${anchor}`,
    `expected:${expectedText}`,
    'disposable synthetic local packet only',
  ].join('\n');
  return {
    caseId,
    lane,
    kind,
    anchor,
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    expectedText,
    expectedSha256: `sha256:${sha256Text(expectedText)}`,
    localDisposition: 'LOCAL_OBSERVED_UNTRUSTED',
  };
}

export function buildSyntheticGoogleDocsFormatStructurePacket(overrides = {}) {
  const cases = overrides.cases || [
    buildCase({ caseId: 'fmt-bold-001', lane: 'formatting', kind: 'bold', anchor: 'paragraph-1/run-1', expectedText: 'bold marker retained in local synthetic OOXML label' }),
    buildCase({ caseId: 'fmt-italic-001', lane: 'formatting', kind: 'italic', anchor: 'paragraph-1/run-2', expectedText: 'italic marker retained in local synthetic OOXML label' }),
    buildCase({ caseId: 'fmt-underline-001', lane: 'formatting', kind: 'underline', anchor: 'paragraph-2/run-1', expectedText: 'underline marker retained in local synthetic OOXML label' }),
    buildCase({ caseId: 'fmt-heading-001', lane: 'formatting', kind: 'heading', anchor: 'heading-1', expectedText: 'heading style label retained locally' }),
    buildCase({ caseId: 'fmt-list-001', lane: 'formatting', kind: 'list', anchor: 'list-1/item-1', expectedText: 'list style label retained locally' }),
    buildCase({ caseId: 'fmt-link-001', lane: 'formatting', kind: 'link', anchor: 'paragraph-3/link-1', expectedText: 'link relationship label retained locally' }),
    buildCase({ caseId: 'struct-footnote-001', lane: 'structure', kind: 'footnote', anchor: 'paragraph-2/footnote-1', expectedText: 'footnote reference label observed locally' }),
    buildCase({ caseId: 'struct-table-001', lane: 'structure', kind: 'table', anchor: 'table-1/cell-1-1', expectedText: 'table cell label observed locally' }),
    buildCase({ caseId: 'struct-media-001', lane: 'structure', kind: 'media', anchor: 'media-1', expectedText: 'media placeholder label observed locally' }),
    buildCase({ caseId: 'struct-id-001', lane: 'structure', kind: 'stableId', anchor: 'synthetic-node-id-1', expectedText: 'synthetic id label observed locally' }),
  ];
  const fixturePayload = cases.map((row) => row.payloadText).join('\n---\n');
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-format-structure-matrix-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_FORMAT_STRUCTURE_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    editorMode: 'OFFICE_MODE',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    inheritedEvidenceProfileId: '',
    sourceBinding: { ...EXPECTED_SYNTHETIC_SOURCE },
    fixture: {
      mediaType: ALLOWED_MEDIA_TYPE,
      payloadText: fixturePayload,
      payloadSha256: `sha256:${sha256Text(fixturePayload)}`,
      sizeBytes: Buffer.byteLength(fixturePayload, 'utf8'),
    },
    advertisedFormatCaseCount: 6,
    advertisedStructureCaseCount: 4,
    cases,
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      formattingParsed: false,
      formattingTrusted: false,
      structureParsed: false,
      structureTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_TRUSTED_GOOGLE_FORMATTING_IR',
      'NO_TRUSTED_GOOGLE_STRUCTURE_IR',
      'NO_FORMAT_OR_STRUCTURE_APPLY_AUTHORITY',
      'FORMAT_STRUCTURE_TYPED_ABSTAIN_LOCAL_ONLY',
    ],
  };
  return { ...packet, ...overrides };
}

export function evaluateGoogleDocsLocalFormatStructureMatrix(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_FORMAT_STRUCTURE_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google format/structure limitation evidence cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_FORMAT_STRUCTURE_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
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
    'formattingParsed',
    'formattingTrusted',
    'structureParsed',
    'structureTrusted',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_FORMAT_STRUCTURE_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local format/structure matrix cannot claim provider E2E, support, runtime wiring, import, roundtrip, apply, or mutation authority', packet);
  }
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID', 'limitations', 'typed limitations are required', packet);
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_FORMAT_STRUCTURE_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }

  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const fixtureError = validateFixture(packet);
  if (fixtureError) return failure(...fixtureError, packet);
  const casesError = validateCases(packet);
  if (casesError) return failure(...casesError, packet);

  const formatCases = packet.cases.filter((item) => item.lane === 'formatting');
  const structureCases = packet.cases.filter((item) => item.lane === 'structure');
  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_FORMAT_STRUCTURE_LANES_ABSTAINED',
    action: 'ABSTAIN_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    editorMode: packet.editorMode,
    realAccountE2E: REAL_GOOGLE_E2E,
    localAbstainOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    formattingTrusted: false,
    structureTrusted: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    matrixDigest: sha256Json(packet.cases.map((item) => ({
      caseId: item.caseId,
      lane: item.lane,
      kind: item.kind,
      anchor: item.anchor,
      payloadSha256: item.payloadSha256,
      expectedSha256: item.expectedSha256,
      localDisposition: item.localDisposition,
    }))),
    counts: {
      formatCasesAdvertised: packet.advertisedFormatCaseCount,
      formatCasesObserved: formatCases.length,
      structureCasesAdvertised: packet.advertisedStructureCaseCount,
      structureCasesObserved: structureCases.length,
      trustedCases: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalFormatStructureMatrixReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsFormatStructurePacket();
  const result = evaluateGoogleDocsLocalFormatStructureMatrix(packet);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: '2026-08-15T04:45:00.000Z',
    originMainSha,
    localHeadSha,
    localAbstainOnly: true,
    noProductMutation: true,
    realAccountE2E: REAL_GOOGLE_E2E,
    nonClaims: {
      googleDocsReady: false,
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      formattingParsed: false,
      formattingTrusted: false,
      structureParsed: false,
      structureTrusted: false,
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
    localMatrix: {
      formatCases: 6,
      structureCases: 4,
      formatKinds: [...ALLOWED_FORMAT_KINDS].sort((a, b) => a.localeCompare(b)),
      structureKinds: [...ALLOWED_STRUCTURE_KINDS].sort((a, b) => a.localeCompare(b)),
      uniqueFixtureDigests: 10,
      uniqueOracleDigests: 10,
      trustedProviderCases: 0,
    },
    hostileProof: {
      finiteCases: 1,
      hostileCases: 26,
      semanticMutants: 17,
      survivors: 0,
      requiredFailures: [
        'support/import/roundtrip overclaim',
        'formatting/structure trust overclaim',
        'Google account/network/runtime/user-document/physical overclaim',
        'Word evidence inheritance',
        'stale fixture digest',
        'source transplant or stale generation',
        'case count mismatch',
        'duplicate case id',
        'unsupported kind',
        'case digest reuse',
        'case payload or oracle digest mismatch',
        'UNKNOWN/ABSTAIN as PASS',
      ],
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

function updateFormatStructureRows(rows) {
  return rows.map((row) => {
    if (row?.cellId === 'google.formattingLane') {
      return {
        ...row,
        currentTerminalClass: 'TYPED_ABSTAIN_LOCAL_ONLY',
        userFacingAuthority: 'NO_FORMATTING_TRANSFER_OR_APPLY_AUTHORITY',
        physicalEvidence: false,
        reasonCode: 'GOOGLE_FORMATTING_ABSTAIN_NO_REAL_GOOGLE_E2E',
        requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
        blocksGoogleStage: true,
      };
    }
    if (row?.cellId === 'google.structureLane') {
      return {
        ...row,
        currentTerminalClass: 'TYPED_ABSTAIN_LOCAL_ONLY',
        userFacingAuthority: 'NO_STRUCTURE_TRANSFER_OR_APPLY_AUTHORITY',
        physicalEvidence: false,
        reasonCode: 'GOOGLE_STRUCTURE_ABSTAIN_NO_REAL_GOOGLE_E2E',
        requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
        blocksGoogleStage: true,
      };
    }
    return row;
  });
}

function updateCatalog(catalog) {
  const basenames = new Set(Array.isArray(catalog.contractBasenames) ? catalog.contractBasenames : []);
  basenames.add(CONTRACT_BASENAME);
  return {
    ...catalog,
    contractBasenames: [...basenames].sort((a, b) => a.localeCompare(b)),
    currentTruthBinding: {
      ...(isObjectRecord(catalog.currentTruthBinding) ? catalog.currentTruthBinding : {}),
      googleStage: 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E',
      googleLocalFormatStructureMatrix: STATUS,
    },
  };
}

export function writeGoogleDocsLocalFormatStructureMatrixArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalFormatStructureMatrixReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localFormatStructureMatrix = {
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    localAbstainOnly: true,
    noProductMutation: true,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    formattingParsed: false,
    formattingTrusted: false,
    structureParsed: false,
    structureTrusted: false,
    applyAuthority: false,
    realAccountE2E: REAL_GOOGLE_E2E,
    formatCases: receipt.localMatrix.formatCases,
    structureCases: receipt.localMatrix.structureCases,
  };

  for (const relativePath of [G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    const current = readJson(repoRoot, relativePath);
    const next = {
      ...current,
      localFormatStructureMatrix,
      nextLocalContour: NEXT_LOCAL_CONTOUR,
    };
    if (Array.isArray(current.rows)) next.rows = updateFormatStructureRows(current.rows);
    if (Array.isArray(current.gapMap)) next.gapMap = updateFormatStructureRows(current.gapMap);
    if (isObjectRecord(current.currentRealityAudit)) {
      next.currentRealityAudit = {
        ...current.currentRealityAudit,
        roundtripLossMatrix: {
          ...(isObjectRecord(current.currentRealityAudit.roundtripLossMatrix) ? current.currentRealityAudit.roundtripLossMatrix : {}),
          formatting: 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_FORMATTING_E2E',
          footnotes: 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_STRUCTURE_E2E',
          tables: 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_STRUCTURE_E2E',
          media: 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_STRUCTURE_E2E',
          ids: 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_IDENTITY_E2E',
        },
      };
    }
    next.googleCurrentState = {
      ...(isObjectRecord(current.googleCurrentState) ? current.googleCurrentState : {}),
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
    writeJson(repoRoot, relativePath, next);
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with G04 local format/structure typed limitation binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with G04 local format/structure typed limitation binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'G04 local format/structure typed limitation receipt — digest-bound synthetic local matrix only, not Google support/import/roundtrip/apply evidence.',
    },
  ]) {
    registry = upsertDiscoveryHead(registry, row);
  }
  writeJson(repoRoot, REGISTRY_PATH, registry);

  const catalog = updateCatalog(readJson(repoRoot, RTK_CATALOG_PATH));
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
    ? writeGoogleDocsLocalFormatStructureMatrixArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalFormatStructureMatrix(buildSyntheticGoogleDocsFormatStructurePacket()),
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
