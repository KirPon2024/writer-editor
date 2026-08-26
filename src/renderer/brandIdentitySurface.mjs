export const BRAND_IDENTITY_ID = 'YALKEN_ORIGINAL_V1';
export const BRAND_NAME = 'Yalken';
export const BRAND_OWNERSHIP = 'FIRST_PARTY_ORIGINAL';

function frozenResult(ok, reason) {
  return Object.freeze({ ok, reason });
}

export function assessBrandIdentitySurface(surface = {}) {
  if (surface.identityId !== BRAND_IDENTITY_ID) return frozenResult(false, 'BRAND_IDENTITY_BINDING_STALE');
  if (surface.name !== BRAND_NAME) return frozenResult(false, 'BRAND_NAME_BINDING_STALE');
  if (surface.ownership !== BRAND_OWNERSHIP) return frozenResult(false, 'BRAND_OWNERSHIP_BINDING_STALE');
  if (surface.accessibleName !== BRAND_NAME) return frozenResult(false, 'BRAND_ACCESSIBLE_NAME_STALE');
  if (surface.role !== 'img') return frozenResult(false, 'BRAND_ACCESSIBLE_ROLE_STALE');
  if (surface.markAriaHidden !== 'true') return frozenResult(false, 'BRAND_DECORATIVE_MARK_EXPOSED');
  if (surface.wordmarkAriaHidden !== 'true') return frozenResult(false, 'BRAND_WORDMARK_DUPLICATES_ACCESSIBLE_NAME');
  if (surface.screenshotCanon !== 'false') return frozenResult(false, 'BRAND_SCREENSHOT_CANON_FORBIDDEN');
  if (surface.thirdPartyAssetAcquisition !== 'false') return frozenResult(false, 'BRAND_THIRD_PARTY_ASSET_FORBIDDEN');
  return frozenResult(true, '');
}

export function activateBrandIdentitySurface(documentRef = globalThis.document, locationRef = globalThis.location) {
  const root = documentRef?.documentElement;
  const lockup = documentRef?.querySelector?.('[data-brand-identity]');
  const mark = lockup?.querySelector?.('[data-brand-mark]');
  const wordmark = lockup?.querySelector?.('[data-brand-wordmark]');
  const identityId = new URLSearchParams(locationRef?.search || '').get('BRAND_IDENTITY') || '';
  const assessment = assessBrandIdentitySurface({
    identityId,
    name: wordmark?.textContent?.trim() || '',
    ownership: lockup?.dataset?.brandOwnership || '',
    accessibleName: lockup?.getAttribute?.('aria-label') || '',
    role: lockup?.getAttribute?.('role') || '',
    markAriaHidden: mark?.getAttribute?.('aria-hidden') || '',
    wordmarkAriaHidden: wordmark?.getAttribute?.('aria-hidden') || '',
    screenshotCanon: lockup?.dataset?.screenshotCanon || '',
    thirdPartyAssetAcquisition: lockup?.dataset?.thirdPartyAssetAcquisition || '',
  });
  if (root?.dataset) root.dataset.brandContract = assessment.ok ? 'active' : 'fallback';
  if (lockup?.dataset) lockup.dataset.brandContract = assessment.ok ? 'active' : 'fallback';
  return assessment;
}

if (typeof document !== 'undefined') activateBrandIdentitySurface();
