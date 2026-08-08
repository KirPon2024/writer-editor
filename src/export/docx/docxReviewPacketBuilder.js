'use strict';

const { buildStoredZip, escapeXml } = require('./docxMinBuilder');

const WORD_MAIN_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const OFFICE_DOCUMENT_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CUSTOM_PROPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
const CUSTOM_PROPS_VT_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
const CUSTOM_XML_PROPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/customXml';
const WORD_SETTINGS_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml';
const WORD_SETTINGS_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings';
const WORD_NUMBERING_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml';
const WORD_NUMBERING_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering';
const WORD_STYLES_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml';
const WORD_STYLES_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles';
const WORD_COMPATIBILITY_URI = 'http://schemas.microsoft.com/office/word';
const FORMAT_IR_SCHEMA = 'yalken.rtk.format-ir.v1';
const RTK_WORD_BOOKMARK_V1_DOMAIN = 'word-bookmark-v1';

// EXPORT-01 (P0-20): the builder is FORBIDDEN from inventing a bookmark name.
// The single source of truth is deriveWordBookmarkNameV1 in
// src/io/revisionBridge/reviewTransportWordBookmarkV1.mjs; the declared name
// arrives in block.wordSignals[].bookmarkName.value.name (produced by the
// packet source / main.js) and is emitted BYTE-FOR-BYTE into w:bookmarkStart.
// When no declared bookmarkName signal is present the builder fails with a
// typed error rather than synthesizing one (synthesis was the P0-20 defect:
// the resolver could then fabricate authority for an undeclared bookmark).
function canonicalWordBookmarkIdentityJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalWordBookmarkIdentityJson(item)).join(',')}]`;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalWordBookmarkIdentityJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// EXPORT-01 (P0-20): re-export the unified generator so there is one importable
// entry point for CJS consumers (the canonical ESM module remains the single
// implementation; this is the byte-identical producer-inline copy, verified by
// contract EXPORT01-E2/E7). ESM consumers should import directly from
// reviewTransportWordBookmarkV1.mjs.
function deriveWordBookmarkNameV1(input = {}) {
  const crypto = require('crypto');
  const source = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const roundId = String(source.roundId ?? '');
  const sceneId = String(source.sceneId ?? '');
  const roundBlockOccurrenceId = String(source.roundBlockOccurrenceId ?? '');
  const identity = canonicalWordBookmarkIdentityJson({ roundBlockOccurrenceId, roundId, sceneId });
  const digest = crypto.createHash('sha256').update(`${RTK_WORD_BOOKMARK_V1_DOMAIN}${identity}`, 'utf8').digest('hex');
  return `YRTK_${digest.slice(0, 32)}`;
}

function readDeclaredBookmarkName(block) {
  const signals = Array.isArray(block?.wordSignals) ? block.wordSignals : [];
  for (const signal of signals) {
    if (signal && typeof signal === 'object' && signal.kind === 'bookmarkName') {
      const name = normalizeString(signal.value?.name);
      if (name) return name;
    }
  }
  return '';
}
const WORD_HIGHLIGHT_NAME_BY_COLOR = Object.freeze({
  '#000000': 'black',
  '#0000ff': 'blue',
  '#00ffff': 'cyan',
  '#00008b': 'darkBlue',
  '#008b8b': 'darkCyan',
  '#a9a9a9': 'darkGray',
  '#006400': 'darkGreen',
  '#8b008b': 'darkMagenta',
  '#8b0000': 'darkRed',
  '#808000': 'darkYellow',
  '#008000': 'green',
  '#d3d3d3': 'lightGray',
  '#ff00ff': 'magenta',
  '#ff0000': 'red',
  '#ffffff': 'white',
  '#ffff00': 'yellow',
});

function isPlainObjectValue(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeDocxXmlText(value) {
  return normalizeString(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function normalizeReviewPacketBlocks(input = {}) {
  const sourceBlocks = Array.isArray(input.blocks) ? input.blocks : [];
  const fallbackText = normalizeDocxXmlText(input.sceneText);
  const fallbackBlocks = fallbackText.split('\n').map((text, index) => ({
    blockId: `block-${String(index + 1).padStart(4, '0')}`,
    paragraphId: `p-${String(index + 1).padStart(4, '0')}`,
    text,
  }));
  return (sourceBlocks.length > 0 ? sourceBlocks : fallbackBlocks)
    .filter(isPlainObjectValue)
    .map((block, index) => ({
      blockId: normalizeString(block.blockId) || `block-${String(index + 1).padStart(4, '0')}`,
      paragraphId: normalizeString(block.paragraphId) || `p-${String(index + 1).padStart(4, '0')}`,
      sceneId: normalizeString(block.sceneId),
      sceneOrdinal: Number.isInteger(block.sceneOrdinal) && block.sceneOrdinal >= 0 ? block.sceneOrdinal : null,
      sceneTitle: normalizeString(block.sceneTitle),
      sceneBoundary: block.sceneBoundary === true,
      paraId: normalizeString(block.paraId).replace(/[^a-fA-F0-9]/g, '').slice(0, 8).padStart(8, '0'),
      textId: normalizeString(block.textId).replace(/[^a-fA-F0-9]/g, '').slice(0, 8).padStart(8, '0'),
      text: normalizeDocxXmlText(block.text),
      formatIr: isPlainObjectValue(block.formatIr) && block.formatIr.schemaVersion === FORMAT_IR_SCHEMA
        ? JSON.parse(JSON.stringify(block.formatIr))
        : null,
      // EXPORT-01 (P0-20): carry the declared bookmark-name wordSignal through
      // normalization so buildParagraphXml can emit it BYTE-FOR-BYTE. The
      // builder never invents a name.
      wordSignals: Array.isArray(block.wordSignals) ? block.wordSignals.filter(isPlainObjectValue) : [],
    }));
}

// EXPORT-01 (P0-20): the builder is forbidden from synthesizing a bookmark name
// for the full-manuscript / single-scene product path — those blocks ALWAYS
// carry a declared bookmarkName signal (produced by deriveWordBookmarkNameV1),
// which buildParagraphXml emits BYTE-FOR-BYTE. A legacy minimal-packet caller
// (P0 review exporter fixture) may pass blocks without wordSignals; for that
// narrow legacy path the builder falls back to a deterministic blockId-derived
// name rather than crashing. This fallback does NOT grant resolver authority:
// the revisionBridge resolver (EXPORT-01) admits ONLY declared bookmarkName
// signals, so a fallback-emitted bookmark can never fabricate return-intake
// authority. The product full-manuscript path never hits this fallback because
// fullManuscriptDocxReviewPacketSource and main.js both emit declared signals.
function resolveBookmarkName(block, index) {
  const declaredName = readDeclaredBookmarkName(block);
  if (declaredName) return declaredName;
  const raw = normalizeString(block?.blockId).replace(/[^A-Za-z0-9_]/g, '');
  const safe = raw || `block${index + 1}`;
  return `YRTK_${String(index + 1).padStart(4, '0')}_${safe}`.slice(0, 40);
}

function buildRunPropertiesXml(inline = {}, preservedMarks = []) {
  const properties = [];
  if (preservedMarks.some((mark) => mark?.type === 'code')) {
    properties.push('<w:rStyle w:val="YalkenInlineCode"/>');
  }
  if (inline.bold === true) properties.push('<w:b/>');
  if (inline.italic === true) properties.push('<w:i/>');
  if (inline.underline === true) properties.push('<w:u w:val="single"/>');
  if (inline.strike === true) properties.push('<w:strike/>');
  if (typeof inline.color === 'string' && /^#[a-f0-9]{6}$/iu.test(inline.color)) {
    properties.push(`<w:color w:val="${inline.color.slice(1).toUpperCase()}"/>`);
  }
  if (typeof inline.highlight === 'string') {
    const highlightName = WORD_HIGHLIGHT_NAME_BY_COLOR[inline.highlight.toLowerCase()];
    if (highlightName) properties.push(`<w:highlight w:val="${highlightName}"/>`);
    else if (/^#[a-f0-9]{6}$/iu.test(inline.highlight)) {
      properties.push(`<w:shd w:val="clear" w:color="auto" w:fill="${inline.highlight.slice(1).toUpperCase()}"/>`);
    } else {
      throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_HIGHLIGHT_UNSUPPORTED');
    }
  }
  if (typeof inline.fontFamily === 'string' && inline.fontFamily) {
    const family = escapeXml(inline.fontFamily);
    properties.push(`<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>`);
  }
  if (typeof inline.fontSize === 'string' && /^(\d{1,4}(?:\.5)?)pt$/u.test(inline.fontSize)) {
    const halfPoints = String(Math.round(Number.parseFloat(inline.fontSize) * 2));
    properties.push(`<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`);
  }
  return properties.length > 0 ? `<w:rPr>${properties.join('')}</w:rPr>` : '';
}

function buildRunContentXml(text) {
  const pieces = normalizeDocxXmlText(text).split('\n');
  return pieces.map((piece, index) => {
    const content = piece ? `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>` : '';
    return index < pieces.length - 1 ? `${content}<w:br/>` : content;
  }).join('');
}

function buildFormatIrRunsXml(block, hyperlinkByHref) {
  const runs = Array.isArray(block.formatIr?.runs) ? block.formatIr.runs : [];
  if (runs.length === 0) {
    return block.text ? `<w:r><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r>` : '';
  }
  const text = runs.map((run) => normalizeString(run?.text)).join('');
  if (text !== block.text) throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_TEXT_MISMATCH');
  return runs.map((run) => {
    const content = buildRunContentXml(run.text);
    if (!content) return '';
    const preservedMarks = Array.isArray(run.preservedMarks) ? run.preservedMarks : [];
    const unsupported = preservedMarks.filter((mark) => !['link', 'code'].includes(mark?.type));
    if (unsupported.length > 0) throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_PRESERVED_MARK_UNSUPPORTED');
    const runXml = `<w:r>${buildRunPropertiesXml(run.inline, preservedMarks)}${content}</w:r>`;
    const link = preservedMarks.find((mark) => mark?.type === 'link');
    if (!link) return runXml;
    const href = normalizeString(link.attrs?.href);
    const relationshipId = hyperlinkByHref.get(href);
    if (!relationshipId) throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_LINK_RELATIONSHIP_MISSING');
    return `<w:hyperlink r:id="${escapeXml(relationshipId)}">${runXml}</w:hyperlink>`;
  }).join('');
}

function buildParagraphXml(block, index, hyperlinkByHref) {
  const bookmarkId = String(index + 1);
  const bookmarkName = resolveBookmarkName(block, index);
  const textRun = buildFormatIrRunsXml(block, hyperlinkByHref);
  const textAlign = normalizeString(block.formatIr?.paragraph?.textAlign);
  const headingLevel = Number(block.formatIr?.paragraph?.headingLevel);
  const paragraphPropertyParts = [];
  if (textAlign && ['left', 'center', 'right', 'justify'].includes(textAlign)) {
    paragraphPropertyParts.push(`<w:jc w:val="${textAlign}"/>`);
  }
  if (block.formatIr?.paragraph?.nodeType === 'heading') {
    if (!Number.isSafeInteger(headingLevel) || headingLevel < 1 || headingLevel > 6) {
      throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_HEADING_LEVEL_UNSUPPORTED');
    }
    paragraphPropertyParts.push(`<w:outlineLvl w:val="${headingLevel - 1}"/>`);
  }
  const blockquoteDepth = Number(block.formatIr?.paragraph?.blockquoteDepth || 0);
  if (Number.isSafeInteger(blockquoteDepth) && blockquoteDepth > 0 && blockquoteDepth <= 8) {
    paragraphPropertyParts.push(`<w:ind w:left="${blockquoteDepth * 720}"/>`);
  }
  const list = block.formatIr?.paragraph?.list;
  if (isPlainObjectValue(list)) {
    const level = Number(list.level);
    const numId = Number(list.numId);
    if (!['bullet', 'ordered'].includes(list.kind)
      || !Number.isSafeInteger(level) || level < 0 || level > 8
      || !Number.isSafeInteger(numId) || numId < 1) {
      throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_LIST_UNSUPPORTED');
    }
    paragraphPropertyParts.push(`<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`);
  }
  if (block.formatIr?.paragraph?.nodeType === 'codeBlock') {
    paragraphPropertyParts.push('<w:pStyle w:val="YalkenCodeBlock"/>');
  }
  if (block.formatIr?.paragraph?.nodeType === 'horizontalRule') {
    paragraphPropertyParts.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>');
  }
  const paragraphProperties = paragraphPropertyParts.length > 0
    ? `<w:pPr>${paragraphPropertyParts.join('')}</w:pPr>`
    : '';
  return [
    `<w:p w14:paraId="${escapeXml(block.paraId)}" w14:textId="${escapeXml(block.textId)}">`,
    paragraphProperties,
    `<w:bookmarkStart w:id="${bookmarkId}" w:name="${escapeXml(bookmarkName)}"/>`,
    textRun,
    `<w:bookmarkEnd w:id="${bookmarkId}"/>`,
    '</w:p>',
  ].join('');
}

function buildDocumentXml(blocks, hyperlinkByHref) {
  const paragraphs = blocks.map((block, index) => buildParagraphXml(block, index, hyperlinkByHref)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_MAIN_NS}" xmlns:w14="${W14_NS}" xmlns:r="${OFFICE_DOCUMENT_REL_NS}">
  <w:body>
    ${paragraphs || '<w:p/>'}
    <w:sectPr/>
  </w:body>
</w:document>`;
}

function normalizeCustomProperties(properties = []) {
  return (Array.isArray(properties) ? properties : [])
    .filter(isPlainObjectValue)
    .map((property) => ({
      name: normalizeString(property.name).trim(),
      value: normalizeString(property.value),
    }))
    .filter((property) => property.name && property.value);
}

function buildCustomPropertiesXml(properties) {
  const body = normalizeCustomProperties(properties)
    .map((property, index) => (
      `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${escapeXml(property.name)}"><vt:lpwstr>${escapeXml(property.value)}</vt:lpwstr></property>`
    ))
    .join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="${CUSTOM_PROPS_NS}" xmlns:vt="${CUSTOM_PROPS_VT_NS}">
    ${body}
</Properties>`;
}

function buildCustomXmlPayloadXml(input = {}) {
  const payload = isPlainObjectValue(input.advisoryManifest) ? input.advisoryManifest : {};
  const json = JSON.stringify(payload);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<yrtk:reviewTransport xmlns:yrtk="urn:yalken:rtk:word-review-packet:v1" authorityRole="advisory-not-apply-authority">
  <yrtk:payload encoding="json">${escapeXml(json)}</yrtk:payload>
</yrtk:reviewTransport>`;
}

function buildCustomXmlItemPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ds:datastoreItem ds:itemID="{8D56F7D3-7A64-4B6C-8C4E-000000000001}" xmlns:ds="${CUSTOM_XML_PROPS_NS}">
  <ds:schemaRefs/>
</ds:datastoreItem>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="${WORD_SETTINGS_CONTENT_TYPE}"/>
  <Override PartName="/word/numbering.xml" ContentType="${WORD_NUMBERING_CONTENT_TYPE}"/>
  <Override PartName="/word/styles.xml" ContentType="${WORD_STYLES_CONTENT_TYPE}"/>
  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${WORD_REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rIdYrtkCustomProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>
  <Relationship Id="rIdYrtkCustomXml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="customXml/item1.xml"/>
</Relationships>`;
}

function buildDocumentRelsXml(hyperlinks = []) {
  // PARSER-01 (P9) hyperlink emission form: the exact-text product profile keeps
  // emitting TargetMode="External" hyperlink relationships so a physical Word
  // reopen shows a clickable link, AND the bounded parser
  // (reviewTransportPackageParserV2.mjs) admits a bounded http(s) hyperlink rel
  // as INERT preserved evidence inside the declared profile — it is never
  // authority, never a locator, never a click target. Non-http(s) and
  // active/attached-template External rels remain RTK_HOSTILE_PACKAGE_BLOCKED.
  // This resolves the former builder↔parser self-conflict where the product's
  // own exported packet was rejected as hostile.
  const hyperlinkRelationships = hyperlinks.map((entry) => (
    `  <Relationship Id="${escapeXml(entry.relationshipId)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(entry.href)}" TargetMode="External"/>`
  )).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${WORD_REL_NS}">
  <Relationship Id="rIdYrtkSettings" Type="${WORD_SETTINGS_REL_TYPE}" Target="settings.xml"/>
  <Relationship Id="rIdYrtkNumbering" Type="${WORD_NUMBERING_REL_TYPE}" Target="numbering.xml"/>
  <Relationship Id="rIdYrtkStyles" Type="${WORD_STYLES_REL_TYPE}" Target="styles.xml"/>
${hyperlinkRelationships}
</Relationships>`;
}

function collectNumberingDefinitions(blocks) {
  const byNumId = new Map();
  for (const block of blocks) {
    const list = block.formatIr?.paragraph?.list;
    if (!isPlainObjectValue(list)) continue;
    const numId = Number(list.numId);
    const start = Number(list.start);
    const definition = {
      numId,
      kind: normalizeString(list.kind),
      start: Number.isSafeInteger(start) ? start : 1,
    };
    const existing = byNumId.get(numId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
      throw new Error('DOCX_REVIEW_PACKET_FORMAT_IR_LIST_ID_CONFLICT');
    }
    byNumId.set(numId, definition);
  }
  return [...byNumId.values()].sort((left, right) => left.numId - right.numId);
}

function buildNumberingXml(definitions) {
  const abstract = definitions.map((definition) => {
    const levels = Array.from({ length: 9 }, (_, level) => {
      const ordered = definition.kind === 'ordered';
      const levelText = ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3];
      return `<w:lvl w:ilvl="${level}"><w:start w:val="${definition.start}"/><w:numFmt w:val="${ordered ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${escapeXml(levelText)}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + level * 360}"/></w:tabs><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`;
    }).join('');
    return `<w:abstractNum w:abstractNumId="${definition.numId}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
  }).join('');
  const instances = definitions.map((definition) => (
    `<w:num w:numId="${definition.numId}"><w:abstractNumId w:val="${definition.numId}"/></w:num>`
  )).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${WORD_MAIN_NS}">${abstract}${instances}</w:numbering>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORD_MAIN_NS}">
  <w:style w:type="paragraph" w:styleId="YalkenCodeBlock"><w:name w:val="Yalken Code Block"/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="80"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:pPr><w:rPr><w:rFonts w:ascii="Menlo" w:hAnsi="Menlo"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="character" w:styleId="YalkenInlineCode"><w:name w:val="Yalken Inline Code"/><w:rPr><w:rFonts w:ascii="Menlo" w:hAnsi="Menlo"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:rPr></w:style>
</w:styles>`;
}

function collectDocumentHyperlinks(blocks) {
  const hrefs = [];
  for (const block of blocks) {
    for (const run of Array.isArray(block.formatIr?.runs) ? block.formatIr.runs : []) {
      for (const mark of Array.isArray(run?.preservedMarks) ? run.preservedMarks : []) {
        if (mark?.type !== 'link') continue;
        const href = normalizeString(mark.attrs?.href);
        if (href && !hrefs.includes(href)) hrefs.push(href);
      }
    }
  }
  return hrefs.map((href, index) => ({ href, relationshipId: `rIdYrtkLink${index + 1}` }));
}

function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${WORD_MAIN_NS}">
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="${WORD_COMPATIBILITY_URI}" w:val="15"/>
  </w:compat>
</w:settings>`;
}

function storedZipEntryList(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (method !== 0 || dataEnd > buffer.length) return [];
    entries.push({
      name: buffer.slice(nameStart, nameStart + fileNameLength).toString('utf8'),
      text: buffer.slice(dataStart, dataEnd).toString('utf8'),
    });
    offset = dataEnd;
  }
  return entries;
}

function validateDocxReviewPacketModernMode15(buffer) {
  const entries = storedZipEntryList(buffer);
  const byName = (name) => entries.filter((entry) => entry.name === name);
  const settings = byName('word/settings.xml');
  const contentTypes = byName('[Content_Types].xml');
  const documentRels = byName('word/_rels/document.xml.rels');
  const failures = [];
  if (settings.length !== 1) failures.push('DOCX_REVIEW_PACKET_SETTINGS_PART_COUNT_INVALID');
  if (contentTypes.length !== 1) failures.push('DOCX_REVIEW_PACKET_CONTENT_TYPES_PART_COUNT_INVALID');
  if (documentRels.length !== 1) failures.push('DOCX_REVIEW_PACKET_DOCUMENT_RELS_PART_COUNT_INVALID');
  const settingsXml = settings[0]?.text || '';
  const modeEntries = settingsXml.match(/<w:compatSetting\b[^>]*\bw:name="compatibilityMode"[^>]*\/>/gu) || [];
  if (!/^<\?xml[\s\S]*<w:settings\b[\s\S]*<w:compat>[\s\S]*<\/w:compat>[\s\S]*<\/w:settings>\s*$/u.test(settingsXml)) {
    failures.push('DOCX_REVIEW_PACKET_SETTINGS_XML_MALFORMED');
  }
  if (modeEntries.length !== 1) failures.push('DOCX_REVIEW_PACKET_COMPATIBILITY_MODE_COUNT_INVALID');
  if (modeEntries.length === 1 && !/\bw:val="15"/u.test(modeEntries[0])) {
    failures.push('DOCX_REVIEW_PACKET_COMPATIBILITY_MODE_NOT_15');
  }
  if (modeEntries.length === 1 && !new RegExp(`\\bw:uri="${WORD_COMPATIBILITY_URI}"`, 'u').test(modeEntries[0])) {
    failures.push('DOCX_REVIEW_PACKET_COMPATIBILITY_MODE_URI_INVALID');
  }
  const overrideMatches = (contentTypes[0]?.text || '').match(/<Override\b[^>]*PartName="\/word\/settings\.xml"[^>]*>/gu) || [];
  if (overrideMatches.length !== 1 || !overrideMatches[0].includes(`ContentType="${WORD_SETTINGS_CONTENT_TYPE}"`)) {
    failures.push('DOCX_REVIEW_PACKET_SETTINGS_CONTENT_TYPE_INVALID');
  }
  const relationshipMatches = (documentRels[0]?.text || '').match(/<Relationship\b[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/settings"[^>]*>/gu) || [];
  if (relationshipMatches.length !== 1 || !/\bTarget="settings\.xml"/u.test(relationshipMatches[0])) {
    failures.push('DOCX_REVIEW_PACKET_SETTINGS_RELATIONSHIP_INVALID');
  }
  return {
    ok: failures.length === 0,
    code: failures[0] || 'DOCX_REVIEW_PACKET_MODERN_MODE_15_VALID',
    failures,
    compatibilityMode: modeEntries.length === 1
      ? Number.parseInt(modeEntries[0].match(/\bw:val="(\d+)"/u)?.[1] || '', 10)
      : null,
  };
}

function buildCustomXmlRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${WORD_REL_NS}">
  <Relationship Id="rIdYrtkCustomXmlProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/>
</Relationships>`;
}

function assertNoEmbeddedSecret(buffer, forbiddenSecret) {
  const secret = normalizeString(forbiddenSecret);
  if (secret && buffer.includes(Buffer.from(secret, 'utf8'))) {
    throw new Error('DOCX_REVIEW_PACKET_SECRET_EMBEDDED');
  }
}

function buildDocxReviewPacketBuffer(input = {}) {
  const blocks = normalizeReviewPacketBlocks(input);
  const numberingDefinitions = collectNumberingDefinitions(blocks);
  const hyperlinks = collectDocumentHyperlinks(blocks);
  const hyperlinkByHref = new Map(hyperlinks.map((entry) => [entry.href, entry.relationshipId]));
  const customProperties = normalizeCustomProperties(input.customProperties);
  if (customProperties.length === 0) {
    throw new Error('DOCX_REVIEW_PACKET_CUSTOM_PROPERTY_REQUIRED');
  }
  if (!customProperties.some((property) => property.name === 'YRTK_C01_AUTH')) {
    throw new Error('DOCX_REVIEW_PACKET_AUTHORITY_PROPERTY_REQUIRED');
  }
  if (!customProperties.some((property) => property.name === 'YRTK2_TOKEN')) {
    throw new Error('DOCX_REVIEW_PACKET_YRTK2_PROPERTY_REQUIRED');
  }

  const buffer = buildStoredZip([
    { name: '[Content_Types].xml', data: buildContentTypesXml() },
    { name: '_rels/.rels', data: buildRootRelsXml() },
    { name: 'word/_rels/document.xml.rels', data: buildDocumentRelsXml(hyperlinks) },
    { name: 'word/document.xml', data: buildDocumentXml(blocks, hyperlinkByHref) },
    { name: 'word/settings.xml', data: buildSettingsXml() },
    { name: 'word/numbering.xml', data: buildNumberingXml(numberingDefinitions) },
    { name: 'word/styles.xml', data: buildStylesXml() },
    { name: 'docProps/custom.xml', data: buildCustomPropertiesXml(customProperties) },
    { name: 'customXml/_rels/item1.xml.rels', data: buildCustomXmlRelsXml() },
    { name: 'customXml/item1.xml', data: buildCustomXmlPayloadXml(input) },
    { name: 'customXml/itemProps1.xml', data: buildCustomXmlItemPropsXml() },
  ]);
  const modernMode = validateDocxReviewPacketModernMode15(buffer);
  if (!modernMode.ok) throw new Error(modernMode.code);
  assertNoEmbeddedSecret(buffer, input.forbiddenSecret);
  return buffer;
}

module.exports = {
  buildDocxReviewPacketBuffer,
  buildSettingsXml,
  normalizeReviewPacketBlocks,
  validateDocxReviewPacketModernMode15,
  deriveWordBookmarkNameV1,
  readDeclaredBookmarkName,
};
