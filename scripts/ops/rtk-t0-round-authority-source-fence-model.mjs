import crypto from 'node:crypto';

const SCHEMAS = Object.freeze({
  envelope: 'yalken.rtk.exact-apply-command-envelope.v2',
  sourceFenceBinding: 'yalken.rtk.round-authority-source-fence.v1',
  sourceFenceRequest: 'yalken.sourceFence.request.v1',
  sourceFenceResult: 'yalken.sourceFence.result.v1',
  sourceFenceToken: 'yalken.sourceFence.token.v1',
});

const CODES = Object.freeze({
  READY: 'RTK_COMMAND_ENVELOPE_BOUND',
  SOURCE_FENCE_AUTHORITY_MISMATCH: 'RTK_SOURCE_FENCE_AUTHORITY_MISMATCH',
  SOURCE_FENCE_IDENTITY_MISMATCH: 'RTK_SOURCE_FENCE_IDENTITY_MISMATCH',
  SOURCE_FENCE_PURPOSE_INVALID: 'RTK_SOURCE_FENCE_PURPOSE_INVALID',
  SOURCE_FENCE_REJECTED: 'RTK_SOURCE_FENCE_REJECTED',
  SOURCE_FENCE_REQUIRED: 'RTK_SOURCE_FENCE_REQUIRED',
  SOURCE_FENCE_RESULT_MISMATCH: 'RTK_SOURCE_FENCE_RESULT_MISMATCH',
  SOURCE_FENCE_SCHEMA_INVALID: 'RTK_SOURCE_FENCE_SCHEMA_INVALID',
  COMMAND_AUTHORITY_BLOCKED: 'RTK_COMMAND_AUTHORITY_BLOCKED',
  STALE_REVISION: 'RTK_BLOCKED_STALE_REVISION',
  STALE_BYTES: 'RTK_BLOCKED_STALE_BYTES',
  PRECONDITION: 'RTK_WRITE_PRECONDITION_FAILED',
});

const SOURCE_FENCE_CODES = Object.freeze({
  ALLOWED: 'YALKEN_SOURCE_FENCE_ALLOWED',
  AUTHORITY_NOT_GRANTED: 'YALKEN_SOURCE_FENCE_AUTHORITY_NOT_GRANTED',
  CANONICAL_REVISION_STALE: 'YALKEN_SOURCE_FENCE_CANONICAL_REVISION_STALE',
  DIRTY_DOCUMENT_REJECTED: 'YALKEN_SOURCE_FENCE_DIRTY_DOCUMENT_REJECTED',
  DIRTY_STATE_UNKNOWN: 'YALKEN_SOURCE_FENCE_DIRTY_STATE_UNKNOWN',
  DOCUMENT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_DOCUMENT_ID_MISMATCH',
  FENCE_TRANSPLANT_REJECTED: 'YALKEN_SOURCE_FENCE_TRANSPLANT_REJECTED',
  KEYSET_INVALID: 'YALKEN_SOURCE_FENCE_KEYSET_INVALID',
  PROJECT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_PROJECT_ID_MISMATCH',
  PURPOSE_MISMATCH: 'YALKEN_SOURCE_FENCE_PURPOSE_MISMATCH',
  ROOT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_ROOT_ID_MISMATCH',
  SOURCE_DIGEST_MISMATCH: 'YALKEN_SOURCE_FENCE_SOURCE_DIGEST_MISMATCH',
  WORKING_REVISION_STALE: 'YALKEN_SOURCE_FENCE_WORKING_REVISION_STALE',
});

const SOURCE_HASH = sha256Text('source:Alpha beta gamma.');
const RAW_HASH = sha256Text('raw:Alpha beta gamma.');
const OTHER_HASH = sha256Text('other');

const BASE_IDENTITY = Object.freeze({
  sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
  writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
  projectId: 'project-t0',
  rootId: 'root-t0',
  documentId: 'scene-1',
  canonicalRevision: SOURCE_HASH,
  workingRevision: SOURCE_HASH,
  revisionSha256: SOURCE_HASH,
  rawBytesSha256: RAW_HASH,
});

export const T0_ROUND_AUTHORITY_SOURCE_FENCE_MUTATION_CATALOG = Object.freeze([
  'allow-missing-source-fence',
  'trust-caller-carried-allow',
  'ignore-source-fence-deny',
  'ignore-source-fence-purpose',
  'ignore-command-id-binding',
  'ignore-project-identity',
  'ignore-root-identity',
  'ignore-document-identity',
  'ignore-writer-target-document',
  'ignore-canonical-revision',
  'ignore-working-revision',
  'ignore-source-digest',
  'allow-unknown-authority',
  'allow-abstain-authority',
  'allow-conflicting-authority',
  'omit-source-fence-digest-from-request-key',
  'omit-source-fence-digest-from-effect-key',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function sha256Json(value) {
  return sha256Text(stableJson(value));
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000');
}

function tokenDigestPayload(source, purpose = 'WRITE_SOURCE') {
  return {
    schemaVersion: SCHEMAS.sourceFenceToken,
    purpose,
    projectId: source.projectId,
    rootId: source.rootId,
    documentId: source.documentId,
    canonicalRevision: source.canonicalRevision,
    workingRevision: source.workingRevision,
    sourceDigest: source.sourceDigest,
  };
}

function sourceFenceToken(source, purpose = 'WRITE_SOURCE') {
  const payload = tokenDigestPayload(source, purpose);
  return { ...payload, fenceDigest: sha256Json(payload) };
}

function sourceFenceOracle(request, skip = new Set()) {
  if (!exactKeys(request, ['authority', 'current', 'dirtyPolicy', 'expected', 'fence', 'purpose', 'schemaVersion'])) {
    return sourceFenceResult(false, SOURCE_FENCE_CODES.KEYSET_INVALID, request, [{
      code: SOURCE_FENCE_CODES.KEYSET_INVALID,
      field: 'request',
    }]);
  }
  const { expected, current, fence, authority } = request;
  const reasons = [];
  const pushReason = (code, field, expectedValue, actualValue) => {
    const entry = { code, field };
    if (expectedValue !== undefined) entry.expected = expectedValue;
    if (actualValue !== undefined) entry.actual = actualValue;
    reasons.push(entry);
  };
  if (request.purpose !== fence.purpose) {
    pushReason(SOURCE_FENCE_CODES.PURPOSE_MISMATCH, 'purpose', fence.purpose, request.purpose);
  }
  if (!skip.has('fence')) {
    const expectedFenceDigest = sha256Json(tokenDigestPayload(fence, fence.purpose));
    if (fence.fenceDigest !== expectedFenceDigest) {
      pushReason(SOURCE_FENCE_CODES.FENCE_TRANSPLANT_REJECTED, 'fence.fenceDigest', expectedFenceDigest, fence.fenceDigest);
    }
    for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'sourceDigest']) {
      if (expected[key] !== fence[key]) {
        pushReason(SOURCE_FENCE_CODES.FENCE_TRANSPLANT_REJECTED, `fence.${key}`, expected[key], fence[key]);
      }
    }
  }
  if (!skip.has('project') && expected.projectId !== current.projectId) {
    pushReason(SOURCE_FENCE_CODES.PROJECT_ID_MISMATCH, 'current.projectId', expected.projectId, current.projectId);
  }
  if (!skip.has('root') && expected.rootId !== current.rootId) {
    pushReason(SOURCE_FENCE_CODES.ROOT_ID_MISMATCH, 'current.rootId', expected.rootId, current.rootId);
  }
  if (!skip.has('document') && expected.documentId !== current.documentId) {
    pushReason(SOURCE_FENCE_CODES.DOCUMENT_ID_MISMATCH, 'current.documentId', expected.documentId, current.documentId);
  }
  if (!skip.has('canonical') && expected.canonicalRevision !== current.canonicalRevision) {
    pushReason(SOURCE_FENCE_CODES.CANONICAL_REVISION_STALE, 'current.canonicalRevision', expected.canonicalRevision, current.canonicalRevision);
  }
  if (!skip.has('working') && expected.workingRevision !== current.workingRevision) {
    pushReason(SOURCE_FENCE_CODES.WORKING_REVISION_STALE, 'current.workingRevision', expected.workingRevision, current.workingRevision);
  }
  if (!skip.has('digest') && expected.sourceDigest !== current.sourceDigest) {
    pushReason(SOURCE_FENCE_CODES.SOURCE_DIGEST_MISMATCH, 'current.sourceDigest', expected.sourceDigest, current.sourceDigest);
  }
  if (!skip.has('dirty') && ['UNKNOWN', 'ABSTAIN', 'CONFLICTING'].includes(current.dirtyState)) {
    pushReason(SOURCE_FENCE_CODES.DIRTY_STATE_UNKNOWN, 'current.dirtyState', 'CLEAN_OR_DIRTY', current.dirtyState);
  } else if (!skip.has('dirty') && current.dirtyState === 'DIRTY') {
    pushReason(SOURCE_FENCE_CODES.DIRTY_DOCUMENT_REJECTED, 'current.dirtyState', 'CLEAN', current.dirtyState);
  }
  const requiredMayWrite = request.purpose === 'READ_SOURCE_SNAPSHOT' ? false : true;
  if (!skip.has('authority') && (authority.decision !== 'ALLOW' || authority.mayWrite !== requiredMayWrite)) {
    if (!['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING'].includes(authority.decision)) {
      pushReason(SOURCE_FENCE_CODES.AUTHORITY_NOT_GRANTED, 'authority.decision', ['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING'], authority.decision);
    }
    pushReason(SOURCE_FENCE_CODES.AUTHORITY_NOT_GRANTED, 'authority');
  }
  const code = reasons[0]?.code || SOURCE_FENCE_CODES.ALLOWED;
  return sourceFenceResult(code === SOURCE_FENCE_CODES.ALLOWED, code, request, reasons);
}

function sourceFenceResult(ok, code, request, reasons = []) {
  const current = isPlainObject(request?.current) ? request.current : {};
  return {
    schemaVersion: SCHEMAS.sourceFenceResult,
    ok,
    decision: ok ? 'ALLOW' : 'DENY',
    code,
    reasons: ok ? [] : reasons,
    observed: {
      purpose: typeof request?.purpose === 'string' ? request.purpose : '',
      projectId: typeof current.projectId === 'string' ? current.projectId : '',
      rootId: typeof current.rootId === 'string' ? current.rootId : '',
      documentId: typeof current.documentId === 'string' ? current.documentId : '',
      canonicalRevision: typeof current.canonicalRevision === 'string' ? current.canonicalRevision : '',
      workingRevision: typeof current.workingRevision === 'string' ? current.workingRevision : '',
      sourceDigest: typeof current.sourceDigest === 'string' ? current.sourceDigest : '',
      dirtyState: typeof current.dirtyState === 'string' ? current.dirtyState : '',
      dirtyPolicy: typeof request?.dirtyPolicy === 'string' ? request.dirtyPolicy : '',
    },
  };
}

function sourceFromIdentity(identity) {
  return {
    projectId: identity.projectId,
    rootId: identity.rootId,
    documentId: identity.documentId,
    canonicalRevision: identity.canonicalRevision,
    workingRevision: identity.workingRevision,
    sourceDigest: identity.rawBytesSha256,
  };
}

function buildSourceFenceBinding(overrides = {}) {
  const identity = { ...BASE_IDENTITY, ...(overrides.identity || {}) };
  const source = sourceFromIdentity(identity);
  const expected = { ...source, ...(overrides.expected || {}) };
  const current = { ...source, dirtyState: 'CLEAN', ...(overrides.current || {}) };
  const purpose = overrides.purpose || 'WRITE_SOURCE';
  const request = {
    schemaVersion: SCHEMAS.sourceFenceRequest,
    purpose,
    expected,
    current,
    dirtyPolicy: overrides.dirtyPolicy || 'REQUIRE_CLEAN',
    authority: {
      decision: overrides.authorityDecision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? true,
      commandId: overrides.commandId || 'cmd-t0',
    },
    fence: sourceFenceToken({ ...expected, ...(overrides.fenceSource || {}) }, purpose),
  };
  return {
    schemaVersion: SCHEMAS.sourceFenceBinding,
    request,
    result: overrides.result || sourceFenceOracle(request),
  };
}

function textChange(overrides = {}) {
  return {
    changeId: overrides.changeId || 'change-beta',
    targetScope: { type: 'scene', id: overrides.sceneId || 'scene-1' },
    match: { kind: 'exact', quote: 'beta' },
    replacementText: 'delta',
  };
}

function buildInput(overrides = {}) {
  const commandId = overrides.commandId || 'cmd-t0';
  const sourceIdentity = { ...BASE_IDENTITY, ...(overrides.sourceIdentity || {}) };
  const currentIdentity = {
    projectId: sourceIdentity.projectId,
    rootId: sourceIdentity.rootId,
    documentId: sourceIdentity.documentId,
    canonicalRevision: sourceIdentity.canonicalRevision,
    workingRevision: sourceIdentity.workingRevision,
    revisionSha256: sourceIdentity.revisionSha256,
    rawBytesSha256: sourceIdentity.rawBytesSha256,
    ...(overrides.currentIdentity || {}),
  };
  const changes = overrides.changes || [textChange(overrides.textChange || {})];
  return {
    callerRole: overrides.callerRole || 'main',
    commandAuthority: {
      issuer: overrides.authorityIssuer || 'main',
      intent: overrides.intent || 'rtk.exactApply',
      commandId,
    },
    roundId: overrides.roundId || 'round-t0',
    requestId: overrides.requestId || 'request-t0',
    exportIdentity: 'export-t0',
    returnArtifactSha256: sha256Text('return-t0'),
    manifestDigest: sha256Text('manifest-t0'),
    analysisDigest: sha256Text('analysis-t0'),
    returnLifecycleState: overrides.returnLifecycleState || 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: 'RTK_EXACT_APPLICABLE',
      commentLane: 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity,
    currentIdentity,
    sourceFence: Object.prototype.hasOwnProperty.call(overrides, 'sourceFence')
      ? overrides.sourceFence
      : buildSourceFenceBinding({ commandId, identity: sourceIdentity }),
    writerInput: {
      projectRoot: '/synthetic/t0',
      projectSnapshot: {
        projectId: overrides.writerProjectId || 'project-t0',
        baselineHash: 'baseline-t0',
        scenes: [{ sceneId: 'scene-1', text: 'Alpha beta gamma.' }],
      },
      revisionSession: {
        projectId: overrides.writerProjectId || 'project-t0',
        baselineHash: 'baseline-t0',
        sessionId: 'session-t0',
        reviewGraph: { textChanges: changes },
      },
      reviewItems: changes,
    },
  };
}

function sourceFenceDigestForBinding(binding) {
  const computed = sourceFenceOracle(binding.request);
  return sha256Json({
    schemaVersion: SCHEMAS.sourceFenceBinding,
    purpose: 'WRITE_SOURCE',
    sourceFenceCode: computed.code,
    observed: computed.observed,
  });
}

function independentOracle(input, options = {}) {
  const skip = new Set(options.skip || []);
  if (!isPlainObject(input)) return { ok: false, code: CODES.PRECONDITION };
  if (input.callerRole !== 'main' || input.commandAuthority?.issuer !== 'main' || input.commandAuthority?.intent !== 'rtk.exactApply' || !input.commandAuthority?.commandId) {
    return { ok: false, code: CODES.COMMAND_AUTHORITY_BLOCKED };
  }
  if (input.sourceIdentity?.sourceTokenDomain !== 'SOURCE_TOKEN_DOMAIN_V1' || input.sourceIdentity?.writerTextDomain !== 'WRITER_TEXT_DOMAIN_V1') {
    return { ok: false, code: CODES.PRECONDITION };
  }
  if (!input.sourceIdentity?.revisionSha256 || input.sourceIdentity.revisionSha256 !== input.currentIdentity?.revisionSha256) {
    return { ok: false, code: CODES.STALE_REVISION };
  }
  if (!input.sourceIdentity?.rawBytesSha256 || input.sourceIdentity.rawBytesSha256 !== input.currentIdentity?.rawBytesSha256) {
    return { ok: false, code: CODES.STALE_BYTES };
  }

  const binding = input.sourceFence;
  if (!skip.has('missingFence') && !isPlainObject(binding)) return { ok: false, code: CODES.SOURCE_FENCE_REQUIRED };
  if (!isPlainObject(binding)) return { ok: true, code: CODES.READY };
  if (!exactKeys(binding, ['request', 'result', 'schemaVersion']) || binding.schemaVersion !== SCHEMAS.sourceFenceBinding) {
    return { ok: false, code: CODES.SOURCE_FENCE_SCHEMA_INVALID };
  }
  const computed = sourceFenceOracle(binding.request, skip);
  const effective = skip.has('trustCallerResult') && isPlainObject(binding.result) ? binding.result : computed;
  if (!skip.has('trustCallerResult') && stableJson(binding.result) !== stableJson(computed)) {
    return { ok: false, code: CODES.SOURCE_FENCE_RESULT_MISMATCH };
  }
  if (!skip.has('purpose') && binding.request?.purpose !== 'WRITE_SOURCE') {
    return { ok: false, code: CODES.SOURCE_FENCE_PURPOSE_INVALID };
  }
  if (!skip.has('command') && binding.request?.authority?.commandId !== input.commandAuthority.commandId) {
    return { ok: false, code: CODES.SOURCE_FENCE_AUTHORITY_MISMATCH };
  }
  if (!skip.has('deny') && (!effective.ok || effective.decision !== 'ALLOW' || effective.code !== SOURCE_FENCE_CODES.ALLOWED)) {
    return { ok: false, code: CODES.SOURCE_FENCE_REJECTED };
  }

  const observed = effective.observed;
  const mismatches = [];
  const compare = (field, expected, actual, skipKey = field) => {
    if (!skip.has(skipKey) && expected && expected !== actual) mismatches.push(field);
  };
  for (const required of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision']) {
    if (!skip.has(required) && !input.sourceIdentity?.[required]) mismatches.push(required);
  }
  compare('projectId', input.sourceIdentity?.projectId, observed.projectId, 'project');
  compare('rootId', input.sourceIdentity?.rootId, observed.rootId, 'root');
  compare('documentId', input.sourceIdentity?.documentId, observed.documentId, 'document');
  compare('canonicalRevision', input.sourceIdentity?.canonicalRevision, observed.canonicalRevision, 'canonical');
  compare('workingRevision', input.sourceIdentity?.workingRevision, observed.workingRevision, 'working');
  compare('sourceRevisionSha256', input.sourceIdentity?.revisionSha256, observed.canonicalRevision, 'canonical');
  compare('sourceRawBytesSha256', input.sourceIdentity?.rawBytesSha256, observed.sourceDigest, 'digest');
  compare('currentRevisionSha256', input.currentIdentity?.revisionSha256, observed.canonicalRevision, 'canonical');
  compare('currentRawBytesSha256', input.currentIdentity?.rawBytesSha256, observed.sourceDigest, 'digest');
  compare('writerProject', input.writerInput?.projectSnapshot?.projectId, observed.projectId, 'project');
  for (const change of input.writerInput?.reviewItems || []) {
    compare('writerTargetDocument', change?.targetScope?.id, observed.documentId, 'writerTarget');
  }
  if (mismatches.length > 0) return { ok: false, code: CODES.SOURCE_FENCE_IDENTITY_MISMATCH };

  return { ok: true, code: CODES.READY };
}

function expectedRequestKey(input, includeSourceFenceDigest = true) {
  return sha256Json({
    schemaVersion: SCHEMAS.envelope,
    kind: 'request',
    roundId: input.roundId,
    requestId: input.requestId,
    commandId: input.commandAuthority.commandId,
    returnArtifactSha256: input.returnArtifactSha256,
    manifestDigest: input.manifestDigest,
    analysisDigest: input.analysisDigest,
    ...(includeSourceFenceDigest ? { sourceFenceDigest: sourceFenceDigestForBinding(input.sourceFence) } : {}),
  });
}

function expectedEffectKey(input, writerInputDigest, includeSourceFenceDigest = true) {
  return sha256Json({
    schemaVersion: SCHEMAS.envelope,
    kind: 'effect',
    roundId: input.roundId,
    lifecycleState: input.returnLifecycleState,
    exportIdentity: input.exportIdentity,
    sourceRevisionSha256: input.sourceIdentity.revisionSha256,
    sourceRawBytesSha256: input.sourceIdentity.rawBytesSha256,
    ...(includeSourceFenceDigest ? { sourceFenceDigest: sourceFenceDigestForBinding(input.sourceFence) } : {}),
    writerInputDigest,
  });
}

function finiteCases() {
  const cases = [
    { id: 'valid', input: buildInput() },
    { id: 'missing-source-fence', input: buildInput({ sourceFence: null }) },
    { id: 'forged-allow-dirty-current', input: (() => {
      const valid = buildSourceFenceBinding();
      return buildInput({ sourceFence: buildSourceFenceBinding({ current: { dirtyState: 'DIRTY' }, result: valid.result }) });
    })() },
    { id: 'source-fence-deny-dirty', input: buildInput({ sourceFence: buildSourceFenceBinding({ current: { dirtyState: 'DIRTY' } }) }) },
    { id: 'source-fence-deny-canonical', input: buildInput({ sourceFence: buildSourceFenceBinding({ current: { canonicalRevision: OTHER_HASH } }) }) },
    { id: 'source-fence-transplant-project', input: buildInput({ sourceFence: buildSourceFenceBinding({ fenceSource: { projectId: 'project-other' } }) }) },
    { id: 'read-source-snapshot-purpose', input: buildInput({ sourceFence: buildSourceFenceBinding({ purpose: 'READ_SOURCE_SNAPSHOT', mayWrite: false }) }) },
    { id: 'command-id-mismatch', input: buildInput({ commandId: 'cmd-a', sourceFence: buildSourceFenceBinding({ commandId: 'cmd-b' }) }) },
    { id: 'project-identity-mismatch', input: buildInput({ sourceIdentity: { projectId: 'project-other' }, sourceFence: buildSourceFenceBinding() }) },
    { id: 'root-identity-mismatch', input: buildInput({ sourceIdentity: { rootId: 'root-other' }, sourceFence: buildSourceFenceBinding() }) },
    { id: 'document-identity-mismatch', input: buildInput({ sourceIdentity: { documentId: 'scene-other' }, sourceFence: buildSourceFenceBinding() }) },
    { id: 'writer-target-document-mismatch', input: buildInput({ textChange: { sceneId: 'scene-other' } }) },
    { id: 'canonical-identity-mismatch', input: buildInput({ sourceIdentity: { canonicalRevision: OTHER_HASH }, sourceFence: buildSourceFenceBinding() }) },
    { id: 'working-identity-mismatch', input: buildInput({ sourceIdentity: { workingRevision: OTHER_HASH }, sourceFence: buildSourceFenceBinding() }) },
    { id: 'source-digest-mismatch', input: buildInput({ sourceIdentity: { rawBytesSha256: OTHER_HASH }, sourceFence: buildSourceFenceBinding() }) },
    { id: 'stale-current-revision', input: buildInput({ currentIdentity: { revisionSha256: OTHER_HASH } }) },
    { id: 'stale-current-bytes', input: buildInput({ currentIdentity: { rawBytesSha256: OTHER_HASH } }) },
  ];
  for (const decision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    cases.push({
      id: `authority-${decision.toLowerCase()}`,
      input: buildInput({
        commandId: `cmd-${decision.toLowerCase()}`,
        sourceFence: buildSourceFenceBinding({
          commandId: `cmd-${decision.toLowerCase()}`,
          authorityDecision: decision,
        }),
      }),
    });
  }
  return cases;
}

const MUTANT_SKIPS = Object.freeze({
  'allow-missing-source-fence': ['missingFence'],
  'trust-caller-carried-allow': ['trustCallerResult'],
  'ignore-source-fence-deny': ['deny', 'dirty', 'authority', 'canonical', 'working', 'digest', 'project', 'root', 'document', 'fence'],
  'ignore-source-fence-purpose': ['purpose'],
  'ignore-command-id-binding': ['command'],
  'ignore-project-identity': ['project'],
  'ignore-root-identity': ['root'],
  'ignore-document-identity': ['document'],
  'ignore-writer-target-document': ['writerTarget'],
  'ignore-canonical-revision': ['canonical'],
  'ignore-working-revision': ['working'],
  'ignore-source-digest': ['digest'],
  'allow-unknown-authority': ['authority', 'deny'],
  'allow-abstain-authority': ['authority', 'deny'],
  'allow-conflicting-authority': ['authority', 'deny'],
});

function mutationVictim(mutantId, cases) {
  if (mutantId === 'omit-source-fence-digest-from-request-key') {
    const input = buildInput();
    return expectedRequestKey(input, true) !== expectedRequestKey(input, false);
  }
  if (mutantId === 'omit-source-fence-digest-from-effect-key') {
    const input = buildInput();
    const writerInputDigest = sha256Json({ synthetic: 'writerInputDigest' });
    return expectedEffectKey(input, writerInputDigest, true) !== expectedEffectKey(input, writerInputDigest, false);
  }
  const skip = new Set(MUTANT_SKIPS[mutantId] || []);
  return cases.some((entry) => {
    const oracle = independentOracle(entry.input);
    const mutant = independentOracle(entry.input, { skip });
    return oracle.ok === false && mutant.ok === true;
  });
}

function actualCode(result) {
  return result?.code || result?.reason || '';
}

export async function runT0RoundAuthoritySourceFenceModel() {
  const { buildRtkExactApplyCommandEnvelope } = await import('../../src/io/revisionBridge/reviewTransportApplyCore.mjs');
  const cryptoPort = { sha256Text: (value) => sha256Text(value).replace(/^sha256:/u, ''), sha256Json };
  const cases = finiteCases();
  const results = [];
  for (const entry of cases) {
    const expected = independentOracle(entry.input);
    const actual = buildRtkExactApplyCommandEnvelope(entry.input, { cryptoPort });
    results.push({
      id: entry.id,
      expected,
      actual: { ok: actual.ok, code: actualCode(actual) },
      pass: expected.ok === actual.ok && expected.code === actualCode(actual),
    });
  }
  const disagreements = results.filter((entry) => !entry.pass);
  const mutants = T0_ROUND_AUTHORITY_SOURCE_FENCE_MUTATION_CATALOG.map((id) => ({
    id,
    killed: mutationVictim(id, cases),
  }));
  return {
    schemaVersion: 'yalken.rtk.t0-round-authority-source-fence-model.v1',
    finiteCases: cases.length,
    hostileCases: cases.filter((entry) => independentOracle(entry.input).ok === false).length,
    disagreements: disagreements.length,
    disagreementIds: disagreements.map((entry) => entry.id),
    mutants: mutants.length,
    survivors: mutants.filter((entry) => !entry.killed).length,
    survivorIds: mutants.filter((entry) => !entry.killed).map((entry) => entry.id),
    requestKeyBindsSourceFenceDigest: mutationVictim('omit-source-fence-digest-from-request-key', cases),
    effectKeyBindsSourceFenceDigest: mutationVictim('omit-source-fence-digest-from-effect-key', cases),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runT0RoundAuthoritySourceFenceModel();
  console.log(JSON.stringify(report, null, 2));
  if (report.disagreements !== 0 || report.survivors !== 0) process.exitCode = 1;
}
