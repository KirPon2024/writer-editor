export const ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION = 'derived.atlas.diagnosticsStageAcceptance.v1';
export const ATLAS_DIAGNOSTICS_SURFACE_MANIFEST_VERSION = 'surface.atlas.diagnosticsStageAcceptance.v1';
export const ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION = 'derived.atlas.degradedCapabilityReport.v1';
export const ATLAS_SURFACE_FALLBACK_INVENTORY_SCHEMA_VERSION = 'derived.atlas.surfaceFallbackInventory.v1';
export const ATLAS_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION = 'derived.atlas.stage05AcceptanceProof.v1';
export const ATLAS_FINAL_UI_AUDIT_RECEIPT_SCHEMA_VERSION = 'derived.atlas.finalUiAuditReceipt.v1';
export const ATLAS_HEURISTIC_REVIEW_RECEIPT_SCHEMA_VERSION = 'derived.atlas.heuristicReviewReceipt.v1';

export function sortAtlasDiagnosticsRows(left, right) {
  const leftKey = `${left?.severity || ''}:${left?.surfaceId || ''}:${left?.code || ''}`;
  const rightKey = `${right?.severity || ''}:${right?.surfaceId || ''}:${right?.code || ''}`;
  return leftKey.localeCompare(rightKey);
}
