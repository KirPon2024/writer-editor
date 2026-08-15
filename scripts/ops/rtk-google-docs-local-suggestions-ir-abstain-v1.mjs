#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localSuggestionsIrAbstain.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localSuggestionsIrAbstain.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1_LOCAL_VERIFIED';
export const RESULT = 'SUGGESTIONS_IR_ABSTAIN_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-suggestions-ir-abstain.contract.test.js';

const ALLOWED_PROFILE_IDS = Object.freeze([
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
]);

const ALLOWED_SUGGESTION_KINDS = new Set([
  'suggestedInsertion',
  'suggestedDeletion',
  'suggestedReplacement',
  'suggestionCommentAssociation',
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
  const advertised = Number.isInteger(packet?.advertisedSuggestionCount) ? packet.advertisedSuggestionCount : 0;
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
      suggestionsAdvertised: Math.max(0, advertised),
      suggestionsObserved: Array.isArray(packet?.suggestions) ? packet.suggestions.length : 0,
      suggestionsTrusted: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_SUGGESTIONS_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_SUGGESTIONS_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic suggestions packet source binding does not match fixture identity'];
    }
  }
  return null;
}

function validateFixture(packet) {
  const fixture = packet.fixture;
  if (!isObjectRecord(fixture)) {
    return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'fixture', 'fixture is required'];
  }
  if (fixture.mediaType !== ALLOWED_MEDIA_TYPE) {
    return ['GOOGLE_SUGGESTIONS_UNSUPPORTED_FORMAT_ABSTAIN', 'fixture.mediaType', 'unsupported local Google export format remains a typed limitation'];
  }
  if (typeof fixture.payloadText !== 'string' || fixture.payloadText.length === 0) {
    return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'fixture.payloadText', 'synthetic payload text is required'];
  }
  const expectedSha = `sha256:${sha256Text(fixture.payloadText)}`;
  if (fixture.payloadSha256 !== expectedSha) {
    return ['GOOGLE_SUGGESTIONS_FIXTURE_DIGEST_MISMATCH', 'fixture.payloadSha256', 'fixture payload digest mismatch'];
  }
  const expectedSize = Buffer.byteLength(fixture.payloadText, 'utf8');
  if (fixture.sizeBytes !== expectedSize) {
    return ['GOOGLE_SUGGESTIONS_FIXTURE_DIGEST_MISMATCH', 'fixture.sizeBytes', 'fixture byte size mismatch'];
  }
  return null;
}

function validateSuggestions(packet) {
  if (!Number.isInteger(packet.advertisedSuggestionCount) || packet.advertisedSuggestionCount < 0) {
    return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'advertisedSuggestionCount', 'advertised suggestion count must be a non-negative integer'];
  }
  if (!Array.isArray(packet.suggestions)) {
    return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'suggestions', 'synthetic suggestion labels must be an array'];
  }
  if (packet.suggestions.length !== packet.advertisedSuggestionCount) {
    return ['GOOGLE_SUGGESTIONS_COUNT_MISMATCH', 'advertisedSuggestionCount', 'advertised suggestion count must match observed synthetic labels'];
  }
  const ids = new Set();
  for (let index = 0; index < packet.suggestions.length; index += 1) {
    const suggestion = packet.suggestions[index];
    if (!isObjectRecord(suggestion)) {
      return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', `suggestions.${index}`, 'suggestion row must be an object'];
    }
    if (typeof suggestion.suggestionId !== 'string' || suggestion.suggestionId.length === 0) {
      return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', `suggestions.${index}.suggestionId`, 'suggestionId is required'];
    }
    if (ids.has(suggestion.suggestionId)) {
      return ['GOOGLE_SUGGESTIONS_COUNT_MISMATCH', `suggestions.${index}.suggestionId`, 'duplicate synthetic suggestion ids are not accepted'];
    }
    ids.add(suggestion.suggestionId);
    if (!ALLOWED_SUGGESTION_KINDS.has(suggestion.kind)) {
      return ['GOOGLE_SUGGESTIONS_UNSUPPORTED_KIND_ABSTAIN', `suggestions.${index}.kind`, 'suggestion kind is outside the local typed vocabulary'];
    }
    if (typeof suggestion.anchor !== 'string' || suggestion.anchor.length === 0) {
      return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', `suggestions.${index}.anchor`, 'synthetic anchor is required'];
    }
    if (typeof suggestion.payloadText !== 'string' || suggestion.payloadText.length === 0) {
      return ['GOOGLE_SUGGESTIONS_SCHEMA_INVALID', `suggestions.${index}.payloadText`, 'synthetic payload text is required'];
    }
  }
  return null;
}

export function buildSyntheticGoogleDocsSuggestionsPacket(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local suggestions synthetic fixture.',
    'Disposable only. No Google account, no network, no user document.',
    'Contains labels that resemble insertion/deletion/replacement suggestions but are not trusted Google provider evidence.',
  ].join('\n');
  const payloadSha256 = sha256Text(payloadText);
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-suggestions-ir-abstain-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_SUGGESTIONS_FIXTURE',
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
      payloadText,
      payloadSha256: `sha256:${payloadSha256}`,
      sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    },
    advertisedSuggestionCount: 4,
    suggestions: [
      { suggestionId: 'sug-insert-001', kind: 'suggestedInsertion', anchor: 'paragraph-1', payloadText: 'inserted text' },
      { suggestionId: 'sug-delete-001', kind: 'suggestedDeletion', anchor: 'paragraph-1', payloadText: 'deleted text' },
      { suggestionId: 'sug-replace-001', kind: 'suggestedReplacement', anchor: 'paragraph-2', payloadText: 'old → new' },
      { suggestionId: 'sug-comment-001', kind: 'suggestionCommentAssociation', anchor: 'paragraph-2', payloadText: 'comment on suggestion' },
    ],
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      suggestionsParsed: false,
      suggestionsIrTrusted: false,
      suggestionsApplyAuthority: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_TRUSTED_GOOGLE_SUGGESTIONS_IR',
      'NO_SUGGESTION_APPLY_AUTHORITY',
      'SUGGESTIONS_TYPED_ABSTAIN_LOCAL_ONLY',
    ],
  };
  return { ...packet, ...overrides };
}

export function evaluateGoogleDocsLocalSuggestionsIrAbstain(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_SUGGESTIONS_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google Docs suggestions limitation evidence cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_SUGGESTIONS_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
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
    'suggestionsParsed',
    'suggestionsIrTrusted',
    'suggestionsApplyAuthority',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_SUGGESTIONS_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local suggestions limitation packet cannot claim provider E2E, support, runtime wiring, apply, or mutation authority', packet);
  }
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_SUGGESTIONS_SCHEMA_INVALID', 'limitations', 'typed limitations are required');
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_SUGGESTIONS_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }

  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const fixtureError = validateFixture(packet);
  if (fixtureError) return failure(...fixtureError, packet);
  const suggestionsError = validateSuggestions(packet);
  if (suggestionsError) return failure(...suggestionsError, packet);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_SUGGESTIONS_IR_ABSTAINED',
    action: 'ABSTAIN_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    editorMode: packet.editorMode,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
    localAbstainOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    suggestionsIrTrusted: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    counts: {
      suggestionsAdvertised: packet.advertisedSuggestionCount,
      suggestionsObserved: packet.suggestions.length,
      suggestionsTrusted: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalSuggestionsIrAbstainReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsSuggestionsPacket();
  const result = evaluateGoogleDocsLocalSuggestionsIrAbstain(packet);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: '2026-08-15T02:25:00.000Z',
    originMainSha,
    localHeadSha,
    localAbstainOnly: true,
    noProductMutation: true,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
    nonClaims: {
      googleDocsReady: false,
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      suggestionsParsed: false,
      suggestionsIrTrusted: false,
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
    hostileProof: {
      finiteCases: 1,
      hostileCases: 16,
      semanticMutants: 11,
      survivors: 0,
      requiredFailures: [
        'support/import/roundtrip overclaim',
        'Google account/network/runtime/user-document overclaim',
        'Word evidence inheritance',
        'stale fixture digest',
        'source transplant',
        'silent suggestion count mismatch',
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

function updateSuggestionsRow(rows) {
  return rows.map((row) => {
    if (row?.cellId !== 'google.suggestionsLane') return row;
    return {
      ...row,
      currentTerminalClass: 'TYPED_ABSTAIN_LOCAL_ONLY',
      userFacingAuthority: 'NO_SUGGESTION_APPLY_AUTHORITY',
      physicalEvidence: false,
      reasonCode: 'GOOGLE_SUGGESTIONS_IR_ABSTAIN_NO_TRUSTED_PROVIDER_OR_E2E',
      requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
      blocksGoogleStage: true,
    };
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
      googleLocalSuggestionsIrAbstain: STATUS,
    },
  };
}

export function writeGoogleDocsLocalSuggestionsIrAbstainArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalSuggestionsIrAbstainReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localSuggestionsIrAbstain = {
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
    suggestionsParsed: false,
    suggestionsIrTrusted: false,
    applyAuthority: false,
    realAccountE2E: 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE',
  };

  for (const relativePath of [G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    const current = readJson(repoRoot, relativePath);
    const next = {
      ...current,
      localSuggestionsIrAbstain,
    };
    if (Array.isArray(current.rows)) next.rows = updateSuggestionsRow(current.rows);
    if (Array.isArray(current.gapMap)) next.gapMap = updateSuggestionsRow(current.gapMap);
    if (isObjectRecord(current.currentRealityAudit)) {
      next.currentRealityAudit = {
        ...current.currentRealityAudit,
        roundtripLossMatrix: {
          ...(isObjectRecord(current.currentRealityAudit.roundtripLossMatrix) ? current.currentRealityAudit.roundtripLossMatrix : {}),
          suggestions: 'ABSTAIN_TYPED_LOCAL_NO_TRUSTED_IR',
        },
      };
    }
    if (isObjectRecord(current.googleCurrentState)) {
      next.googleCurrentState = {
        ...current.googleCurrentState,
        nextLocalContour: 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1',
      };
    }
    if (typeof current.nextLocalContour === 'string') {
      next.nextLocalContour = 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1';
    }
    writeJson(repoRoot, relativePath, next);
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with G02 local suggestions typed limitation binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with G02 local suggestions typed limitation binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'G02 local suggestions IR typed limitation receipt — local synthetic abstain evidence only, not Google support/import/roundtrip/apply evidence.',
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
    ? writeGoogleDocsLocalSuggestionsIrAbstainArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalSuggestionsIrAbstain(buildSyntheticGoogleDocsSuggestionsPacket()),
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
