import crypto from 'node:crypto';
import { types as nodeTypes } from 'node:util';

export const GOOGLE_PROVIDER_PROFILE_SCHEMA_VERSION = 'yalken.google-provider-profile.v1';
export const GOOGLE_PROVIDER_PROFILE_IDS = Object.freeze({
  NATIVE: 'GOOGLE_NATIVE_CONVERSION_BOUNDED_V1',
  OFFICE: 'GOOGLE_OFFICE_MODE_ABSTAIN_V1',
  BRIDGE: 'GOOGLE_DRIVE_DOCS_BRIDGE_BOUNDED_V1',
});
export const GOOGLE_APPLY_EFFECT = 'GOOGLE_DOC_REVISION_GUARDED_APPLY';
export const GOOGLE_PROVIDER_LIMITS = Object.freeze({ maxJsonNodes: 20_000, maxTextBytes: 1_048_576 });

const HISTORICAL_SCHEMA = 'yalken.rtk.google-build-profile-registry.v1';
const HISTORICAL_OFFICE = 'google-docs-office-mode-post-d1-v1';
const HISTORICAL_NATIVE = 'google-docs-native-conversion-post-d1-v1';
const OWNER_GATE = 'GOOGLE_EGRESS_APPLY_ADR';
const STAGE_SCOPE = 'WP-708_GOOGLE_PROVIDER';
const SHA256 = /^[0-9a-f]{64}$/u;
const IDENTITY_KEYS = ['entityId', 'generation', 'projectId', 'sourceRevision'];
const OBSERVATION_KEYS = ['accountBound', 'commentsRoundtrip', 'docxExportZip', 'nativeDocumentReadback', 'revisionGuardedApply', 'staleRevisionRejected', 'textExportExact'];
const ATOM_KEYS = ['atomSha256', 'claimId', 'cleanupVerified', 'exactHead', 'observations', 'profileId', 'provider', 'receiptSha256', 'status'];

const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const hashBytes = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = value => hashBytes(Buffer.from(canonical(value), 'utf8'));
const reject = code => { throw new Error(code); };

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function attempted(fn) {
  try { return fn(); } catch (error) {
    if (!/^E_GOOGLE_[A-Z0-9_]+$/u.test(error.message)) throw error;
    return freeze({
      ok: false,
      status: 'REJECTED',
      code: error.message,
      effectEligible: false,
      projectionPublished: false,
      productMutationAuthority: false,
      providerEffectAuthority: false,
    });
  }
}

function exactObject(value, keys) {
  if (!value || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) reject('E_GOOGLE_OBJECT_SHAPE');
  const actual = Reflect.ownKeys(value);
  if (actual.some(key => typeof key !== 'string') || canonical([...actual].sort()) !== canonical([...keys].sort())) reject('E_GOOGLE_OBJECT_KEYS');
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) reject('E_GOOGLE_ACCESSOR');
  }
}

function exactArray(value, max = 128) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) reject('E_GOOGLE_ARRAY_SHAPE');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some(key => typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)))) reject('E_GOOGLE_ARRAY_SHAPE');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) reject('E_GOOGLE_ACCESSOR');
  }
  return value;
}

function cleanJson(value, depth = 0, budget = { nodes: 0, textBytes: 0 }) {
  if (++budget.nodes > GOOGLE_PROVIDER_LIMITS.maxJsonNodes || depth > 32) reject('E_GOOGLE_JSON_BUDGET');
  if (nodeTypes.isProxy(value)) reject('E_GOOGLE_JSON_TYPE');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) reject('E_GOOGLE_JSON_TYPE');
    return value;
  }
  if (typeof value === 'string') {
    budget.textBytes += Buffer.byteLength(value, 'utf8');
    if (budget.textBytes > GOOGLE_PROVIDER_LIMITS.maxTextBytes) reject('E_GOOGLE_JSON_BUDGET');
    string(value);
    return value;
  }
  if (Array.isArray(value)) return exactArray(value, GOOGLE_PROVIDER_LIMITS.maxJsonNodes).map(item => cleanJson(item, depth + 1, budget));
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) reject('E_GOOGLE_JSON_TYPE');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))) reject('E_GOOGLE_JSON_KEY');
  exactObject(value, keys);
  return Object.fromEntries(keys.map(key => [key, cleanJson(value[key], depth + 1, budget)]));
}

function string(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.normalize('NFC')) reject('E_GOOGLE_STRING');
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) reject('E_GOOGLE_STRING');
  }
  return value;
}

function sha(value) {
  if (typeof value !== 'string' || !SHA256.test(value)) reject('E_GOOGLE_SHA256');
  return value;
}

function positiveInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) reject('E_GOOGLE_IDENTITY');
  return value;
}

function instant(value) {
  string(value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || !/Z$/u.test(value)) reject('E_GOOGLE_TIME');
  return parsed;
}

function identity(value) {
  exactObject(value, IDENTITY_KEYS);
  return {
    entityId: string(value.entityId),
    generation: positiveInteger(value.generation),
    projectId: string(value.projectId),
    sourceRevision: string(value.sourceRevision),
  };
}

function validateHistoricalRegistry(value) {
  const registry = cleanJson(value);
  if (registry.schemaVersion !== HISTORICAL_SCHEMA || !Array.isArray(registry.profiles) || registry.profiles.length !== 2) reject('E_GOOGLE_HISTORICAL_REGISTRY');
  const office = registry.profiles.find(profile => profile.profileId === HISTORICAL_OFFICE);
  const native = registry.profiles.find(profile => profile.profileId === HISTORICAL_NATIVE);
  if (!office || !native || office.class !== 'DECLARED' || native.class !== 'DECLARED') reject('E_GOOGLE_HISTORICAL_REGISTRY');
  if (office.editorMode !== 'OFFICE_MODE' || office.conversionBoundary !== 'NONE') reject('E_GOOGLE_HISTORICAL_REGISTRY');
  if (native.editorMode !== 'NATIVE_CONVERSION' || native.conversionBoundary !== 'DOCX_TO_NATIVE_ROUNDTRIP') reject('E_GOOGLE_HISTORICAL_REGISTRY');
  for (const profile of [office, native]) {
    if (!Array.isArray(profile.evidenceHeads) || profile.evidenceHeads.length !== 0 || !Array.isArray(profile.ladder?.completedRungs) || profile.ladder.completedRungs.length !== 0) reject('E_GOOGLE_HISTORICAL_INHERITANCE');
  }
  return registry;
}

function validateOwnerDecision(value, nowUtc) {
  exactObject(value, ['decisionDigest', 'expiresAtUtc', 'gateId', 'lifecycleReceiptSha256', 'registryDigest', 'scope', 'status']);
  const result = {
    decisionDigest: sha(value.decisionDigest),
    expiresAtUtc: string(value.expiresAtUtc),
    gateId: string(value.gateId),
    lifecycleReceiptSha256: sha(value.lifecycleReceiptSha256),
    registryDigest: sha(value.registryDigest),
    scope: string(value.scope),
    status: string(value.status),
  };
  if (result.gateId !== OWNER_GATE || result.scope !== STAGE_SCOPE || result.status !== 'APPROVED') reject('E_GOOGLE_OWNER_GATE_DENY');
  if (instant(result.expiresAtUtc).getTime() < instant(nowUtc).getTime()) reject('E_GOOGLE_OWNER_GATE_EXPIRED');
  return result;
}

export function computeGoogleEvidenceAtomDigest(atom) {
  exactObject(atom, ATOM_KEYS.filter(key => key !== 'atomSha256'));
  return digest(cleanJson(atom));
}

function validateAtom(value) {
  exactObject(value, ATOM_KEYS);
  const observations = value.observations;
  exactObject(observations, OBSERVATION_KEYS);
  for (const key of OBSERVATION_KEYS) if (typeof observations[key] !== 'boolean') reject('E_GOOGLE_EVIDENCE_OBSERVATION');
  const atom = {
    atomSha256: sha(value.atomSha256),
    claimId: string(value.claimId),
    cleanupVerified: value.cleanupVerified,
    exactHead: value.exactHead,
    observations: { ...observations },
    profileId: string(value.profileId),
    provider: string(value.provider),
    receiptSha256: sha(value.receiptSha256),
    status: string(value.status),
  };
  if (typeof atom.cleanupVerified !== 'boolean' || typeof atom.exactHead !== 'boolean') reject('E_GOOGLE_EVIDENCE_OBSERVATION');
  const { atomSha256: _omitted, ...body } = atom;
  if (atom.atomSha256 !== digest(body)) reject('E_GOOGLE_EVIDENCE_DIGEST');
  if (atom.status !== 'PASS' || atom.provider !== 'google-docs') reject('E_GOOGLE_EVIDENCE_STATUS');
  if (!atom.cleanupVerified || !atom.exactHead || !atom.observations.revisionGuardedApply || !atom.observations.staleRevisionRejected) reject('E_GOOGLE_EVIDENCE_INCOMPLETE');
  if (atom.profileId === GOOGLE_PROVIDER_PROFILE_IDS.NATIVE) {
    if (!atom.observations.nativeDocumentReadback || !atom.observations.textExportExact || !atom.observations.docxExportZip) reject('E_GOOGLE_NATIVE_EVIDENCE_INCOMPLETE');
  } else if (atom.profileId === GOOGLE_PROVIDER_PROFILE_IDS.BRIDGE) {
    if (!atom.observations.accountBound || !atom.observations.commentsRoundtrip) reject('E_GOOGLE_BRIDGE_EVIDENCE_INCOMPLETE');
  } else if (atom.profileId === GOOGLE_PROVIDER_PROFILE_IDS.OFFICE) reject('E_GOOGLE_OFFICE_PHYSICAL_FORBIDDEN');
  else reject('E_GOOGLE_PROFILE_UNKNOWN');
  return atom;
}

function profile(profileId, provider, editorMode, conversionBoundary, status, atom) {
  return freeze({
    applyDefault: 'DENY',
    conversionBoundary,
    editorMode,
    evidenceAtomSha256: atom?.atomSha256 ?? null,
    physicalClaim: atom !== null,
    physicalReceiptSha256: atom?.receiptSha256 ?? null,
    profileId,
    provider,
    status,
  });
}

export function createGoogleProviderProfileProjection(input = {}) {
  return attempted(() => {
    exactObject(input, ['evidenceAtoms', 'historicalRegistry', 'identity', 'nowUtc', 'ownerDecision']);
    const expectedIdentity = identity(input.identity);
    validateHistoricalRegistry(input.historicalRegistry);
    const ownerDecision = validateOwnerDecision(input.ownerDecision, input.nowUtc);
    const atoms = exactArray(input.evidenceAtoms, 3).map(validateAtom);
    if (atoms.length !== 2) reject('E_GOOGLE_EVIDENCE_DENOMINATOR');
    if (new Set(atoms.map(atom => atom.atomSha256)).size !== atoms.length || new Set(atoms.map(atom => atom.claimId)).size !== atoms.length) reject('E_GOOGLE_CROSS_PROFILE_INHERITANCE');
    const native = atoms.find(atom => atom.profileId === GOOGLE_PROVIDER_PROFILE_IDS.NATIVE);
    const bridge = atoms.find(atom => atom.profileId === GOOGLE_PROVIDER_PROFILE_IDS.BRIDGE);
    if (!native || !bridge) reject('E_GOOGLE_EVIDENCE_DENOMINATOR');
    if (native.receiptSha256 !== ownerDecision.lifecycleReceiptSha256 || bridge.receiptSha256 !== ownerDecision.lifecycleReceiptSha256) reject('E_GOOGLE_RECEIPT_BINDING');
    const body = {
      claimCeiling: 'WP708_EXACT_SYNTHETIC_NATIVE_AND_BRIDGE_ONLY',
      evidenceAtomDenominator: atoms.length,
      identity: expectedIdentity,
      ownerGate: {
        decisionDigest: ownerDecision.decisionDigest,
        gateId: ownerDecision.gateId,
        lifecycleReceiptSha256: ownerDecision.lifecycleReceiptSha256,
        registryDigest: ownerDecision.registryDigest,
        scope: ownerDecision.scope,
      },
      productMutationAuthority: false,
      profiles: [
        profile(GOOGLE_PROVIDER_PROFILE_IDS.NATIVE, 'google-docs', 'NATIVE_CONVERSION', 'NATIVE_DOC_PROVIDER_LIFECYCLE', 'PHYSICAL_PASS_BOUNDED', native),
        profile(GOOGLE_PROVIDER_PROFILE_IDS.OFFICE, 'google-docs', 'OFFICE_MODE', 'NONE', 'ABSTAIN_NO_PHYSICAL_EVIDENCE', null),
        profile(GOOGLE_PROVIDER_PROFILE_IDS.BRIDGE, 'google-drive-docs-connector', 'BRIDGE', 'CONNECTOR_NATIVE_DOC', 'PHYSICAL_PASS_BOUNDED', bridge),
      ],
      providerEffectAuthority: false,
      runtimeNetworkAuthority: false,
      schemaVersion: GOOGLE_PROVIDER_PROFILE_SCHEMA_VERSION,
    };
    const projection = freeze({ ...body, projectionDigest: digest(body) });
    return freeze({ ok: true, status: 'PROJECTED', code: 'GOOGLE_PROVIDER_PROJECTION_OK', projection, projectionPublished: true, productMutationAuthority: false, providerEffectAuthority: false });
  });
}

export function verifyGoogleProviderProfileProjection(input = {}) {
  return attempted(() => {
    exactObject(input, ['evidenceAtoms', 'historicalRegistry', 'identity', 'nowUtc', 'ownerDecision', 'projection']);
    const candidate = cleanJson(input.projection);
    const replay = createGoogleProviderProfileProjection({ evidenceAtoms: input.evidenceAtoms, historicalRegistry: input.historicalRegistry, identity: input.identity, nowUtc: input.nowUtc, ownerDecision: input.ownerDecision });
    if (!replay.ok || canonical(candidate) !== canonical(replay.projection)) reject('E_GOOGLE_PROJECTION_REPLAY');
    return freeze({ ok: true, status: 'VERIFIED', code: 'GOOGLE_PROVIDER_PROJECTION_VERIFIED', projectionDigest: replay.projection.projectionDigest, projectionPublished: false, productMutationAuthority: false, providerEffectAuthority: false });
  });
}

function applyIntent(value) {
  exactObject(value, ['accountIdSha256', 'documentIdSha256', 'entityId', 'generation', 'profileId', 'projectId', 'proposedTextSha256', 'requiredRevision', 'sourceRevision']);
  return { accountIdSha256: sha(value.accountIdSha256), documentIdSha256: sha(value.documentIdSha256), entityId: string(value.entityId), generation: positiveInteger(value.generation), profileId: string(value.profileId), projectId: string(value.projectId), proposedTextSha256: sha(value.proposedTextSha256), requiredRevision: string(value.requiredRevision), sourceRevision: string(value.sourceRevision) };
}

function capability(value) {
  exactObject(value, ['allowedAccountIdSha256', 'allowedDocumentIdSha256', 'allowedProfileIds', 'decisionDigest', 'effect', 'expiresAtUtc', 'gateId', 'lifecycleStatus', 'nonceSha256', 'scope', 'status']);
  return { allowedAccountIdSha256: sha(value.allowedAccountIdSha256), allowedDocumentIdSha256: sha(value.allowedDocumentIdSha256), allowedProfileIds: exactArray(value.allowedProfileIds, 2).map(string), decisionDigest: sha(value.decisionDigest), effect: string(value.effect), expiresAtUtc: string(value.expiresAtUtc), gateId: string(value.gateId), lifecycleStatus: string(value.lifecycleStatus), nonceSha256: sha(value.nonceSha256), scope: string(value.scope), status: string(value.status) };
}

function currentState(value) {
  exactObject(value, ['accountIdSha256', 'activeArtifactCount', 'documentIdSha256', 'entityId', 'generation', 'nowUtc', 'profileId', 'projectId', 'revision', 'sourceRevision', 'syntheticOnly']);
  if (!Number.isSafeInteger(value.activeArtifactCount) || value.activeArtifactCount < 0 || typeof value.syntheticOnly !== 'boolean') reject('E_GOOGLE_CURRENT_STATE');
  return { accountIdSha256: sha(value.accountIdSha256), activeArtifactCount: value.activeArtifactCount, documentIdSha256: sha(value.documentIdSha256), entityId: string(value.entityId), generation: positiveInteger(value.generation), nowUtc: string(value.nowUtc), profileId: string(value.profileId), projectId: string(value.projectId), revision: string(value.revision), sourceRevision: string(value.sourceRevision), syntheticOnly: value.syntheticOnly };
}

export function evaluateGoogleApplyAdmission(input = {}) {
  return attempted(() => {
    exactObject(input, ['capability', 'current', 'intent']);
    const intent = applyIntent(input.intent), cap = capability(input.capability), current = currentState(input.current);
    if (cap.status !== 'APPROVED' || cap.gateId !== OWNER_GATE || cap.scope !== STAGE_SCOPE || cap.effect !== GOOGLE_APPLY_EFFECT || cap.lifecycleStatus !== 'ACTIVE_SYNTHETIC_SINGLE_TARGET') reject('E_GOOGLE_APPLY_DEFAULT_DENY');
    if (instant(cap.expiresAtUtc).getTime() < instant(current.nowUtc).getTime()) reject('E_GOOGLE_APPLY_EXPIRED');
    if (intent.profileId === GOOGLE_PROVIDER_PROFILE_IDS.OFFICE) reject('E_GOOGLE_OFFICE_APPLY_DENY');
    if (![GOOGLE_PROVIDER_PROFILE_IDS.NATIVE, GOOGLE_PROVIDER_PROFILE_IDS.BRIDGE].includes(intent.profileId) || canonical(cap.allowedProfileIds) !== canonical([GOOGLE_PROVIDER_PROFILE_IDS.NATIVE, GOOGLE_PROVIDER_PROFILE_IDS.BRIDGE])) reject('E_GOOGLE_APPLY_PROFILE');
    if (current.profileId !== intent.profileId) reject('E_GOOGLE_APPLY_PROFILE');
    if (intent.accountIdSha256 !== cap.allowedAccountIdSha256 || intent.accountIdSha256 !== current.accountIdSha256) reject('E_GOOGLE_APPLY_ACCOUNT');
    if (intent.documentIdSha256 !== cap.allowedDocumentIdSha256 || intent.documentIdSha256 !== current.documentIdSha256) reject('E_GOOGLE_APPLY_DOCUMENT');
    if (intent.projectId !== current.projectId || intent.entityId !== current.entityId || intent.sourceRevision !== current.sourceRevision || intent.generation !== current.generation) reject('E_GOOGLE_APPLY_IDENTITY');
    if (intent.requiredRevision !== current.revision) reject('E_GOOGLE_APPLY_STALE_REVISION');
    if (current.activeArtifactCount !== 1 || current.syntheticOnly !== true) reject('E_GOOGLE_APPLY_TARGET_SET');
    const decisionBody = {
      capabilityDecisionDigest: cap.decisionDigest,
      capabilityNonceSha256: cap.nonceSha256,
      effect: cap.effect,
      identity: { entityId: intent.entityId, generation: intent.generation, projectId: intent.projectId, sourceRevision: intent.sourceRevision },
      profileId: intent.profileId,
      proposedTextSha256: intent.proposedTextSha256,
      requiredRevision: intent.requiredRevision,
    };
    return freeze({
      ok: true,
      status: 'ELIGIBLE_REQUIRES_COMMAND_KERNEL_REVALIDATION',
      code: 'GOOGLE_APPLY_ELIGIBLE',
      decisionDigest: digest(decisionBody),
      effectEligible: true,
      projectionPublished: false,
      productMutationAuthority: false,
      providerEffectAuthority: false,
      requiresCommandKernelRevalidation: true,
    });
  });
}

export { canonical as canonicalGoogleProviderJson };
