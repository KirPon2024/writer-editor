import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import {
  ATLAS_GRAPH_PACKAGE_FORMAT,
  ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION,
} from '../../../export/atlas/v1/index.mjs';
import { parseAtlasExportIrReadableJsonV1 } from './parseAtlasExportIrV1.mjs';

export const ATLAS_GRAPH_PACKAGE_REPEAT_IMPORT_PROOF_SCHEMA_VERSION = 'atlas.graphPackageRepeatImportProof.v1';

const REPEAT_IMPORT_OP = 'atlas.graphPackage.repeatImport';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedFailure(code, reason, details = {}) {
  const error = { code, op: REPEAT_IMPORT_OP, reason };
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

function parsePackage(input) {
  const candidate = input.graphPackageJson ?? input.graphPackage ?? input.payload ?? input.package;
  if (isPlainObject(candidate)) return { ok: true, value: sortJsonValue(cloneJson(candidate)) };
  if (typeof candidate !== 'string') return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_PAYLOAD_REQUIRED', 'PAYLOAD_REQUIRED');
  try {
    const parsed = JSON.parse(candidate);
    if (!isPlainObject(parsed)) return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
    return { ok: true, value: sortJsonValue(parsed) };
  } catch {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_JSON_INVALID', 'JSON_INVALID');
  }
}

function verifyGraphPackageHash(graphPackage) {
  const { archiveIntegration, packageHash, ...core } = graphPackage;
  const actual = hashCanonicalValue(sortJsonValue(core));
  if (actual !== normalizeString(packageHash)) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_HASH_MISMATCH', 'PACKAGE_HASH_MISMATCH', {
      expectedPackageHash: normalizeString(packageHash),
      actualPackageHash: actual,
    });
  }
  return { ok: true, value: actual };
}

function verifyLossReport(graphPackage) {
  const lossReport = isPlainObject(graphPackage.lossReport) ? graphPackage.lossReport : {};
  const items = Array.isArray(lossReport.items) ? lossReport.items : [];
  const blocking = items.filter((item) => item?.blocking === true);
  if (Number(lossReport.count) !== items.length || Number(lossReport.blockingCount) !== blocking.length) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_LOSS_REPORT_INVALID', 'LOSS_REPORT_INVALID');
  }
  if (blocking.length > 0) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_BLOCKING_LOSS', 'BLOCKING_LOSS_PRESENT', {
      blockingCount: blocking.length,
    });
  }
  const derivedOmission = items.find((item) => item?.reasonCode === 'ATLAS_DERIVED_GRAPH_DATA_OMITTED_REBUILDABLE');
  if (!derivedOmission || derivedOmission.rebuildable !== true) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_DERIVED_REBUILD_PROOF_MISSING', 'DERIVED_REBUILD_PROOF_MISSING');
  }
  return { ok: true, value: sortJsonValue(lossReport) };
}

function verifyDerivedRebuildContract(graphPackage) {
  const contract = graphPackage?.derivedData?.rebuildContract;
  if (!isPlainObject(contract) || contract.deterministic !== true) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_DERIVED_REBUILD_CONTRACT_INVALID', 'DERIVED_REBUILD_CONTRACT_INVALID');
  }
  const { rebuildProofHash, ...base } = contract;
  const actual = hashCanonicalValue(sortJsonValue(base));
  if (actual !== normalizeString(rebuildProofHash)) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_DERIVED_REBUILD_HASH_MISMATCH', 'DERIVED_REBUILD_HASH_MISMATCH', {
      expectedRebuildProofHash: normalizeString(rebuildProofHash),
      actualRebuildProofHash: actual,
    });
  }
  return { ok: true, value: sortJsonValue(contract) };
}

export function validateAtlasGraphPackageRepeatImport(input = {}) {
  const parsed = parsePackage(input);
  if (!parsed.ok) return parsed;
  const graphPackage = parsed.value;
  if (graphPackage.schemaVersion !== ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION || graphPackage.format !== ATLAS_GRAPH_PACKAGE_FORMAT) {
    return typedFailure('E_ATLAS_GRAPH_PACKAGE_IMPORT_SCHEMA_INVALID', 'SCHEMA_INVALID', {
      schemaVersion: normalizeString(graphPackage.schemaVersion),
      format: normalizeString(graphPackage.format),
    });
  }
  const packageHash = verifyGraphPackageHash(graphPackage);
  if (!packageHash.ok) return packageHash;
  const lossReport = verifyLossReport(graphPackage);
  if (!lossReport.ok) return lossReport;
  const rebuildContract = verifyDerivedRebuildContract(graphPackage);
  if (!rebuildContract.ok) return rebuildContract;
  const readable = parseAtlasExportIrReadableJsonV1({ exportPayload: graphPackage.readableJsonPacket });
  if (!readable.ok) return readable;
  const importPreviewHash = hashCanonicalValue(readable.value);
  const proofBase = sortJsonValue({
    schemaVersion: ATLAS_GRAPH_PACKAGE_REPEAT_IMPORT_PROOF_SCHEMA_VERSION,
    projectId: graphPackage.projectId,
    packageHash: packageHash.value,
    readableJsonPackageHash: readable.value.packageHash,
    importPreviewHash,
    lossReportHash: hashCanonicalValue(lossReport.value),
    rebuildProofHash: rebuildContract.value.rebuildProofHash,
    repeatImportValidated: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  });
  return {
    ok: true,
    value: sortJsonValue({
      ...proofBase,
      proofHash: hashCanonicalValue(proofBase),
      restoredProjectPatch: readable.value.restoredProjectPatch,
    }),
  };
}
