import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_CALENDAR_DEFINITIONS_SCHEMA_VERSION,
  ATLAS_CALENDAR_SURFACE_MANIFEST_VERSION,
  sortAtlasCalendarConversionRules,
  sortAtlasCalendarDefinitions,
} from './atlasCalendarTypes.mjs';

const VIEW_ID = 'derived.atlas.calendarDefinitions.v1';
const PROVIDER_ID = 'query.atlasCalendarDefinitions';
const SURFACE_ID = 'surface.atlas.calendarDefinitions';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.calendarDefinitions';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isAtlasCalendarCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.calendarDefinitions'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.calendarDefinitions'] === false) return false;
  if (capabilities.atlasCalendarDefinitions === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.calendarDefinitions === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_CALENDAR_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjectionWithCommandBoundary',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE'],
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.calendar.define'],
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_CALENDARS_EMPTY',
      degraded: 'ATLAS_CALENDARS_DEGRADED',
      unavailable: 'ATLAS_CALENDARS_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: ['atlas.author.v1.calendarDefinitions'],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.calendar.define'],
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    cloudSync: false,
    accountSync: false,
    hiddenMutation: false,
  };
}

function normalizeRule(rule) {
  const source = isPlainObject(rule) ? rule : {};
  return {
    schemaVersion: 'atlas.calendarConversionRule.v1',
    id: normalizeString(source.id),
    ruleKind: normalizeString(source.ruleKind),
    sourceScale: normalizeString(source.sourceScale),
    targetScale: normalizeString(source.targetScale),
    precision: normalizeString(source.precision),
    canConvert: source.canConvert === true,
    offsetDays: Number.isSafeInteger(Number(source.offsetDays)) ? Number(source.offsetDays) : 0,
    reason: normalizeString(source.reason),
  };
}

function normalizeDefinition(definition) {
  const source = isPlainObject(definition) ? definition : {};
  const conversionRules = sortAtlasCalendarConversionRules(
    (Array.isArray(source.conversionRules) ? source.conversionRules : []).map(normalizeRule),
  );
  const unsupportedConversionCount = conversionRules.filter((rule) => !rule.canConvert || rule.ruleKind === 'unsupported').length;
  const activeConversionCount = conversionRules.filter((rule) => rule.canConvert).length;
  return {
    schemaVersion: 'atlas.calendarDefinition.v1',
    id: normalizeString(source.id),
    name: normalizeString(source.name),
    calendarKind: normalizeString(source.calendarKind),
    calendarSystem: normalizeString(source.calendarSystem),
    dayZeroLabel: normalizeString(source.dayZeroLabel),
    localePolicy: normalizeString(source.localePolicy) || 'project-local',
    conversionRules,
    activeConversionCount,
    unsupportedConversionCount,
    state: activeConversionCount > 0 ? 'ready' : 'degraded',
    sourceHash: normalizeString(source.sourceHash) || hashCanonicalValue(source),
    createdByCommandSeq: Number.isSafeInteger(Number(source.createdByCommandSeq)) ? Number(source.createdByCommandSeq) : 0,
    updatedByCommandSeq: Number.isSafeInteger(Number(source.updatedByCommandSeq)) ? Number(source.updatedByCommandSeq) : 0,
  };
}

function emptyCalendarState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_CALENDAR_DEFINITIONS_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      calendarCount: 0,
      realCalendarCount: 0,
      fictionalCalendarCount: 0,
      conversionRuleCount: 0,
      activeConversionRuleCount: 0,
      unsupportedConversionRuleCount: 0,
      degradedCalendarCount: 0,
      calendarHash: '',
      invalidationKey: '',
    },
    calendarDefinitions: [],
    degradedStates: [],
    evidence: buildEvidence({ calendarHash: '' }),
  };
}

function buildEvidence({ calendarHash = '' } = {}) {
  return {
    schemaVersion: 'derived.atlas.calendarDefinitions.evidence.v1',
    calendarHash,
    guarantees: {
      localOnly: true,
      externalTimeService: false,
      hiddenAssumptions: false,
      unsupportedStatesExplicit: true,
      authorCommandBoundary: 'atlas.calendar.define',
    },
  };
}

function buildCalendarState({ projectId, calendarDefinitions, invalidationKey }) {
  const sorted = sortAtlasCalendarDefinitions(calendarDefinitions.map(normalizeDefinition));
  const calendarHash = hashCanonicalValue(sorted);
  const unsupportedConversionRuleCount = sorted.reduce((sum, item) => sum + item.unsupportedConversionCount, 0);
  const activeConversionRuleCount = sorted.reduce((sum, item) => sum + item.activeConversionCount, 0);
  const degradedStates = sorted
    .filter((item) => item.state === 'degraded' || item.unsupportedConversionCount > 0)
    .map((item) => ({
      calendarId: item.id,
      code: item.activeConversionCount > 0 ? 'UNSUPPORTED_CONVERSION_RULES_PRESENT' : 'NO_ACTIVE_CONVERSION_RULE',
      reason: item.activeConversionCount > 0
        ? 'At least one conversion rule is explicitly unsupported.'
        : 'Calendar has no active conversion rule.',
      unsupportedConversionRuleCount: item.unsupportedConversionCount,
    }));
  return {
    schemaVersion: ATLAS_CALENDAR_DEFINITIONS_SCHEMA_VERSION,
    state: sorted.length === 0 ? 'empty' : degradedStates.length > 0 ? 'degraded' : 'ready',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      calendarCount: sorted.length,
      realCalendarCount: sorted.filter((item) => item.calendarKind === 'real').length,
      fictionalCalendarCount: sorted.filter((item) => item.calendarKind === 'fictional').length,
      conversionRuleCount: sorted.reduce((sum, item) => sum + item.conversionRules.length, 0),
      activeConversionRuleCount,
      unsupportedConversionRuleCount,
      degradedCalendarCount: degradedStates.length,
      calendarHash,
      invalidationKey,
    },
    calendarDefinitions: sorted,
    degradedStates,
    evidence: buildEvidence({ calendarHash }),
  };
}

export function deriveAtlasCalendarDefinitions(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasCalendarCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_CALENDAR_DEFINITIONS_DISABLED',
          { capabilityId: 'atlas.calendarDefinitions' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) {
        throw createDerivedError(
          'E_ATLAS_PROJECT_NOT_FOUND',
          VIEW_ID,
          'PROJECT_NOT_FOUND',
          { projectId: params.projectId },
        );
      }
      const calendarDefinitions = isPlainObject(project.atlas?.calendarDefinitions)
        ? Object.values(project.atlas.calendarDefinitions)
        : [];
      if (calendarDefinitions.length === 0) {
        return {
          ...emptyCalendarState(params.projectId),
          summary: {
            ...emptyCalendarState(params.projectId).summary,
            invalidationKey: meta.invalidationKey,
          },
        };
      }
      return buildCalendarState({
        projectId: params.projectId,
        calendarDefinitions,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_CALENDAR_DEFINITIONS_VIEW_ID };
