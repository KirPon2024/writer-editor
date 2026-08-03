#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStoredZip } = require('../../src/export/docx/docxMinBuilder.js');

export const C5V2_NEGATIVE_PROBE_KINDS = Object.freeze([
  'stale-baseline',
  'conflicting-overlap',
  'tampered-authority',
  'wrong-scene',
  'corrupt-package',
  'replay-conflict',
  'truncated-package',
  'duplicate-request-mutated-payload',
]);

function sha256Bytes(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeBufferAtomicDurable(filePath, bytes) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const dirFd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
  return {
    path: filePath,
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function listZipEntries(docxPath) {
  return execFileSync('/usr/bin/unzip', ['-Z1', docxPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
  }).split(/\r?\n/u).filter(Boolean);
}

function readZipEntries(docxPath) {
  return listZipEntries(docxPath).map((name) => ({
    name,
    data: execFileSync('/usr/bin/unzip', ['-p', docxPath, name.replace(/[\[\]]/gu, '\\$&')], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 128 * 1024 * 1024,
    }),
  }));
}

function safeMarker(operationId, suffix = '') {
  return `${String(operationId || '').replace(/[^a-z0-9_-]/giu, '-')}${suffix ? `-${suffix}` : ''}`;
}

function withPackageMarker(entries, marker) {
  let found = false;
  const next = entries.map((entry) => {
    if (entry.name !== 'docProps/custom.xml') return entry;
    const text = entry.data.toString('utf8');
    if (!text.includes('</Properties>')) throw new Error('C5V2_NEGATIVE_CUSTOM_PROPERTIES_ROOT_MISSING');
    found = true;
    return {
      name: entry.name,
      data: Buffer.from(text.replace('</Properties>', `<!--${marker}--></Properties>`), 'utf8'),
    };
  });
  if (!found) throw new Error('C5V2_NEGATIVE_CUSTOM_PROPERTIES_PART_MISSING');
  return next;
}

function withTamperedAuthority(entries, marker) {
  let found = false;
  const marked = withPackageMarker(entries, marker);
  const next = marked.map((entry) => {
    if (entry.name !== 'docProps/custom.xml') return entry;
    const text = entry.data.toString('utf8');
    const mutated = text.replace(/YRTK1\.[^<]+/u, `YRTK1.tampered-${marker}`);
    if (mutated === text) throw new Error('C5V2_NEGATIVE_AUTHORITY_TOKEN_MISSING');
    found = true;
    return { name: entry.name, data: Buffer.from(mutated, 'utf8') };
  });
  if (!found) throw new Error('C5V2_NEGATIVE_AUTHORITY_TAMPER_FAILED');
  return next;
}

function sceneOrdinalFromId(sceneId) {
  const match = String(sceneId || '').match(/(?:^|\/)0?(\d{1,2})_/u);
  const ordinal = match ? Number.parseInt(match[1], 10) : 0;
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 99) {
    throw new Error(`C5V2_NEGATIVE_SCENE_ORDINAL_UNRESOLVED:${sceneId || ''}`);
  }
  return ordinal;
}

function xmlUnescape(value) {
  return String(value || '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function withConflictingTrackedOverlap(entries, operation) {
  const ordinal = sceneOrdinalFromId(operation.sceneId);
  const sceneToken = `scene_${String(ordinal).padStart(2, '0')}_`;
  let mutation = null;
  const next = withPackageMarker(entries, safeMarker(operation.id, 'conflict')).map((entry) => {
    if (entry.name !== 'word/document.xml') return entry;
    const xml = entry.data.toString('utf8');
    const sceneStart = xml.indexOf(sceneToken);
    if (sceneStart < 0) throw new Error(`C5V2_NEGATIVE_SCENE_BOOKMARK_MISSING:${operation.id}`);
    const nextSceneToken = `scene_${String(ordinal + 1).padStart(2, '0')}_`;
    const nextSceneStart = xml.indexOf(nextSceneToken, sceneStart + sceneToken.length);
    const sceneEnd = nextSceneStart >= 0 ? nextSceneStart : xml.length;
    const region = xml.slice(sceneStart, sceneEnd);
    const runPattern = /<w:r(?:\s[^>]*)?><w:t(?:\s[^>]*)?>([^<]{24,})<\/w:t><\/w:r>/u;
    const runMatch = region.match(runPattern);
    if (!runMatch || typeof runMatch.index !== 'number') {
      throw new Error(`C5V2_NEGATIVE_SCENE_TEXT_RUN_MISSING:${operation.id}`);
    }
    const rawText = runMatch[1];
    const plainText = xmlUnescape(rawText);
    const graphemes = typeof Intl?.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plainText)].map((part) => part.segment)
      : [...plainText];
    const take = Math.min(32, Math.max(12, Math.floor(graphemes.length / 3)));
    const oldText = graphemes.slice(0, take).join('');
    const remainder = graphemes.slice(take).join('');
    const marker = safeMarker(operation.id).slice(-12);
    const insertedA = `C5V2_CONFLICT_A_${marker}`;
    const insertedB = `C5V2_CONFLICT_B_${marker}`;
    const revisionBase = 80_000 + Number.parseInt(String(operation.id).slice(-4), 10) * 4;
    const replacement = [
      `<w:ins w:id="${revisionBase}" w:author="Yalken C5V2 Negative" w:date="2026-08-02T00:00:00Z"><w:r><w:t>${xmlEscape(insertedA)}</w:t></w:r></w:ins>`,
      `<w:del w:id="${revisionBase + 1}" w:author="Yalken C5V2 Negative" w:date="2026-08-02T00:00:00Z"><w:r><w:delText>${xmlEscape(oldText)}</w:delText></w:r></w:del>`,
      `<w:ins w:id="${revisionBase + 2}" w:author="Yalken C5V2 Negative" w:date="2026-08-02T00:00:00Z"><w:r><w:t>${xmlEscape(insertedB)}</w:t></w:r></w:ins>`,
      `<w:del w:id="${revisionBase + 3}" w:author="Yalken C5V2 Negative" w:date="2026-08-02T00:00:00Z"><w:r><w:delText>${xmlEscape(oldText)}</w:delText></w:r></w:del>`,
      remainder ? `<w:r><w:t xml:space="preserve">${xmlEscape(remainder)}</w:t></w:r>` : '',
    ].join('');
    const absoluteStart = sceneStart + runMatch.index;
    const mutated = `${xml.slice(0, absoluteStart)}${replacement}${xml.slice(absoluteStart + runMatch[0].length)}`;
    mutation = {
      sceneOrdinal: ordinal,
      oldTextSha256: sha256Bytes(Buffer.from(oldText, 'utf8')),
      insertedTextSha256: [insertedA, insertedB].map((value) => sha256Bytes(Buffer.from(value, 'utf8'))),
      duplicateBaselineRangeCount: 2,
      revisionIds: [revisionBase, revisionBase + 1, revisionBase + 2, revisionBase + 3],
    };
    return { name: entry.name, data: Buffer.from(mutated, 'utf8') };
  });
  if (!mutation) throw new Error(`C5V2_NEGATIVE_CONFLICT_MUTATION_FAILED:${operation.id}`);
  return { entries: next, mutation };
}

function withWrongSceneSignals(entries, operation) {
  const ordinal = sceneOrdinalFromId(operation.sceneId);
  const wrongOrdinal = ordinal === 21 ? 20 : ordinal + 1;
  const sceneToken = `scene_${String(ordinal).padStart(2, '0')}_`;
  const wrongSceneToken = `scene_${String(wrongOrdinal).padStart(2, '0')}_`;
  let mutation = null;
  const next = withPackageMarker(entries, safeMarker(operation.id, 'wrong-scene')).map((entry) => {
    if (entry.name !== 'word/document.xml') return entry;
    const xml = entry.data.toString('utf8');
    const sceneStart = xml.indexOf(sceneToken);
    const wrongSceneStart = xml.indexOf(wrongSceneToken);
    if (sceneStart < 0 || wrongSceneStart < 0) {
      throw new Error(`C5V2_NEGATIVE_WRONG_SCENE_BOOKMARK_MISSING:${operation.id}`);
    }
    const paragraphStart = xml.lastIndexOf('<w:p ', sceneStart);
    const paragraphEnd = xml.indexOf('</w:p>', sceneStart);
    const wrongParagraphStart = xml.lastIndexOf('<w:p ', wrongSceneStart);
    const wrongParagraphEnd = xml.indexOf('</w:p>', wrongSceneStart);
    if ([paragraphStart, paragraphEnd, wrongParagraphStart, wrongParagraphEnd].some((value) => value < 0)) {
      throw new Error(`C5V2_NEGATIVE_WRONG_SCENE_PARAGRAPH_MISSING:${operation.id}`);
    }
    const paragraph = xml.slice(paragraphStart, paragraphEnd + '</w:p>'.length);
    const wrongParagraph = xml.slice(wrongParagraphStart, wrongParagraphEnd + '</w:p>'.length);
    const signalPattern = /w14:paraId="([^"]+)"\s+w14:textId="([^"]+)"/u;
    const targetSignals = paragraph.match(signalPattern);
    const wrongSignals = wrongParagraph.match(signalPattern);
    if (!targetSignals || !wrongSignals) {
      throw new Error(`C5V2_NEGATIVE_WRONG_SCENE_SIGNALS_MISSING:${operation.id}`);
    }
    const signalMutatedParagraph = paragraph
      .replace(
        signalPattern,
        `w14:paraId="${wrongSignals[1]}" w14:textId="${wrongSignals[2]}"`,
      )
      .replace(sceneToken, wrongSceneToken);
    const runPattern = /<w:r(?:\s[^>]*)?><w:t(?:\s[^>]*)?>([^<]{24,})<\/w:t><\/w:r>/u;
    const runMatch = signalMutatedParagraph.match(runPattern);
    if (!runMatch) throw new Error(`C5V2_NEGATIVE_WRONG_SCENE_TEXT_RUN_MISSING:${operation.id}`);
    const plainText = xmlUnescape(runMatch[1]);
    const graphemes = typeof Intl?.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plainText)].map((part) => part.segment)
      : [...plainText];
    const take = Math.min(28, Math.max(12, Math.floor(graphemes.length / 3)));
    const oldText = graphemes.slice(0, take).join('');
    const remainder = graphemes.slice(take).join('');
    const marker = safeMarker(operation.id).slice(-12);
    const insertedText = `C5V2_WRONG_SCENE_${marker}`;
    const revisionBase = 90_000 + Number.parseInt(String(operation.id).slice(-4), 10) * 2;
    const trackedReplacement = [
      `<w:ins w:id="${revisionBase}" w:author="Yalken C5V2 Negative" w:date="2026-08-02T00:00:00Z"><w:r><w:t>${xmlEscape(insertedText)}</w:t></w:r></w:ins>`,
      `<w:del w:id="${revisionBase + 1}" w:author="Yalken C5V2 Negative" w:date="2026-08-02T00:00:00Z"><w:r><w:delText>${xmlEscape(oldText)}</w:delText></w:r></w:del>`,
      remainder ? `<w:r><w:t xml:space="preserve">${xmlEscape(remainder)}</w:t></w:r>` : '',
    ].join('');
    const mutatedParagraph = signalMutatedParagraph.replace(runMatch[0], trackedReplacement);
    if (mutatedParagraph === paragraph) {
      throw new Error(`C5V2_NEGATIVE_WRONG_SCENE_MUTATION_FAILED:${operation.id}`);
    }
    mutation = {
      sourceSceneOrdinal: ordinal,
      forgedSceneOrdinal: wrongOrdinal,
      originalParaId: targetSignals[1],
      originalTextId: targetSignals[2],
      forgedParaId: wrongSignals[1],
      forgedTextId: wrongSignals[2],
      nativeSignalsForged: true,
      signedExportMapUntouched: true,
      trackedReplacementInjected: true,
      oldTextSha256: sha256Bytes(Buffer.from(oldText, 'utf8')),
      insertedTextSha256: sha256Bytes(Buffer.from(insertedText, 'utf8')),
      revisionIds: [revisionBase, revisionBase + 1],
    };
    return {
      name: entry.name,
      data: Buffer.from(`${xml.slice(0, paragraphStart)}${mutatedParagraph}${xml.slice(paragraphEnd + '</w:p>'.length)}`, 'utf8'),
    };
  });
  if (!mutation) throw new Error(`C5V2_NEGATIVE_WRONG_SCENE_MUTATION_FAILED:${operation.id}`);
  return { entries: next, mutation };
}

export function buildC5V2NegativeProbePlan(masterLedger) {
  const operations = Array.isArray(masterLedger?.operations)
    ? masterLedger.operations.filter((operation) => operation?.family === 'negative_probe')
    : [];
  const seen = new Set();
  const kindCounts = Object.fromEntries(C5V2_NEGATIVE_PROBE_KINDS.map((kind) => [kind, 0]));
  const probes = operations.map((operation, index) => {
    const id = typeof operation.id === 'string' ? operation.id : '';
    const sceneId = typeof operation.sceneId === 'string' ? operation.sceneId : '';
    const kind = typeof operation.semanticIntent?.kind === 'string' ? operation.semanticIntent.kind : '';
    if (!id || seen.has(id)) throw new Error(`C5V2_NEGATIVE_PROBE_ID_INVALID:${id || index}`);
    if (!sceneId) throw new Error(`C5V2_NEGATIVE_PROBE_SCENE_REQUIRED:${id}`);
    if (!C5V2_NEGATIVE_PROBE_KINDS.includes(kind)) throw new Error(`C5V2_NEGATIVE_PROBE_KIND_INVALID:${id}:${kind}`);
    if (operation.expectedOutcome !== 'REJECT' || operation.isolatedFork !== true) {
      throw new Error(`C5V2_NEGATIVE_PROBE_CONTRACT_INVALID:${id}`);
    }
    seen.add(id);
    kindCounts[kind] += 1;
    return {
      ordinal: index + 1,
      id,
      sceneId,
      kind,
      expectedOutcome: 'REJECT',
      isolatedFork: true,
      contaminationPolicy: operation.semanticIntent.contaminationPolicy || '',
      requestKey: `c5v2-negative-request-${id}`,
    };
  });
  if (probes.length !== 40) throw new Error(`C5V2_NEGATIVE_PROBE_COUNT_INVALID:${probes.length}`);
  for (const kind of C5V2_NEGATIVE_PROBE_KINDS) {
    if (kindCounts[kind] !== 5) throw new Error(`C5V2_NEGATIVE_PROBE_KIND_COUNT_INVALID:${kind}:${kindCounts[kind]}`);
  }
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.negative-probe-plan.v1',
    masterLedgerDigest: masterLedger?.ledgerDigest || '',
    operationCount: probes.length,
    kindCounts,
    probes,
    planDigest: sha256Bytes(Buffer.from(stableJson(probes), 'utf8')),
  };
}

export function selectC5V2NegativeProbeChunk(fullPlan, { start, count }) {
  const operationCount = Number(fullPlan?.operationCount);
  const chunkStart = Number(start);
  const chunkCount = Number(count);
  if (
    !Array.isArray(fullPlan?.probes)
    || !Number.isSafeInteger(operationCount)
    || fullPlan.probes.length !== operationCount
    || !Number.isSafeInteger(chunkStart)
    || chunkStart < 1
    || chunkStart > operationCount
    || !Number.isSafeInteger(chunkCount)
    || chunkCount < 1
    || chunkStart + chunkCount - 1 > operationCount
  ) {
    throw new Error(`C5V2_NEGATIVE_PROBE_CHUNK_INVALID:${chunkStart}:${chunkCount}`);
  }
  const probes = fullPlan.probes.slice(chunkStart - 1, chunkStart - 1 + chunkCount);
  const kindCounts = probes.reduce((acc, probe) => {
    acc[probe.kind] = (acc[probe.kind] || 0) + 1;
    return acc;
  }, {});
  return {
    ...fullPlan,
    operationCount: probes.length,
    fullCampaignOperationCount: operationCount,
    kindCounts,
    probes,
    chunk: {
      start: chunkStart,
      count: chunkCount,
      end: chunkStart + chunkCount - 1,
    },
  };
}

export function materializeC5V2NegativeForks({ baselineDocxPath, outputDir, plan }) {
  if (!baselineDocxPath || !fs.existsSync(baselineDocxPath)) {
    throw new Error('C5V2_NEGATIVE_BASELINE_DOCX_REQUIRED');
  }
  if (!plan || !Array.isArray(plan.probes) || plan.probes.length < 1 || plan.probes.length > 40) {
    throw new Error('C5V2_NEGATIVE_PLAN_REQUIRED');
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const baselineBytes = fs.readFileSync(baselineDocxPath);
  const baselineEntries = readZipEntries(baselineDocxPath);
  const materialized = [];
  for (const probe of plan.probes) {
    const stem = `${String(probe.ordinal).padStart(2, '0')}-${probe.id}-${probe.kind}`;
    const artifactPath = path.join(outputDir, `${stem}.docx`);
    let artifactBytes;
    let mutation = { kind: probe.kind };
    if (probe.kind === 'corrupt-package') {
      artifactBytes = Buffer.from(baselineBytes);
      artifactBytes[0] = 0x58;
      artifactBytes[1] = 0x58;
      const marker = Buffer.from(`C5V2_CORRUPT_${probe.id}`, 'utf8');
      marker.copy(artifactBytes, Math.max(2, Math.min(artifactBytes.length - marker.length, 32)));
      mutation = { ...mutation, zipSignatureDestroyed: true };
    } else if (probe.kind === 'truncated-package') {
      const retainedBytes = Math.max(128, Math.floor(baselineBytes.length * (0.33 + ((probe.ordinal % 5) * 0.02))));
      artifactBytes = Buffer.from(baselineBytes.subarray(0, retainedBytes));
      mutation = { ...mutation, retainedBytes, originalBytes: baselineBytes.length };
    } else if (probe.kind === 'tampered-authority') {
      artifactBytes = buildStoredZip(withTamperedAuthority(baselineEntries, safeMarker(probe.id, 'authority')));
      mutation = { ...mutation, signedAuthorityTampered: true };
    } else if (probe.kind === 'conflicting-overlap') {
      const conflict = withConflictingTrackedOverlap(baselineEntries, probe);
      artifactBytes = buildStoredZip(conflict.entries);
      mutation = { ...mutation, ...conflict.mutation };
    } else if (probe.kind === 'wrong-scene') {
      const wrongScene = withWrongSceneSignals(baselineEntries, probe);
      artifactBytes = buildStoredZip(wrongScene.entries);
      mutation = { ...mutation, ...wrongScene.mutation };
    } else {
      artifactBytes = buildStoredZip(withPackageMarker(baselineEntries, safeMarker(probe.id, 'primary')));
      mutation = { ...mutation, semanticContentUnchanged: true };
    }
    const written = writeBufferAtomicDurable(artifactPath, artifactBytes);
    let mutatedArtifact = null;
    if (probe.kind === 'replay-conflict') {
      const conflict = withConflictingTrackedOverlap(baselineEntries, probe);
      const conflictBytes = buildStoredZip(conflict.entries);
      mutatedArtifact = writeBufferAtomicDurable(path.join(outputDir, `${stem}.mutated.docx`), conflictBytes);
      mutation.secondPayload = { kind: 'conflicting-overlap', ...conflict.mutation };
    } else if (probe.kind === 'duplicate-request-mutated-payload') {
      const variant = buildStoredZip(withPackageMarker(baselineEntries, safeMarker(probe.id, 'mutated-payload')));
      mutatedArtifact = writeBufferAtomicDurable(path.join(outputDir, `${stem}.mutated.docx`), variant);
      mutation.secondPayload = { kind: 'semantically-identical-byte-distinct-package' };
    }
    const effectKey = sha256Bytes(Buffer.from(stableJson({
      id: probe.id,
      kind: probe.kind,
      sceneId: probe.sceneId,
      artifactSha256: written.sha256,
      mutatedArtifactSha256: mutatedArtifact?.sha256 || '',
    }), 'utf8'));
    materialized.push({
      ...probe,
      artifactPath: written.path,
      artifactSha256: written.sha256,
      artifactBytes: written.bytes,
      mutatedArtifactPath: mutatedArtifact?.path || '',
      mutatedArtifactSha256: mutatedArtifact?.sha256 || '',
      mutatedArtifactBytes: mutatedArtifact?.bytes || 0,
      mutation,
      effectKey,
    });
  }
  const manifest = {
    schemaVersion: 'yalken.rtk.word.c5v2.negative-fork-manifest.v1',
    baselineDocxPath,
    baselineDocxSha256: sha256Bytes(baselineBytes),
    masterLedgerDigest: plan.masterLedgerDigest,
    planDigest: plan.planDigest,
    fullCampaignOperationCount: Number.isSafeInteger(plan.fullCampaignOperationCount)
      ? plan.fullCampaignOperationCount
      : 40,
    chunk: plan.chunk && typeof plan.chunk === 'object' ? plan.chunk : null,
    operationCount: materialized.length,
    kindCounts: plan.kindCounts,
    probes: materialized,
  };
  return {
    ...manifest,
    manifestDigest: sha256Bytes(Buffer.from(stableJson(manifest), 'utf8')),
  };
}

function digestObjectWithoutField(value, fieldName) {
  const copy = { ...value };
  delete copy[fieldName];
  return sha256Bytes(Buffer.from(stableJson(copy), 'utf8'));
}

function assertNegativeAggregate(condition, code, detail = '') {
  if (!condition) throw new Error(`${code}${detail ? `:${detail}` : ''}`);
}

function validateCheckpointChain(evidence) {
  let previousCheckpointDigest = sha256Bytes(Buffer.from(stableJson({
    manifestDigest: evidence.manifestDigest || '',
    campaignBaselineDigest: evidence.campaignBaseline?.digest || '',
  }), 'utf8'));
  for (const result of evidence.results) {
    const checkpointPath = String(result.checkpointPath || '');
    assertNegativeAggregate(checkpointPath && fs.existsSync(checkpointPath), 'C5V2_NEGATIVE_CHECKPOINT_MISSING', result.id);
    const checkpointBytes = fs.readFileSync(checkpointPath);
    assertNegativeAggregate(
      sha256Bytes(checkpointBytes) === result.checkpointSha256,
      'C5V2_NEGATIVE_CHECKPOINT_FILE_HASH_MISMATCH',
      result.id,
    );
    const checkpoint = JSON.parse(checkpointBytes.toString('utf8'));
    assertNegativeAggregate(checkpoint.id === result.id, 'C5V2_NEGATIVE_CHECKPOINT_ID_MISMATCH', result.id);
    assertNegativeAggregate(checkpoint.ordinal === result.ordinal, 'C5V2_NEGATIVE_CHECKPOINT_ORDINAL_MISMATCH', result.id);
    assertNegativeAggregate(checkpoint.headSha === evidence.headSha, 'C5V2_NEGATIVE_CHECKPOINT_HEAD_MISMATCH', result.id);
    assertNegativeAggregate(
      checkpoint.masterLedgerDigest === evidence.masterLedgerDigest,
      'C5V2_NEGATIVE_CHECKPOINT_LEDGER_MISMATCH',
      result.id,
    );
    assertNegativeAggregate(
      checkpoint.fullPlanDigest === evidence.fullPlanDigest,
      'C5V2_NEGATIVE_CHECKPOINT_PLAN_MISMATCH',
      result.id,
    );
    assertNegativeAggregate(
      stableJson(checkpoint.chunk) === stableJson(evidence.chunk),
      'C5V2_NEGATIVE_CHECKPOINT_CHUNK_MISMATCH',
      result.id,
    );
    assertNegativeAggregate(
      checkpoint.previousCheckpointDigest === previousCheckpointDigest,
      'C5V2_NEGATIVE_CHECKPOINT_CHAIN_MISMATCH',
      result.id,
    );
    assertNegativeAggregate(
      digestObjectWithoutField(checkpoint, 'checkpointDigest') === checkpoint.checkpointDigest,
      'C5V2_NEGATIVE_CHECKPOINT_DIGEST_MISMATCH',
      result.id,
    );
    assertNegativeAggregate(
      checkpoint.checkpointDigest === result.checkpointDigest,
      'C5V2_NEGATIVE_RESULT_CHECKPOINT_DIGEST_MISMATCH',
      result.id,
    );
    const resultPayload = { ...result };
    delete resultPayload.checkpointPath;
    delete resultPayload.checkpointSha256;
    delete resultPayload.checkpointDigest;
    const checkpointPayload = { ...checkpoint };
    for (const field of [
      'headSha',
      'masterLedgerDigest',
      'fullPlanDigest',
      'chunk',
      'manifestDigest',
      'previousCheckpointDigest',
      'checkpointDigest',
    ]) delete checkpointPayload[field];
    assertNegativeAggregate(
      stableJson(resultPayload) === stableJson(checkpointPayload),
      'C5V2_NEGATIVE_CHECKPOINT_PAYLOAD_MISMATCH',
      result.id,
    );
    previousCheckpointDigest = checkpoint.checkpointDigest;
  }
  assertNegativeAggregate(
    evidence.terminalCheckpointDigest === previousCheckpointDigest,
    'C5V2_NEGATIVE_TERMINAL_CHECKPOINT_MISMATCH',
  );
}

function loadEvidenceFile(evidencePath) {
  const resolvedPath = path.resolve(String(evidencePath || ''));
  assertNegativeAggregate(resolvedPath && fs.existsSync(resolvedPath), 'C5V2_NEGATIVE_EVIDENCE_MISSING', resolvedPath);
  const bytes = fs.readFileSync(resolvedPath);
  return {
    path: resolvedPath,
    sha256: sha256Bytes(bytes),
    evidence: JSON.parse(bytes.toString('utf8')),
  };
}

export function aggregateC5V2NegativeCampaignChunks({ plan, evidencePaths, expectedHeadSha }) {
  assertNegativeAggregate(
    plan?.schemaVersion === 'yalken.rtk.word.c5v2.negative-probe-plan.v1'
      && Array.isArray(plan?.probes)
      && plan.operationCount === 40
      && plan.probes.length === 40,
    'C5V2_NEGATIVE_AGGREGATE_PLAN_INVALID',
  );
  assertNegativeAggregate(
    plan.planDigest === sha256Bytes(Buffer.from(stableJson(plan.probes), 'utf8')),
    'C5V2_NEGATIVE_AGGREGATE_PLAN_DIGEST_MISMATCH',
  );
  assertNegativeAggregate(
    typeof expectedHeadSha === 'string' && /^[a-f0-9]{40}$/u.test(expectedHeadSha),
    'C5V2_NEGATIVE_AGGREGATE_HEAD_INVALID',
  );
  assertNegativeAggregate(
    Array.isArray(evidencePaths) && evidencePaths.length === 8,
    'C5V2_NEGATIVE_AGGREGATE_CHUNK_COUNT_INVALID',
    Array.isArray(evidencePaths) ? evidencePaths.length : 0,
  );
  const chunks = evidencePaths.map(loadEvidenceFile).sort((left, right) => (
    Number(left.evidence?.chunk?.start || 0) - Number(right.evidence?.chunk?.start || 0)
  ));
  const allResults = [];
  const chunkSummaries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const expectedStart = index * 5 + 1;
    const loaded = chunks[index];
    const evidence = loaded.evidence;
    assertNegativeAggregate(
      evidence?.schemaVersion === 'yalken.rtk.word.c5v2.negative-campaign-evidence.v1',
      'C5V2_NEGATIVE_EVIDENCE_SCHEMA_INVALID',
      expectedStart,
    );
    assertNegativeAggregate(evidence.headSha === expectedHeadSha, 'C5V2_NEGATIVE_EVIDENCE_HEAD_MISMATCH', expectedStart);
    assertNegativeAggregate(
      evidence.masterLedgerDigest === plan.masterLedgerDigest,
      'C5V2_NEGATIVE_EVIDENCE_LEDGER_MISMATCH',
      expectedStart,
    );
    assertNegativeAggregate(
      evidence.fullPlanDigest === plan.planDigest,
      'C5V2_NEGATIVE_EVIDENCE_PLAN_MISMATCH',
      expectedStart,
    );
    assertNegativeAggregate(
      evidence.chunk?.start === expectedStart
        && evidence.chunk?.count === 5
        && evidence.chunk?.end === expectedStart + 4,
      'C5V2_NEGATIVE_EVIDENCE_CHUNK_INVALID',
      expectedStart,
    );
    assertNegativeAggregate(
      evidence.operationCount === 5 && Array.isArray(evidence.results) && evidence.results.length === 5,
      'C5V2_NEGATIVE_EVIDENCE_OPERATION_COUNT_INVALID',
      expectedStart,
    );
    assertNegativeAggregate(
      digestObjectWithoutField(evidence, 'evidenceDigest') === evidence.evidenceDigest,
      'C5V2_NEGATIVE_EVIDENCE_DIGEST_MISMATCH',
      expectedStart,
    );
    assertNegativeAggregate(evidence.baselineReturnApplyOk === true, 'C5V2_NEGATIVE_BASELINE_APPLY_NOT_GREEN', expectedStart);
    assertNegativeAggregate(
      evidence.allSceneHashesStable === true,
      'C5V2_NEGATIVE_SCENE_HASH_STABILITY_NOT_GREEN',
      expectedStart,
    );
    assertNegativeAggregate(
      evidence.allWriterFlagsFalse === true,
      'C5V2_NEGATIVE_WRITER_FLAG_NOT_GREEN',
      expectedStart,
    );
    assertNegativeAggregate(
      Array.isArray(evidence.networkRequests) && evidence.networkRequests.length === 0,
      'C5V2_NEGATIVE_NETWORK_NOT_GREEN',
      expectedStart,
    );
    assertNegativeAggregate(
      evidence.rejectedCount === 5 && evidence.failedCount === 0,
      'C5V2_NEGATIVE_TYPED_OUTCOME_COUNT_INVALID',
      expectedStart,
    );
    validateCheckpointChain(evidence);
    allResults.push(...evidence.results);
    chunkSummaries.push({
      start: evidence.chunk.start,
      end: evidence.chunk.end,
      evidencePath: loaded.path,
      evidenceFileSha256: loaded.sha256,
      evidenceDigest: evidence.evidenceDigest,
      manifestDigest: evidence.manifestDigest,
      baselineArtifactSha256: evidence.baselineArtifactSha256,
      terminalCheckpointDigest: evidence.terminalCheckpointDigest,
    });
  }
  const requestKeys = new Set();
  const effectKeys = new Set();
  const completedOperationIds = [];
  const kindCounts = Object.fromEntries(C5V2_NEGATIVE_PROBE_KINDS.map((kind) => [kind, 0]));
  for (let index = 0; index < plan.probes.length; index += 1) {
    const expected = plan.probes[index];
    const result = allResults[index];
    assertNegativeAggregate(
      result?.ordinal === expected.ordinal && result?.id === expected.id && result?.kind === expected.kind
        && result?.sceneId === expected.sceneId,
      'C5V2_NEGATIVE_AGGREGATE_ORDER_MISMATCH',
      expected.id,
    );
    assertNegativeAggregate(
      result.expectedOutcome === 'REJECT' && result.observedOutcome === 'REJECT' && result.ok === true,
      'C5V2_NEGATIVE_AGGREGATE_OUTCOME_MISMATCH',
      expected.id,
    );
    assertNegativeAggregate(
      result.typedRejectGreen === true && result.sceneHashGreen === true
        && result.noWriterGreen === true && result.networkGreen === true,
      'C5V2_NEGATIVE_AGGREGATE_PROBE_GATE_NOT_GREEN',
      expected.id,
    );
    assertNegativeAggregate(
      result.requestKey === expected.requestKey && !requestKeys.has(result.requestKey),
      'C5V2_NEGATIVE_AGGREGATE_REQUEST_KEY_INVALID',
      expected.id,
    );
    assertNegativeAggregate(
      typeof result.effectKey === 'string' && /^sha256:[a-f0-9]{64}$/u.test(result.effectKey)
        && !effectKeys.has(result.effectKey),
      'C5V2_NEGATIVE_AGGREGATE_EFFECT_KEY_INVALID',
      expected.id,
    );
    assertNegativeAggregate(
      typeof result.artifactSha256 === 'string' && /^sha256:[a-f0-9]{64}$/u.test(result.artifactSha256),
      'C5V2_NEGATIVE_AGGREGATE_ARTIFACT_HASH_INVALID',
      expected.id,
    );
    requestKeys.add(result.requestKey);
    effectKeys.add(result.effectKey);
    completedOperationIds.push(result.id);
    kindCounts[result.kind] += 1;
  }
  assertNegativeAggregate(
    stableJson(kindCounts) === stableJson(plan.kindCounts),
    'C5V2_NEGATIVE_AGGREGATE_KIND_COUNTS_INVALID',
  );
  const aggregate = {
    schemaVersion: 'yalken.rtk.word.c5v2.negative-campaign-aggregate.v1',
    headSha: expectedHeadSha,
    masterLedgerDigest: plan.masterLedgerDigest,
    fullPlanDigest: plan.planDigest,
    operationCount: allResults.length,
    chunkCount: chunks.length,
    completedOperationIds,
    rejectedCount: allResults.filter((result) => result.observedOutcome === 'REJECT').length,
    failedCount: allResults.filter((result) => !result.ok).length,
    kindCounts,
    allSceneHashesStable: allResults.every((result) => result.sceneHashGreen),
    allWriterFlagsFalse: allResults.every((result) => result.noWriterGreen),
    allNetworkFlagsGreen: allResults.every((result) => result.networkGreen),
    uniqueRequestKeyCount: requestKeys.size,
    uniqueEffectKeyCount: effectKeys.size,
    chunks: chunkSummaries,
    terminalCheckpointDigests: chunkSummaries.map((chunk) => chunk.terminalCheckpointDigest),
    certificationClaim: 'NO_TERMINAL_CERTIFICATION_CLAIM_REQUIRES_MERGED_HEAD_REPETITIONS_AND_INDEPENDENT_AUDIT',
  };
  return {
    ...aggregate,
    aggregateDigest: sha256Bytes(Buffer.from(stableJson(aggregate), 'utf8')),
  };
}

export function writeC5V2NegativeAggregateAtomicDurable(outputPath, aggregate) {
  const bytes = Buffer.from(`${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
  return writeBufferAtomicDurable(path.resolve(String(outputPath || '')), bytes);
}
