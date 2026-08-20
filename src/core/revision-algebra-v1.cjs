// R2.4 R0_REVISION_ALGEBRA — project/entity/source/generation identities as a
// lineage-aware partial order with canonical serialization. Comparison is
// legal only inside one identity domain; concurrent or incomparable
// coordinates produce typed conflicts, never silent last-write-wins.
'use strict';

class RevisionAlgebraError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const ORDER = Object.freeze({
  LESS: 'LESS',
  EQUAL: 'EQUAL',
  GREATER: 'GREATER',
  CONCURRENT: 'CONCURRENT',
});

const REVISION_FORMAT_VERSION = 'rv1';
const COMPONENT_KEYS = Object.freeze(['projectRevision', 'entityRevision', 'sourceRevision', 'generation', 'writerEpoch']);

const isDomainPart = (value) => typeof value === 'string' && value.length > 0 && !value.includes('/');
const isCounter = (value) => Number.isInteger(value) && value >= 0;

function normalizeRevisionCoordinate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RevisionAlgebraError('E_REVISION_SHAPE');
  }
  const domain = input.domain;
  if (!domain || typeof domain !== 'object' || Array.isArray(domain)) throw new RevisionAlgebraError('E_REVISION_DOMAIN_SHAPE');
  if (!isDomainPart(domain.projectId) || !isDomainPart(domain.entityId)) {
    throw new RevisionAlgebraError('E_REVISION_DOMAIN_IDENTITY');
  }
  const out = { domain: { projectId: domain.projectId, entityId: domain.entityId } };
  for (const key of COMPONENT_KEYS) {
    if (!isCounter(input[key])) throw new RevisionAlgebraError('E_REVISION_COMPONENT_INVALID', key);
    out[key] = input[key];
  }
  return Object.freeze(out);
}

function assertSameDomain(a, b) {
  if (a.domain.projectId !== b.domain.projectId || a.domain.entityId !== b.domain.entityId) {
    throw new RevisionAlgebraError('E_REVISION_DOMAIN_MISMATCH', `${a.domain.projectId}/${a.domain.entityId} vs ${b.domain.projectId}/${b.domain.entityId}`);
  }
}

// Partial order: LESS/EQUAL/GREATER for compatible coordinates, CONCURRENT
// (typed conflict) for mixed ones. Never a silent total order.
function compareRevisionCoordinates(leftInput, rightInput) {
  const left = normalizeRevisionCoordinate(leftInput);
  const right = normalizeRevisionCoordinate(rightInput);
  assertSameDomain(left, right);
  let less = false;
  let greater = false;
  for (const key of COMPONENT_KEYS) {
    if (left[key] < right[key]) less = true;
    else if (left[key] > right[key]) greater = true;
  }
  if (less && greater) return ORDER.CONCURRENT;
  if (less) return ORDER.LESS;
  if (greater) return ORDER.GREATER;
  return ORDER.EQUAL;
}

function isLineageDescendant(descendantInput, ancestorInput) {
  const order = compareRevisionCoordinates(descendantInput, ancestorInput);
  return order === ORDER.GREATER || order === ORDER.EQUAL;
}

// Join is defined only for comparable coordinates of one domain. Concurrent
// coordinates are a typed conflict, never a silent merge.
function joinRevisionCoordinates(leftInput, rightInput) {
  const left = normalizeRevisionCoordinate(leftInput);
  const right = normalizeRevisionCoordinate(rightInput);
  const order = compareRevisionCoordinates(left, right);
  if (order === ORDER.CONCURRENT) {
    throw new RevisionAlgebraError('E_REVISION_CONCURRENT_CONFLICT', `${serializeRevisionCoordinate(left)} vs ${serializeRevisionCoordinate(right)}`);
  }
  return order === ORDER.LESS ? right : left;
}

function advanceRevisionCoordinate(input, component) {
  const current = normalizeRevisionCoordinate(input);
  if (!COMPONENT_KEYS.includes(component)) throw new RevisionAlgebraError('E_REVISION_COMPONENT_UNKNOWN', String(component));
  return normalizeRevisionCoordinate({ ...current, [component]: current[component] + 1 });
}

function serializeRevisionCoordinate(input) {
  const c = normalizeRevisionCoordinate(input);
  return `${REVISION_FORMAT_VERSION}:${c.domain.projectId}/${c.domain.entityId}/${COMPONENT_KEYS.map((k) => c[k]).join('/')}`;
}

function parseRevisionCoordinate(text) {
  if (typeof text !== 'string') throw new RevisionAlgebraError('E_REVISION_SERIALIZE_SHAPE');
  const match = text.match(/^rv1:([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) throw new RevisionAlgebraError('E_REVISION_PARSE', text.slice(0, 64));
  return normalizeRevisionCoordinate({
    domain: { projectId: match[1], entityId: match[2] },
    projectRevision: Number(match[3]),
    entityRevision: Number(match[4]),
    sourceRevision: Number(match[5]),
    generation: Number(match[6]),
    writerEpoch: Number(match[7]),
  });
}

module.exports = Object.freeze({
  REVISION_COMPONENT_KEYS: COMPONENT_KEYS,
  REVISION_FORMAT_VERSION,
  REVISION_ORDER: ORDER,
  RevisionAlgebraError,
  advanceRevisionCoordinate,
  compareRevisionCoordinates,
  isLineageDescendant,
  joinRevisionCoordinates,
  normalizeRevisionCoordinate,
  parseRevisionCoordinate,
  serializeRevisionCoordinate,
});
