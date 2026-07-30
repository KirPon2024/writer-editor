import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import { buildAtlasGraphPackageArchiveIntegrationProof } from '../../archive/atlasGraphPackageArchiveProof.mjs';
import {
  ATLAS_EXPORT_FORMAT,
  ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION,
  ATLAS_EXPORT_ROUND_TRIP_PROOF_SCHEMA_VERSION,
} from './atlasExportIrTypes.mjs';
import { serializeAtlasExportIrReadableJsonV1 } from './serializeAtlasExportIrV1.mjs';

export const ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION = 'atlas.graphPackage.v1';
export const ATLAS_GRAPH_PACKAGE_FORMAT = 'atlas-graph-package-json';
export const ATLAS_GRAPH_PACKAGE_LOSS_REPORT_SCHEMA_VERSION = 'atlas.graphPackageLossReport.v1';
export const ATLAS_DERIVED_REBUILD_CONTRACT_SCHEMA_VERSION = 'atlas.derivedRebuildContract.v1';
export const ATLAS_GRAPH_PACKAGE_IMAGE_PDF_EVIDENCE_SCHEMA_VERSION = 'atlas.graphPackageImagePdfEvidence.v1';

const GRAPH_PACKAGE_OP = 'atlas.graphPackage.build';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value ?? '')).length;
}

function typedFailure(code, reason, details = {}) {
  const error = { code, op: GRAPH_PACKAGE_OP, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = sortJsonValue(child);
  }
  return out;
}

function buildContentProof(exportIr) {
  const authorData = isPlainObject(exportIr.authorData) ? exportIr.authorData : {};
  return {
    authorTruth: isPlainObject(authorData) && Object.keys(authorData).length > 0,
    languageTags: isPlainObject(authorData.languageTags),
    evidenceIdentities: Array.isArray(exportIr.evidenceIdentity?.rows),
    customVocabularies: isPlainObject(authorData.entityVocabulary) && isPlainObject(authorData.relationVocabulary),
    seriesReferences: isPlainObject(authorData.seriesIdentityLinks),
    unknownFields: isPlainObject(exportIr.unknownFieldsEnvelope),
  };
}

function buildLossReport(readableJsonPacket, contentProof) {
  const items = [{
    kind: 'INTENTIONAL_OMISSION',
    reasonCode: 'ATLAS_DERIVED_GRAPH_DATA_OMITTED_REBUILDABLE',
    note: 'Derived graph/layout data is omitted from the portable graph package and must be rebuilt from ExportIR author truth.',
    blocking: false,
    rebuildable: true,
    sourcePackageHash: readableJsonPacket.packageHash,
  }];
  if (!Object.values(contentProof).every(Boolean)) {
    items.push({
      kind: 'UNSUPPORTED_PAYLOAD',
      reasonCode: 'ATLAS_GRAPH_PACKAGE_CONTENT_PROOF_INCOMPLETE',
      note: 'Graph package content proof is incomplete and repeat import must fail closed.',
      blocking: true,
      rebuildable: false,
      sourcePackageHash: readableJsonPacket.packageHash,
    });
  }
  const sortedItems = items.sort((a, b) => a.reasonCode.localeCompare(b.reasonCode, 'en'));
  return sortJsonValue({
    schemaVersion: ATLAS_GRAPH_PACKAGE_LOSS_REPORT_SCHEMA_VERSION,
    count: sortedItems.length,
    blockingCount: sortedItems.filter((item) => item.blocking === true).length,
    items: sortedItems,
  });
}

function buildDerivedRebuildContract(readableJsonPacket, exportIr) {
  const base = sortJsonValue({
    schemaVersion: ATLAS_DERIVED_REBUILD_CONTRACT_SCHEMA_VERSION,
    sourceReadableJsonSchemaVersion: ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION,
    sourceReadableJsonFormat: ATLAS_EXPORT_FORMAT,
    sourcePackageHash: readableJsonPacket.packageHash,
    sourceExportIrHash: hashCanonicalValue(exportIr),
    omittedDerivedData: [
      'derived.atlas.localGraph.v1',
      'derived.atlas.globalCompositeGraph.v1',
      'derived.atlas.temporalLayout.v1',
      'renderer.atlas.graphLayoutCache',
    ],
    rebuildInputs: [
      'exportIr.authorData',
      'exportIr.languageTags',
      'exportIr.evidenceIdentity',
      'exportIr.unknownFieldsEnvelope',
    ],
    deterministic: true,
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
  });
  return sortJsonValue({
    ...base,
    rebuildProofHash: hashCanonicalValue(base),
  });
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function entityRowsFromPackage(graphPackage) {
  const entities = isPlainObject(graphPackage?.readableJsonPacket?.exportIr?.authorData?.entities)
    ? graphPackage.readableJsonPacket.exportIr.authorData.entities
    : {};
  return Object.keys(entities).sort().map((entityId, index) => {
    const entity = isPlainObject(entities[entityId]) ? entities[entityId] : {};
    return {
      id: entityId,
      label: normalizeString(entity.name) || entityId,
      kind: normalizeString(entity.entityKind) || 'entity',
      x: 90 + (index % 4) * 190,
      y: 90 + Math.floor(index / 4) * 110,
    };
  });
}

function buildSvg(graphPackage, rows) {
  const title = normalizeString(graphPackage.title) || normalizeString(graphPackage.projectId) || 'Atlas graph package';
  const width = Math.max(520, 220 + rows.length * 160);
  const height = Math.max(240, 180 + Math.ceil(rows.length / 4) * 120);
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fbfbf8"/>',
    `<text x="24" y="38" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#202124">${escapeXml(title)}</text>`,
  ];
  for (const row of rows) {
    lines.push(`<circle cx="${row.x}" cy="${row.y}" r="22" fill="#c8dcf1" stroke="#263747" stroke-width="2"/>`);
    lines.push(`<text x="${row.x + 32}" y="${row.y + 4}" font-family="system-ui, sans-serif" font-size="13" fill="#202124">${escapeXml(row.label)}</text>`);
    lines.push(`<text x="${row.x + 32}" y="${row.y + 22}" font-family="system-ui, sans-serif" font-size="11" fill="#52606d">${escapeXml(row.kind)}</text>`);
  }
  const summary = `${rows.length} entities / ${graphPackage.summary?.evidenceIdentityCount || 0} evidence identities / ${graphPackage.lossReport?.count || 0} loss rows`;
  lines.push(`<text x="24" y="${height - 24}" font-family="system-ui, sans-serif" font-size="12" fill="#4f5b4d">${escapeXml(summary)}</text>`);
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

function buildPrintHtml(graphPackage, svg) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeXml(graphPackage.title || graphPackage.projectId)}</title>`,
    '<style>body{margin:24px;font-family:system-ui,sans-serif;color:#202124}svg{max-width:100%;height:auto}pre{white-space:pre-wrap;font-size:12px}</style>',
    '</head>',
    '<body>',
    svg.trimEnd(),
    `<pre>${escapeXml(JSON.stringify({
      projectId: graphPackage.projectId,
      packageHash: graphPackage.packageHash,
      derivedRebuildRequired: graphPackage.derivedData.rebuildRequired,
      lossCount: graphPackage.lossReport.count,
    }, null, 2))}</pre>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export function buildAtlasGraphPackage(input = {}) {
  const readable = serializeAtlasExportIrReadableJsonV1(input);
  if (!readable.ok) return readable;
  const readableJsonPacket = readable.value;
  const exportIr = readableJsonPacket.exportIr;
  const contentProof = buildContentProof(exportIr);
  const lossReport = buildLossReport(readableJsonPacket, contentProof);
  const derivedData = sortJsonValue({
    included: false,
    persistedAsTruth: false,
    rebuildRequired: true,
    rebuildContract: buildDerivedRebuildContract(readableJsonPacket, exportIr),
  });
  const packageCore = sortJsonValue({
    schemaVersion: ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION,
    format: ATLAS_GRAPH_PACKAGE_FORMAT,
    projectId: exportIr.projectId,
    title: exportIr.title,
    readableJsonPacket,
    contentProof,
    derivedData,
    lossReport,
    summary: {
      entityCount: Object.keys(exportIr.authorData.entities || {}).length,
      evidenceIdentityCount: Array.isArray(exportIr.evidenceIdentity?.rows) ? exportIr.evidenceIdentity.rows.length : 0,
      entityVocabularyCount: Object.keys(exportIr.authorData.entityVocabulary || {}).length,
      relationVocabularyCount: Object.keys(exportIr.authorData.relationVocabulary || {}).length,
      seriesIdentityLinkCount: Object.keys(exportIr.authorData.seriesIdentityLinks || {}).length,
      blockingLossCount: lossReport.blockingCount,
    },
    authority: {
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      applyAuthority: false,
    },
  });
  const packageHash = hashCanonicalValue(packageCore);
  const graphPackage = sortJsonValue({
    ...packageCore,
    packageHash,
  });
  return {
    ok: true,
    value: sortJsonValue({
      ...graphPackage,
      archiveIntegration: buildAtlasGraphPackageArchiveIntegrationProof({
        graphPackage,
        readableJsonPacket,
        graphPackageHash: packageHash,
      }),
    }),
  };
}

export function buildAtlasGraphPackageImagePdfEvidence(graphPackageInput = {}) {
  if (!isPlainObject(graphPackageInput) || graphPackageInput.schemaVersion !== ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMAGE_PDF_PACKAGE_INVALID', 'GRAPH_PACKAGE_INVALID');
  }
  const graphPackage = sortJsonValue(cloneJson(graphPackageInput));
  const rows = entityRowsFromPackage(graphPackage);
  if (rows.length === 0) return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMAGE_PDF_ENTITIES_REQUIRED', 'ENTITIES_REQUIRED');
  const svg = buildSvg(graphPackage, rows);
  const printHtml = buildPrintHtml(graphPackage, svg);
  const evidence = sortJsonValue({
    schemaVersion: ATLAS_GRAPH_PACKAGE_IMAGE_PDF_EVIDENCE_SCHEMA_VERSION,
    projectId: graphPackage.projectId,
    packageHash: graphPackage.packageHash,
    sourceSchemaVersion: graphPackage.schemaVersion,
    image: {
      format: 'svg',
      mediaType: 'image/svg+xml',
      utf8ByteLength: utf8ByteLength(svg),
      sha256: hashCanonicalValue(svg),
      content: svg,
    },
    pdf: {
      format: 'pdf',
      sourceFormat: 'html-print-packet',
      adapterRequired: 'local-print-to-pdf-port',
      binaryGenerated: false,
      htmlUtf8ByteLength: utf8ByteLength(printHtml),
      htmlSha256: hashCanonicalValue(printHtml),
      content: printHtml,
    },
    roundTripProofSchema: ATLAS_EXPORT_ROUND_TRIP_PROOF_SCHEMA_VERSION,
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    projectTruthMutation: false,
  });
  return {
    ok: true,
    value: sortJsonValue({
      ...evidence,
      meta: {
        evidenceHash: hashCanonicalValue({
          schemaVersion: evidence.schemaVersion,
          projectId: evidence.projectId,
          packageHash: evidence.packageHash,
          imageSha256: evidence.image.sha256,
          pdfHtmlSha256: evidence.pdf.htmlSha256,
        }),
      },
    }),
  };
}
