'use strict';

const crypto = require('crypto');
const { buildDocxReviewPacketBuffer } = require('./docxReviewPacketBuilder');

const FULL_MANUSCRIPT_REVIEW_DOCX_COMMAND_ID = 'cmd.project.review.exportFullManuscriptDocxReviewPacket';
const FULL_MANUSCRIPT_REVIEW_DOCX_CAPABILITY_ID = 'cap.project.review.exportFullManuscriptDocxReviewPacket';
const FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID = 'word-mac-latest-observed-16.111.x-product-review-export-c5v2-full-manuscript';
const REVIEW_DOCX_PACKET_AUTH_PROPERTY_NAME = 'YRTK_C01_AUTH';
const REVIEW_DOCX_PACKET_YRTK2_PROPERTY_NAME = 'YRTK2_TOKEN';
const REVIEW_DOCX_PACKET_CORE_DIGEST_PROPERTY_NAME = 'YRTK_CORE_DIGEST';
const FULL_MANUSCRIPT_FORMAT_IR_SCHEMA = 'yalken.rtk.format-ir.v1';
const FORMAT_IR_BOOLEAN_MARKS = new Set(['bold', 'italic', 'underline', 'strike']);
const FORMAT_IR_TEXT_STYLE_KEYS = new Set(['color', 'fontFamily', 'fontSize']);
const FORMAT_IR_TEXT_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

// EXPORT-01 (P0-20): unified bookmark-name generator. The single source of
// truth is src/io/revisionBridge/reviewTransportWordBookmarkV1.mjs
// (deriveWordBookmarkNameV1). This CJS module cannot synchronously import an
// ESM module, so when deps.deriveWordBookmarkNameV1 is supplied (main.js wires
// the real revisionBridge generator) it is used; otherwise this inline copy of
// the IDENTICAL formula runs. This is the same producer-inline + shared-builder
// pattern CANON-01 already uses for buildFullManuscriptHashTree. Contract
// EXPORT01-E2 asserts declared == emitted == resolved byte-for-byte, so any drift
// between this fallback and reviewTransportWordBookmarkV1.mjs is caught.
const RTK_WORD_BOOKMARK_V1_DOMAIN = 'word-bookmark-v1';
function canonicalWordBookmarkIdentityJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalWordBookmarkIdentityJson(item)).join(',')}]`;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalWordBookmarkIdentityJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function deriveWordBookmarkNameV1Fallback(input = {}) {
  const source = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const roundId = String(source.roundId ?? '');
  const sceneId = String(source.sceneId ?? '');
  const roundBlockOccurrenceId = String(source.roundBlockOccurrenceId ?? '');
  const identity = canonicalWordBookmarkIdentityJson({ roundBlockOccurrenceId, roundId, sceneId });
  const digest = crypto.createHash('sha256').update(`${RTK_WORD_BOOKMARK_V1_DOMAIN}${identity}`, 'utf8').digest('hex');
  return `YRTK_${digest.slice(0, 32)}`;
}

function isPlainObjectValue(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSceneText(value) {
  return typeof value === 'string'
    ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    : '';
}

function normalizeVisibleDocumentText(value) {
  return normalizeSceneText(value)
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+/u, '')
    .replace(/\n+$/u, '');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeFormatColor(value, code) {
  const color = normalizeString(value).toLowerCase();
  if (!/^#[a-f0-9]{6}$/u.test(color)) throw makeError(code, { value });
  return color;
}

function normalizeFormatFontSize(value) {
  const source = normalizeString(value).toLowerCase();
  const pointsMatch = /^(\d{1,4}(?:\.5)?)pt$/u.exec(source);
  if (pointsMatch) return `${Number(pointsMatch[1])}pt`;
  const pixelsMatch = /^(\d{1,4}(?:\.\d{1,4})?)px$/u.exec(source);
  if (!pixelsMatch) throw makeError('FULL_MANUSCRIPT_FORMAT_IR_FONT_SIZE_UNSUPPORTED', { value });
  const points = Number(pixelsMatch[1]) * 0.75;
  if (!Number.isFinite(points) || points < 1 || points > 1638) {
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_FONT_SIZE_UNSUPPORTED', { value });
  }
  return `${Math.round(points * 2) / 2}pt`;
}

function normalizeFormatIrInlineMarks(marks, sceneId, paragraphOrdinal) {
  const inline = {};
  const preservedMarks = [];
  for (const mark of Array.isArray(marks) ? marks : []) {
    if (!isPlainObjectValue(mark)) {
      throw makeError('FULL_MANUSCRIPT_FORMAT_IR_MARK_INVALID', { sceneId, paragraphOrdinal });
    }
    const type = normalizeString(mark.type);
    const attrs = isPlainObjectValue(mark.attrs) ? mark.attrs : {};
    if (FORMAT_IR_BOOLEAN_MARKS.has(type)) {
      if (Object.keys(attrs).some((key) => attrs[key] !== null && attrs[key] !== undefined)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_MARK_ATTR_UNSUPPORTED', { sceneId, paragraphOrdinal, type });
      }
      inline[type] = true;
      continue;
    }
    if (type === 'textStyle') {
      const unknownKeys = Object.keys(attrs).filter((key) => !FORMAT_IR_TEXT_STYLE_KEYS.has(key) && attrs[key] !== null && attrs[key] !== undefined);
      if (unknownKeys.length > 0) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_TEXT_STYLE_UNSUPPORTED', { sceneId, paragraphOrdinal, unknownKeys });
      }
      if (attrs.color !== null && attrs.color !== undefined && attrs.color !== '') {
        inline.color = normalizeFormatColor(attrs.color, 'FULL_MANUSCRIPT_FORMAT_IR_COLOR_UNSUPPORTED');
      }
      if (attrs.fontFamily !== null && attrs.fontFamily !== undefined && attrs.fontFamily !== '') {
        const fontFamily = normalizeString(attrs.fontFamily);
        if (!fontFamily || fontFamily.length > 128 || /[\u0000-\u001f\u007f]/u.test(fontFamily)) {
          throw makeError('FULL_MANUSCRIPT_FORMAT_IR_FONT_FAMILY_UNSUPPORTED', { sceneId, paragraphOrdinal });
        }
        inline.fontFamily = fontFamily;
      }
      if (attrs.fontSize !== null && attrs.fontSize !== undefined && attrs.fontSize !== '') {
        inline.fontSize = normalizeFormatFontSize(attrs.fontSize);
      }
      continue;
    }
    if (type === 'highlight') {
      const unknownKeys = Object.keys(attrs).filter((key) => key !== 'color' && attrs[key] !== null && attrs[key] !== undefined);
      if (unknownKeys.length > 0) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_HIGHLIGHT_UNSUPPORTED', { sceneId, paragraphOrdinal, unknownKeys });
      }
      inline.highlight = normalizeFormatColor(
        attrs.color || '#ffff00',
        'FULL_MANUSCRIPT_FORMAT_IR_HIGHLIGHT_UNSUPPORTED',
      );
      continue;
    }
    if (type === 'link') {
      const unknownKeys = Object.keys(attrs).filter((key) => (
        !['href', 'target', 'rel', 'class'].includes(key)
        && attrs[key] !== null
        && attrs[key] !== undefined
      ));
      const href = normalizeString(attrs.href);
      if (
        unknownKeys.length > 0
        || !href
        || href.length > 2048
        || /[\u0000-\u001f\u007f]/u.test(href)
        || /^(?:javascript|data|vbscript):/iu.test(href)
      ) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_LINK_UNSUPPORTED', {
          sceneId,
          paragraphOrdinal,
          unknownKeys,
        });
      }
      preservedMarks.push({
        type: 'link',
        attrs: {
          href,
          target: normalizeString(attrs.target),
          rel: normalizeString(attrs.rel),
        },
      });
      continue;
    }
    if (type === 'code') {
      preservedMarks.push({ type: 'code' });
      continue;
    }
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_MARK_UNSUPPORTED', { sceneId, paragraphOrdinal, type });
  }
  return { inline, preservedMarks };
}

function buildFormatIrParagraphs(scene) {
  const sourceDoc = isPlainObjectValue(scene.doc) ? cloneJson(scene.doc) : null;
  const topLevelNodes = sourceDoc
    ? (sourceDoc.type === 'doc' && Array.isArray(sourceDoc.content) ? sourceDoc.content : null)
    : scene.text.split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      }));
  if (!topLevelNodes) {
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_DOCUMENT_STRUCTURE_UNSUPPORTED', { sceneId: scene.sceneId });
  }
  const result = [];
  let nextListNumId = 1;
  const appendTextBlock = (node, context) => {
    const paragraphOrdinal = result.length;
    const attrs = isPlainObjectValue(node.attrs) ? node.attrs : {};
    const allowedAttrs = node.type === 'heading'
      ? new Set(['textAlign', 'level'])
      : node.type === 'codeBlock'
        ? new Set(['language'])
        : new Set(['textAlign']);
    const unknownAttrs = Object.keys(attrs).filter((key) => (
      !allowedAttrs.has(key) && attrs[key] !== null && attrs[key] !== undefined
    ));
    if (unknownAttrs.length > 0) {
      throw makeError('FULL_MANUSCRIPT_FORMAT_IR_PARAGRAPH_ATTR_UNSUPPORTED', {
        sceneId: scene.sceneId,
        paragraphOrdinal,
        unknownAttrs,
      });
    }
    const paragraphFormat = { nodeType: node.type };
    if (node.type === 'heading') {
      const headingLevel = Number(attrs.level);
      if (!Number.isSafeInteger(headingLevel) || headingLevel < 1 || headingLevel > 6) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_HEADING_LEVEL_UNSUPPORTED', {
          sceneId: scene.sceneId,
          paragraphOrdinal,
        });
      }
      paragraphFormat.headingLevel = headingLevel;
    }
    if (node.type === 'codeBlock') {
      const language = normalizeString(attrs.language);
      if (language.length > 64 || /[\u0000-\u001f\u007f]/u.test(language)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_CODE_LANGUAGE_UNSUPPORTED', {
          sceneId: scene.sceneId,
          paragraphOrdinal,
        });
      }
      paragraphFormat.codeLanguage = language;
    }
    if (context.blockquoteDepth > 0) paragraphFormat.blockquoteDepth = context.blockquoteDepth;
    const activeList = context.listStack.at(-1);
    if (activeList) {
      paragraphFormat.list = {
        kind: activeList.kind,
        level: context.listStack.length - 1,
        itemOrdinal: activeList.itemOrdinal,
        start: activeList.start,
        numId: activeList.numId,
      };
    }
    if (attrs.textAlign !== null && attrs.textAlign !== undefined && attrs.textAlign !== '') {
      const textAlign = normalizeString(attrs.textAlign).toLowerCase();
      if (!FORMAT_IR_TEXT_ALIGNMENTS.has(textAlign)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_TEXT_ALIGN_UNSUPPORTED', { sceneId: scene.sceneId, paragraphOrdinal });
      }
      paragraphFormat.textAlign = textAlign;
    }
    let cursor = 0;
    const runs = [];
    for (const inlineNode of Array.isArray(node.content) ? node.content : []) {
      if (!isPlainObjectValue(inlineNode) || !['text', 'hardBreak'].includes(inlineNode.type)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_INLINE_NODE_UNSUPPORTED', {
          sceneId: scene.sceneId,
          paragraphOrdinal,
          nodeType: normalizeString(inlineNode?.type),
        });
      }
      const text = inlineNode.type === 'hardBreak' ? '\n' : normalizeSceneText(inlineNode.text);
      if (inlineNode.type === 'text' && !text) continue;
      const normalizedMarks = inlineNode.type === 'text'
        ? normalizeFormatIrInlineMarks(inlineNode.marks, scene.sceneId, paragraphOrdinal)
        : { inline: {}, preservedMarks: [] };
      runs.push({
        from: cursor,
        to: cursor + text.length,
        text,
        inline: normalizedMarks.inline,
        preservedMarks: normalizedMarks.preservedMarks,
      });
      cursor += text.length;
    }
    const text = runs.map((run) => run.text).join('');
    result.push({
      text,
      formatIr: {
        schemaVersion: FULL_MANUSCRIPT_FORMAT_IR_SCHEMA,
        paragraph: paragraphFormat,
        runs,
      },
    });
  };
  const visit = (node, context = { blockquoteDepth: 0, listStack: [] }) => {
    if (!isPlainObjectValue(node)) {
      throw makeError('FULL_MANUSCRIPT_FORMAT_IR_DOCUMENT_STRUCTURE_UNSUPPORTED', { sceneId: scene.sceneId });
    }
    if (['paragraph', 'heading', 'codeBlock'].includes(node.type)) {
      appendTextBlock(node, context);
      return;
    }
    if (node.type === 'horizontalRule') {
      if ((Array.isArray(node.content) && node.content.length > 0) || Object.keys(node.attrs || {}).length > 0) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_HORIZONTAL_RULE_UNSUPPORTED', { sceneId: scene.sceneId });
      }
      result.push({
        text: '',
        formatIr: {
          schemaVersion: FULL_MANUSCRIPT_FORMAT_IR_SCHEMA,
          paragraph: { nodeType: 'horizontalRule' },
          runs: [],
        },
      });
      return;
    }
    if (node.type === 'blockquote') {
      if (Object.keys(node.attrs || {}).some((key) => node.attrs[key] !== null && node.attrs[key] !== undefined)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_BLOCKQUOTE_ATTR_UNSUPPORTED', { sceneId: scene.sceneId });
      }
      for (const child of Array.isArray(node.content) ? node.content : []) {
        visit(child, { ...context, blockquoteDepth: context.blockquoteDepth + 1 });
      }
      return;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const attrs = isPlainObjectValue(node.attrs) ? node.attrs : {};
      const unknownAttrs = Object.keys(attrs).filter((key) => key !== 'start' && attrs[key] !== null && attrs[key] !== undefined);
      const start = node.type === 'orderedList' ? Number(attrs.start ?? 1) : 1;
      if (unknownAttrs.length > 0 || !Number.isSafeInteger(start) || start < 1 || start > 32767) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_LIST_ATTR_UNSUPPORTED', { sceneId: scene.sceneId, unknownAttrs });
      }
      const items = Array.isArray(node.content) ? node.content : [];
      const numId = nextListNumId;
      nextListNumId += 1;
      for (const [itemOrdinal, item] of items.entries()) {
        if (!isPlainObjectValue(item) || item.type !== 'listItem') {
          throw makeError('FULL_MANUSCRIPT_FORMAT_IR_LIST_ITEM_UNSUPPORTED', { sceneId: scene.sceneId });
        }
        const listStack = [...context.listStack, {
          kind: node.type === 'orderedList' ? 'ordered' : 'bullet',
          start,
          itemOrdinal,
          numId,
        }];
        for (const child of Array.isArray(item.content) ? item.content : []) {
          visit(child, { ...context, listStack });
        }
      }
      return;
    }
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_DOCUMENT_STRUCTURE_UNSUPPORTED', {
      sceneId: scene.sceneId,
      nodeType: normalizeString(node.type),
    });
  };
  for (const node of topLevelNodes) visit(node);
  const derivedText = normalizeVisibleDocumentText(result.map((paragraph) => paragraph.text).join('\n'));
  if (derivedText !== scene.text) {
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_VISIBLE_TEXT_MISMATCH', { sceneId: scene.sceneId });
  }
  return result;
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

function sha256Json(value) {
  return sha256Text(JSON.stringify(value));
}

function hmacSha256Json(value, secret) {
  return `hmac-sha256:${crypto.createHmac('sha256', String(secret || '')).update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function createDefaultCryptoPort() {
  return {
    sha256Text,
    sha256Json,
    hmacSha256Json,
  };
}

function base64UrlEncode(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function buildAuthorityEnvelope(payload, hmacSecret, cryptoPort = createDefaultCryptoPort()) {
  const body = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload: JSON.parse(JSON.stringify(payload)),
    payloadDigest: cryptoPort.sha256Json(payload),
    signature: cryptoPort.hmacSha256Json(payload, hmacSecret),
    keyId: 'product-review-docx-local-secret-v1',
    secretEmbeddedInDocx: false,
  };
  return `YRTK1.${base64UrlEncode(JSON.stringify(body))}`;
}

function makeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  if (isPlainObjectValue(details) && Object.keys(details).length > 0) {
    error.details = details;
  }
  return error;
}

function normalizeFullManuscriptScenes(input = {}) {
  const projectId = normalizeString(input.projectId);
  const projectRoot = normalizeString(input.projectRoot);
  const manifestPath = normalizeString(input.manifestPath);
  const sourceScenes = Array.isArray(input.scenes) ? input.scenes : [];
  if (!projectId) {
    throw makeError('FULL_MANUSCRIPT_PROJECT_ID_REQUIRED');
  }
  if (sourceScenes.length < 1) {
    throw makeError('FULL_MANUSCRIPT_SCENE_REQUIRED', { sceneCount: sourceScenes.length });
  }

  const expectedOrderedSceneIds = Array.isArray(input.expectedOrderedSceneIds)
    ? input.expectedOrderedSceneIds.map(normalizeString).filter(Boolean)
    : [];
  const seen = new Set();
  const scenes = sourceScenes.map((scene, index) => {
    if (!isPlainObjectValue(scene)) {
      throw makeError('FULL_MANUSCRIPT_SCENE_RECORD_INVALID', { index });
    }
    const sceneId = normalizeString(scene.sceneId);
    if (!sceneId) {
      throw makeError('FULL_MANUSCRIPT_SCENE_ID_REQUIRED', { index });
    }
    if (seen.has(sceneId)) {
      throw makeError('FULL_MANUSCRIPT_SCENE_ID_DUPLICATE', { sceneId });
    }
    seen.add(sceneId);
    const text = normalizeSceneText(scene.text);
    const observableContent = typeof scene.observableContent === 'string' ? scene.observableContent : text;
    const rawSha256 = normalizeString(scene.rawSha256) || sha256Text(observableContent);
    if (rawSha256 !== sha256Text(observableContent)) {
      throw makeError('FULL_MANUSCRIPT_SCENE_BASELINE_HASH_STALE', { sceneId });
    }
    return {
      sceneId,
      sceneOrdinal: index,
      order: Number.isInteger(scene.order) ? scene.order : index,
      title: normalizeString(scene.title),
      label: normalizeString(scene.label),
      scenePath: normalizeString(scene.scenePath || scene.path),
      text,
      doc: isPlainObjectValue(scene.doc) ? cloneJson(scene.doc) : null,
      observableContent,
      rawSha256,
      sceneRevision: normalizeString(scene.sceneRevision) || rawSha256,
    };
  });

  for (let index = 0; index < scenes.length; index += 1) {
    if (scenes[index].order !== index) {
      throw makeError('FULL_MANUSCRIPT_SCENE_ORDER_NON_CANONICAL', {
        sceneId: scenes[index].sceneId,
        order: scenes[index].order,
        expectedOrder: index,
      });
    }
  }
  if (expectedOrderedSceneIds.length > 0) {
    const actual = scenes.map((scene) => scene.sceneId);
    if (expectedOrderedSceneIds.length !== actual.length || expectedOrderedSceneIds.some((sceneId, index) => sceneId !== actual[index])) {
      throw makeError('FULL_MANUSCRIPT_SCENE_ORDER_MISMATCH', {
        expectedOrderedSceneIds,
        actualOrderedSceneIds: actual,
      });
    }
  }
  return {
    projectId,
    projectRoot,
    manifestPath,
    scenes,
  };
}

function buildFullManuscriptBlocks(scenes, cryptoPort = createDefaultCryptoPort(), options = {}) {
  const roundId = typeof options.roundId === 'string' ? options.roundId : '';
  const deriveWordBookmarkNameV1 = typeof options.deriveWordBookmarkNameV1 === 'function'
    ? options.deriveWordBookmarkNameV1
    : deriveWordBookmarkNameV1Fallback;
  const blocks = [];
  for (const scene of scenes) {
    const paragraphs = buildFormatIrParagraphs(scene);
    for (let index = 0; index < paragraphs.length; index += 1) {
      const { text, formatIr } = paragraphs[index];
      const seed = `${scene.sceneId}\n${scene.sceneOrdinal}\n${index}\n${text}`;
      const seedHash = crypto.createHash('sha256').update(seed, 'utf8').digest('hex');
      const blockId = `scene-${String(scene.sceneOrdinal + 1).padStart(2, '0')}-block-${String(index + 1).padStart(4, '0')}-${seedHash.slice(0, 16)}`;
      const paragraphId = `yrtk-${String(scene.sceneOrdinal + 1).padStart(2, '0')}-p-${seedHash.slice(0, 16)}`;
      const paraId = seedHash.slice(0, 8);
      const textId = crypto.createHash('sha256').update(`${seed}:textId`, 'utf8').digest('hex').slice(0, 8);
      const documentParagraphIndex = blocks.length;
      blocks.push({
        blockId,
        paragraphId,
        paraId,
        textId,
        text,
        sceneId: scene.sceneId,
        sceneOrdinal: scene.sceneOrdinal,
        documentParagraphIndex,
        sceneTitle: scene.title,
        canonicalTextSha256: sha256Text(text),
        canonicalMarksSha256: cryptoPort.sha256Json(formatIr),
        formatIr,
        wordSignals: [
          {
            kind: 'w14ParaIdTextId',
            value: { paraId, textId },
            applyAuthority: false,
          },
          {
            kind: 'bookmarkName',
            value: { name: deriveWordBookmarkNameV1({ roundId, sceneId: scene.sceneId, roundBlockOccurrenceId: index }) },
            applyAuthority: false,
          },
        ],
        locatorSignals: [
          {
            signalId: `${blockId}:signed-full-manuscript-scene-block-baseline`,
            kind: 'signed-scene-block-baseline-v1',
            authority: 'required-apply-authority',
            value: {
              scope: 'full-manuscript',
              sceneId: scene.sceneId,
              sceneOrdinal: scene.sceneOrdinal,
              documentParagraphIndex,
              blockId,
              paragraphId,
            },
          },
          {
            signalId: `${blockId}:w14-paraid-textid`,
            kind: 'w14-paraId-textId-v1',
            authority: 'word-native-placement-signal-only',
            value: { paraId, textId },
          },
        ],
      });
    }
  }
  return blocks;
}

// CANON-01: the full-manuscript hash tree is built with the SAME domain-separated bottom-up
// recipe the CoreManifest validator recomputes (domainBlock/domainScene/domainRoot). When the
// revisionBridge dependency surface exposes the shared builder, delegate to it so producer and
// validator are guaranteed to converge on one canonical tree; otherwise fall back to an inline
// implementation of the identical recipe.
function buildFullManuscriptHashTree({ projectId, scenes, blocks }, cryptoPort = createDefaultCryptoPort(), revisionBridge = {}) {
  const normOrdinal = (value) => (Number.isSafeInteger(value) ? value : null);
  const exportMap = {
    scenes: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sceneOrdinal: normOrdinal(scene.sceneOrdinal),
      sceneRevision: scene.sceneRevision,
      rawSha256: scene.rawSha256,
      blocks: blocks
        .filter((block) => block.sceneId === scene.sceneId)
        .map((block) => ({
          blockId: block.blockId,
          paragraphId: block.paragraphId,
          documentParagraphIndex: normOrdinal(block.documentParagraphIndex),
          canonicalTextSha256: block.canonicalTextSha256,
          canonicalMarksSha256: block.canonicalMarksSha256,
          formatIr: cloneJson(block.formatIr ?? null),
        })),
    })),
  };
  if (revisionBridge && typeof revisionBridge.buildWordV4ManifestHashTree === 'function') {
    const shared = revisionBridge.buildWordV4ManifestHashTree(exportMap, projectId, cryptoPort);
    if (shared && shared.ok) {
      return {
        rootDigest: shared.rootDigest,
        sceneDigests: shared.sceneDigests,
        blockDigests: shared.blockDigests,
      };
    }
  }
  const blocksBySceneId = new Map();
  for (const block of blocks) {
    if (!blocksBySceneId.has(block.sceneId)) blocksBySceneId.set(block.sceneId, []);
    blocksBySceneId.get(block.sceneId).push(block);
  }
  const blockDigests = blocks.map((block) => ({
    sceneId: block.sceneId,
    sceneOrdinal: normOrdinal(block.sceneOrdinal),
    documentParagraphIndex: normOrdinal(block.documentParagraphIndex),
    blockId: block.blockId,
    digest: cryptoPort.sha256Json({
      domain: 'domainBlock',
      sceneId: block.sceneId,
      sceneOrdinal: normOrdinal(block.sceneOrdinal),
      documentParagraphIndex: normOrdinal(block.documentParagraphIndex),
      blockId: block.blockId,
      paragraphId: block.paragraphId,
      canonicalTextSha256: block.canonicalTextSha256,
      canonicalMarksSha256: block.canonicalMarksSha256,
      formatIr: cloneJson(block.formatIr ?? null),
    }),
  }));
  const sceneDigests = scenes.map((scene) => {
    const sceneBlocks = blocksBySceneId.get(scene.sceneId) || [];
    return {
      sceneId: scene.sceneId,
      sceneOrdinal: normOrdinal(scene.sceneOrdinal),
      digest: cryptoPort.sha256Json({
        domain: 'domainScene',
        projectId,
        sceneId: scene.sceneId,
        sceneOrdinal: normOrdinal(scene.sceneOrdinal),
        sceneRevision: scene.sceneRevision,
        rawSha256: scene.rawSha256,
        blockDigests: sceneBlocks.map((block) => ({
          blockId: block.blockId,
          digest: blockDigests.find((entry) => entry.blockId === block.blockId)?.digest || '',
        })),
      }),
    };
  });
  return {
    rootDigest: cryptoPort.sha256Json({ domain: 'domainRoot', sceneDigests: sceneDigests.map((entry) => ({ sceneId: entry.sceneId, digest: entry.digest })) }),
    sceneDigests,
    blockDigests,
  };
}

function buildFullManuscriptCapabilityManifest(input = {}) {
  return {
    schemaVersion: 'yalken.rtk.word.full-manuscript-docx-review.capability-manifest.v1',
    commandId: FULL_MANUSCRIPT_REVIEW_DOCX_COMMAND_ID,
    capabilityId: FULL_MANUSCRIPT_REVIEW_DOCX_CAPABILITY_ID,
    route: [
      'capability-manifest',
      'typed-command-port',
      'command-surface-kernel',
      'canonical-project-truth-projection',
      'docx-review-packet-adapter',
      'existing-design-os-export-surface',
    ],
    scope: 'full-manuscript',
    preserves: [
      'ordered-scene-boundaries',
      'stable-scene-ids',
      'baseline-scene-revisions',
      'scene-hash-tree',
      'export-id',
      'hmac-authority',
      'no-loss-custom-xml-metadata',
    ],
    prohibits: [
      'direct-storage-mutation',
      'direct-ui-mutation',
      'harness-local-positive-authority',
      'synthetic-tail-positive-authority',
    ],
    sceneCount: Number.isInteger(input.sceneCount) ? input.sceneCount : 0,
    orderedSceneIds: Array.isArray(input.orderedSceneIds) ? input.orderedSceneIds.filter((sceneId) => typeof sceneId === 'string') : [],
  };
}

function buildFallbackRevisionBridgeManifest({
  profileId,
  projectId,
  roundId,
  exportId,
  exportedAtUtc,
  sceneSnapshots,
  hmacSecret,
  cryptoPort,
}) {
  const payload = {
    schemaVersion: 'yalken.rtk.review-transport-manifest.v2',
    profileId,
    manifestId: `transport-manifest-${roundId.replace(/^round-/u, '')}`,
    projectId,
    roundId,
    exportId,
    exportedAtUtc,
    sceneSnapshots,
  };
  return {
    ok: true,
    manifest: {
      ...payload,
      payloadDigest: cryptoPort.sha256Json(payload),
      signature: cryptoPort.hmacSha256Json(payload, hmacSecret),
      secretEmbeddedInDocx: false,
    },
  };
}

function buildFallbackCoreManifest({
  profileId,
  projectId,
  roundId,
  exportArtifactId,
  semanticReturnId,
  createdAtUtc,
  compileIrDigest,
  actualBaselineDigest,
  parserProfileDigest,
  capabilityProfileDigest,
  artifactIdentities,
  exportMap,
  hashTree,
  cryptoPort,
}) {
  const manifest = {
    schemaVersion: 'yalken.rtk.word-v4.core-manifest.v1',
    profileId,
    projectId,
    roundId,
    exportArtifactId,
    semanticReturnId,
    createdAtUtc,
    compileIrDigest,
    actualBaselineDigest,
    parserProfileDigest,
    capabilityProfileDigest,
    artifactIdentities,
    exportMap,
    hashTree,
  };
  return {
    ok: true,
    manifest,
    coreManifestDigest: cryptoPort.sha256Json(manifest),
  };
}

function buildFallbackYrtk2Token({ keyIdHex, roundIdHex, coreManifestDigest, hmacSecret, cryptoPort }) {
  const payload = {
    schemaVersion: 'yalken.rtk.word-v4-round-locator-token.v1',
    keyIdHex,
    roundIdHex,
    coreManifestDigest,
    secretEmbeddedInDocx: false,
  };
  const token = `YRTK2.${base64UrlEncode(JSON.stringify({
    ...payload,
    signature: cryptoPort.hmacSha256Json(payload, hmacSecret),
  }))}`;
  return {
    ok: true,
    ...payload,
    token,
    tokenLength: token.length,
  };
}

function buildFullManuscriptDocxReviewPacketSource(input = {}, deps = {}) {
  const cryptoPort = deps.cryptoPort || createDefaultCryptoPort();
  const normalized = normalizeFullManuscriptScenes(input);
  const { projectId, projectRoot, manifestPath, scenes } = normalized;
  const orderedSceneIds = scenes.map((scene) => scene.sceneId);
  const createdAtUtc = typeof deps.createdAtUtc === 'string' ? deps.createdAtUtc : new Date().toISOString();
  const roundIdHex = typeof deps.roundIdHex === 'string' && /^[a-f0-9]{32}$/iu.test(deps.roundIdHex)
    ? deps.roundIdHex.toLowerCase()
    : crypto.randomBytes(16).toString('hex');
  const keyIdHex = typeof deps.keyIdHex === 'string' && /^[a-f0-9]{32}$/iu.test(deps.keyIdHex)
    ? deps.keyIdHex.toLowerCase()
    : crypto.randomBytes(16).toString('hex');
  const hmacSecret = typeof deps.hmacSecret === 'string' && deps.hmacSecret
    ? deps.hmacSecret
    : crypto.randomBytes(32).toString('hex');
  // ROUND-01 (V3): opaque keyRef + public correlation material. The raw
  // hmacSecret stays a local signing input; the durable capsule carries only
  // the keyRef so the secret never reaches disk / renderer / worker / DOCX.
  // main.js imports the secret into the main-process vault and OVERWRITES this
  // provisional keyRef with the real vault handle. When no keyRef is supplied
  // (e.g. test fixtures), a non-empty opaque local keyRef is generated so the
  // durable capsule always carries a resolvable keyRef correlation.
  const keyRef = typeof deps.keyRef === 'string' && deps.keyRef
    ? deps.keyRef
    : crypto.randomBytes(16).toString('hex');
  const roundId = `round-${roundIdHex}`;
  const exportId = `export-${roundIdHex}`;
  const exportArtifactId = `export-artifact-${roundIdHex}`;
  const semanticReturnId = `semantic-return-${roundIdHex}`;
  const blocks = buildFullManuscriptBlocks(scenes, cryptoPort, {
    roundId,
    deriveWordBookmarkNameV1: typeof deps.deriveWordBookmarkNameV1 === 'function'
      ? deps.deriveWordBookmarkNameV1
      : undefined,
  });
  const sceneSnapshots = scenes.map((scene) => ({
    sceneId: scene.sceneId,
    sceneOrdinal: scene.sceneOrdinal,
    sceneRevision: scene.sceneRevision,
    rawSha256: scene.rawSha256,
    blocks: blocks
      .filter((block) => block.sceneId === scene.sceneId)
      .map((block) => ({
        blockId: block.blockId,
        paragraphId: block.paragraphId,
        documentParagraphIndex: block.documentParagraphIndex,
        canonicalTextSha256: block.canonicalTextSha256,
        canonicalMarksSha256: block.canonicalMarksSha256,
        formatIr: block.formatIr,
        locatorSignals: block.locatorSignals,
      })),
  }));
  const exportMap = {
    exportMapId: `export-map-${roundIdHex}`,
    profileId: FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID,
    scope: 'full-manuscript',
    roundId,
    scenes: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sceneOrdinal: scene.sceneOrdinal,
      sceneRevision: scene.sceneRevision,
      rawSha256: scene.rawSha256,
      blocks: blocks
        .filter((block) => block.sceneId === scene.sceneId)
        .map((block) => ({
          blockId: block.blockId,
          paragraphId: block.paragraphId,
          documentParagraphIndex: block.documentParagraphIndex,
          canonicalTextSha256: block.canonicalTextSha256,
          canonicalMarksSha256: block.canonicalMarksSha256,
          formatIr: block.formatIr,
          wordSignals: block.wordSignals,
        })),
    })),
  };
  const revisionBridgeForHashTree = isPlainObjectValue(deps.revisionBridge) ? deps.revisionBridge : {};
  const hashTree = buildFullManuscriptHashTree({ projectId, scenes, blocks }, cryptoPort, revisionBridgeForHashTree);
  const fullBookRawSha256 = cryptoPort.sha256Json(scenes.map((scene) => ({
    sceneId: scene.sceneId,
    sceneOrdinal: scene.sceneOrdinal,
    rawSha256: scene.rawSha256,
  })));
  const capabilityManifest = buildFullManuscriptCapabilityManifest({
    sceneCount: scenes.length,
    orderedSceneIds,
  });
  const capabilityManifestDigest = cryptoPort.sha256Json(capabilityManifest);
  const provisionalBuffer = buildDocxReviewPacketBuffer({
    sceneText: scenes.map((scene) => scene.text).join('\n\n'),
    blocks,
    customProperties: [
      { name: REVIEW_DOCX_PACKET_AUTH_PROPERTY_NAME, value: 'YRTK1.provisional' },
      { name: REVIEW_DOCX_PACKET_YRTK2_PROPERTY_NAME, value: 'YRTK2.provisional' },
    ],
    advisoryManifest: {
      roundId,
      exportId,
      scope: 'full-manuscript',
      provisional: true,
    },
  });
  const provisionalDocxSha256 = `sha256:${crypto.createHash('sha256').update(provisionalBuffer).digest('hex')}`;
  const revisionBridge = isPlainObjectValue(deps.revisionBridge) ? deps.revisionBridge : {};
  const transportManifestResult = typeof revisionBridge.createReviewTransportManifestV2 === 'function'
    ? revisionBridge.createReviewTransportManifestV2({
        profileId: FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID,
        manifestId: `transport-manifest-${roundIdHex}`,
        projectId,
        roundId,
        exportId,
        exportedAtUtc: createdAtUtc,
        sceneSnapshots,
        hmacSecret,
        keyId: 'product-review-docx-local-secret-v1',
      }, { cryptoPort })
    : buildFallbackRevisionBridgeManifest({
        profileId: FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID,
        projectId,
        roundId,
        exportId,
        exportedAtUtc: createdAtUtc,
        sceneSnapshots,
        hmacSecret,
        cryptoPort,
      });
  if (!transportManifestResult || transportManifestResult.ok !== true) {
    throw makeError('FULL_MANUSCRIPT_TRANSPORT_MANIFEST_BLOCKED');
  }
  const coreManifestInput = {
    profileId: FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID,
    projectId,
    roundId,
    exportArtifactId,
    semanticReturnId,
    createdAtUtc,
    compileIrDigest: cryptoPort.sha256Json({ scope: 'full-manuscript', orderedSceneIds, blocks: blocks.map((block) => block.blockId) }),
    actualBaselineDigest: fullBookRawSha256,
    parserProfileDigest: cryptoPort.sha256Json({ parser: 'parseReviewTransportPackageV2', profile: FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID }),
    capabilityProfileDigest: capabilityManifestDigest,
    artifactIdentities: {
      provisionalDocxSha256,
      returnArtifactId: '',
      applyId: '',
      effectIds: [],
    },
    exportMap,
    hashTree,
  };
  const coreManifestResult = typeof revisionBridge.createWordV4CoreManifest === 'function'
    ? revisionBridge.createWordV4CoreManifest(coreManifestInput, { cryptoPort })
    : buildFallbackCoreManifest({ ...coreManifestInput, cryptoPort });
  if (!coreManifestResult || coreManifestResult.ok !== true) {
    throw makeError('FULL_MANUSCRIPT_CORE_MANIFEST_BLOCKED');
  }
  const yrtk2Result = typeof revisionBridge.createYrtk2RoundLocatorToken === 'function'
    ? revisionBridge.createYrtk2RoundLocatorToken({
        keyIdHex,
        roundIdHex,
        coreManifestDigest: coreManifestResult.coreManifestDigest,
        hmacSecret,
        secretEmbeddedInDocx: false,
      }, { cryptoPort })
    : buildFallbackYrtk2Token({
        keyIdHex,
        roundIdHex,
        coreManifestDigest: coreManifestResult.coreManifestDigest,
        hmacSecret,
        cryptoPort,
      });
  if (!yrtk2Result || yrtk2Result.ok !== true) {
    throw makeError('FULL_MANUSCRIPT_YRTK2_BLOCKED');
  }
  const authorityPayload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: 'YALKEN_WORD_FULL_BOOK_EDITORIAL_ROUNDTRIP_CERTIFICATION_V2',
    profileId: FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID,
    caseId: 'product-review-docx-export-c5v2-full-manuscript',
    scope: 'full-manuscript',
    projectId,
    sceneCount: scenes.length,
    orderedSceneIds,
    sceneRevisions: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sceneOrdinal: scene.sceneOrdinal,
      sceneRevision: scene.sceneRevision,
      rawSha256: scene.rawSha256,
    })),
    fullBookRawSha256,
    roundId,
    exportId,
    exportArtifactId,
    semanticReturnId,
    coreManifestDigest: coreManifestResult.coreManifestDigest,
    transportManifestDigest: transportManifestResult.manifest.payloadDigest,
    yrtk2TokenDigest: cryptoPort.sha256Text(yrtk2Result.token),
    capabilityManifestDigest,
    blockCount: blocks.length,
  };
  const authorityEncoded = buildAuthorityEnvelope(authorityPayload, hmacSecret, cryptoPort);
  const exportCapsule = {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.v1',
    projectId,
    scope: 'full-manuscript',
    fullManuscript: true,
    sceneCount: scenes.length,
    orderedSceneIds,
    sceneId: '',
    sceneRevision: '',
    rawSha256: '',
    fullBookRawSha256,
    roundId,
    exportId,
    exportArtifactId,
    semanticReturnId,
    coreManifestDigest: coreManifestResult.coreManifestDigest,
    transportManifestDigest: transportManifestResult.manifest.payloadDigest,
    yrtk2TokenLength: yrtk2Result.tokenLength,
    capabilityManifestDigest,
    blockCount: blocks.length,
    authorityCarrier: 'customDocumentProperty',
    authorityPropertyName: REVIEW_DOCX_PACKET_AUTH_PROPERTY_NAME,
    secretEmbeddedInDocx: false,
    automaticApplyCertified: false,
    productRuntimeWired: true,
    returnIntakeWired: true,
  };
  const scenePathBySceneId = {};
  const baselineFinalTextBySceneId = {};
  for (const scene of scenes) {
    scenePathBySceneId[scene.sceneId] = scene.scenePath;
    baselineFinalTextBySceneId[scene.sceneId] = scene.text;
  }
  const localAuthorityCapsule = {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.local-authority.v1',
    projectRoot,
    manifestPath,
    scope: 'full-manuscript',
    scenePathBySceneId,
    baselineFinalTextBySceneId,
    // ROUND-01 (V3): opaque keyRef + public correlation material alongside the
    // in-memory hmacSecret. The DURABLE record (buildDocxReviewReturnAuthorityStoreRecord)
    // redacts hmacSecret and keeps only keyRef; the in-memory capsule retains the
    // secret so the downstream return-router proof binding can still compute its
    // HMAC during a live session without a vault round-trip.
    hmacSecret,
    keyRef,
    keyIdHex: yrtk2Result.keyIdHex,
    roundIdHex: yrtk2Result.roundIdHex,
    lifecycleState: 'ALLOCATED',
    recordVersion: 1,
    expectedAuthority: {
      scope: 'full-manuscript',
      sceneCount: scenes.length,
      orderedSceneIds,
      fullBookRawSha256,
      roundId,
      exportId,
      capabilityManifestDigest,
    },
    roundId,
    exportIdentity: exportId,
    manifestDigest: transportManifestResult.manifest.payloadDigest,
    coreManifestDigest: coreManifestResult.coreManifestDigest,
    yrtk2: {
      schemaVersion: yrtk2Result.schemaVersion,
      tokenDigest: cryptoPort.sha256Text(yrtk2Result.token),
      tokenLength: yrtk2Result.tokenLength,
      keyIdHex: yrtk2Result.keyIdHex,
      roundIdHex: yrtk2Result.roundIdHex,
      coreManifestDigest: yrtk2Result.coreManifestDigest,
      secretEmbeddedInDocx: false,
    },
    exportMap,
  };
  return {
    sceneText: scenes.map((scene) => scene.text).join('\n\n'),
    blocks,
    forbiddenSecret: hmacSecret,
    customProperties: [
      { name: REVIEW_DOCX_PACKET_AUTH_PROPERTY_NAME, value: authorityEncoded },
      { name: REVIEW_DOCX_PACKET_YRTK2_PROPERTY_NAME, value: yrtk2Result.token },
      { name: REVIEW_DOCX_PACKET_CORE_DIGEST_PROPERTY_NAME, value: coreManifestResult.coreManifestDigest },
    ],
    advisoryManifest: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.advisory-manifest.v1',
      scope: 'full-manuscript',
      capabilityManifest,
      capabilityManifestDigest,
      coreManifest: coreManifestResult.manifest,
      transportManifest: transportManifestResult.manifest,
      yrtk2: {
        schemaVersion: yrtk2Result.schemaVersion,
        tokenLength: yrtk2Result.tokenLength,
        keyIdHex: yrtk2Result.keyIdHex,
        roundIdHex: yrtk2Result.roundIdHex,
        coreManifestDigest: yrtk2Result.coreManifestDigest,
        secretEmbeddedInDocx: false,
      },
      authorityCarrier: {
        carrier: 'customDocumentProperty',
        propertyName: REVIEW_DOCX_PACKET_AUTH_PROPERTY_NAME,
        legacyC01Compatibility: true,
      },
      nonClaims: {
        customXmlApplyAuthority: false,
        automaticApplyCertified: false,
        harnessLocalPositiveAuthority: false,
      },
    },
    provisionalSelfParseArtifact: {
      schemaVersion: 'yalken.rtk.word.v4.provisional-docx-self-parse-artifact.v1',
      provisionalDocxSha256,
      bytes: provisionalBuffer,
      expectedDocumentTextSha256: cryptoPort.sha256Json({
        sceneText: scenes.map((scene) => scene.text).join('\n\n'),
      }),
    },
    exportCapsule,
    localAuthorityCapsule,
  };
}

function validateFullManuscriptAuthorityReturn(returned = {}, localAuthority = {}) {
  const expected = isPlainObjectValue(localAuthority.expectedAuthority) ? localAuthority.expectedAuthority : {};
  const orderedSceneIds = Array.isArray(returned.orderedSceneIds) ? returned.orderedSceneIds.filter((sceneId) => typeof sceneId === 'string') : [];
  if (returned.scope !== 'full-manuscript') {
    return { ok: false, code: 'FULL_MANUSCRIPT_RETURN_SCOPE_REQUIRED' };
  }
  if (returned.roundId !== expected.roundId || returned.exportId !== expected.exportId) {
    return { ok: false, code: 'FULL_MANUSCRIPT_RETURN_EXPORT_ID_MISMATCH' };
  }
  if (returned.fullBookRawSha256 !== expected.fullBookRawSha256) {
    return { ok: false, code: 'FULL_MANUSCRIPT_RETURN_BASELINE_STALE_OR_TAMPERED' };
  }
  if (orderedSceneIds.length !== expected.orderedSceneIds?.length) {
    return { ok: false, code: 'FULL_MANUSCRIPT_RETURN_SCENE_COUNT_MISMATCH' };
  }
  for (let index = 0; index < orderedSceneIds.length; index += 1) {
    if (orderedSceneIds[index] !== expected.orderedSceneIds[index]) {
      return { ok: false, code: 'FULL_MANUSCRIPT_RETURN_SCENE_ORDER_MISMATCH' };
    }
  }
  return { ok: true };
}

module.exports = {
  FULL_MANUSCRIPT_REVIEW_DOCX_COMMAND_ID,
  FULL_MANUSCRIPT_REVIEW_DOCX_CAPABILITY_ID,
  FULL_MANUSCRIPT_REVIEW_DOCX_PROFILE_ID,
  FULL_MANUSCRIPT_FORMAT_IR_SCHEMA,
  REVIEW_DOCX_PACKET_AUTH_PROPERTY_NAME,
  REVIEW_DOCX_PACKET_YRTK2_PROPERTY_NAME,
  REVIEW_DOCX_PACKET_CORE_DIGEST_PROPERTY_NAME,
  buildFullManuscriptCapabilityManifest,
  buildFullManuscriptDocxReviewPacketSource,
  buildFullManuscriptBlocks,
  normalizeFullManuscriptScenes,
  validateFullManuscriptAuthorityReturn,
};
