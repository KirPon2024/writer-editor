import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildDeterministicFoldTape,
  mapFoldedOffsetToOriginal,
  mapOriginalOffsetToFolded,
} from '../../src/core/text-fold-tape-v1.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const IMPLEMENTATION_PATH = path.join(REPO_ROOT, 'src', 'core', 'text-fold-tape-v1.mjs');
const OLD_PREFIX_EXPRESSION = "codePoints.slice(0, codePointIndex).join('').length";
const HOSTILE_CORPUS = Object.freeze([
  '😀A😀B',
  'e\u0301 CAFÉ\u0301',
  '👨‍👩‍👧‍👦 FAMILY',
  'İSTANBUL Iı',
  'ΛΟΓΟΣ ΣΑΣ Σ ΠΟΛΗ',
  'Bi\u202Edi\r\nNEXT',
]);
const PERFORMANCE_LANES = Object.freeze([
  Object.freeze({ codePoints: 8192, thresholdMs: 600 }),
  Object.freeze({ codePoints: 16384, thresholdMs: 1000 }),
]);
const WARMUPS_PER_LANE = 2;
const SAMPLES_PER_LANE = 5;
const MAX_SCALING_RATIO = 2.75;

const round = (value) => Number(value.toFixed(3));

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measureFold(text) {
  const start = process.hrtime.bigint();
  const tape = buildDeterministicFoldTape(text);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(tape.foldedText.length > 0);
  return elapsedMs;
}

function assertTapeCoordinates(text) {
  const tape = buildDeterministicFoldTape(text);
  for (let offset = 0; offset <= text.length; offset += 1) {
    const strictlyInside = tape.tape.operations.some((operation) => (
      offset > operation.sourceStart && offset < operation.sourceEnd
    ));
    const forward = mapOriginalOffsetToFolded(tape, offset);
    assert.equal(
      forward.status,
      strictlyInside ? 'UNMAPPABLE' : 'EXACT',
      `source coordinate ${JSON.stringify(text)} @${offset}`,
    );
    if (forward.status === 'EXACT') {
      const inverse = mapFoldedOffsetToOriginal(tape, forward.position);
      assert.equal(inverse.status, 'EXACT', `inverse coordinate ${JSON.stringify(text)} @${offset}`);
      assert.equal(inverse.position, offset, `roundtrip coordinate ${JSON.stringify(text)} @${offset}`);
    }
  }
  for (let offset = 0; offset <= tape.foldedText.length; offset += 1) {
    const strictlyInside = tape.tape.operations.some((operation) => (
      offset > operation.targetStart && offset < operation.targetEnd
    ));
    const inverse = mapFoldedOffsetToOriginal(tape, offset);
    assert.equal(
      inverse.status,
      strictlyInside ? 'UNMAPPABLE' : 'EXACT',
      `target coordinate ${JSON.stringify(tape.foldedText)} @${offset}`,
    );
  }
}

test('C6A implementation has one cumulative UTF-16 prefix table and no quadratic prefix slice', () => {
  const source = fs.readFileSync(IMPLEMENTATION_PATH, 'utf8');
  const anchors = [
    'const utf16PrefixOffsets = new Uint32Array(codePoints.length + 1);',
    'utf16PrefixOffsets[index + 1] = utf16PrefixOffsets[index] + codePoints[index].length;',
    'const utf16OffsetOf = (codePointIndex) => utf16PrefixOffsets[codePointIndex];',
  ];
  for (const anchor of anchors) {
    assert.equal(source.split(anchor).length - 1, 1, `one structural anchor: ${anchor}`);
  }
  assert.equal(source.includes(OLD_PREFIX_EXPRESSION), false, 'old O(n^2) prefix reconstruction is absent');
  assert.equal(source.includes("codePoints.slice(cursor, runStart).join('')"), true, 'disjoint output slices remain allowed');
});

test('C6A preserves hostile Unicode fold text and UTF-16 tape coordinates', () => {
  const astral = buildDeterministicFoldTape('😀A😀B');
  assert.equal(astral.foldedText, '😀a😀b');
  assert.deepEqual(
    astral.tape.operations.map(({ sourceStart, sourceEnd }) => ({ sourceStart, sourceEnd })),
    [
      { sourceStart: 2, sourceEnd: 3 },
      { sourceStart: 5, sourceEnd: 6 },
    ],
    'astral prefixes advance by two UTF-16 code units',
  );
  assert.equal(buildDeterministicFoldTape('İSTANBUL Iı').foldedText, 'i̇stanbul iı');
  assert.equal(buildDeterministicFoldTape('ΛΟΓΟΣ ΣΑΣ Σ ΠΟΛΗ').foldedText, 'λογος σας ς πολη');
  for (const text of HOSTILE_CORPUS) assertTapeCoordinates(text);
});

test('C6A generated contract stays pending external attestation with pathless public capabilities', async () => {
  const generator = await import('../../scripts/ops/r24/corrective/c6a-text-fold-prefix-offset.mjs');
  const { contract, matrix } = generator.buildArtifacts(REPO_ROOT);
  assert.equal(contract.status, 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION');
  assert.equal(contract.signals.EXTERNAL_TERMINAL_ATTESTATION_VERIFIED, 'PENDING_POST_MERGE_EXTERNAL_C6A_ATTESTATION');
  assert.deepEqual(Object.keys(contract.signals), [
    'PREFIX_OFFSET_ON',
    'UTF16_SEMANTICS',
    'HOSTILE_UNICODE_CASES_PASS',
    'EIGHT_K_AND_SIXTEEN_K_STABLE_LANE',
    'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED',
  ]);
  const publicCapabilityIds = [
    ...Object.values(contract.capabilityIds),
    ...Object.values(contract.sourceBindings)
      .filter((binding) => binding && typeof binding === 'object' && typeof binding.capabilityId === 'string')
      .map((binding) => binding.capabilityId),
  ];
  for (const capabilityId of publicCapabilityIds) {
    assert.match(capabilityId, /^CAP_R24_[A-Z0-9_]+$/u);
    assert.equal(/[\\/]/u.test(capabilityId), false);
  }
  assert.equal(matrix.vectors.length, 9);
  assert.equal(matrix.vectors.at(-1).mutation, 'C6B_SCOPE_EXCLUSION');
  assert.equal(matrix.vectors.at(-1).autoAdmittedNextStage, false);
});

test('C6A hostile alternating 8K and 16K lanes remain within stable performance budgets', () => {
  const lanes = PERFORMANCE_LANES.map(({ codePoints, thresholdMs }) => {
    const text = '😀A'.repeat(codePoints / 2);
    assert.equal([...text].length, codePoints);
    return { codePoints, thresholdMs, text, samples: [] };
  });

  for (const lane of lanes) {
    for (let index = 0; index < WARMUPS_PER_LANE; index += 1) measureFold(lane.text);
  }
  for (let sample = 0; sample < SAMPLES_PER_LANE; sample += 1) {
    for (const lane of lanes) lane.samples.push(measureFold(lane.text));
  }

  const measured = lanes.map((lane) => {
    const medianMs = median(lane.samples);
    assert.ok(
      medianMs < lane.thresholdMs,
      `${lane.codePoints} code points median ${medianMs.toFixed(3)}ms >= ${lane.thresholdMs}ms`,
    );
    return {
      codePoints: lane.codePoints,
      utf16Units: lane.text.length,
      medianMs: round(medianMs),
      absoluteThresholdMs: lane.thresholdMs,
      withinThreshold: true,
    };
  });
  const scalingRatio = measured[1].medianMs / measured[0].medianMs;
  assert.ok(
    scalingRatio <= MAX_SCALING_RATIO,
    `16K/8K median scaling ${scalingRatio.toFixed(3)} > ${MAX_SCALING_RATIO}`,
  );

  console.log(`R24_C6A_PERFORMANCE_RECEIPT=${JSON.stringify({
    schemaVersion: 'R24_C6A_PERFORMANCE_RECEIPT_V1',
    corpus: 'ALTERNATING_ASTRAL_AND_UPPERCASE_CODE_POINTS',
    warmupsPerLane: WARMUPS_PER_LANE,
    samplesPerLane: SAMPLES_PER_LANE,
    lanes: measured,
    scalingRatio: round(scalingRatio),
    maxScalingRatio: MAX_SCALING_RATIO,
    stableScaling: true,
  })}`);
});
