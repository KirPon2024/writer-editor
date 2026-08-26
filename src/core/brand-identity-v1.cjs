'use strict';

const BRAND_IDENTITY_SCHEMA_VERSION = 'yalken.brand-identity.v1';
const BRAND_IDENTITY_ID = 'YALKEN_ORIGINAL_V1';
const BRAND_LICENSE_DECISION_ID = 'BRAND_LICENSE_OWNER_CHOICE_WP308_BRAND_BASELINE_V1';
const BRAND_OWNERSHIP_FIRST_PARTY_ORIGINAL = 'FIRST_PARTY_ORIGINAL';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function channelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/iu.test(hex)) return Number.NaN;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const [red, green, blue] = channels.map(channelToLinear);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (!Number.isFinite(foregroundLuminance) || !Number.isFinite(backgroundLuminance)) return 0;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const BRAND_IDENTITY_V1 = deepFreeze({
  schemaVersion: BRAND_IDENTITY_SCHEMA_VERSION,
  identityId: BRAND_IDENTITY_ID,
  name: 'Yalken',
  ownership: BRAND_OWNERSHIP_FIRST_PARTY_ORIGINAL,
  decisionId: BRAND_LICENSE_DECISION_ID,
  scope: {
    screenshotCanon: false,
    thirdPartyAssetAcquisition: false,
    dependencyAdoption: false,
    signing: false,
    release: false,
    cloud: false,
    userDataMutation: false,
  },
  accessibility: {
    accessibleName: 'Yalken',
    decorativeMarkAriaHidden: true,
    minimumTextContrastRatio: 4.5,
    minimumNonTextContrastRatio: 3,
    forcedColorsSupported: true,
    motionRequired: false,
  },
  tokens: {
    metrics: {
      titlebarHeightPx: 28,
      markSizePx: 18,
      markRadiusPx: 4,
      wordmarkSizePx: 13,
    },
    light: {
      titlebarSurface: '#f8f5ef',
      wordmarkInk: '#173b34',
      markBackground: '#173b34',
      markForeground: '#ffffff',
      markAccent: '#b74636',
      focusRing: '#005fcc',
    },
    dark: {
      titlebarSurface: '#101119',
      wordmarkInk: '#d7eee6',
      markBackground: '#d7eee6',
      markForeground: '#102c26',
      markAccent: '#ff8b74',
      focusRing: '#9bc3ff',
    },
  },
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assessBrandIdentity(identity = BRAND_IDENTITY_V1) {
  const reasons = [];
  if (!isPlainObject(identity)) return Object.freeze({ ok: false, reasons: Object.freeze(['BRAND_IDENTITY_INVALID']) });
  if (identity.schemaVersion !== BRAND_IDENTITY_SCHEMA_VERSION) reasons.push('BRAND_SCHEMA_INVALID');
  if (identity.identityId !== BRAND_IDENTITY_ID) reasons.push('BRAND_IDENTITY_ID_INVALID');
  if (identity.name !== 'Yalken') reasons.push('BRAND_NAME_INVALID');
  if (identity.ownership !== BRAND_OWNERSHIP_FIRST_PARTY_ORIGINAL) reasons.push('BRAND_OWNERSHIP_INVALID');
  if (identity.decisionId !== BRAND_LICENSE_DECISION_ID) reasons.push('BRAND_DECISION_INVALID');

  const scope = isPlainObject(identity.scope) ? identity.scope : {};
  for (const field of [
    'screenshotCanon',
    'thirdPartyAssetAcquisition',
    'dependencyAdoption',
    'signing',
    'release',
    'cloud',
    'userDataMutation',
  ]) {
    if (scope[field] !== false) reasons.push(`BRAND_SCOPE_WIDENED_${field}`);
  }

  const accessibility = isPlainObject(identity.accessibility) ? identity.accessibility : {};
  if (accessibility.accessibleName !== 'Yalken') reasons.push('BRAND_ACCESSIBLE_NAME_INVALID');
  if (accessibility.decorativeMarkAriaHidden !== true) reasons.push('BRAND_MARK_ACCESSIBILITY_INVALID');
  if (accessibility.minimumTextContrastRatio !== 4.5) reasons.push('BRAND_TEXT_CONTRAST_POLICY_INVALID');
  if (accessibility.minimumNonTextContrastRatio !== 3) reasons.push('BRAND_NON_TEXT_CONTRAST_POLICY_INVALID');
  if (accessibility.forcedColorsSupported !== true) reasons.push('BRAND_FORCED_COLORS_INVALID');
  if (accessibility.motionRequired !== false) reasons.push('BRAND_MOTION_POLICY_INVALID');

  const modes = isPlainObject(identity.tokens) ? [identity.tokens.light, identity.tokens.dark] : [];
  if (modes.length !== 2 || modes.some((mode) => !isPlainObject(mode))) {
    reasons.push('BRAND_TOKEN_MODES_INVALID');
  } else {
    for (const mode of modes) {
      if (contrastRatio(mode.wordmarkInk, mode.titlebarSurface) < accessibility.minimumTextContrastRatio) {
        reasons.push('BRAND_WORDMARK_CONTRAST_INVALID');
      }
      if (contrastRatio(mode.markForeground, mode.markBackground) < accessibility.minimumTextContrastRatio) {
        reasons.push('BRAND_MARK_CONTRAST_INVALID');
      }
      if (contrastRatio(mode.markBackground, mode.titlebarSurface) < accessibility.minimumNonTextContrastRatio) {
        reasons.push('BRAND_MARK_SURFACE_CONTRAST_INVALID');
      }
      if (contrastRatio(mode.focusRing, mode.titlebarSurface) < accessibility.minimumNonTextContrastRatio) {
        reasons.push('BRAND_FOCUS_CONTRAST_INVALID');
      }
    }
  }
  return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
}

function createBrandIdentityRendererProjection(identity = BRAND_IDENTITY_V1) {
  const assessment = assessBrandIdentity(identity);
  if (!assessment.ok) {
    const error = new Error(assessment.reasons.join(','));
    error.code = 'E_BRAND_IDENTITY_INVALID';
    throw error;
  }
  return deepFreeze({
    schemaVersion: identity.schemaVersion,
    identityId: identity.identityId,
    name: identity.name,
    ownership: identity.ownership,
    accessibleName: identity.accessibility.accessibleName,
  });
}

module.exports = Object.freeze({
  BRAND_IDENTITY_SCHEMA_VERSION,
  BRAND_IDENTITY_ID,
  BRAND_LICENSE_DECISION_ID,
  BRAND_OWNERSHIP_FIRST_PARTY_ORIGINAL,
  BRAND_IDENTITY_V1,
  assessBrandIdentity,
  contrastRatio,
  createBrandIdentityRendererProjection,
});
