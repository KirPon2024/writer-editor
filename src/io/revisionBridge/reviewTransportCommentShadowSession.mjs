import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';
import { stableJson } from './reviewTransportCore.mjs';

export const RTK_COMMENT_SHADOW_SESSION_V1_SCHEMA =
  'yalken.rtk.comment-shadow-session.v1';
export const RTK_COMMENT_SHADOW_SESSION_RECEIPT_V1_SCHEMA =
  'yalken.rtk.comment-shadow-session-receipt.v1';
export const RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID =
  'cmd.rtk.reviewSession.importComments';

const SESSION_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-comment-shadow-sessions'];
const RECEIPT_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-comment-shadow-receipts'];
const MAX_THREADS = 2000;
const MAX_BODY_BYTES = 128 * 1024;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function makeReason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
}

function sha256Json(value) {
  return `sha256:${sha256Text(stableJson(value))}`;
}

function isSha256Identity(value) {
  return /^sha256:[a-f0-9]{64}$/u.test(normalizeString(value).toLowerCase());
}

function portableHashName(value) {
  const match = normalizeString(value).toLowerCase().match(/^sha256:([a-f0-9]{64})$/u);
  if (!match) throw new Error('RTK comment shadow key must be a sha256 identity');
  return match[1];
}

function block(reasons, details = {}) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    type: 'yalken.rtk.commentShadowSession',
    schemaVersion: RTK_COMMENT_SHADOW_SESSION_RECEIPT_V1_SCHEMA,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reason: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons: normalized,
    canWriteManuscript: false,
    manuscriptApplyAuthority: false,
    writerCalled: false,
    ...details,
  };
}

function projectRootFrom(input = {}) {
  return normalizeString(input.projectRoot || input.writerInput?.projectRoot);
}

async function ensureRealDirectory(rootPath, segments) {
  const root = path.resolve(rootPath);
  await fs.stat(root);
  let cursor = root;
  const rootReal = await fs.realpath(root);
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('RTK comment shadow directory must be a real directory');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(cursor);
    }
  }
  const directoryReal = await fs.realpath(cursor);
  const relative = path.relative(rootReal, directoryReal);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return cursor;
  }
  throw new Error('RTK comment shadow directory resolves outside project');
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function reviewIrFrom(input = {}) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  if (isPlainObject(input.parserResult?.reviewIr)) return input.parserResult.reviewIr;
  return {};
}

function normalizeAnchor(thread) {
  const placement = isPlainObject(thread.placement) ? thread.placement : {};
  const selectorStack = isPlainObject(placement.selectorStack) ? placement.selectorStack : {};
  return {
    outcome: normalizeString(placement.outcome || thread.status) || 'ORPHAN',
    anchored: placement.anchored === true || normalizeString(thread.status) === 'ANCHORED',
    anchorStart: Number.isSafeInteger(Number(thread.anchorStart)) ? Number(thread.anchorStart) : null,
    anchorEnd: Number.isSafeInteger(Number(thread.anchorEnd)) ? Number(thread.anchorEnd) : null,
    quotedAnchorText: rawString(thread.quotedAnchorText || selectorStack.exactQuote),
    selectorStack: {
      exactQuote: rawString(selectorStack.exactQuote || thread.quotedAnchorText),
      prefix: rawString(selectorStack.prefix),
      suffix: rawString(selectorStack.suffix),
      utf16Position: Number.isSafeInteger(Number(selectorStack.utf16Position))
        ? Number(selectorStack.utf16Position)
        : null,
    },
  };
}

function normalizeAuthor(thread) {
  const source = isPlainObject(thread.authorPersonIdentity) ? thread.authorPersonIdentity : {};
  return {
    author: rawString(source.author || thread.author),
    initials: rawString(source.initials || thread.initials),
    people: Array.isArray(source.people) ? cloneJsonSafe(source.people) : [],
  };
}

function normalizeRootCommentThread(thread, index, reasons) {
  const messages = Array.isArray(thread.messages) ? thread.messages.filter(isPlainObject) : [];
  const rootMessage = messages[0] || {};
  const threadId = normalizeString(thread.threadId || `rtk-comment-${thread.commentId || index}`);
  const commentId = normalizeString(thread.commentId || thread.rawId || thread.attributes?.id || rootMessage.messageId);
  const rawStatus = normalizeString(thread.status) || 'ORPHAN';
  const status = rawStatus === 'open' ? 'ANCHORED' : (rawStatus === 'resolved' ? 'RESOLVED' : rawStatus);
  const body = rawString(thread.body || thread.items?.[0]?.body || rootMessage.body);
  const replies = list(thread.replies).concat(messages.slice(1));

  if (!threadId || !commentId) {
    reasons.push(makeReason('RTK_COMMENT_UNSUPPORTED', `commentThreads.${index}`, 'Comment thread identity is required.'));
  }
  if (normalizeString(thread.parentThreadId)) {
    reasons.push(makeReason('RTK_COMMENT_UNSUPPORTED', `commentThreads.${index}.parentThreadId`, 'A03-C01 admits root comment threads only.'));
  }
  if (replies.length > 0) {
    reasons.push(makeReason('RTK_COMMENT_REPLY_NOT_PROMOTED', `commentThreads.${index}.replies`, 'Modern replies remain a typed limitation and are not promoted in A03-C01.'));
  }
  if (!['ANCHORED', 'ORPHAN', 'RESOLVED'].includes(status)) {
    reasons.push(makeReason('RTK_COMMENT_UNSUPPORTED', `commentThreads.${index}.status`, 'Unsupported comment outcome cannot enter the shadow session.', { status }));
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    reasons.push(makeReason('RTK_BUDGET_EXCEEDED', `commentThreads.${index}.body`, 'Comment body exceeds A03-C01 shadow import budget.'));
  }

  const anchor = normalizeAnchor(thread);
  return {
    kind: 'CommentThread',
    threadId,
    commentId,
    durableId: normalizeString(thread.durableId),
    body,
    bodyDigest: sha256Json({ commentId, body }),
    authorPersonIdentity: normalizeAuthor(thread),
    date: rawString(thread.date),
    status,
    anchor,
    orphanOutcome: status === 'ORPHAN' || anchor.outcome === 'ORPHAN',
    orderingKey: Number.isSafeInteger(Number(thread.orderingKey)) ? Number(thread.orderingKey) : index,
    reasonCodes: Array.isArray(thread.reasonCodes) ? thread.reasonCodes.map(normalizeString).filter(Boolean) : [],
    sourceXmlProvenanceDigest: thread.sourceXmlProvenance
      ? sha256Json(thread.sourceXmlProvenance)
      : '',
  };
}

function normalizeThreads(reviewIr) {
  const reasons = [];
  const placements = new Map(list(reviewIr.commentPlacements).map((placement) => [
    normalizeString(placement.threadId),
    placement,
  ]).filter(([threadId]) => Boolean(threadId)));
  const threads = list(reviewIr.commentThreads).map((thread, index) => {
    const threadId = normalizeString(thread.threadId);
    const placement = placements.get(threadId);
    return normalizeRootCommentThread({
      ...thread,
      quotedAnchorText: thread.quotedAnchorText || placement?.quote,
      placement: isPlainObject(thread.placement)
        ? thread.placement
        : (placement ? {
          outcome: placement.status === 'placed' ? 'ANCHORED' : 'ORPHAN',
          anchored: placement.status === 'placed',
          selectorStack: {
            exactQuote: placement.quote,
            prefix: placement.inlineRange?.prefix,
            suffix: placement.inlineRange?.suffix,
            utf16Position: placement.inlineRange?.start,
          },
        } : undefined),
    }, index, reasons);
  });
  if (threads.length === 0) {
    reasons.push(makeReason('RTK_COMMENT_UNSUPPORTED', 'reviewIr.commentThreads', 'A03-C01 requires at least one root comment thread.'));
  }
  if (threads.length > MAX_THREADS) {
    reasons.push(makeReason('RTK_BUDGET_EXCEEDED', 'reviewIr.commentThreads', 'Comment thread count exceeds V6 budget.'));
  }

  const seenThreadIds = new Set();
  const seenCommentIds = new Set();
  for (const thread of threads) {
    if (seenThreadIds.has(thread.threadId) || seenCommentIds.has(thread.commentId)) {
      reasons.push(makeReason('RTK_BLOCKED_DUPLICATE_TOKEN', 'reviewIr.commentThreads', 'Duplicate comment thread identity is blocked.'));
    }
    seenThreadIds.add(thread.threadId);
    seenCommentIds.add(thread.commentId);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    threads: threads.sort((left, right) => left.orderingKey - right.orderingKey),
  };
}

function summarizeThreads(threads) {
  const outcomeCounts = { ANCHORED: 0, ORPHAN: 0, RESOLVED: 0 };
  for (const thread of threads) {
    if (Object.prototype.hasOwnProperty.call(outcomeCounts, thread.status)) outcomeCounts[thread.status] += 1;
  }
  return {
    threadCount: threads.length,
    anchored: outcomeCounts.ANCHORED,
    orphan: outcomeCounts.ORPHAN,
    resolved: outcomeCounts.RESOLVED,
    replyCountPromoted: 0,
  };
}

function normalizeAuthenticatedReturnIdentity(input, reviewIr, roundId, returnArtifactId, semanticReturnId) {
  const source = isPlainObject(input.authenticatedReturnIdentity) ? input.authenticatedReturnIdentity : null;
  if (!source) {
    return {
      ok: true,
      binding: {
        schemaVersion: 'yalken.rtk.comment-shadow-authenticated-return-binding.v1',
        authenticated: false,
        bindingLevel: 'legacy-component-or-unbound-preview',
      },
    };
  }

  const binding = {
    schemaVersion: 'yalken.rtk.comment-shadow-authenticated-return-binding.v1',
    authenticated: source.authenticated === true,
    projectId: normalizeString(source.projectId),
    sceneId: normalizeString(source.sceneId),
    sceneRevision: normalizeString(source.sceneRevision),
    rawSha256: normalizeString(source.rawSha256).toLowerCase(),
    baselineHash: normalizeString(source.baselineHash).toLowerCase(),
    currentBaselineHash: normalizeString(source.currentBaselineHash).toLowerCase(),
    roundId: normalizeString(source.roundId),
    exportId: normalizeString(source.exportId),
    exportArtifactId: normalizeString(source.exportArtifactId),
    returnArtifactId: normalizeString(source.returnArtifactId),
    semanticReturnId: normalizeString(source.semanticReturnId),
    parserProfileDigest: normalizeString(source.parserProfileDigest),
    analysisDigest: normalizeString(source.analysisDigest),
  };
  const reasons = [];
  for (const field of [
    'projectId',
    'sceneId',
    'sceneRevision',
    'rawSha256',
    'baselineHash',
    'roundId',
    'exportId',
    'returnArtifactId',
    'semanticReturnId',
  ]) {
    if (!binding[field]) {
      reasons.push(makeReason('RTK_COMMENT_SHADOW_AUTHORITY_REQUIRED', `authenticatedReturnIdentity.${field}`, 'Authenticated comment shadow identity must bind project, scene, baseline, round and return artifact.'));
    }
  }
  if (binding.authenticated !== true) {
    reasons.push(makeReason('RTK_COMMENT_SHADOW_AUTHORITY_REQUIRED', 'authenticatedReturnIdentity.authenticated', 'Authenticated product return binding is required for persistent product comment shadow storage.'));
  }
  if (binding.rawSha256 && !isSha256Identity(binding.rawSha256)) {
    reasons.push(makeReason('RTK_COMMENT_SHADOW_AUTHORITY_INVALID', 'authenticatedReturnIdentity.rawSha256', 'rawSha256 must be a full lowercase sha256 identity.'));
  }
  if (binding.returnArtifactId && !isSha256Identity(binding.returnArtifactId)) {
    reasons.push(makeReason('RTK_COMMENT_SHADOW_AUTHORITY_INVALID', 'authenticatedReturnIdentity.returnArtifactId', 'returnArtifactId must be the full returned DOCX sha256 identity.'));
  }
  const reviewRoundId = normalizeString(reviewIr.roundId);
  const reviewReturnArtifactId = normalizeString(reviewIr.returnArtifactId);
  const reviewSemanticReturnId = normalizeString(reviewIr.semanticReturnId);
  const mismatches = [
    ['roundId', binding.roundId, roundId, reviewRoundId],
    ['returnArtifactId', binding.returnArtifactId, returnArtifactId, reviewReturnArtifactId],
    ['semanticReturnId', binding.semanticReturnId, semanticReturnId, reviewSemanticReturnId],
  ].filter(([, expected, topLevel, irValue]) => (
    expected
    && ((topLevel && expected !== topLevel) || (irValue && expected !== irValue))
  ));
  for (const [field] of mismatches) {
    reasons.push(makeReason('RTK_COMMENT_SHADOW_AUTHORITY_MISMATCH', `authenticatedReturnIdentity.${field}`, 'Authenticated product return binding must match command envelope and ReviewIR identities.'));
  }

  return {
    ok: reasons.length === 0,
    reasons,
    binding: {
      ...binding,
      bindingLevel: 'authenticated-product-return',
      bindingDigest: sha256Json(binding),
    },
  };
}

function buildSessionRecord(input = {}) {
  const reviewIr = reviewIrFrom(input);
  const normalized = normalizeThreads(reviewIr);
  const roundId = normalizeString(input.roundId || reviewIr.roundId);
  const returnArtifactId = normalizeString(input.returnArtifactId || reviewIr.returnArtifactId);
  const semanticReturnId = normalizeString(input.semanticReturnId || reviewIr.semanticReturnId);
  const identity = normalizeAuthenticatedReturnIdentity(input, reviewIr, roundId, returnArtifactId, semanticReturnId);
  const reasons = [
    ...(normalized.ok ? [] : normalized.reasons),
    ...(identity.ok ? [] : identity.reasons),
  ];
  if (reasons.length > 0) return { ok: false, reasons };
  if (!roundId || !semanticReturnId) {
    return {
      ok: false,
      reasons: [makeReason('RTK_WRITE_PRECONDITION_FAILED', 'roundId', 'roundId and semanticReturnId are required.')],
    };
  }
  const commentShadowDigest = sha256Json(normalized.threads);
  const identityPayload = {
    schemaVersion: RTK_COMMENT_SHADOW_SESSION_V1_SCHEMA,
    commandId: RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID,
    roundId,
    returnArtifactId,
    semanticReturnId,
    authenticatedReturnIdentity: identity.binding,
    commentShadowDigest,
  };
  const requestKey = sha256Json(identityPayload);
  const effectKey = sha256Json({
    roundId,
    semanticReturnId,
    authenticatedReturnIdentity: identity.binding,
    commentShadowDigest,
    lane: 'comments-shadow',
  });
  const record = {
    schemaVersion: RTK_COMMENT_SHADOW_SESSION_V1_SCHEMA,
    commandId: RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID,
    authorityLevel: {
      physicalWordProven: true,
      componentProven: true,
      productRuntimeWired: true,
      automaticApplyCertified: false,
    },
    roundId,
    returnArtifactId,
    semanticReturnId,
    authenticatedReturnIdentity: identity.binding,
    requestKey,
    effectKey,
    reviewIrDigest: sha256Json(reviewIr),
    commentShadowDigest,
    threads: normalized.threads,
    summary: summarizeThreads(normalized.threads),
    invariants: {
      manuscriptApplyAuthority: false,
      canWriteManuscript: false,
      parserAuthority: 'immutable-derived-analysis-only',
      commandAuthority: 'Command Kernel',
      reviewSessionMutation: 'comment-shadow-session-only',
      modernRepliesPromoted: false,
      resolveReopenPromoted: false,
      authenticatedProjectSceneBaselineBinding: identity.binding.authenticated === true,
    },
  };
  return { ok: true, record };
}

function buildReceipt(record, writeState = {}) {
  const storageEffects = isPlainObject(writeState.storageEffects)
    ? cloneJsonSafe(writeState.storageEffects)
    : {
      sessionRecordCreated: writeState.sessionRecordCreated === true,
      sessionRecordExisting: writeState.sessionRecordExisting === true,
      receiptCreated: writeState.receiptCreated === true,
      receiptExisting: writeState.receiptExisting === true,
      receiptRecovered: writeState.recoveredReceipt === true,
      bytesWritten: Number.isSafeInteger(Number(writeState.bytesWritten)) ? Number(writeState.bytesWritten) : 0,
      manuscriptBytesWritten: 0,
    };
  return {
    schemaVersion: RTK_COMMENT_SHADOW_SESSION_RECEIPT_V1_SCHEMA,
    commandId: RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID,
    status: writeState.status || 'committed',
    code: writeState.code || 'RTK_COMMENT_SHADOW_SESSION_COMMITTED',
    roundId: record.roundId,
    semanticReturnId: record.semanticReturnId,
    requestKey: record.requestKey,
    effectKey: record.effectKey,
    commentShadowDigest: record.commentShadowDigest,
    authenticatedReturnIdentity: cloneJsonSafe(record.authenticatedReturnIdentity),
    authenticatedReturnIdentityDigest: record.authenticatedReturnIdentity?.bindingDigest || '',
    threadCount: record.summary.threadCount,
    outcomeCounts: {
      anchored: record.summary.anchored,
      orphan: record.summary.orphan,
      resolved: record.summary.resolved,
    },
    authorityLevel: cloneJsonSafe(record.authorityLevel),
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      manuscriptMutation: 0,
      replyPromotion: 0,
      resolveReopenPromotion: 0,
    },
    writeOnce: true,
    idempotentReplay: writeState.replay === true,
    recoveredReceipt: writeState.recoveredReceipt === true,
    storageEffects,
    sessionRecordSha256: sha256Json(record),
  };
}

async function writeJsonOnce(filePath, value, options = {}) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await readJsonFile(filePath);
    if (stableJson(existing) !== stableJson(value)) {
      throw new Error('RTK comment shadow record is immutable and cannot be replaced');
    }
    return { ok: true, existing: true, bytesWritten: Buffer.byteLength(content, 'utf8') };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const result = await atomicWriteFile(filePath, content, {
    safetyMode: 'strict',
    afterTempWrite: options.afterTempWrite,
  });
  return { ok: true, existing: false, bytesWritten: result.bytesWritten };
}

export async function importRtkCommentShadowSession(input = {}, options = {}) {
  if (normalizeString(input.commandId || RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID) !== RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID) {
    return block(makeReason('RTK_COMMAND_AUTHORITY_BLOCKED', 'commandId', 'Unexpected command id for comment shadow import.'));
  }
  const projectRoot = projectRootFrom(input);
  if (!projectRoot) {
    return block(makeReason('RTK_WRITE_PRECONDITION_FAILED', 'projectRoot', 'projectRoot is required for comment shadow session storage.'));
  }
  const built = buildSessionRecord(input);
  if (!built.ok) return block(built.reasons);
  const record = built.record;
  const sessionDirectory = await ensureRealDirectory(projectRoot, SESSION_DIRECTORY_SEGMENTS);
  const receiptDirectory = await ensureRealDirectory(projectRoot, RECEIPT_DIRECTORY_SEGMENTS);
  const sessionPath = path.join(sessionDirectory, `${portableHashName(record.requestKey)}.json`);
  const receiptPath = path.join(receiptDirectory, `${portableHashName(record.requestKey)}.json`);

  const existingSession = await readJsonFile(sessionPath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (existingSession) {
    if (stableJson(existingSession) !== stableJson(record)) {
      return block(makeReason('RTK_COMMAND_ENVELOPE_TAMPERED', 'requestKey', 'Existing comment shadow session does not match rebuilt record.'));
    }
    let receipt = buildReceipt(record, {
      status: 'replay',
      code: 'RTK_ALREADY_ANALYZED',
      replay: true,
      storageEffects: {
        sessionRecordCreated: false,
        sessionRecordExisting: true,
        receiptCreated: false,
        receiptExisting: true,
        receiptRecovered: false,
        bytesWritten: 0,
        manuscriptBytesWritten: 0,
      },
    });
    const receiptExists = await readJsonFile(receiptPath).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    let recoveredReceipt = false;
    if (!receiptExists) {
      receipt = buildReceipt(record, {
        status: 'recovered-replay-receipt',
        code: 'RTK_WRITE_RECOVERED',
        replay: true,
        recoveredReceipt: true,
        storageEffects: {
          sessionRecordCreated: false,
          sessionRecordExisting: true,
          receiptCreated: true,
          receiptExisting: false,
          receiptRecovered: true,
          bytesWritten: 0,
          manuscriptBytesWritten: 0,
        },
      });
      const receiptWrite = await writeJsonOnce(receiptPath, receipt);
      receipt.storageEffects.bytesWritten = receiptWrite.bytesWritten;
      recoveredReceipt = true;
    }
    const storageEffects = cloneJsonSafe(receipt.storageEffects);
    return {
      ok: true,
      type: 'yalken.rtk.commentShadowSession',
      status: recoveredReceipt ? 'recovered-replay-receipt' : 'replay',
      code: recoveredReceipt ? 'RTK_WRITE_RECOVERED' : 'RTK_ALREADY_ANALYZED',
      applied: false,
      writerCalled: false,
      canWriteManuscript: false,
      manuscriptApplyAuthority: false,
      reviewSessionMutation: 'comment-shadow-session-only',
      session: cloneJsonSafe(record),
      receipt,
      storageEffects,
      sessionPath,
      receiptPath,
    };
  }

  let sessionWrite = null;
  let receiptWrite = null;
  try {
    sessionWrite = await writeJsonOnce(sessionPath, record, {
      afterTempWrite: options.simulateCrashAfterSessionTempWrite
        ? () => { throw new Error('A03_C01_SIMULATED_SESSION_TEMP_CRASH'); }
        : undefined,
    });
    const receipt = buildReceipt(record, {
      status: 'committed',
      code: 'RTK_COMMENT_SHADOW_SESSION_COMMITTED',
      storageEffects: {
        sessionRecordCreated: sessionWrite.existing !== true,
        sessionRecordExisting: sessionWrite.existing === true,
        receiptCreated: true,
        receiptExisting: false,
        receiptRecovered: false,
        bytesWritten: sessionWrite.bytesWritten,
        manuscriptBytesWritten: 0,
      },
    });
    receiptWrite = await writeJsonOnce(receiptPath, receipt, {
      afterTempWrite: options.simulateCrashAfterReceiptTempWrite
        ? () => { throw new Error('A03_C01_SIMULATED_RECEIPT_TEMP_CRASH'); }
        : undefined,
    });
    const storageEffects = {
      ...receipt.storageEffects,
      receiptCreated: receiptWrite.existing !== true,
      receiptExisting: receiptWrite.existing === true,
      bytesWritten: sessionWrite.bytesWritten + receiptWrite.bytesWritten,
      manuscriptBytesWritten: 0,
    };
    return {
      ok: true,
      type: 'yalken.rtk.commentShadowSession',
      status: 'committed',
      code: 'RTK_COMMENT_SHADOW_SESSION_COMMITTED',
      applied: false,
      writerCalled: false,
      canWriteManuscript: false,
      manuscriptApplyAuthority: false,
      reviewSessionMutation: 'comment-shadow-session-only',
      session: cloneJsonSafe(record),
      receipt,
      storageEffects,
      sessionPath,
      receiptPath,
    };
  } catch (error) {
    return block(makeReason('RTK_RECOVERY_REQUIRED', 'commentShadowSession', 'Comment shadow session write did not complete cleanly.', {
      errorCode: normalizeString(error?.code || error?.message),
    }), {
      requestKey: record.requestKey,
      sessionPath,
      receiptPath,
      storageEffects: {
        sessionRecordCreated: sessionWrite?.existing === false,
        sessionRecordExisting: sessionWrite?.existing === true,
        receiptCreated: receiptWrite?.existing === false,
        receiptExisting: receiptWrite?.existing === true,
        receiptRecovered: false,
        bytesWritten: Number(sessionWrite?.bytesWritten || 0) + Number(receiptWrite?.bytesWritten || 0),
        manuscriptBytesWritten: 0,
      },
    });
  }
}

export function createRtkCommentShadowSessionCommandHandler(options = {}) {
  return async function handleRtkCommentShadowSessionCommand(payload = {}) {
    return importRtkCommentShadowSession({
      ...payload,
      commandId: RTK_COMMENT_SHADOW_IMPORT_COMMAND_ID,
    }, options);
  };
}

export function buildRtkCommentShadowSessionPreview(input = {}) {
  const built = buildSessionRecord(input);
  if (!built.ok) return block(built.reasons);
  return {
    ok: true,
    type: 'yalken.rtk.commentShadowSession.preview',
    status: 'preview',
    canWriteManuscript: false,
    manuscriptApplyAuthority: false,
    session: built.record,
  };
}
