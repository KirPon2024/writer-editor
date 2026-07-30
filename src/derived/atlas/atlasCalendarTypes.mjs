export const ATLAS_CALENDAR_DEFINITION_SCHEMA_VERSION = 'atlas.calendarDefinition.v1';
export const ATLAS_CALENDAR_CONVERSION_RULE_SCHEMA_VERSION = 'atlas.calendarConversionRule.v1';
export const ATLAS_CALENDAR_DEFINITIONS_SCHEMA_VERSION = 'derived.atlas.calendarDefinitions.v1';
export const ATLAS_CALENDAR_SURFACE_MANIFEST_VERSION = 'surface.atlas.calendarDefinitions.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasCalendarDefinitions(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const kind = compareText(a.calendarKind, b.calendarKind);
    if (kind !== 0) return kind;
    const name = compareText(a.name, b.name);
    if (name !== 0) return name;
    return compareText(a.id, b.id);
  });
}

export function sortAtlasCalendarConversionRules(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => compareText(a.id, b.id));
}
