export const RTK_BLOCK_RANGE_WRITER_AUTHORITY_SCHEMA =
  'yalken.rtk.review-transport-block-range-writer-authority.v2';
export const RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROFILE =
  'locally-bound-c04-block-range-authority-v2-c05';
export const RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROVENANCE =
  'C04_BLOCK_EXACT_WRITER_BINDING_V2';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function numberOrNull(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Text === 'function' && typeof port?.sha256Json === 'function') {
    return port;
  }
  throw new Error('CryptoPort with sha256Text and sha256Json is required');
}

export function buildReviewTransportBlockTextDigestV2(range, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  return cryptoPort.sha256Json({
    schemaVersion: RTK_BLOCK_RANGE_WRITER_AUTHORITY_SCHEMA,
    sceneId: rawString(range.sceneId),
    blockId: rawString(range.blockId),
    blockText: rawString(range.blockText),
  });
}

export function buildReviewTransportBlockRangeDigestV2(range, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  return cryptoPort.sha256Json({
    schemaVersion: RTK_BLOCK_RANGE_WRITER_AUTHORITY_SCHEMA,
    sceneId: rawString(range.sceneId),
    blockId: rawString(range.blockId),
    blockText: rawString(range.blockText),
    sceneStart: numberOrNull(range.sceneStart),
    blockLocalStart: numberOrNull(range.blockLocalStart),
    blockLocalEnd: numberOrNull(range.blockLocalEnd),
    expectedText: rawString(range.expectedText),
  });
}

function sceneTextFromSnapshot(projectSnapshot, sceneId) {
  if (!isPlainObject(projectSnapshot)) return '';
  if (Array.isArray(projectSnapshot.scenes)) {
    const scene = projectSnapshot.scenes.find((item, index) => {
      if (!isPlainObject(item)) return false;
      return normalizeString(item.sceneId || item.id) === sceneId || (!sceneId && index === 0);
    });
    return rawString(scene?.text);
  }
  if (isPlainObject(projectSnapshot.scenes)) {
    const scene = projectSnapshot.scenes[sceneId];
    if (typeof scene === 'string') return scene;
    return rawString(scene?.text);
  }
  if (isPlainObject(projectSnapshot.scene)) return rawString(projectSnapshot.scene.text);
  return rawString(projectSnapshot.text);
}

function occurrenceRanges(haystack, needle) {
  const ranges = [];
  const source = rawString(haystack);
  const target = rawString(needle);
  if (!target) return ranges;
  let cursor = 0;
  while (cursor <= source.length) {
    const start = source.indexOf(target, cursor);
    if (start < 0) break;
    ranges.push({ start, end: start + target.length });
    cursor = start + 1;
  }
  return ranges;
}

function baselineBlocks(localBaseline, sceneId) {
  const blocks = Array.isArray(localBaseline?.sceneBlocks)
    ? localBaseline.sceneBlocks
    : (Array.isArray(localBaseline?.blocks) ? localBaseline.blocks : []);
  return list(blocks).map((block) => ({
    sceneId: normalizeString(block.sceneId || localBaseline.sceneId || sceneId),
    blockId: normalizeString(block.blockId || block.id),
    text: rawString(block.text || block.rawText || block.blockText),
  }));
}

export function buildLocalReviewTransportBlockRangeAuthorityV2(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const sceneId = normalizeString(input.sceneId);
  const blockId = normalizeString(input.blockId);
  const expectedText = rawString(input.expectedText);
  const blockLocalStart = numberOrNull(input.blockLocalStart);
  const blockLocalEnd = numberOrNull(input.blockLocalEnd);
  const projectSnapshot = isPlainObject(input.projectSnapshot) ? input.projectSnapshot : {};
  const localBaseline = isPlainObject(input.localBaseline) ? input.localBaseline : {};
  const sceneText = sceneTextFromSnapshot(projectSnapshot, sceneId);
  const block = baselineBlocks(localBaseline, sceneId).find((item) => (
    item.sceneId === sceneId && item.blockId === blockId
  ));
  const blockText = rawString(block?.text);
  const blockRanges = occurrenceRanges(sceneText, blockText);

  if (
    !sceneId
    || !blockId
    || !expectedText
    || !blockText
    || blockLocalStart === null
    || blockLocalEnd === null
    || blockLocalStart < 0
    || blockLocalEnd < blockLocalStart
    || blockLocalEnd > blockText.length
    || blockText.slice(blockLocalStart, blockLocalEnd) !== expectedText
    || blockRanges.length !== 1
  ) {
    return {
      ok: false,
      reason: 'RTK_LOCAL_BLOCK_RANGE_AUTHORITY_UNAVAILABLE',
      sceneId,
      blockId,
      blockOccurrenceCount: blockRanges.length,
    };
  }

  const authorityBase = {
    schemaVersion: RTK_BLOCK_RANGE_WRITER_AUTHORITY_SCHEMA,
    profileId: RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROFILE,
    provenance: RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROVENANCE,
    authorityKind: 'locallyBoundBlockRange',
    sceneId,
    blockId,
    blockText,
    sceneStart: blockRanges[0].start,
    blockLocalStart,
    blockLocalEnd,
    expectedText,
  };
  return {
    ok: true,
    authority: {
      ...authorityBase,
      blockTextDigest: buildReviewTransportBlockTextDigestV2(authorityBase, { cryptoPort }),
      rangeDigest: buildReviewTransportBlockRangeDigestV2(authorityBase, { cryptoPort }),
      integrityDigest: cryptoPort.sha256Text(stableJson({
        profileId: RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROFILE,
        provenance: RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROVENANCE,
        sceneId,
        blockId,
        rangeDigest: buildReviewTransportBlockRangeDigestV2(authorityBase, { cryptoPort }),
      })),
    },
  };
}
