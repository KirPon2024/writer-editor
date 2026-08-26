'use strict';

const WRITER_LOCAL_PROFILE_SCHEMA_VERSION = 'writer-local-profile.v1';
const WRITER_LOCAL_PROFILE_ID = 'WRITER_LOCAL_V1';
const WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED = 'WRITER_LOCAL_PROFILE_OPTIONAL_SYSTEM_DISABLED';

const OPTIONAL_PRODUCT_DOMAINS = Object.freeze([
  'atlas',
  'blackBox',
  'idea',
  'manualMap',
  'meaning',
  'stage10',
]);
const OPTIONAL_PRODUCT_DOMAIN_SET = new Set(OPTIONAL_PRODUCT_DOMAINS);
const OPTIONAL_COMMAND_PREFIXES = Object.freeze([
  'cmd.project.plan.',
  'cmd.project.review.',
]);
const OPTIONAL_QUERY_IDS = Object.freeze([
  'query.collabScopeLocal',
  'query.reviewSurface',
  'query.stage10ProductState',
  'query.atlasOverview',
  'query.atlasEntityDossier',
  'query.atlasRelationDossier',
  'query.atlasMatrices',
  'query.atlasHeatmap',
  'query.atlasTemporalLayout',
  'query.atlasContinuityLedgerSurface',
  'query.atlasReportsSavedQueries',
  'query.atlasDiagnosticsStageAcceptance',
  'query.atlasCurrentScene',
  'query.manualMapWorkbench',
  'query.projectionInspector',
]);
const OPTIONAL_QUERY_ID_SET = new Set(OPTIONAL_QUERY_IDS);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeIdentity(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createWriterLocalProfileProjection({ isPackaged = false, platform = '' } = {}) {
  const normalizedPlatform = normalizeIdentity(platform);
  const active = isPackaged === true && normalizedPlatform === 'darwin';
  return Object.freeze({
    schemaVersion: WRITER_LOCAL_PROFILE_SCHEMA_VERSION,
    profileId: active ? WRITER_LOCAL_PROFILE_ID : '',
    active,
    platform: normalizedPlatform,
    packaged: isPackaged === true,
    localPackagingAndCertificationOnly: active,
    optionalSystemsEnabled: !active,
    signing: false,
    notarization: false,
    publicDistribution: false,
    dependencyAdoption: false,
    cloudAuthority: false,
    userDataMutation: false,
  });
}

function isActiveWriterLocalProfile(profile) {
  return isPlainObject(profile)
    && profile.schemaVersion === WRITER_LOCAL_PROFILE_SCHEMA_VERSION
    && profile.profileId === WRITER_LOCAL_PROFILE_ID
    && profile.active === true
    && profile.packaged === true
    && profile.platform === 'darwin'
    && profile.optionalSystemsEnabled === false;
}

function isOptionalWriterLocalCommand(commandId, productCommandRecord = null) {
  const normalizedCommandId = normalizeIdentity(commandId);
  if (!normalizedCommandId) return false;
  if (OPTIONAL_COMMAND_PREFIXES.some((prefix) => normalizedCommandId.startsWith(prefix))) {
    return true;
  }
  if (!isPlainObject(productCommandRecord) || productCommandRecord.id !== normalizedCommandId) {
    return false;
  }
  return OPTIONAL_PRODUCT_DOMAIN_SET.has(normalizeIdentity(productCommandRecord.domain));
}

function evaluateWriterLocalCommandAccess({ profile, commandId, productCommandRecord = null } = {}) {
  const denied = isActiveWriterLocalProfile(profile)
    && isOptionalWriterLocalCommand(commandId, productCommandRecord);
  return Object.freeze({
    allowed: !denied,
    reason: denied ? WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED : '',
    profileId: isActiveWriterLocalProfile(profile) ? WRITER_LOCAL_PROFILE_ID : '',
  });
}

function evaluateWriterLocalQueryAccess({ profile, queryId } = {}) {
  const denied = isActiveWriterLocalProfile(profile)
    && OPTIONAL_QUERY_ID_SET.has(normalizeIdentity(queryId));
  return Object.freeze({
    allowed: !denied,
    reason: denied ? WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED : '',
    profileId: isActiveWriterLocalProfile(profile) ? WRITER_LOCAL_PROFILE_ID : '',
  });
}

module.exports = Object.freeze({
  WRITER_LOCAL_PROFILE_SCHEMA_VERSION,
  WRITER_LOCAL_PROFILE_ID,
  WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED,
  OPTIONAL_PRODUCT_DOMAINS,
  OPTIONAL_COMMAND_PREFIXES,
  OPTIONAL_QUERY_IDS,
  createWriterLocalProfileProjection,
  isActiveWriterLocalProfile,
  isOptionalWriterLocalCommand,
  evaluateWriterLocalCommandAccess,
  evaluateWriterLocalQueryAccess,
});
