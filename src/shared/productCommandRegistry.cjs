const PRODUCT_COMMAND_SCHEMA_VERSION = 'product-command-registry.v1';

const PRODUCT_COMMAND_ROWS = Object.freeze([
  {
    key: 'ATLAS_ENTITY_CREATE',
    id: 'atlas.entity.create',
    label: 'Atlas Entity Create',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.entity.create',
  },
  {
    key: 'ATLAS_ALIAS_ADD',
    id: 'atlas.alias.add',
    label: 'Atlas Alias Add',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.alias.add',
  },
  {
    key: 'ATLAS_MENTION_CONFIRM',
    id: 'atlas.mention.confirm',
    label: 'Atlas Mention Confirm',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.mention.confirm',
  },
  {
    key: 'ATLAS_OBSERVATION_SUPPRESS',
    id: 'atlas.observation.suppress',
    label: 'Atlas Observation Suppress',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.observation.suppress',
  },
  {
    key: 'ATLAS_ENTITY_MERGE',
    id: 'atlas.entity.merge',
    label: 'Atlas Entity Merge',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.entity.merge',
  },
  {
    key: 'ATLAS_ENTITY_SPLIT_RESTORE',
    id: 'atlas.entity.splitRestore',
    label: 'Atlas Entity Split Restore',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.entity.splitRestore',
  },
  {
    key: 'ATLAS_OBSERVATION_REASSIGN',
    id: 'atlas.observation.reassign',
    label: 'Atlas Observation Reassign',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.observation.reassign',
  },
  {
    key: 'ATLAS_EVIDENCE_REATTACH',
    id: 'atlas.evidence.reattach',
    label: 'Atlas Evidence Reattach',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.evidence.reattach',
  },
  {
    key: 'ATLAS_SAVED_QUERY_SAVE',
    id: 'atlas.savedQuery.save',
    label: 'Atlas Saved Query Save',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.savedQuery.save',
  },
  {
    key: 'ATLAS_LANGUAGE_TAG_SET',
    id: 'atlas.languageTag.set',
    label: 'Atlas Language Tag Set',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.languageTag.edit',
  },
  {
    key: 'ATLAS_LANGUAGE_TAG_CLEAR',
    id: 'atlas.languageTag.clear',
    label: 'Atlas Language Tag Clear',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.languageTag.edit',
  },
  {
    key: 'ATLAS_SERIES_PORTABILITY_APPLY',
    id: 'atlas.seriesPortability.apply',
    label: 'Atlas Series Portability Apply',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.seriesPortability.apply',
  },
  {
    key: 'ATLAS_SERIES_PORTABILITY_ROLLBACK',
    id: 'atlas.seriesPortability.rollback',
    label: 'Atlas Series Portability Rollback',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.seriesPortability.rollback',
  },
  {
    key: 'ATLAS_CALENDAR_DEFINE',
    id: 'atlas.calendar.define',
    label: 'Atlas Calendar Define',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.calendar.define',
  },
  {
    key: 'ATLAS_SCENE_TEMPORAL_ANCHOR_SET',
    id: 'atlas.sceneTemporalAnchor.set',
    label: 'Atlas Scene Temporal Anchor Set',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.sceneTemporalAnchor.set',
  },
  {
    key: 'ATLAS_CONTINUITY_FACT_RECORD',
    id: 'atlas.continuityFact.record',
    label: 'Atlas Continuity Fact Record',
    group: 'atlas',
    domain: 'atlas',
    capabilityId: 'cap.atlas.continuityFact.record',
  },
  {
    key: 'IDEA_CREATE',
    id: 'idea.create',
    label: 'Idea Create',
    group: 'idea',
    domain: 'idea',
    capabilityId: 'cap.idea.edit',
  },
  {
    key: 'IDEA_ORIGIN_LINK_ADD',
    id: 'idea.originLink.add',
    label: 'Idea Origin Link Add',
    group: 'idea',
    domain: 'idea',
    capabilityId: 'cap.idea.edit',
  },
  {
    key: 'MEANING_PROMOTE',
    id: 'meaning.promote',
    label: 'Meaning Promote',
    group: 'meaning',
    domain: 'meaning',
    capabilityId: 'cap.meaning.edit',
  },
  {
    key: 'MANUAL_MAP_CREATE',
    id: 'manualMap.create',
    label: 'Manual Map Create',
    group: 'manualMap',
    domain: 'manualMap',
    capabilityId: 'cap.manualMap.edit',
  },
  {
    key: 'MANUAL_MAP_NODE_ADD',
    id: 'manualMap.node.add',
    label: 'Manual Map Node Add',
    group: 'manualMap',
    domain: 'manualMap',
    capabilityId: 'cap.manualMap.edit',
  },
  {
    key: 'MANUAL_MAP_EDGE_ADD',
    id: 'manualMap.edge.add',
    label: 'Manual Map Edge Add',
    group: 'manualMap',
    domain: 'manualMap',
    capabilityId: 'cap.manualMap.edit',
  },
  {
    key: 'MANUAL_MAP_ATTACHMENT_ADD',
    id: 'manualMap.attachment.add',
    label: 'Manual Map Attachment Add',
    group: 'manualMap',
    domain: 'manualMap',
    capabilityId: 'cap.manualMap.edit',
  },
  {
    key: 'MANUAL_MAP_PORTAL_ADD',
    id: 'manualMap.portal.add',
    label: 'Manual Map Portal Add',
    group: 'manualMap',
    domain: 'manualMap',
    capabilityId: 'cap.manualMap.edit',
  },
  {
    key: 'MANUAL_MAP_TEMPLATE_APPLY',
    id: 'manualMap.template.apply',
    label: 'Manual Map Template Apply',
    group: 'manualMap',
    domain: 'manualMap',
    capabilityId: 'cap.manualMap.edit',
  },
].map((row) => Object.freeze({
  ...row,
  surface: Object.freeze(['palette', 'product']),
  hotkey: '',
  runtimeBacked: true,
  commandAuthority: 'CommandKernel',
})));

const PRODUCT_COMMAND_ID_LIST = Object.freeze(PRODUCT_COMMAND_ROWS.map((row) => row.id));
const PRODUCT_COMMAND_ID_SET = new Set(PRODUCT_COMMAND_ID_LIST);
const PRODUCT_COMMAND_RECORDS = Object.freeze(PRODUCT_COMMAND_ROWS.map((row) => Object.freeze({
  ...row,
  surface: Object.freeze([...row.surface]),
})));
const PRODUCT_COMMAND_CATALOG_ROWS = Object.freeze(PRODUCT_COMMAND_RECORDS.map((row) => Object.freeze({
  key: row.key,
  id: row.id,
  label: row.label,
  group: row.group,
  surface: Object.freeze([...row.surface]),
  hotkey: row.hotkey,
})));
const PRODUCT_COMMAND_CAPABILITY_BINDING = Object.freeze(Object.fromEntries(
  PRODUCT_COMMAND_RECORDS.map((row) => [row.id, row.capabilityId]),
));
const PRODUCT_COMMAND_CAPABILITY_IDS = Object.freeze([...new Set(PRODUCT_COMMAND_RECORDS.map((row) => row.capabilityId))].sort());
const PRODUCT_COMMAND_RECORD_BY_ID = new Map(PRODUCT_COMMAND_RECORDS.map((row) => [row.id, row]));

const PRODUCT_COMMAND_DOMAIN_STATUS = Object.freeze({
  atlas: Object.freeze({ domain: 'atlas', status: 'runtime-backed', commandIds: Object.freeze(PRODUCT_COMMAND_ID_LIST.filter((id) => id.startsWith('atlas.'))) }),
  manualMap: Object.freeze({ domain: 'manualMap', status: 'runtime-backed', commandIds: Object.freeze(PRODUCT_COMMAND_ID_LIST.filter((id) => id.startsWith('manualMap.'))) }),
  idea: Object.freeze({ domain: 'idea', status: 'runtime-backed', commandIds: Object.freeze(PRODUCT_COMMAND_ID_LIST.filter((id) => id.startsWith('idea.'))) }),
  meaning: Object.freeze({ domain: 'meaning', status: 'runtime-backed', commandIds: Object.freeze(PRODUCT_COMMAND_ID_LIST.filter((id) => id.startsWith('meaning.'))) }),
  plot: Object.freeze({
    domain: 'plot',
    status: 'degraded-no-runtime-mutating-command',
    commandIds: Object.freeze([]),
    reason: 'PLOT_IS_CURRENTLY_A_DERIVED_READ_PROJECTION_WITH_NO_CORE_MUTATING_COMMAND_ID',
  }),
});

function getProductCommandRecord(commandId) {
  return PRODUCT_COMMAND_RECORD_BY_ID.get(typeof commandId === 'string' ? commandId : '') || null;
}

function isProductCommandId(commandId) {
  return PRODUCT_COMMAND_ID_SET.has(typeof commandId === 'string' ? commandId : '');
}

module.exports = Object.freeze({
  PRODUCT_COMMAND_SCHEMA_VERSION,
  PRODUCT_COMMAND_RECORDS,
  PRODUCT_COMMAND_CATALOG_ROWS,
  PRODUCT_COMMAND_ID_LIST,
  PRODUCT_COMMAND_ID_SET,
  PRODUCT_COMMAND_CAPABILITY_BINDING,
  PRODUCT_COMMAND_CAPABILITY_IDS,
  PRODUCT_COMMAND_DOMAIN_STATUS,
  getProductCommandRecord,
  isProductCommandId,
});
