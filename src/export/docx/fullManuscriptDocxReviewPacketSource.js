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
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_MARK_UNSUPPORTED', { sceneId, paragraphOrdinal, type });
  }
  return inline;
}

function buildFormatIrParagraphs(scene) {
  const sourceDoc = isPlainObjectValue(scene.doc) ? cloneJson(scene.doc) : null;
  const paragraphs = sourceDoc
    ? (sourceDoc.type === 'doc' && Array.isArray(sourceDoc.content) ? sourceDoc.content : null)
    : scene.text.split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      }));
  if (!paragraphs || paragraphs.some((node) => !isPlainObjectValue(node) || node.type !== 'paragraph')) {
    throw makeError('FULL_MANUSCRIPT_FORMAT_IR_DOCUMENT_STRUCTURE_UNSUPPORTED', { sceneId: scene.sceneId });
  }
  const result = [];
  for (const [paragraphOrdinal, paragraph] of paragraphs.entries()) {
    const attrs = isPlainObjectValue(paragraph.attrs) ? paragraph.attrs : {};
    const unknownAttrs = Object.keys(attrs).filter((key) => key !== 'textAlign' && attrs[key] !== null && attrs[key] !== undefined);
    if (unknownAttrs.length > 0) {
      throw makeError('FULL_MANUSCRIPT_FORMAT_IR_PARAGRAPH_ATTR_UNSUPPORTED', {
        sceneId: scene.sceneId,
        paragraphOrdinal,
        unknownAttrs,
      });
    }
    const paragraphFormat = {};
    if (attrs.textAlign !== null && attrs.textAlign !== undefined && attrs.textAlign !== '') {
      const textAlign = normalizeString(attrs.textAlign).toLowerCase();
      if (!FORMAT_IR_TEXT_ALIGNMENTS.has(textAlign)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_TEXT_ALIGN_UNSUPPORTED', { sceneId: scene.sceneId, paragraphOrdinal });
      }
      paragraphFormat.textAlign = textAlign;
    }
    let cursor = 0;
    const runs = [];
    for (const node of Array.isArray(paragraph.content) ? paragraph.content : []) {
      if (!isPlainObjectValue(node) || !['text', 'hardBreak'].includes(node.type)) {
        throw makeError('FULL_MANUSCRIPT_FORMAT_IR_INLINE_NODE_UNSUPPORTED', {
          sceneId: scene.sceneId,
          paragraphOrdinal,
          nodeType: normalizeString(node?.type),
        });
      }
      const text = node.type === 'hardBreak' ? '\n' : normalizeSceneText(node.text);
      if (node.type === 'text' && !text) continue;
      const inline = node.type === 'text'
        ? normalizeFormatIrInlineMarks(node.marks, scene.sceneId, paragraphOrdinal)
        : {};
      runs.push({ from: cursor, to: cursor + text.length, text, inline });
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
  }
  const derivedText = result.map((paragraph) => paragraph.text).join('\n');
  if (normalizeSceneText(derivedText) !== scene.text) {
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
  if (sourceScenes.length < 2) {
    throw makeError('FULL_MANUSCRIPT_MULTI_SCENE_PROJECT_REQUIRED', { sceneCount: sourceScenes.length });
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

function buildFullManuscriptBlocks(scenes, cryptoPort = createDefaultCryptoPort()) {
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
      blocks.push({
        blockId,
        paragraphId,
        paraId,
        textId,
        text,
        sceneId: scene.sceneId,
        sceneOrdinal: scene.sceneOrdinal,
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
            value: { name: `YRTK_${String(scene.sceneOrdinal + 1).padStart(2, '0')}_${String(index + 1).padStart(4, '0')}_${seedHash.slice(0, 8)}` },
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

function buildFullManuscriptHashTree({ projectId, scenes, blocks }, cryptoPort = createDefaultCryptoPort()) {
  const blocksBySceneId = new Map();
  for (const block of blocks) {
    if (!blocksBySceneId.has(block.sceneId)) blocksBySceneId.set(block.sceneId, []);
    blocksBySceneId.get(block.sceneId).push(block);
  }
  const blockDigests = blocks.map((block) => ({
    sceneId: block.sceneId,
    sceneOrdinal: block.sceneOrdinal,
    blockId: block.blockId,
    digest: cryptoPort.sha256Json({
      sceneId: block.sceneId,
      sceneOrdinal: block.sceneOrdinal,
      blockId: block.blockId,
      paragraphId: block.paragraphId,
      canonicalTextSha256: block.canonicalTextSha256,
      canonicalMarksSha256: block.canonicalMarksSha256,
    }),
  }));
  const sceneDigests = scenes.map((scene) => {
    const sceneBlocks = blocksBySceneId.get(scene.sceneId) || [];
    return {
      sceneId: scene.sceneId,
      sceneOrdinal: scene.sceneOrdinal,
      digest: cryptoPort.sha256Json({
        projectId,
        sceneId: scene.sceneId,
        sceneOrdinal: scene.sceneOrdinal,
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
    rootDigest: cryptoPort.sha256Json({ sceneDigests }),
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
  const roundId = `round-${roundIdHex}`;
  const exportId = `export-${roundIdHex}`;
  const exportArtifactId = `export-artifact-${roundIdHex}`;
  const semanticReturnId = `semantic-return-${roundIdHex}`;
  const blocks = buildFullManuscriptBlocks(scenes, cryptoPort);
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
          canonicalTextSha256: block.canonicalTextSha256,
          canonicalMarksSha256: block.canonicalMarksSha256,
          formatIr: block.formatIr,
          wordSignals: block.wordSignals,
        })),
    })),
  };
  const hashTree = buildFullManuscriptHashTree({ projectId, scenes, blocks }, cryptoPort);
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
    hmacSecret,
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
