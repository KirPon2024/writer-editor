'use strict';

const { buildStoredZip, escapeXml } = require('./docxMinBuilder');

const WORD_MAIN_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const CUSTOM_PROPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
const CUSTOM_PROPS_VT_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
const CUSTOM_XML_PROPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/customXml';
const WORD_SETTINGS_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml';
const WORD_SETTINGS_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings';
const WORD_COMPATIBILITY_URI = 'http://schemas.microsoft.com/office/word';

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
    }));
}

function buildBookmarkName(block, index) {
  const raw = normalizeString(block.blockId).replace(/[^A-Za-z0-9_]/g, '_');
  return `YRTK_${String(index + 1).padStart(4, '0')}_${raw}`.slice(0, 40);
}

function buildParagraphXml(block, index) {
  const bookmarkId = String(index + 1);
  const bookmarkName = buildBookmarkName(block, index);
  const text = block.text;
  const textRun = text
    ? `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
    : '';
  return [
    `<w:p w14:paraId="${escapeXml(block.paraId)}" w14:textId="${escapeXml(block.textId)}">`,
    `<w:bookmarkStart w:id="${bookmarkId}" w:name="${escapeXml(bookmarkName)}"/>`,
    textRun,
    `<w:bookmarkEnd w:id="${bookmarkId}"/>`,
    '</w:p>',
  ].join('');
}

function buildDocumentXml(blocks) {
  const paragraphs = blocks.map((block, index) => buildParagraphXml(block, index)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_MAIN_NS}" xmlns:w14="${W14_NS}">
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

function buildDocumentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${WORD_REL_NS}">
  <Relationship Id="rIdYrtkSettings" Type="${WORD_SETTINGS_REL_TYPE}" Target="settings.xml"/>
</Relationships>`;
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
    { name: 'word/_rels/document.xml.rels', data: buildDocumentRelsXml() },
    { name: 'word/document.xml', data: buildDocumentXml(blocks) },
    { name: 'word/settings.xml', data: buildSettingsXml() },
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
};
