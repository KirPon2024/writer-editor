import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasContinuityFactLedgers } from './deriveAtlasContinuityFactLedgers.mjs';
import {
  ATLAS_CONTINUITY_FINDINGS_GENERATION_PROOF_SCHEMA_VERSION,
  ATLAS_CONTINUITY_FINDINGS_SCHEMA_VERSION,
  ATLAS_CONTINUITY_FINDING_SCHEMA_VERSION,
  ATLAS_CONTINUITY_OUTCOME_SCHEMA_VERSION,
  sortAtlasContinuityFindings,
  sortAtlasContinuityOutcomes,
} from './atlasContinuityFindingsTypes.mjs';

const VIEW_ID = 'derived.atlas.continuityFindings.v1';

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

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.continuityFindings'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.continuityFindings'] === false) return false;
  if (capabilities.atlasContinuityFindings === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.continuityFindings === false) return false;
  return true;
}

function buildAuthority() {
  return {
    sourceOfTruth: ['derived.atlas.continuityFactLedgers.v1'],
    readModelOnly: true,
    commandAuthority: 'none',
    commandIds: [],
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    automaticCorrection: false,
    automaticApply: false,
    hiddenMutation: false,
  };
}

function severityRank(severity) {
  if (severity === 'error') return '0-error';
  if (severity === 'warning') return '1-warning';
  return '2-info';
}

function sceneOrdinal(project, sceneId) {
  const ids = Object.keys(isPlainObject(project?.scenes) ? project.scenes : {}).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
  const index = ids.indexOf(sceneId);
  return index >= 0 ? index : 0;
}

function finding({ findingKind, severity, facts, summary, project }) {
  const factIds = uniqueSorted(facts.map((fact) => fact.id));
  const evidenceAnchorIds = uniqueSorted(facts.map((fact) => fact.evidenceAnchor?.anchorId));
  const sceneIds = uniqueSorted(facts.map((fact) => fact.sceneId));
  const subjectEntityIds = uniqueSorted(facts.map((fact) => fact.subjectEntityId));
  return {
    schemaVersion: ATLAS_CONTINUITY_FINDING_SCHEMA_VERSION,
    id: `atlas-continuity-finding:${hashCanonicalValue({ findingKind, factIds })}`,
    findingKind,
    severity,
    severityRank: severityRank(severity),
    status: 'evidenceBacked',
    summary,
    factIds,
    evidenceAnchorIds,
    sceneIds,
    sceneOrdinals: sceneIds.map((sceneId) => sceneOrdinal(project, sceneId)),
    subjectEntityIds,
    correctionApplied: false,
  };
}

function outcome({ outcomeKind, fact, summary, project }) {
  return {
    schemaVersion: ATLAS_CONTINUITY_OUTCOME_SCHEMA_VERSION,
    id: `atlas-continuity-outcome:${hashCanonicalValue({ outcomeKind, factId: fact.id })}`,
    outcomeKind,
    status: 'unknownOrInsufficientEvidence',
    summary,
    factId: fact.id,
    sceneId: fact.sceneId,
    sceneOrdinal: sceneOrdinal(project, fact.sceneId),
    subjectEntityId: fact.subjectEntityId,
    evidenceAnchorId: normalizeString(fact.evidenceAnchor?.anchorId),
  };
}

function groupFacts(facts, keyFn) {
  const groups = new Map();
  for (const fact of Array.isArray(facts) ? facts : []) {
    const key = keyFn(fact);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }
  return [...groups.values()];
}

function buildContradictionFindings(facts, project) {
  const source = facts.filter((fact) => ['location', 'knowledge', 'object'].includes(fact.ledgerKind));
  return groupFacts(source, (fact) => [
    fact.ledgerKind,
    fact.subjectEntityId,
    fact.sceneId,
    fact.factLabel,
  ].join(':')).flatMap((items) => {
    if (items[0].ledgerKind === 'location' && items.some((fact) => isDisappearanceValue(fact.factValue))) return [];
    const values = uniqueSorted(items.map((fact) => fact.factValue.toLowerCase()));
    if (values.length < 2) return [];
    return [finding({
      findingKind: `${items[0].ledgerKind.toUpperCase()}_CONTRADICTION`,
      severity: 'warning',
      facts: items,
      project,
      summary: `${items[0].ledgerKind} facts disagree for ${items[0].subjectEntityId} in ${items[0].sceneId}.`,
    })];
  });
}

function buildPromiseFindingsAndOutcomes(facts, project) {
  const findings = [];
  const outcomes = [];
  const promises = facts.filter((fact) => fact.ledgerKind === 'promise');
  for (const items of groupFacts(promises, (fact) => [fact.subjectEntityId, fact.factLabel, fact.factValue].join(':'))) {
    const states = uniqueSorted(items.map((fact) => fact.promiseState));
    if (states.includes('fulfilled') && states.includes('broken')) {
      findings.push(finding({
        findingKind: 'PROMISE_CONTRADICTION',
        severity: 'error',
        facts: items,
        project,
        summary: `Promise has both fulfilled and broken evidence for ${items[0].subjectEntityId}.`,
      }));
      continue;
    }
    if (states.includes('broken')) {
      findings.push(finding({
        findingKind: 'PROMISE_BROKEN',
        severity: 'warning',
        facts: items,
        project,
        summary: `Promise is marked broken for ${items[0].subjectEntityId}.`,
      }));
      continue;
    }
    if (states.includes('fulfilled')) {
      findings.push(finding({
        findingKind: 'PROMISE_FULFILLED',
        severity: 'info',
        facts: items,
        project,
        summary: `Promise is marked fulfilled for ${items[0].subjectEntityId}.`,
      }));
      continue;
    }
    for (const fact of items) {
      outcomes.push(outcome({
        outcomeKind: 'PROMISE_OUTCOME_UNKNOWN',
        fact,
        project,
        summary: 'Promise has no fulfilled or broken evidence yet.',
      }));
    }
  }
  return { findings, outcomes };
}

function isDisappearanceValue(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ['missing', 'absent', 'disappeared', 'unknown location'].includes(normalized);
}

function buildDisappearanceFindingsAndOutcomes(facts, project) {
  const findings = [];
  const outcomes = [];
  const locations = facts.filter((fact) => fact.ledgerKind === 'location');
  for (const items of groupFacts(locations, (fact) => fact.subjectEntityId)) {
    const missingFacts = items.filter((fact) => isDisappearanceValue(fact.factValue));
    const presentFacts = items.filter((fact) => !isDisappearanceValue(fact.factValue));
    if (missingFacts.length > 0 && presentFacts.length > 0) {
      findings.push(finding({
        findingKind: 'DISAPPEARANCE_RESOLVED_OR_CONFLICTING',
        severity: 'warning',
        facts: [...missingFacts, ...presentFacts],
        project,
        summary: `Location facts report both disappearance and later presence for ${items[0].subjectEntityId}.`,
      }));
      continue;
    }
    if (missingFacts.length > 0) {
      findings.push(finding({
        findingKind: 'DISAPPEARANCE_REPORTED',
        severity: 'warning',
        facts: missingFacts,
        project,
        summary: `Location facts report disappearance for ${items[0].subjectEntityId}.`,
      }));
      continue;
    }
    for (const fact of items) {
      outcomes.push(outcome({
        outcomeKind: 'DISAPPEARANCE_INSUFFICIENT_EVIDENCE',
        fact,
        project,
        summary: 'Location fact has no disappearance evidence.',
      }));
    }
  }
  return { findings, outcomes };
}

function buildEvidence({ findingsHash, sourceHash }) {
  return {
    schemaVersion: 'derived.atlas.continuityFindings.evidence.v1',
    findingsHash,
    sourceHash,
    guarantees: {
      localOnly: true,
      evidenceFirst: true,
      projectTruthMutation: false,
      manuscriptMutation: false,
      automaticCorrection: false,
      unknownOutcomesExplicit: true,
      sourceRevisionBound: true,
    },
  };
}

function emptyState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_CONTINUITY_FINDINGS_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    projectId,
    authority: buildAuthority(),
    summary: {
      findingCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      unknownOutcomeCount: 0,
      insufficientEvidenceOutcomeCount: 0,
      sourceHash: '',
      findingsHash: '',
      generationKey: '',
      invalidationKey: '',
    },
    findings: [],
    outcomes: [],
    generationProof: {
      schemaVersion: ATLAS_CONTINUITY_FINDINGS_GENERATION_PROOF_SCHEMA_VERSION,
      sourceHash: '',
      findingsHash: '',
      generationKey: '',
      sourceCoreStateHash: '',
      sourceInvalidationKey: '',
      matchesCurrentRevision: true,
    },
    evidence: buildEvidence({ findingsHash: '', sourceHash: '' }),
  };
}

function buildState({ project, projectId, ledgersResult, meta }) {
  const facts = Array.isArray(ledgersResult.value?.facts) ? ledgersResult.value.facts : [];
  const contradictionFindings = buildContradictionFindings(facts, project);
  const promise = buildPromiseFindingsAndOutcomes(facts, project);
  const disappearance = buildDisappearanceFindingsAndOutcomes(facts, project);
  const findings = sortAtlasContinuityFindings([
    ...contradictionFindings,
    ...promise.findings,
    ...disappearance.findings,
  ]);
  const outcomes = sortAtlasContinuityOutcomes([
    ...promise.outcomes,
    ...disappearance.outcomes,
  ]);
  const findingsHash = hashCanonicalValue({ findings, outcomes });
  const sourceHash = hashCanonicalValue({
    ledgerHash: normalizeString(ledgersResult.value?.summary?.ledgerHash),
    ledgerOutputHash: normalizeString(ledgersResult.meta?.outputHash),
    coreStateHash: normalizeString(meta.coreStateHash),
  });
  const generationKey = hashCanonicalValue({
    viewId: VIEW_ID,
    sourceHash,
    findingsHash,
    invalidationKey: meta.invalidationKey,
  });
  return {
    schemaVersion: ATLAS_CONTINUITY_FINDINGS_SCHEMA_VERSION,
    state: findings.length > 0 ? 'ready' : outcomes.length > 0 ? 'insufficientEvidence' : 'empty',
    unavailableReason: '',
    projectId,
    authority: buildAuthority(),
    summary: {
      findingCount: findings.length,
      errorCount: findings.filter((item) => item.severity === 'error').length,
      warningCount: findings.filter((item) => item.severity === 'warning').length,
      infoCount: findings.filter((item) => item.severity === 'info').length,
      unknownOutcomeCount: outcomes.filter((item) => item.outcomeKind.includes('UNKNOWN')).length,
      insufficientEvidenceOutcomeCount: outcomes.filter((item) => item.outcomeKind.includes('INSUFFICIENT')).length,
      sourceHash,
      findingsHash,
      generationKey,
      invalidationKey: meta.invalidationKey,
    },
    findings,
    outcomes,
    generationProof: {
      schemaVersion: ATLAS_CONTINUITY_FINDINGS_GENERATION_PROOF_SCHEMA_VERSION,
      sourceHash,
      findingsHash,
      generationKey,
      sourceCoreStateHash: meta.coreStateHash,
      sourceInvalidationKey: ledgersResult.value?.summary?.invalidationKey || '',
      matchesCurrentRevision: ledgersResult.meta?.coreStateHash === meta.coreStateHash,
    },
    evidence: buildEvidence({ findingsHash, sourceHash }),
  };
}

export function deriveAtlasContinuityFindings(input = {}) {
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
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError('E_CAPABILITY_DISABLED_FOR_COMMAND', VIEW_ID, 'ATLAS_CONTINUITY_FINDINGS_DISABLED', {
          capabilityId: 'atlas.continuityFindings',
        });
      }
      const project = getProject(coreState, params.projectId);
      if (!project) throw createDerivedError('E_ATLAS_PROJECT_NOT_FOUND', VIEW_ID, 'PROJECT_NOT_FOUND', { projectId: params.projectId });
      const ledgers = deriveAtlasContinuityFactLedgers({ coreState, params: { projectId: params.projectId }, capabilitySnapshot });
      if (!ledgers.ok) throw createDerivedError(ledgers.error?.code, VIEW_ID, ledgers.error?.reason, ledgers.error?.details);
      if ((Array.isArray(ledgers.value?.facts) ? ledgers.value.facts : []).length === 0) {
        return {
          ...emptyState(params.projectId),
          summary: {
            ...emptyState(params.projectId).summary,
            invalidationKey: meta.invalidationKey,
          },
        };
      }
      return buildState({ project, projectId: params.projectId, ledgersResult: ledgers, meta });
    },
  });
}

export { VIEW_ID as ATLAS_CONTINUITY_FINDINGS_VIEW_ID };
