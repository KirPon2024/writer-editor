const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadTransformAlgebra() {
  return import(pathToFileURL(path.join(
    process.cwd(),
    'src',
    'core',
    'textTransformAlgebra.mjs',
  )).href);
}

function applyOperations(sourceText, operations) {
  const pieces = [];
  let cursor = 0;
  for (const operation of operations) {
    pieces.push(sourceText.slice(cursor, operation.sourceStart), operation.insertedText);
    cursor = operation.sourceEnd;
  }
  pieces.push(sourceText.slice(cursor));
  return pieces.join('');
}

function assertTransformError(fn, code, reason) {
  assert.throws(fn, (error) => {
    assert.equal(error?.name, 'TextTransformError');
    assert.equal(error?.code, code);
    if (reason) assert.equal(error?.reason, reason);
    return true;
  });
}

function positionInput(transform, direction, inputRevisionId, position, affinity) {
  return { transform, direction, inputRevisionId, position, affinity };
}

test('TEXT-03A: verified tape is deterministic, compact, Unicode-safe, and plaintext-free', async () => {
  const transform = await loadTransformAlgebra();
  const sourceText = 'A😀bc\nאבגZ';
  const operations = [
    { sourceStart: 1, sourceEnd: 1, insertedText: '👍🏽' },
    { sourceStart: 3, sourceEnd: 5, insertedText: '中' },
    { sourceStart: 6, sourceEnd: 9, insertedText: '' },
  ];
  const targetText = applyOperations(sourceText, operations);
  assert.equal(targetText, 'A👍🏽😀中\nZ');

  const tape = transform.buildTextTransformTape({
    sourceText,
    targetText,
    sourceRevisionId: 'scene-1:revision-1',
    targetRevisionId: 'scene-1:revision-2',
    operations,
  });
  const repeated = transform.buildTextTransformTape({
    sourceText,
    targetText,
    sourceRevisionId: 'scene-1:revision-1',
    targetRevisionId: 'scene-1:revision-2',
    operations,
  });

  assert.equal(tape.schemaVersion, 'core.textTransformTape.v1');
  assert.equal(tape.coordinateDomain, 'UTF16_JS_CODE_UNIT');
  assert.equal(tape.boundaryPolicy, 'UNICODE_CODE_POINT_BOUNDARIES');
  assert.equal(tape.operationCount, 3);
  assert.deepEqual(tape.operations.map((operation) => operation.kind), [
    'INSERT',
    'REPLACE',
    'DELETE',
  ]);
  assert.equal(tape.tapeId, repeated.tapeId);
  assert.equal(Object.isFrozen(tape), true);
  assert.equal(Object.isFrozen(tape.operations), true);
  assert.equal(Object.isFrozen(tape.operations[0]), true);
  assert.equal(tape.operations[0].insertedText, undefined);
  assert.equal(JSON.stringify(tape).includes('👍🏽'), false);
  assert.equal(JSON.stringify(tape).includes('אבג'), false);
});

test('TEXT-03A: position mapping exposes affinity and never clamps removed or inserted interiors', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const sourceText = 'A😀bc\nאבגZ';
  const operations = [
    { sourceStart: 1, sourceEnd: 1, insertedText: '👍🏽' },
    { sourceStart: 3, sourceEnd: 5, insertedText: '中' },
    { sourceStart: 6, sourceEnd: 9, insertedText: '' },
  ];
  const targetText = applyOperations(sourceText, operations);
  const tape = transform.buildTextTransformTape({
    sourceText,
    targetText,
    sourceRevisionId: 'rev-1',
    targetRevisionId: 'rev-2',
    operations,
  });

  assert.equal(transform.mapTextTransformPosition(
    positionInput(tape, D.FORWARD, 'rev-1', 1, A.BEFORE),
  ).outputPosition, 1);
  assert.equal(transform.mapTextTransformPosition(
    positionInput(tape, D.FORWARD, 'rev-1', 1, A.AFTER),
  ).outputPosition, 5);

  const removed = transform.mapTextTransformPosition(
    positionInput(tape, D.FORWARD, 'rev-1', 4, A.AFTER),
  );
  assert.equal(removed.status, 'UNMAPPABLE');
  assert.equal(removed.reason, 'POSITION_INSIDE_REMOVED_SOURCE_RANGE');
  assert.equal(removed.outputPosition, undefined);
  assert.equal(removed.failedOperationIndex, 1);

  const inserted = transform.mapTextTransformPosition(
    positionInput(tape, D.INVERSE, 'rev-2', 2, A.BEFORE),
  );
  assert.equal(inserted.status, 'UNMAPPABLE');
  assert.equal(inserted.reason, 'POSITION_INSIDE_INSERTED_TARGET_RANGE');
  assert.equal(inserted.outputPosition, undefined);

  assertTransformError(
    () => transform.mapTextTransformPosition(
      positionInput(tape, D.FORWARD, 'rev-wrong', 0, A.AFTER),
    ),
    'E_TEXT_TRANSFORM_REVISION_MISMATCH',
    'INPUT_REVISION_DOES_NOT_MATCH_TRANSFORM_DIRECTION',
  );
});

test('TEXT-03A: range mapping separates exact boundaries from content preservation', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const sourceText = 'alpha beta gamma';
  const operations = [
    { sourceStart: 5, sourceEnd: 5, insertedText: '!' },
    { sourceStart: 6, sourceEnd: 10, insertedText: 'BETA+' },
    { sourceStart: 11, sourceEnd: 16, insertedText: '' },
  ];
  const targetText = applyOperations(sourceText, operations);
  const tape = transform.buildTextTransformTape({
    sourceText,
    targetText,
    sourceRevisionId: 'rev-range-1',
    targetRevisionId: 'rev-range-2',
    operations,
  });
  const mapRange = (start, end, startAffinity = A.AFTER, endAffinity = A.BEFORE) => (
    transform.mapTextTransformRange({
      transform: tape,
      direction: D.FORWARD,
      inputRevisionId: 'rev-range-1',
      start,
      end,
      startAffinity,
      endAffinity,
    })
  );

  const alpha = mapRange(0, 5);
  assert.equal(alpha.status, 'EXACT');
  assert.deepEqual(alpha.outputRange, { start: 0, end: 5, length: 5 });
  assert.equal(alpha.contentImpact, 'UNCHANGED');
  assert.equal(alpha.contentPreserved, true);

  const insertionInside = mapRange(0, 6);
  assert.equal(insertionInside.startBoundary.status, 'EXACT');
  assert.equal(insertionInside.endBoundary.status, 'EXACT');
  assert.equal(insertionInside.contentImpact, 'OUTPUT_CONTENT_INSERTED');
  assert.equal(insertionInside.contentPreserved, false);

  const replacement = mapRange(6, 10);
  assert.equal(replacement.startBoundary.status, 'EXACT');
  assert.equal(replacement.endBoundary.status, 'EXACT');
  assert.equal(replacement.contentImpact, 'INPUT_REMOVED_AND_OUTPUT_INSERTED');
  assert.equal(replacement.contentPreserved, false);

  const deletion = mapRange(11, 16);
  assert.equal(deletion.status, 'EXACT');
  assert.equal(deletion.outputRange.length, 0);
  assert.equal(deletion.contentImpact, 'INPUT_CONTENT_REMOVED');
  assert.equal(deletion.contentPreserved, false);

  const interiorBoundaries = mapRange(7, 9);
  assert.equal(interiorBoundaries.status, 'UNMAPPABLE');
  assert.equal(interiorBoundaries.reason, 'BOTH_BOUNDARIES_UNMAPPABLE');
  assert.equal(interiorBoundaries.contentImpact, 'UNKNOWN_UNMAPPABLE_BOUNDARY');
  assert.equal(interiorBoundaries.contentPreserved, false);
});

test('TEXT-03A: explicit boundary affinities can expand or reject a collapsed range deterministically', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const tape = transform.buildTextTransformTape({
    sourceText: 'abc',
    targetText: 'aXbc',
    sourceRevisionId: 'collapsed-1',
    targetRevisionId: 'collapsed-2',
    operations: [{ sourceStart: 1, sourceEnd: 1, insertedText: 'X' }],
  });

  const before = transform.mapTextTransformRange({
    transform: tape,
    direction: D.FORWARD,
    inputRevisionId: 'collapsed-1',
    start: 1,
    end: 1,
    startAffinity: A.BEFORE,
    endAffinity: A.BEFORE,
  });
  assert.equal(before.status, 'EXACT');
  assert.deepEqual(before.outputRange, { start: 1, end: 1, length: 0 });

  const expanded = transform.mapTextTransformRange({
    transform: tape,
    direction: D.FORWARD,
    inputRevisionId: 'collapsed-1',
    start: 1,
    end: 1,
    startAffinity: A.BEFORE,
    endAffinity: A.AFTER,
  });
  assert.equal(expanded.status, 'EXACT');
  assert.deepEqual(expanded.outputRange, { start: 1, end: 2, length: 1 });
  assert.equal(expanded.contentImpact, 'OUTPUT_CONTENT_INSERTED');

  const inverted = transform.mapTextTransformRange({
    transform: tape,
    direction: D.FORWARD,
    inputRevisionId: 'collapsed-1',
    start: 1,
    end: 1,
    startAffinity: A.AFTER,
    endAffinity: A.BEFORE,
  });
  assert.equal(inverted.status, 'UNMAPPABLE');
  assert.equal(inverted.reason, 'BOUNDARY_AFFINITIES_INVERT_OUTPUT_RANGE');
});

test('TEXT-03A: routes compose only exact adjacent revision, hash, length, and algorithm edges', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const tape1 = transform.buildTextTransformTape({
    sourceText: 'abc',
    targetText: 'aXbc',
    sourceRevisionId: 'route-1',
    targetRevisionId: 'route-2',
    operations: [{ sourceStart: 1, sourceEnd: 1, insertedText: 'X' }],
  });
  const tape2Operations = [
    { sourceStart: 2, sourceEnd: 3, insertedText: '' },
    { sourceStart: 4, sourceEnd: 4, insertedText: '!' },
  ];
  const tape2 = transform.buildTextTransformTape({
    sourceText: 'aXbc',
    targetText: applyOperations('aXbc', tape2Operations),
    sourceRevisionId: 'route-2',
    targetRevisionId: 'route-3',
    operations: tape2Operations,
  });
  const route = transform.buildTextTransformRoute({ tapes: [tape1, tape2] });
  assert.equal(route.schemaVersion, 'core.textTransformRoute.v1');
  assert.equal(route.tapeCount, 2);
  assert.deepEqual(route.tapeIds, [tape1.tapeId, tape2.tapeId]);
  assert.equal(Object.isFrozen(route.tapeIds), true);

  const end = transform.mapTextTransformPosition(
    positionInput(route, D.FORWARD, 'route-1', 3, A.AFTER),
  );
  assert.equal(end.status, 'EXACT');
  assert.equal(end.outputRevisionId, 'route-3');
  assert.equal(end.outputPosition, 4);
  const roundTrip = transform.mapTextTransformPosition(
    positionInput(route, D.INVERSE, 'route-3', 4, A.AFTER),
  );
  assert.equal(roundTrip.status, 'EXACT');
  assert.equal(roundTrip.outputPosition, 3);

  const gap = transform.buildTextTransformTape({
    sourceText: 'aXbc',
    targetText: 'aXbc?',
    sourceRevisionId: 'route-gap',
    targetRevisionId: 'route-4',
    operations: [{ sourceStart: 4, sourceEnd: 4, insertedText: '?' }],
  });
  assertTransformError(
    () => transform.buildTextTransformRoute({ tapes: [tape1, gap] }),
    'E_TEXT_TRANSFORM_ROUTE_DISCONTINUITY',
    'ROUTE_TAPES_ARE_NOT_EXACTLY_ADJACENT',
  );

  const wrongText = transform.buildTextTransformTape({
    sourceText: 'zzzz',
    targetText: 'zzzz?',
    sourceRevisionId: 'route-2',
    targetRevisionId: 'route-5',
    operations: [{ sourceStart: 4, sourceEnd: 4, insertedText: '?' }],
  });
  assertTransformError(
    () => transform.buildTextTransformRoute({ tapes: [tape1, wrongText] }),
    'E_TEXT_TRANSFORM_ROUTE_DISCONTINUITY',
    'ROUTE_TAPES_ARE_NOT_EXACTLY_ADJACENT',
  );

  const cycle = transform.buildTextTransformTape({
    sourceText: 'aXbc',
    targetText: 'abc',
    sourceRevisionId: 'route-2',
    targetRevisionId: 'route-1',
    operations: [{ sourceStart: 1, sourceEnd: 2, insertedText: '' }],
  });
  assertTransformError(
    () => transform.buildTextTransformRoute({ tapes: [tape1, cycle] }),
    'E_TEXT_TRANSFORM_ROUTE_DISCONTINUITY',
    'ROUTE_REVISION_CYCLE_OR_DUPLICATE',
  );
});

test('TEXT-03A: deterministic property corpus preserves every mappable position across one tape', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const atoms = ['A', '😀', 'я', '中', 'é', 'א', '👍🏽', 'Z', 'क्ष', 'Q'];
  const insertedVariants = ['Ω', '🧭', '', 'אב', 'é'];
  let seed = 0x03a51a7;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };

  for (let caseIndex = 0; caseIndex < 48; caseIndex += 1) {
    const sourceAtoms = Array.from({ length: 20 }, () => atoms[next() % atoms.length]);
    const sourceText = sourceAtoms.join('');
    const boundaries = [0];
    for (const atom of sourceAtoms) boundaries.push(boundaries[boundaries.length - 1] + atom.length);
    let secondInserted = insertedVariants[next() % insertedVariants.length];
    const secondDeleted = sourceText.slice(boundaries[6], boundaries[7]);
    if (secondInserted === secondDeleted) secondInserted = 'ΩΩ';
    let thirdInserted = insertedVariants[next() % insertedVariants.length];
    const thirdDeleted = sourceText.slice(boundaries[12], boundaries[14]);
    if (thirdInserted === thirdDeleted) thirdInserted = '🧭🧭';
    const operations = [
      { sourceStart: boundaries[2], sourceEnd: boundaries[2], insertedText: '§' },
      { sourceStart: boundaries[6], sourceEnd: boundaries[7], insertedText: secondInserted },
      { sourceStart: boundaries[12], sourceEnd: boundaries[14], insertedText: thirdInserted },
    ];
    const targetText = applyOperations(sourceText, operations);
    const tape = transform.buildTextTransformTape({
      sourceText,
      targetText,
      sourceRevisionId: `property-${caseIndex}-a`,
      targetRevisionId: `property-${caseIndex}-b`,
      operations,
    });

    for (const position of boundaries) {
      const isRemovedInterior = operations.some((operation) => (
        position > operation.sourceStart && position < operation.sourceEnd
      ));
      for (const affinity of [A.BEFORE, A.AFTER]) {
        const forward = transform.mapTextTransformPosition(
          positionInput(tape, D.FORWARD, `property-${caseIndex}-a`, position, affinity),
        );
        if (isRemovedInterior) {
          assert.equal(forward.status, 'UNMAPPABLE');
          continue;
        }
        assert.equal(forward.status, 'EXACT');
        const inverseCandidates = [A.BEFORE, A.AFTER].map((inverseAffinity) => (
          transform.mapTextTransformPosition(positionInput(
            tape,
            D.INVERSE,
            `property-${caseIndex}-b`,
            forward.outputPosition,
            inverseAffinity,
          ))
        ));
        assert.equal(inverseCandidates.some((candidate) => (
          candidate.status === 'EXACT' && candidate.outputPosition === position
        )), true, `case ${caseIndex} position ${position} affinity ${affinity}`);
      }
    }

    for (const operation of tape.operations) {
      for (let position = operation.targetStart + 1; position < operation.targetEnd; position += 1) {
        const inverse = transform.mapTextTransformPosition(
          positionInput(tape, D.INVERSE, `property-${caseIndex}-b`, position, A.BEFORE),
        );
        assert.equal(inverse.status, 'UNMAPPABLE');
      }
    }
  }
});

test('TEXT-03A: malformed, ambiguous, forged, mismatched, and invalid Unicode inputs fail typed and closed', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const build = (overrides = {}) => transform.buildTextTransformTape({
    sourceText: 'A😀BC',
    targetText: 'A😀XBC',
    sourceRevisionId: 'strict-1',
    targetRevisionId: 'strict-2',
    operations: [{ sourceStart: 3, sourceEnd: 3, insertedText: 'X' }],
    ...overrides,
  });

  assertTransformError(
    () => build({ targetText: 'A😀YBC' }),
    'E_TEXT_TRANSFORM_TARGET_MISMATCH',
  );
  assertTransformError(
    () => build({ operations: [
      { sourceStart: 1, sourceEnd: 3, insertedText: 'Q' },
      { sourceStart: 3, sourceEnd: 4, insertedText: 'R' },
    ] }),
    'E_TEXT_TRANSFORM_OPERATION_ORDER',
    'OPERATIONS_MUST_BE_ORDERED_NON_TOUCHING_AND_NON_OVERLAPPING',
  );
  assertTransformError(
    () => build({ operations: [{ sourceStart: 0, sourceEnd: 1, insertedText: 'A' }] }),
    'E_TEXT_TRANSFORM_OPERATION_INVALID',
    'NOOP_OPERATION_FORBIDDEN',
  );
  assertTransformError(
    () => build({ operations: [{ sourceStart: 2, sourceEnd: 3, insertedText: 'X' }] }),
    'E_TEXT_TRANSFORM_OPERATION_INVALID',
    'OPERATION_SPLITS_UNICODE_CODE_POINT',
  );
  assertTransformError(
    () => build({ sourceText: 'A\ud800B' }),
    'E_TEXT_TRANSFORM_UNICODE_INVALID',
    'TEXT_MUST_BE_WELL_FORMED_UNICODE',
  );
  assertTransformError(
    () => build({ targetRevisionId: 'strict-1' }),
    'E_TEXT_TRANSFORM_INVALID',
    'SOURCE_AND_TARGET_REVISIONS_MUST_DIFFER',
  );

  let getterReads = 0;
  const accessorOperation = {
    sourceStart: 3,
    sourceEnd: 3,
    get insertedText() {
      getterReads += 1;
      return 'X';
    },
  };
  assertTransformError(
    () => build({ operations: [accessorOperation] }),
    'E_TEXT_TRANSFORM_INVALID',
    'INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY',
  );
  assert.equal(getterReads, 0);

  const extraFieldOperations = [{ sourceStart: 3, sourceEnd: 3, insertedText: 'X' }];
  extraFieldOperations.extra = true;
  assertTransformError(
    () => build({ operations: extraFieldOperations }),
    'E_TEXT_TRANSFORM_INVALID',
    'ARRAY_FIELDS_INVALID',
  );

  const throwingArray = new Proxy(
    [{ sourceStart: 3, sourceEnd: 3, insertedText: 'X' }],
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === '0') throw new Error('descriptor trap');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  assertTransformError(
    () => build({ operations: throwingArray }),
    'E_TEXT_TRANSFORM_INVALID',
    'ARRAY_ITEM_INSPECTION_FAILED',
  );

  const tape = build();
  const forged = JSON.parse(JSON.stringify(tape));
  assertTransformError(
    () => transform.mapTextTransformPosition(
      positionInput(forged, D.FORWARD, 'strict-1', 0, A.AFTER),
    ),
    'E_TEXT_TRANSFORM_DESCRIPTOR_INVALID',
    'TRANSFORM_NOT_CREATED_BY_TRANSFORM_ALGEBRA',
  );
});

test('TEXT-03A: identity text edges are valid and large text is not retained in the public descriptor', async () => {
  const transform = await loadTransformAlgebra();
  const D = transform.TEXT_TRANSFORM_DIRECTION;
  const A = transform.TEXT_TRANSFORM_AFFINITY;
  const identity = transform.buildTextTransformTape({
    sourceText: 'same 😀 text',
    targetText: 'same 😀 text',
    sourceRevisionId: 'identity-1',
    targetRevisionId: 'identity-2',
    operations: [],
  });
  assert.equal(identity.operationCount, 0);
  assert.equal(transform.mapTextTransformPosition(
    positionInput(identity, D.FORWARD, 'identity-1', 12, A.AFTER),
  ).outputPosition, 12);

  const sourceText = 'a'.repeat(250_000);
  const operations = [{ sourceStart: 125_000, sourceEnd: 125_000, insertedText: '中' }];
  const tape = transform.buildTextTransformTape({
    sourceText,
    targetText: applyOperations(sourceText, operations),
    sourceRevisionId: 'large-1',
    targetRevisionId: 'large-2',
    operations,
  });
  assert.equal(JSON.stringify(tape).length < 3_000, true);
  assert.equal(transform.mapTextTransformPosition(
    positionInput(tape, D.FORWARD, 'large-1', 200_000, A.AFTER),
  ).outputPosition, 200_001);
});

test('TEXT-03A: module remains browser-safe and contracts are publicly exported', () => {
  const moduleSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'core', 'textTransformAlgebra.mjs'),
    'utf8',
  );
  const contractSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'contracts', 'text-transform.contract.ts'),
    'utf8',
  );
  const contractIndex = fs.readFileSync(
    path.join(process.cwd(), 'src', 'contracts', 'index.ts'),
    'utf8',
  );
  assert.doesNotMatch(moduleSource, /node:|electron|require\(|from ['"](?:fs|path|crypto)['"]/);
  assert.match(moduleSource, /browser-safe-hash\.mjs/);
  assert.match(moduleSource, /textCoordinateAlgebra\.mjs/);
  assert.match(contractSource, /TextTransformTapeDescriptor/);
  assert.match(contractIndex, /from "\.\/text-transform\.contract"/);
});
