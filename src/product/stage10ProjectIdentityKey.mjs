import projectIdDomain from './projectIdDomain.cjs';

export const STAGE10_PROJECT_PATH_KEY_SCHEMA = 'yalken.stage10.projectPathKey.v2';
export const STAGE10_PROJECT_PATH_KEY_PREFIX = 'p2~';

const HEX_SEGMENT_LENGTH = 96;
const PATH_LEAF = 'project';
const { normalizeProjectId } = projectIdDomain;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function encodeProjectId(projectId) {
  const hex = Buffer.from(projectId, 'utf8').toString('hex');
  const segments = [];
  for (let offset = 0; offset < hex.length; offset += HEX_SEGMENT_LENGTH) {
    segments.push(hex.slice(offset, offset + HEX_SEGMENT_LENGTH));
  }
  return [STAGE10_PROJECT_PATH_KEY_PREFIX, ...segments, PATH_LEAF].join('/');
}

export function stage10ProjectPathIdentity(value) {
  const projectId = normalizeProjectId(value);
  if (!projectId) {
    return Object.freeze({
      ok: false,
      schemaVersion: STAGE10_PROJECT_PATH_KEY_SCHEMA,
      error: Object.freeze({
        code: 'E_STAGE10_PROJECT_ID_INVALID',
        reason: 'STAGE10_PROJECT_ID_INVALID',
      }),
    });
  }
  const canonicalKey = encodeProjectId(projectId);
  const legacyKey = projectId.replace(/[^a-zA-Z0-9._-]/gu, '_');
  return Object.freeze({
    ok: true,
    schemaVersion: STAGE10_PROJECT_PATH_KEY_SCHEMA,
    projectId,
    canonicalKey,
    legacyKey,
    requiresLegacyMigration: canonicalKey !== legacyKey,
  });
}

export function normalizeStage10ProjectId(value) {
  return normalizeProjectId(value);
}

export function decodeStage10ProjectPathKey(value) {
  const key = normalizeString(value);
  const segments = key.split('/');
  if (
    segments.length < 3
    || segments[0] !== STAGE10_PROJECT_PATH_KEY_PREFIX
    || segments.at(-1) !== PATH_LEAF
  ) return null;
  const encodedSegments = segments.slice(1, -1);
  if (
    encodedSegments.some((segment, index) => (
      !/^[0-9a-f]+$/u.test(segment)
      || segment.length > HEX_SEGMENT_LENGTH
      || (index < encodedSegments.length - 1 && segment.length !== HEX_SEGMENT_LENGTH)
    ))
  ) return null;
  const encoded = encodedSegments.join('');
  if (encoded.length === 0 || encoded.length % 2 !== 0) return null;
  let projectId;
  try {
    projectId = Buffer.from(encoded, 'hex').toString('utf8');
  } catch {
    return null;
  }
  const identity = stage10ProjectPathIdentity(projectId);
  if (!identity.ok || identity.canonicalKey !== key) return null;
  return identity.projectId;
}
