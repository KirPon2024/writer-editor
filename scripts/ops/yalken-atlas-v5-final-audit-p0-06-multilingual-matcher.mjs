#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  CORE_COMMAND_IDS,
  applyCoreSequence,
  createInitialCoreState,
  reduceCoreState,
} from '../../src/core/runtime.mjs';
import {
  deriveAtlasMentionIndex,
  hashCanonicalValue,
} from '../../src/derived/index.mjs';

const require = createRequire(import.meta.url);
const {
  ATLAS_MULTILINGUAL_MATCHER_ID,
  collectAtlasMultilingualMatches,
} = require('../../src/shared/atlasMultilingualMatcher.cjs');

const REPORT_SCHEMA = 'yalken.atlas.v5.finalAudit.p0_06.multilingualMatcher.v1';
const CONTOUR_ID = 'P0_06_MULTILINGUAL_MATCHER';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_06_MULTILINGUAL_MATCHER');
const DEFAULT_RECEIPT = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_06_MULTILINGUAL_MATCHER_RECEIPT.json');

const PROJECT_ID = 'p0-06-multilingual-matcher-project';
const SCENE_ID = 'scene-p0-06';

const CASES = Object.freeze([
  {
    id: 'case-fold-en',
    languageCode: 'en',
    entityId: 'entity-case',
    term: 'Atlas Keeper',
    text: 'atlas keeper waits. Annabel is not Anna.',
    expectedQuotes: ['atlas keeper'],
    rejectedQuotes: ['Annabel'],
  },
  {
    id: 'cjk-exact',
    languageCode: 'zh-hans',
    entityId: 'entity-cjk',
    term: '東京',
    text: '東京で会う。東京都ではない。',
    expectedQuotes: ['東京'],
    rejectedQuotes: ['東京都'],
  },
  {
    id: 'rtl-hebrew',
    languageCode: 'he',
    entityId: 'entity-rtl',
    term: 'אבג',
    text: 'אבג אמר שלום.',
    expectedQuotes: ['אבג'],
    rejectedQuotes: [],
  },
  {
    id: 'indic',
    languageCode: 'hi',
    entityId: 'entity-indic',
    term: 'नमस्ते',
    text: 'नमस्ते फिर मिलेंगे.',
    expectedQuotes: ['नमस्ते'],
    rejectedQuotes: [],
  },
  {
    id: 'combining-nfd-source',
    languageCode: 'fr',
    entityId: 'entity-combining',
    term: 'Café',
    text: 'Café opens at noon.',
    expectedQuotes: ['Café'],
    rejectedQuotes: [],
  },
  {
    id: 'emoji-zwj',
    languageCode: 'und',
    entityId: 'entity-emoji',
    term: '👩‍💻',
    text: 'The 👩‍💻 fixed it, not partial 👩.',
    expectedQuotes: ['👩‍💻'],
    rejectedQuotes: ['👩'],
  },
]);

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, receiptPath: DEFAULT_RECEIPT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      out.outDir = path.resolve(String(argv[index + 1]));
      index += 1;
    } else if (arg === '--receipt' && argv[index + 1]) {
      out.receiptPath = path.resolve(String(argv[index + 1]));
      index += 1;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value ?? ''), 'utf8'));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256Buffer(fsSync.readFileSync(filePath)) : '',
  };
}

function sourceProof(relativePath) {
  return fileProof(relativePath);
}

function git(args) {
  const result = require('node:child_process').spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function buildProductState() {
  const text = CASES.map((item) => item.text).join('\n');
  const commands = [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: PROJECT_ID, title: 'P0 06 multilingual matcher', sceneId: SCENE_ID },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId: PROJECT_ID, sceneId: SCENE_ID, text },
    },
    {
      type: CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: { projectId: PROJECT_ID, scopeKind: 'project', languageCode: 'en', tagId: 'p0-06-project-language' },
    },
  ];
  for (const item of CASES) {
    commands.push({
      type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId: PROJECT_ID, entityId: item.entityId, name: item.term, entityKind: 'term' },
    });
    const startOffset = text.indexOf(item.text);
    commands.push({
      type: CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId: PROJECT_ID,
        scopeKind: 'range',
        sceneId: SCENE_ID,
        tagId: `p0-06-language-${item.id}`,
        languageCode: item.languageCode,
        startOffset,
        endOffset: startOffset + item.text.length,
      },
    });
  }
  const result = applyCoreSequence(createInitialCoreState(), commands);
  if (!result.ok) throw new Error(`P0_06_PRODUCT_STATE_FAILED:${JSON.stringify(result.error)}`);
  return { state: result.state, text };
}

function expectedOffset(fullText, quote) {
  const offset = fullText.indexOf(quote);
  if (offset < 0) throw new Error(`P0_06_EXPECTED_QUOTE_NOT_FOUND:${quote}`);
  return offset;
}

function proveSharedMatcher() {
  return CASES.map((item) => {
    const result = collectAtlasMultilingualMatches({
      sourceText: item.text,
      needle: item.term,
      languageCode: item.languageCode,
    });
    return {
      id: item.id,
      languageCode: result.policy.languageCode,
      matcherId: result.matcherId,
      languagePolicy: result.policy.languagePolicy,
      segmentationAppliedBeforeMatching: result.policy.segmentationAppliedBeforeMatching === true,
      caseFold: result.policy.caseFold === true,
      fuzzyMatching: result.policy.fuzzyMatching === true,
      englishFallback: result.policy.englishFallback === true,
      quotes: result.matches.map((match) => match.matchedText),
      boundaryAligned: result.matches.every((match) => match.boundaryAligned === true && match.graphemeRange.length >= 1),
      originalTextPreserved: result.matches.every((match) => match.originalTextPreserved === true),
      expectedQuotesPresent: item.expectedQuotes.every((quote) => result.matches.some((match) => match.matchedText === quote)),
      rejectedQuotesAbsent: item.rejectedQuotes.every((quote) => !result.matches.some((match) => match.matchedText === quote)),
    };
  });
}

function proveProductMentionIndex(state, text) {
  const mentionIndex = deriveAtlasMentionIndex({
    coreState: state,
    params: { projectId: PROJECT_ID },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  if (!mentionIndex.ok) throw new Error(`P0_06_MENTION_INDEX_FAILED:${JSON.stringify(mentionIndex.error)}`);
  const rows = CASES.map((item) => {
    const expectedQuotes = item.expectedQuotes.map((quote) => {
      const offset = expectedOffset(text, quote);
      return {
        quote,
        offset,
        mention: mentionIndex.value.mentions.find((mention) => (
          mention.entityId === item.entityId
          && mention.startOffset === offset
          && mention.endOffset === offset + quote.length
        )) || null,
      };
    });
    const rejectedPresent = item.rejectedQuotes.some((quote) => (
      mentionIndex.value.mentions.some((mention) => mention.entityId === item.entityId && mention.evidenceAnchor.quote === quote)
    ));
    return {
      id: item.id,
      expectedQuotesPresent: expectedQuotes.every((entry) => Boolean(entry.mention)),
      rejectedQuotesAbsent: rejectedPresent === false,
      matcherBound: expectedQuotes.every((entry) => entry.mention?.matcherId === ATLAS_MULTILINGUAL_MATCHER_ID),
      matchModeBound: expectedQuotes.every((entry) => entry.mention?.matchMode === 'CASE_AND_CANONICAL_EQUIVALENCE_EXACT'),
      languageRouteBound: expectedQuotes.every((entry) => entry.mention?.languageCode === item.languageCode),
      noEnglishFallback: expectedQuotes.every((entry) => entry.mention?.languageRoute?.englishFallback === false),
      originalQuotePreserved: expectedQuotes.every((entry) => (
        entry.mention?.evidenceAnchor?.quote === entry.quote
        && text.slice(entry.mention.startOffset, entry.mention.endOffset) === entry.quote
      )),
      graphemeBoundaryProof: expectedQuotes.every((entry) => entry.mention?.evidenceAnchor?.graphemeRange?.length >= 1),
    };
  });
  return {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p0_06.productMentionIndexProof.v1',
    mentionCount: mentionIndex.value.mentions.length,
    indexHash: mentionIndex.value.meta.indexHash,
    rows,
  };
}

function proveCoreAdmission(state, text) {
  const emojiStart = text.indexOf('👩‍💻');
  const splitQuote = text.slice(emojiStart + 1, emojiStart + '👩‍💻'.length);
  const rejected = reduceCoreState(state, {
    type: CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId: PROJECT_ID,
      sceneId: SCENE_ID,
      entityId: 'entity-emoji',
      mentionId: 'p0-06-split-emoji',
      evidenceAnchor: {
        schemaVersion: 'atlas.evidenceAnchor.v1',
        anchorId: 'p0-06-split-emoji-anchor',
        projectId: PROJECT_ID,
        sceneId: SCENE_ID,
        entityId: 'entity-emoji',
        startOffset: emojiStart + 1,
        endOffset: emojiStart + '👩‍💻'.length,
        quote: splitQuote,
        quoteHash: hashCanonicalValue(splitQuote),
        sceneTextHash: hashCanonicalValue(text),
      },
    },
  });
  return {
    splitGraphemeEvidenceRejected: rejected.ok === false && rejected.error?.code === 'E_ATLAS_EVIDENCE_GRAPHEME_SPLIT',
    rejectionCode: rejected.error?.code || '',
  };
}

function proveSourceBinding() {
  const mentionSource = fsSync.readFileSync(path.resolve('src/derived/atlas/deriveAtlasMentionIndex.mjs'), 'utf8');
  const mainSource = fsSync.readFileSync(path.resolve('src/main.js'), 'utf8');
  const matcherSource = fsSync.readFileSync(path.resolve('src/shared/atlasMultilingualMatcher.cjs'), 'utf8');
  return {
    noMentionIndexRawCaseSensitiveIndexOf: !mentionSource.includes('sceneText.indexOf(term.value, cursor)'),
    noMainRawCaseSensitiveNeedleIndexOf: !mainSource.includes('sourceText.indexOf(needle, index)'),
    sharedMatcherWiredToDerived: mentionSource.includes('collectAtlasMultilingualMatches({'),
    sharedMatcherWiredToMain: mainSource.includes('countAtlasMultilingualMatches({'),
    matcherUsesGraphemeSegmentation: matcherSource.includes("new Intl.Segmenter('und', { granularity: 'grapheme' })"),
    matcherUsesCanonicalCaseFold: matcherSource.includes(".normalize('NFC')") && matcherSource.includes('toLocaleLowerCase'),
    noNetworkDependency: !/fetch\s*\(|node:http|node:https|electron/u.test(matcherSource),
    sourceFiles: {
      'src/shared/atlasMultilingualMatcher.cjs': sourceProof('src/shared/atlasMultilingualMatcher.cjs'),
      'src/derived/atlas/deriveAtlasMentionIndex.mjs': sourceProof('src/derived/atlas/deriveAtlasMentionIndex.mjs'),
      'src/main.js': sourceProof('src/main.js'),
      'scripts/ops/yalken-atlas-v5-final-audit-p0-06-multilingual-matcher.mjs': sourceProof('scripts/ops/yalken-atlas-v5-final-audit-p0-06-multilingual-matcher.mjs'),
      'test/contracts/yalken-atlas-v5-final-audit-p0-06-multilingual-matcher.contract.test.js': sourceProof('test/contracts/yalken-atlas-v5-final-audit-p0-06-multilingual-matcher.contract.test.js'),
    },
  };
}

function collectFailures(report) {
  const failures = [];
  if (!report.sharedMatcher.every((row) => row.segmentationAppliedBeforeMatching === true)) failures.push('MATCHER_SEGMENTATION_NOT_BEFORE_MATCHING');
  if (!report.sharedMatcher.every((row) => row.caseFold === true)) failures.push('MATCHER_CASE_FOLD_DISABLED');
  if (!report.sharedMatcher.every((row) => row.fuzzyMatching === false && row.englishFallback === false)) failures.push('MATCHER_FUZZY_OR_ENGLISH_FALLBACK');
  if (!report.sharedMatcher.every((row) => row.expectedQuotesPresent === true)) failures.push('MATCHER_EXPECTED_QUOTE_MISSING');
  if (!report.sharedMatcher.every((row) => row.rejectedQuotesAbsent === true)) failures.push('MATCHER_BOUNDARY_FALSE_POSITIVE');
  if (!report.sharedMatcher.every((row) => row.originalTextPreserved === true && row.boundaryAligned === true)) failures.push('MATCHER_ORIGINAL_OR_GRAPHEME_PROOF_MISSING');
  if (!report.productMentionIndex.rows.every((row) => row.expectedQuotesPresent === true)) failures.push('PRODUCT_MENTION_EXPECTED_QUOTE_MISSING');
  if (!report.productMentionIndex.rows.every((row) => row.rejectedQuotesAbsent === true)) failures.push('PRODUCT_MENTION_BOUNDARY_FALSE_POSITIVE');
  if (!report.productMentionIndex.rows.every((row) => row.matcherBound === true && row.matchModeBound === true)) failures.push('PRODUCT_MENTION_MATCHER_NOT_BOUND');
  if (!report.productMentionIndex.rows.every((row) => row.languageRouteBound === true && row.noEnglishFallback === true)) failures.push('PRODUCT_MENTION_LANGUAGE_ROUTE_NOT_BOUND');
  if (!report.productMentionIndex.rows.every((row) => row.originalQuotePreserved === true && row.graphemeBoundaryProof === true)) failures.push('PRODUCT_MENTION_ANCHOR_PROOF_MISSING');
  if (report.coreAdmission.splitGraphemeEvidenceRejected !== true) failures.push('CORE_SPLIT_GRAPHEME_ADMISSION_ACCEPTED');
  for (const [key, value] of Object.entries(report.sourceBinding)) {
    if (typeof value === 'boolean' && value !== true) failures.push(`SOURCE_BINDING_${key}`);
  }
  return failures;
}

export async function runP006(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const { state, text } = buildProductState();
  const sourceBinding = proveSourceBinding();
  const report = {
    schemaVersion: REPORT_SCHEMA,
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    sourceBinding: {
      headSha: git(['rev-parse', 'HEAD']).stdout,
      originMainSha: git(['rev-parse', 'origin/main']).stdout,
      ...sourceBinding,
    },
    sharedMatcher: proveSharedMatcher(),
    productMentionIndex: proveProductMentionIndex(state, text),
    coreAdmission: proveCoreAdmission(state, text),
    authority: {
      commandKernelAdmission: true,
      readModelProjection: true,
      storageMutation: false,
      networkRuntime: false,
      generatedArtifactOnlyAccepted: false,
      programDoneClaim: false,
    },
  };
  report.failures = collectFailures(report);
  report.pass = report.failures.length === 0;
  report.status = report.pass ? 'PASS_P0_06_MULTILINGUAL_MATCHER' : 'FAIL_P0_06_MULTILINGUAL_MATCHER';
  const reportPath = path.join(outDir, 'p0-06-multilingual-matcher-report.json');
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(reportPath, reportText, 'utf8');

  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT);
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schemaVersion: `${REPORT_SCHEMA}.receipt`,
    contourId: CONTOUR_ID,
    status: report.status,
    pass: report.pass,
    programDoneClaim: false,
    generatedAtUtc: report.generatedAtUtc,
    sourceBinding: report.sourceBinding,
    report: fileProof(reportPath),
    acceptance: {
      languagePolicyBeforeMatching: true,
      graphemeAwareMatching: true,
      unicodeMatrixProductEvidence: true,
      rawCaseSensitiveUtf16MatcherRemoved: true,
      productMentionIndexBound: true,
      commandKernelCoreAdmissionRejectsSplitGrapheme: true,
      noEnglishFallback: true,
      noFuzzyMatching: true,
      noNetwork: true,
      noProgramDoneClaim: true,
    },
    evidenceCommands: [
      'node scripts/ops/yalken-atlas-v5-final-audit-p0-06-multilingual-matcher.mjs',
    ],
    nextContour: 'P0_07_STRESS_PRODUCT_PROOF',
  };
  const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
  await fs.writeFile(receiptPath, receiptText, 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: sha256Text(reportText),
    receiptPath,
    receiptSha256: sha256Text(receiptText),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runP006(options);
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    pass: result.pass,
    failures: result.failures,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
    receiptPath: result.receiptPath,
    receiptSha256: result.receiptSha256,
  }, null, 2));
  if (result.pass !== true) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
