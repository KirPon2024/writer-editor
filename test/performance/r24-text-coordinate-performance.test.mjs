import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
  buildAtlasTextAnchorPacket,
  buildAtlasTextCoordinateIndex,
} from '../../src/derived/atlas/atlasTextAnchorNormalization.mjs';

const BUDGET_URL = new URL('../fixtures/r24/c1b/text-coordinate-performance-budget.json', import.meta.url);

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1);
  return ordered[index];
}

function runScenario(budget) {
  const sceneText = 'Anna '.repeat(budget.sceneRepeats);
  const startedAt = performance.now();
  const coordinateIndex = buildAtlasTextCoordinateIndex(sceneText);
  const anchorIds = new Set();

  for (let index = 0; index < budget.anchorsPerRun; index += 1) {
    const startOffset = index * 5;
    const packet = buildAtlasTextAnchorPacket({
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

  assert.equal(anchorIds.size, budget.anchorsPerRun);
  return performance.now() - startedAt;
}

test('C1B performance lane uses warm-up and multi-sample median and p95 budgets', async () => {
  const budget = JSON.parse(await readFile(BUDGET_URL, 'utf8'));
  assert.equal(budget.schemaVersion, 'R24_C1B_TEXT_COORDINATE_PERFORMANCE_BUDGET_V1');
  assert.equal(budget.scenarioId, 'TEXT-01A-SHARED-COMPACT-INDEX');
  assert.equal(Number.isInteger(budget.warmupRuns) && budget.warmupRuns > 0, true);
  assert.equal(Number.isInteger(budget.sampleRuns) && budget.sampleRuns >= 5, true);

  for (let index = 0; index < budget.warmupRuns; index += 1) runScenario(budget);
  const samples = Array.from({ length: budget.sampleRuns }, () => runScenario(budget));
  const medianMs = percentile(samples, 0.5);
  const p95Ms = percentile(samples, 0.95);

  assert.equal(medianMs <= budget.maxMedianMs, true, `median ${medianMs.toFixed(1)}ms exceeded ${budget.maxMedianMs}ms`);
  assert.equal(p95Ms <= budget.maxP95Ms, true, `p95 ${p95Ms.toFixed(1)}ms exceeded ${budget.maxP95Ms}ms`);
});
