const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function assertCoordinateError(fn, code, reason) {
  assert.throws(fn, (error) => {
    assert.equal(error?.name, 'TextCoordinateError');
    assert.equal(error?.code, code);
    if (reason) assert.equal(error?.reason, reason);
    return true;
  });
}

test('TEXT-01A: Intl.Segmenter extended grapheme boundaries cover Unicode edge families', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const cases = [
    ['regional-indicator-flag', '🇫🇮'],
    ['emoji-skin-tone-modifier', '👍🏽'],
    ['crlf-pair', '\r\n'],
    ['emoji-zwj-family', '👨‍👩‍👧‍👦'],
    ['combining-mark', 'e\u0301'],
    ['indic-conjunct', 'क्ष'],
    ['indic-zwj-conjunct', 'क्‍ष'],
    ['tamil-dependent-vowel', 'நி'],
  ];
  for (const [caseId, text] of cases) {
    const index = coordinate.buildTextCoordinateIndex(text);
    assert.equal(index.graphemeLength, 1, caseId);
    const segments = [...coordinate.iterateTextCoordinateSegments(
      index,
      coordinate.TEXT_COORDINATE_DOMAIN.GRAPHEME_CLUSTER,
    )];
    assert.equal(segments.length, 1, caseId);
    assert.equal(segments[0].text, text, caseId);
    assert.equal(segments[0].utf16Start, 0, caseId);
    assert.equal(segments[0].utf16End, text.length, caseId);
  }
});

test('TEXT-01A: every valid domain position round-trips through UTF-16 and whole ranges stay exact', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const D = coordinate.TEXT_COORDINATE_DOMAIN;
  const text = 'A🇫🇮👍🏽\r\ne\u0301क्षZ';
  const index = coordinate.buildTextCoordinateIndex(text);
  const domainLengths = new Map([
    [D.UTF16_JS_CODE_UNIT, index.utf16Length],
    [D.UNICODE_CODE_POINT, index.codePointLength],
    [D.GRAPHEME_CLUSTER, index.graphemeLength],
  ]);
  for (const [domain, length] of domainLengths) {
    for (let position = 0; position <= length; position += 1) {
      const utf16Position = coordinate.convertTextCoordinatePosition({
        index,
        fromDomain: domain,
        toDomain: D.UTF16_JS_CODE_UNIT,
        position,
      });
      const roundTrip = coordinate.convertTextCoordinatePosition({
        index,
        fromDomain: D.UTF16_JS_CODE_UNIT,
        toDomain: domain,
        position: utf16Position,
      });
      assert.equal(roundTrip, position, `${domain} position ${position}`);
    }
  }
  const graphemeRange = coordinate.convertTextCoordinateRange({
    index,
    fromDomain: D.UTF16_JS_CODE_UNIT,
    toDomain: D.GRAPHEME_CLUSTER,
    start: 0,
    end: text.length,
  });
  assert.deepEqual(graphemeRange, {
    start: 0,
    end: 7,
    length: 7,
  });
  assert.equal(Object.isFrozen(graphemeRange), true);
});

test('TEXT-01A: deterministic mixed-script property corpus preserves text and all declared boundaries', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const D = coordinate.TEXT_COORDINATE_DOMAIN;
  const atoms = [
    'A',
    'я',
    '中',
    'א',
    '😀',
    '🇫🇮',
    '👍🏽',
    '\r\n',
    'e\u0301',
    '👨‍👩‍👧‍👦',
    'क्ष',
    'நி',
  ];
  let seed = 0x51a7c001;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let caseIndex = 0; caseIndex < 64; caseIndex += 1) {
    let text = '';
    for (let atomIndex = 0; atomIndex < 24; atomIndex += 1) {
      text += atoms[next() % atoms.length];
    }
    const index = coordinate.buildTextCoordinateIndex(text);
    for (const [domain, expectedLength] of [
      [D.UNICODE_CODE_POINT, index.codePointLength],
      [D.GRAPHEME_CLUSTER, index.graphemeLength],
    ]) {
      const segments = [...coordinate.iterateTextCoordinateSegments(index, domain)];
      assert.equal(segments.length, expectedLength);
      assert.equal(segments.map((segment) => segment.text).join(''), text);
      for (let position = 0; position <= expectedLength; position += 1) {
        const utf16Position = coordinate.convertTextCoordinatePosition({
          index,
          fromDomain: domain,
          toDomain: D.UTF16_JS_CODE_UNIT,
          position,
        });
        assert.equal(coordinate.convertTextCoordinatePosition({
          index,
          fromDomain: D.UTF16_JS_CODE_UNIT,
          toDomain: domain,
          position: utf16Position,
        }), position);
      }
    }
  }
});

test('TEXT-01A: malformed, forged, out-of-range, split-surrogate, and split-grapheme inputs fail typed and closed', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const D = coordinate.TEXT_COORDINATE_DOMAIN;
  assertCoordinateError(
    () => coordinate.buildTextCoordinateIndex({ text: 'not a string' }),
    'E_TEXT_COORDINATE_INVALID',
    'TEXT_MUST_BE_STRING',
  );
  assertCoordinateError(
    () => coordinate.convertTextCoordinatePosition({
      index: {},
      fromDomain: D.UTF16_JS_CODE_UNIT,
      toDomain: D.UTF16_JS_CODE_UNIT,
      position: 0,
    }),
    'E_TEXT_COORDINATE_INDEX_INVALID',
  );

  const emojiIndex = coordinate.buildTextCoordinateIndex('😀');
  assertCoordinateError(
    () => coordinate.convertTextCoordinatePosition({
      index: emojiIndex,
      fromDomain: D.UTF16_JS_CODE_UNIT,
      toDomain: D.UNICODE_CODE_POINT,
      position: 1,
    }),
    'E_TEXT_COORDINATE_NOT_BOUNDARY',
  );
  assertCoordinateError(
    () => coordinate.convertTextCoordinatePosition({
      index: emojiIndex,
      fromDomain: 'BYTE_OFFSET',
      toDomain: D.UTF16_JS_CODE_UNIT,
      position: 0,
    }),
    'E_TEXT_COORDINATE_INVALID',
    'OFFSET_DOMAIN_INVALID',
  );
  assertCoordinateError(
    () => coordinate.convertTextCoordinatePosition({
      index: emojiIndex,
      fromDomain: D.UTF16_JS_CODE_UNIT,
      toDomain: D.UTF16_JS_CODE_UNIT,
      position: 3,
    }),
    'E_TEXT_COORDINATE_OUT_OF_RANGE',
  );
  assertCoordinateError(
    () => coordinate.convertTextCoordinateRange({
      index: emojiIndex,
      fromDomain: D.UTF16_JS_CODE_UNIT,
      toDomain: D.UTF16_JS_CODE_UNIT,
      start: 2,
      end: 1,
    }),
    'E_TEXT_COORDINATE_RANGE_INVALID',
  );

  const combiningIndex = coordinate.buildTextCoordinateIndex('e\u0301');
  assert.equal(coordinate.convertTextCoordinatePosition({
    index: combiningIndex,
    fromDomain: D.UTF16_JS_CODE_UNIT,
    toDomain: D.UNICODE_CODE_POINT,
    position: 1,
  }), 1);
  assertCoordinateError(
    () => coordinate.convertTextCoordinatePosition({
      index: combiningIndex,
      fromDomain: D.UTF16_JS_CODE_UNIT,
      toDomain: D.GRAPHEME_CLUSTER,
      position: 1,
    }),
    'E_TEXT_COORDINATE_NOT_BOUNDARY',
  );
  assertCoordinateError(
    () => coordinate.assertTextCoordinateIndexMatches(combiningIndex, 'é'),
    'E_TEXT_COORDINATE_INDEX_MISMATCH',
  );

  let getterReadCount = 0;
  const accessorInput = {
    index: emojiIndex,
    fromDomain: D.UTF16_JS_CODE_UNIT,
    toDomain: D.UTF16_JS_CODE_UNIT,
    get position() {
      getterReadCount += 1;
      return 0;
    },
  };
  assertCoordinateError(
    () => coordinate.convertTextCoordinatePosition(accessorInput),
    'E_TEXT_COORDINATE_INVALID',
    'INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY',
  );
  assert.equal(getterReadCount, 0);
});

test('TEXT-01A: missing Intl.Segmenter has no heuristic fallback', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  Object.defineProperty(Intl, 'Segmenter', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  try {
    assertCoordinateError(
      () => coordinate.buildTextCoordinateIndex('fallback forbidden'),
      'E_TEXT_COORDINATE_SEGMENTER_UNAVAILABLE',
      'INTL_SEGMENTER_GRAPHEME_UNAVAILABLE',
    );
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
    else delete Intl.Segmenter;
  }
});

test('TEXT-01A: malformed or throwing Segmenter output fails typed instead of inventing boundaries', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  const installSegmenter = (Segmenter) => Object.defineProperty(Intl, 'Segmenter', {
    configurable: true,
    writable: true,
    value: Segmenter,
  });
  try {
    installSegmenter(class {
      segment() {
        return [{ index: 1 }];
      }
    });
    assertCoordinateError(
      () => coordinate.buildTextCoordinateIndex('ab'),
      'E_TEXT_COORDINATE_INVALID',
      'SEGMENTER_FIRST_BOUNDARY_MUST_BE_ZERO',
    );

    installSegmenter(class {
      segment() {
        return [];
      }
    });
    assertCoordinateError(
      () => coordinate.buildTextCoordinateIndex('ab'),
      'E_TEXT_COORDINATE_INVALID',
      'SEGMENTER_RETURNED_EMPTY_RESULT',
    );

    installSegmenter(class {
      segment() {
        return {
          *[Symbol.iterator]() {
            throw new TypeError('synthetic segmenter failure');
          },
        };
      }
    });
    assertCoordinateError(
      () => coordinate.buildTextCoordinateIndex('ab'),
      'E_TEXT_COORDINATE_INVALID',
      'SEGMENTER_ITERATION_FAILED',
    );
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
    else delete Intl.Segmenter;
  }
});

test('TEXT-01A: compact indexes are frozen and keep source text plus boundary tables opaque', async () => {
  const coordinate = await loadModule(path.join('src', 'core', 'textCoordinateAlgebra.mjs'));
  const index = coordinate.buildTextCoordinateIndex('A😀e\u0301');
  assert.equal(Object.isFrozen(index), true);
  assert.deepEqual(Object.keys(index), [
    'schemaVersion',
    'offsetDomains',
    'adapterOffsetDomain',
    'segmentationProvider',
    'segmentationLocale',
    'segmentationGranularity',
    'utf16Length',
    'codePointLength',
    'graphemeLength',
  ]);
  assert.equal(Object.hasOwn(index, 'text'), false);
  assert.equal(Object.hasOwn(index, 'codePointBoundaries'), false);
  assert.equal(Object.hasOwn(index, 'graphemeBoundaries'), false);
  assert.equal(index.schemaVersion, 'core.textCoordinateIndex.v1');
  assert.equal(index.utf16Length, 5);
  assert.equal(index.codePointLength, 4);
  assert.equal(index.graphemeLength, 3);
});

test('TEXT-01A: Atlas compatibility map adopts extended graphemes while anchor identity inputs remain byte-for-byte stable', async () => {
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'atlasTextAnchorNormalization.mjs'));
  const sceneText = 'Start 🇫🇮 then 👍🏽 and Cafe\u0301 finish.';
  const quote = '👍🏽';
  const startOffset = sceneText.indexOf(quote);
  const endOffset = startOffset + quote.length;
  const coordinateIndex = atlas.buildAtlasTextCoordinateIndex(sceneText);
  const offsetMap = atlas.buildAtlasTextOffsetMap(sceneText, coordinateIndex);
  const fullPacket = atlas.buildAtlasTextAnchorPacket({
    projectId: 'project-text-01a',
    sceneId: 'scene-unicode',
    entityId: 'entity-emoji',
    termId: 'term-thumb',
    startOffset,
    endOffset,
    sceneText,
    coordinateIndex,
  });
  const compactPacket = atlas.buildAtlasTextAnchorPacket({
    projectId: 'project-text-01a',
    sceneId: 'scene-unicode',
    entityId: 'entity-emoji',
    termId: 'term-thumb',
    startOffset,
    endOffset,
    sceneText,
    coordinateIndex,
    materializeOffsetMap: false,
  });

  assert.equal(offsetMap.graphemes.some((entry) => entry.text === '🇫🇮'), true);
  assert.equal(offsetMap.graphemes.some((entry) => entry.text === '👍🏽'), true);
  assert.equal(fullPacket.evidenceAnchor.graphemeRange.length, 1);
  assert.equal(compactPacket.offsetMap, null);
  assert.deepEqual(compactPacket.evidenceAnchor, fullPacket.evidenceAnchor);
  assert.equal(
    compactPacket.evidenceAnchor.anchorId,
    'atlas-anchor:021719442d2043ea8bbebcd650160ba89706246301e0dca23bdea22b0629ba3d',
  );
  assert.equal(
    compactPacket.evidenceAnchor.quoteHash,
    'dfe735e047f3a7b2c2b2c1a5b6c62a3b4fdf080c43dde0fd19b3be8214b2d632',
  );
  assert.equal(
    compactPacket.evidenceAnchor.sceneTextHash,
    '1ab3d93532f2436a312fb0c950a0d86b48a6036f8013df4388349d2bfdf2f13a',
  );

  const lineMap = atlas.buildAtlasTextOffsetMap('A\r\nB');
  assert.equal(lineMap.codePointLength, 4);
  assert.equal(lineMap.graphemeLength, 3);
  assert.equal(lineMap.graphemes[1].text, '\r\n');
  assertCoordinateError(
    () => atlas.buildAtlasTextAnchorPacket({
      projectId: 'project-text-01a',
      sceneId: 'scene-unicode',
      entityId: 'entity-combining',
      termId: 'term-split',
      startOffset: sceneText.indexOf('Cafe\u0301') + 4,
      endOffset: sceneText.indexOf('Cafe\u0301') + 5,
      sceneText,
    }),
    'E_TEXT_COORDINATE_NOT_BOUNDARY',
  );
  assertCoordinateError(
    () => atlas.buildAtlasTextOffsetMap(null),
    'E_TEXT_COORDINATE_INVALID',
    'TEXT_MUST_BE_STRING',
  );
  assertCoordinateError(
    () => atlas.buildAtlasTextAnchorPacket({
      projectId: 'project-text-01a',
      sceneId: 'scene-unicode',
      entityId: 'entity-emoji',
      termId: 'term-thumb',
      startOffset,
      endOffset,
      sceneText,
      materializeOffsetMap: 0,
    }),
    'E_TEXT_COORDINATE_INVALID',
    'ANCHOR_MATERIALIZE_OFFSET_MAP_MUST_BE_BOOLEAN',
  );
  let sceneTextGetterReadCount = 0;
  const accessorAnchorInput = {
    projectId: 'project-text-01a',
    sceneId: 'scene-unicode',
    entityId: 'entity-emoji',
    termId: 'term-thumb',
    startOffset,
    endOffset,
    get sceneText() {
      sceneTextGetterReadCount += 1;
      return sceneText;
    },
  };
  assertCoordinateError(
    () => atlas.buildAtlasTextAnchorPacket(accessorAnchorInput),
    'E_TEXT_COORDINATE_INVALID',
    'ANCHOR_INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY',
  );
  assert.equal(sceneTextGetterReadCount, 0);
});

test('TEXT-01A: one shared compact scene index removes per-anchor full-map materialization', async () => {
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'atlasTextAnchorNormalization.mjs'));
  const sceneText = 'Anna '.repeat(4000);
  const coordinateIndex = atlas.buildAtlasTextCoordinateIndex(sceneText);
  const anchorIds = new Set();
  for (let index = 0; index < 100; index += 1) {
    const startOffset = index * 5;
    const packet = atlas.buildAtlasTextAnchorPacket({
      projectId: 'project-performance',
      sceneId: 'scene-performance',
      entityId: 'entity-anna',
      termId: 'term-anna',
      startOffset,
      endOffset: startOffset + 4,
      sceneText,
      coordinateIndex,
      materializeOffsetMap: false,
    });
    assert.equal(packet.offsetMap, null);
    assert.equal(packet.evidenceAnchor.quote, 'Anna');
    anchorIds.add(packet.evidenceAnchor.anchorId);
  }
  assert.equal(anchorIds.size, 100);
});

test('TEXT-01A: coordinate sources remain browser-safe, side-effect-free, and wired into high-volume Atlas callers', () => {
  const sourcePaths = [
    'src/core/textCoordinateAlgebra.mjs',
    'src/derived/atlas/atlasTextAnchorNormalization.mjs',
  ];
  const forbiddenPatterns = [
    /from\s+['"]node:/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
    /\bdocument\./u,
    /fetch\s*\(/u,
    /WebAssembly/u,
  ];
  for (const relativePath of sourcePaths) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${relativePath} matched ${pattern.source}`);
    }
  }

  const highVolumeSources = [
    'src/derived/atlas/deriveAtlasMentionIndex.mjs',
    'src/derived/atlas/deriveAtlasEvidenceReattachmentInbox.mjs',
    'src/derived/atlas/deriveAtlasMixedLanguageRouter.mjs',
    'src/derived/atlas/deriveAtlasComplexScriptExactOnlyGuards.mjs',
  ];
  for (const relativePath of highVolumeSources) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.match(source, /buildAtlasTextCoordinateIndex/u, relativePath);
    assert.match(source, /materializeOffsetMap:\s*false/u, relativePath);
  }
  const contractSource = fs.readFileSync(path.join(process.cwd(), 'src', 'contracts', 'text-coordinate.contract.ts'), 'utf8');
  const barrelSource = fs.readFileSync(path.join(process.cwd(), 'src', 'contracts', 'index.ts'), 'utf8');
  assert.match(contractSource, /UTF16_JS_CODE_UNIT/u);
  assert.match(contractSource, /UNICODE_CODE_POINT/u);
  assert.match(contractSource, /GRAPHEME_CLUSTER/u);
  assert.match(barrelSource, /from "\.\/text-coordinate\.contract"/u);
});
