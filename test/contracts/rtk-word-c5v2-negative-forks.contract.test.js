'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
