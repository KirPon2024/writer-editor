'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildStoredZip } = require('../../src/export/docx/docxMinBuilder.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function syntheticMasterLedger(kinds) {
  return {
    ledgerDigest: 'sha256:synthetic-master-ledger',
    operations: Array.from({ length: 40 }, (_, index) => ({
      id: `c5v2-negative-probe-${String(index + 1).padStart(4, '0')}`,
      family: 'negative_probe',
      round: 0,
      sceneId: `roman/${String((index % 21) + 1).padStart(2, '0')}_scene-${String((index % 21) + 1).padStart(2, '0')}.txt`,
      expectedOutcome: 'REJECT',
      isolatedFork: true,
      semanticIntent: {
        kind: kinds[index % kinds.length],
        contaminationPolicy: 'separate-copy-never-positive-authority-chain',
      },
    })),
  };
}

function syntheticBaselineDocx(filePath) {
  const paragraphs = Array.from({ length: 21 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    return `<w:p w14:paraId="${ordinal.padEnd(8, 'a')}" w14:textId="${ordinal.padEnd(8, 'b')}"><w:bookmarkStart w:id="${index + 1}" w:name="YRTK_${ordinal}_scene_${ordinal}_block_0001_deadbeef00"/><w:r><w:t xml:space="preserve">Scene ${ordinal} carries a sufficiently long deterministic paragraph for conflicting overlap fault injection and parser rejection evidence.</w:t></w:r><w:bookmarkEnd w:id="${index + 1}"/></w:p>`;
  }).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
  const customXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="YRTK_C01_AUTH"><vt:lpwstr>YRTK1.synthetic-signed-envelope</vt:lpwstr></property></Properties>';
  const bytes = buildStoredZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'docProps/custom.xml', data: Buffer.from(customXml) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
  ]);
  fs.writeFileSync(filePath, bytes);
}

function unzipText(docxPath, part) {
  return execFileSync('/usr/bin/unzip', ['-p', docxPath, part], { encoding: 'utf8' });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

test('C5V2 negative plan preserves the exact 40-operation, five-per-kind ledger contract', async () => {
  const negative = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-negative-forks.mjs'));
  const master = syntheticMasterLedger(negative.C5V2_NEGATIVE_PROBE_KINDS);
  const first = negative.buildC5V2NegativeProbePlan(master);
  const second = negative.buildC5V2NegativeProbePlan(master);

  assert.equal(first.operationCount, 40);
  assert.deepEqual(first.kindCounts, Object.fromEntries(negative.C5V2_NEGATIVE_PROBE_KINDS.map((kind) => [kind, 5])));
  assert.equal(first.planDigest, second.planDigest);
  assert.deepEqual(first.probes, second.probes);
  assert.equal(first.probes.every((probe) => probe.expectedOutcome === 'REJECT'), true);
  assert.equal(first.probes.every((probe) => probe.isolatedFork === true), true);
  assert.equal(new Set(first.probes.map((probe) => probe.id)).size, 40);
  assert.equal(new Set(first.probes.map((probe) => probe.requestKey)).size, 40);
});

test('C5V2 negative probe chunk selection preserves global ordinals and full-plan authority', async () => {
  const negative = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-negative-forks.mjs'));
  const full = negative.buildC5V2NegativeProbePlan(syntheticMasterLedger(negative.C5V2_NEGATIVE_PROBE_KINDS));
  const chunk = negative.selectC5V2NegativeProbeChunk(full, { start: 16, count: 5 });

  assert.deepEqual(chunk.chunk, { start: 16, count: 5, end: 20 });
  assert.equal(chunk.operationCount, 5);
  assert.equal(chunk.fullCampaignOperationCount, 40);
  assert.deepEqual(chunk.probes.map((probe) => probe.ordinal), [16, 17, 18, 19, 20]);
  assert.equal(chunk.planDigest, full.planDigest);
  assert.throws(
    () => negative.selectC5V2NegativeProbeChunk(full, { start: 39, count: 5 }),
    /CHUNK_INVALID/u,
  );
});

test('C5V2 negative fork materialization is isolated, hash-bound and fault-specific', async () => {
  const negative = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-negative-forks.mjs'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-negative-forks-'));
  const baselinePath = path.join(tempRoot, 'baseline.docx');
  syntheticBaselineDocx(baselinePath);
  const plan = negative.buildC5V2NegativeProbePlan(syntheticMasterLedger(negative.C5V2_NEGATIVE_PROBE_KINDS));
  const manifest = negative.materializeC5V2NegativeForks({
    baselineDocxPath: baselinePath,
    outputDir: path.join(tempRoot, 'forks'),
    plan,
  });

  assert.equal(manifest.operationCount, 40);
  assert.equal(manifest.probes.length, 40);
  assert.equal(new Set(manifest.probes.map((probe) => probe.artifactPath)).size, 40);
  assert.equal(new Set(manifest.probes.map((probe) => probe.artifactSha256)).size, 40);
  assert.equal(new Set(manifest.probes.map((probe) => probe.effectKey)).size, 40);
  assert.equal(manifest.probes.every((probe) => fs.existsSync(probe.artifactPath)), true);
  assert.equal(manifest.probes.every((probe) => probe.artifactSha256 !== manifest.baselineDocxSha256), true);

  const corrupt = manifest.probes.filter((probe) => probe.kind === 'corrupt-package');
  const truncated = manifest.probes.filter((probe) => probe.kind === 'truncated-package');
  const healthy = manifest.probes.filter((probe) => !['corrupt-package', 'truncated-package'].includes(probe.kind));
  for (const probe of healthy) {
    assert.doesNotThrow(() => execFileSync('/usr/bin/unzip', ['-t', probe.artifactPath], { stdio: 'ignore' }), probe.id);
  }
  for (const probe of [...corrupt, ...truncated]) {
    assert.throws(() => execFileSync('/usr/bin/unzip', ['-t', probe.artifactPath], { stdio: 'ignore' }), undefined, probe.id);
  }

  for (const probe of manifest.probes.filter((item) => item.kind === 'tampered-authority')) {
    assert.match(unzipText(probe.artifactPath, 'docProps/custom.xml'), /YRTK1\.tampered-/u);
  }
  for (const probe of manifest.probes.filter((item) => item.kind === 'conflicting-overlap')) {
    const documentXml = unzipText(probe.artifactPath, 'word/document.xml');
    assert.match(documentXml, /C5V2_CONFLICT_A_/u);
    assert.match(documentXml, /C5V2_CONFLICT_B_/u);
    assert.equal(probe.mutation.duplicateBaselineRangeCount, 2);
  }
  for (const probe of manifest.probes.filter((item) => item.kind === 'wrong-scene')) {
    assert.equal(probe.mutation.nativeSignalsForged, true);
    assert.equal(probe.mutation.signedExportMapUntouched, true);
    assert.equal(probe.mutation.trackedReplacementInjected, true);
    assert.notEqual(probe.mutation.originalParaId, probe.mutation.forgedParaId);
    assert.notEqual(probe.mutation.sourceSceneOrdinal, probe.mutation.forgedSceneOrdinal);
  }
  for (const probe of manifest.probes.filter((item) => ['replay-conflict', 'duplicate-request-mutated-payload'].includes(item.kind))) {
    assert.equal(Boolean(probe.mutatedArtifactPath), true);
    assert.equal(fs.existsSync(probe.mutatedArtifactPath), true);
    assert.notEqual(probe.mutatedArtifactSha256, probe.artifactSha256);
  }
});

test('C5V2 negative plan rejects missing, duplicated and imbalanced probe authority', async () => {
  const negative = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-negative-forks.mjs'));
  const master = syntheticMasterLedger(negative.C5V2_NEGATIVE_PROBE_KINDS);
  assert.throws(() => negative.buildC5V2NegativeProbePlan({ ...master, operations: master.operations.slice(1) }), /COUNT_INVALID/u);
  assert.throws(() => negative.buildC5V2NegativeProbePlan({
    ...master,
    operations: master.operations.map((operation, index) => index === 1 ? { ...operation, id: master.operations[0].id } : operation),
  }), /ID_INVALID/u);
  assert.throws(() => negative.buildC5V2NegativeProbePlan({
    ...master,
    operations: master.operations.map((operation, index) => index === 0 ? {
      ...operation,
      semanticIntent: { ...operation.semanticIntent, kind: 'unknown-negative-kind' },
    } : operation),
  }), /KIND_INVALID/u);
});

test('C5V2 physical child routes negative forks through the shipped activation command and durable checkpoints', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const source = canary.createFullManuscriptExportChildSource({
    tempRoot: '/tmp/c5v2-negative-child',
    outPath: '/tmp/c5v2-negative-source.docx',
    returnedPath: '/tmp/c5v2-negative-returned.docx',
    returnedReadyPath: '/tmp/c5v2-negative-ready.json',
    scenes: [{ file: 'scene.txt', text: 'Scene text', rawContent: 'Scene text' }],
    negativeCampaign: {
      manifestPath: '/tmp/c5v2-negative-manifest.json',
      evidencePath: '/tmp/c5v2-negative-evidence.json',
      checkpointDir: '/tmp/c5v2-negative-checkpoints',
      headSha: 'head',
      masterLedgerDigest: 'ledger',
    },
  });
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /cmd\.project\.review\.activateDocxReviewPreviewSession/u);
  assert.match(source, /runC5V2NegativeCampaign/u);
  assert.match(source, /checkpointDigest/u);
  assert.match(source, /RTK_DOCX_ACTIVATION_DUPLICATE_REQUEST_MUTATED_PAYLOAD/u);
  assert.match(source, /allSceneHashesStable/u);
  assert.match(source, /allWriterFlagsFalse/u);
});

test('C5V2 negative aggregate verifies eight durable five-probe chains and exact 40-operation coverage', async () => {
  const negative = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-negative-forks.mjs'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-negative-aggregate-'));
  const plan = negative.buildC5V2NegativeProbePlan(syntheticMasterLedger(negative.C5V2_NEGATIVE_PROBE_KINDS));
  const headSha = 'a'.repeat(40);
  const evidencePaths = [];
  for (let chunkIndex = 0; chunkIndex < 8; chunkIndex += 1) {
    const start = chunkIndex * 5 + 1;
    const chunk = { start, count: 5, end: start + 4 };
    const manifestDigest = digest(`manifest-${start}`);
    const campaignBaseline = { digest: digest(`baseline-${start}`) };
    let previousCheckpointDigest = digest(stableJson({
      manifestDigest,
      campaignBaselineDigest: campaignBaseline.digest,
    }));
    const results = [];
    for (const probe of plan.probes.slice(start - 1, start + 4)) {
      const result = {
        schemaVersion: 'yalken.rtk.word.c5v2.negative-probe-result.v1',
        ordinal: probe.ordinal,
        id: probe.id,
        sceneId: probe.sceneId,
        kind: probe.kind,
        expectedOutcome: 'REJECT',
        observedOutcome: 'REJECT',
        ok: true,
        requestKey: probe.requestKey,
        effectKey: digest(`effect-${probe.id}`),
        artifactSha256: digest(`artifact-${probe.id}`),
        typedRejectGreen: true,
        sceneHashGreen: true,
        noWriterGreen: true,
        networkGreen: true,
      };
      const checkpoint = {
        ...result,
        headSha,
        masterLedgerDigest: plan.masterLedgerDigest,
        fullPlanDigest: plan.planDigest,
        chunk,
        manifestDigest,
        previousCheckpointDigest,
      };
      checkpoint.checkpointDigest = digest(stableJson(checkpoint));
      const checkpointPath = path.join(tempRoot, `${probe.id}.json`);
      const checkpointBytes = Buffer.from(`${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
      fs.writeFileSync(checkpointPath, checkpointBytes);
      results.push({
        ...result,
        checkpointPath,
        checkpointSha256: digest(checkpointBytes),
        checkpointDigest: checkpoint.checkpointDigest,
      });
      previousCheckpointDigest = checkpoint.checkpointDigest;
    }
    const evidence = {
      schemaVersion: 'yalken.rtk.word.c5v2.negative-campaign-evidence.v1',
      headSha,
      masterLedgerDigest: plan.masterLedgerDigest,
      fullPlanDigest: plan.planDigest,
      chunk,
      manifestDigest,
      baselineArtifactSha256: digest(`baseline-artifact-${start}`),
      baselineReturnApplyOk: true,
      campaignBaseline,
      operationCount: results.length,
      completedOperationIds: results.map((result) => result.id),
      rejectedCount: results.length,
      failedCount: 0,
      kindCounts: results.reduce((acc, result) => {
        acc[result.kind] = (acc[result.kind] || 0) + 1;
        return acc;
      }, {}),
      allSceneHashesStable: true,
      allWriterFlagsFalse: true,
      networkRequests: [],
      results,
      terminalCheckpointDigest: previousCheckpointDigest,
      createdAtUtc: '2026-08-02T00:00:00.000Z',
    };
    evidence.evidenceDigest = digest(stableJson(evidence));
    const evidencePath = path.join(tempRoot, `evidence-${String(start).padStart(2, '0')}.json`);
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    evidencePaths.push(evidencePath);
  }

  const aggregate = negative.aggregateC5V2NegativeCampaignChunks({ plan, evidencePaths, expectedHeadSha: headSha });
  assert.equal(aggregate.operationCount, 40);
  assert.equal(aggregate.chunkCount, 8);
  assert.equal(aggregate.rejectedCount, 40);
  assert.equal(aggregate.failedCount, 0);
  assert.equal(aggregate.uniqueRequestKeyCount, 40);
  assert.equal(aggregate.uniqueEffectKeyCount, 40);
  assert.deepEqual(aggregate.kindCounts, plan.kindCounts);
  assert.match(aggregate.aggregateDigest, /^sha256:[a-f0-9]{64}$/u);

  const tampered = JSON.parse(fs.readFileSync(evidencePaths[0], 'utf8'));
  tampered.results[0].observedOutcome = 'FAIL';
  fs.writeFileSync(evidencePaths[0], `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
  assert.throws(
    () => negative.aggregateC5V2NegativeCampaignChunks({ plan, evidencePaths, expectedHeadSha: headSha }),
    /EVIDENCE_DIGEST_MISMATCH/u,
  );
});
