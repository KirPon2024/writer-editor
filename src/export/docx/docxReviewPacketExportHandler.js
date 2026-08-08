'use strict';

const crypto = require('crypto');

function isPlainObjectValue(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getErrorMessage(error) {
  return error && typeof error.message === 'string' ? error.message : 'UNKNOWN';
}

function requireDependency(deps, name) {
  const value = deps && deps[name];
  if (typeof value !== 'function') {
    throw new Error(`E_DOCX_REVIEW_PACKET_EXPORT_HANDLER_DEP_MISSING:${name}`);
  }
  return value;
}

function sanitizeReviewDocxExportCapsule(value) {
  const source = isPlainObjectValue(value) ? value : {};
  const capsule = {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'yalken.rtk.word.product-review-docx-export.v1',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    scope: typeof source.scope === 'string' ? source.scope : '',
    fullManuscript: source.fullManuscript === true,
    sceneCount: Number.isInteger(source.sceneCount) ? source.sceneCount : 0,
    orderedSceneIds: Array.isArray(source.orderedSceneIds)
      ? source.orderedSceneIds.filter((sceneId) => typeof sceneId === 'string')
      : [],
    sceneId: typeof source.sceneId === 'string' ? source.sceneId : '',
    sceneRevision: typeof source.sceneRevision === 'string' ? source.sceneRevision : '',
    rawSha256: typeof source.rawSha256 === 'string' ? source.rawSha256 : '',
    fullBookRawSha256: typeof source.fullBookRawSha256 === 'string' ? source.fullBookRawSha256 : '',
    capabilityManifestDigest: typeof source.capabilityManifestDigest === 'string' ? source.capabilityManifestDigest : '',
    roundId: typeof source.roundId === 'string' ? source.roundId : '',
    exportId: typeof source.exportId === 'string' ? source.exportId : '',
    exportArtifactId: typeof source.exportArtifactId === 'string' ? source.exportArtifactId : '',
    semanticReturnId: typeof source.semanticReturnId === 'string' ? source.semanticReturnId : '',
    coreManifestDigest: typeof source.coreManifestDigest === 'string' ? source.coreManifestDigest : '',
    transportManifestDigest: typeof source.transportManifestDigest === 'string' ? source.transportManifestDigest : '',
    yrtk2TokenLength: Number.isInteger(source.yrtk2TokenLength) ? source.yrtk2TokenLength : 0,
    blockCount: Number.isInteger(source.blockCount) ? source.blockCount : 0,
    authorityCarrier: typeof source.authorityCarrier === 'string' ? source.authorityCarrier : 'customDocumentProperty',
    authorityPropertyName: typeof source.authorityPropertyName === 'string' ? source.authorityPropertyName : 'YRTK_C01_AUTH',
    secretEmbeddedInDocx: source.secretEmbeddedInDocx === true,
    automaticApplyCertified: source.automaticApplyCertified === true,
    productRuntimeWired: source.productRuntimeWired === true,
    returnIntakeWired: source.returnIntakeWired === true,
  };
  return capsule;
}

async function runDocxReviewPacketExport(payloadRaw, deps = {}) {
  const normalizeExportPayload = requireDependency(deps, 'normalizeExportPayload');
  const makeTypedReviewDocxExportError = requireDependency(deps, 'makeTypedReviewDocxExportError');
  const resolveDocxReviewPacketExportPath = requireDependency(deps, 'resolveDocxReviewPacketExportPath');
  const validateDocxExportTarget = requireDependency(deps, 'validateDocxExportTarget');
  const readDocxReviewPacketExportSource = requireDependency(deps, 'readDocxReviewPacketExportSource');
  const buildDocxReviewPacketBuffer = requireDependency(deps, 'buildDocxReviewPacketBuffer');
  const queueDiskOperation = requireDependency(deps, 'queueDiskOperation');
  const writeBufferAtomic = requireDependency(deps, 'writeBufferAtomic');
  const updateStatus = requireDependency(deps, 'updateStatus');
  const buildPathBoundaryDetails = typeof deps.buildPathBoundaryDetails === 'function'
    ? deps.buildPathBoundaryDetails
    : (error) => error;
  // EXPORT-01 (P0-09): post-write activation deps. The authority store is
  // persisted ONLY after a successful gate + atomic write + EXACT readback. Any
  // failure before activation leaves zero durable authority. These are optional
  // so the handler stays usable for callers that carry no authority store.
  const readWrittenBuffer = typeof deps.readWrittenBuffer === 'function' ? deps.readWrittenBuffer : null;
  const activateReviewDocxExportAuthority = typeof deps.activateReviewDocxExportAuthority === 'function'
    ? deps.activateReviewDocxExportAuthority
    : null;

  const payload = normalizeExportPayload(payloadRaw);
  if (!payload) {
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_PAYLOAD_INVALID', 'REVIEW_DOCX_EXPORT_PAYLOAD_INVALID');
  }
  if (payload.pathBoundaryError) {
    return makeTypedReviewDocxExportError(
      'E_REVIEW_DOCX_EXPORT_PATH_BOUNDARY_VIOLATION',
      'PATH_BOUNDARY_VIOLATION',
      buildPathBoundaryDetails(payload.pathBoundaryError),
    );
  }
  if (payload.bufferSource) {
    return makeTypedReviewDocxExportError(
      'E_REVIEW_DOCX_EXPORT_PAYLOAD_INVALID',
      'REVIEW_DOCX_EXPORT_BUFFER_SOURCE_FORBIDDEN',
    );
  }

  let outPath = '';
  try {
    outPath = await resolveDocxReviewPacketExportPath(payload);
  } catch (error) {
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_DIALOG_FAILED', 'REVIEW_DOCX_EXPORT_DIALOG_FAILED', {
      message: getErrorMessage(error),
    });
  }
  if (!outPath) {
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_CANCELED', 'EXPORT_DIALOG_CANCELED', {
      requestId: payload.requestId,
    });
  }

  try {
    const targetState = await validateDocxExportTarget(outPath, payload);
    if (!targetState || targetState.ok !== true) {
      return makeTypedReviewDocxExportError(
        'E_REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN',
        typeof targetState?.reason === 'string' && targetState.reason
          ? targetState.reason
          : 'REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN',
      );
    }
  } catch (error) {
    return makeTypedReviewDocxExportError(
      'E_REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN',
      typeof error?.reason === 'string' && error.reason
        ? error.reason
        : 'REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN',
    );
  }

  let source;
  try {
    source = await readDocxReviewPacketExportSource(payload);
  } catch (error) {
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_SOURCE_UNAVAILABLE', 'REVIEW_DOCX_EXPORT_SOURCE_UNAVAILABLE', {
      message: getErrorMessage(error),
    });
  }

  let built;
  try {
    built = await buildDocxReviewPacketBuffer(source);
  } catch (error) {
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_BUILD_FAILED', 'REVIEW_DOCX_EXPORT_BUILD_FAILED', {
      message: getErrorMessage(error),
    });
  }
  const documentBuffer = Buffer.isBuffer(built) ? built : built?.documentBuffer;
  if (!Buffer.isBuffer(documentBuffer) || documentBuffer.length === 0) {
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_BUILD_INVALID_OUTPUT', 'REVIEW_DOCX_EXPORT_BUILD_INVALID_OUTPUT', {
      isBuffer: Buffer.isBuffer(documentBuffer),
      bytes: Buffer.isBuffer(documentBuffer) ? documentBuffer.length : null,
    });
  }
  const exportCapsule = sanitizeReviewDocxExportCapsule(built?.exportCapsule || source?.exportCapsule);
  const publicationGate = isPlainObjectValue(built?.publicationGate) ? built.publicationGate : null;
  if (exportCapsule.fullManuscript === true) {
    const publicationGateReady = publicationGate
      && publicationGate.publishAllowed === true
      && publicationGate.ok === true
      && publicationGate.provisionalSelfParse?.verified === true
      && publicationGate.finalSelfParse?.semanticEquivalent === true
      && publicationGate.yrtk2Verification?.code === 'RTK_RETURN_INTAKE_YRTK2_VERIFIED';
    if (!publicationGateReady) {
      return makeTypedReviewDocxExportError(
        'E_REVIEW_DOCX_EXPORT_PUBLICATION_GATE_BLOCKED',
        typeof publicationGate?.code === 'string' && publicationGate.code
          ? publicationGate.code
          : 'REVIEW_DOCX_EXPORT_PUBLICATION_GATE_REQUIRED',
        isPlainObjectValue(publicationGate) ? {
          ...publicationGate,
          provisionalSelfParseVerified: publicationGate.provisionalSelfParse?.verified === true,
          finalSelfParseSemanticEquivalent: publicationGate.finalSelfParse?.semanticEquivalent === true,
          yrtk2Verified: publicationGate.yrtk2Verification?.code === 'RTK_RETURN_INTAKE_YRTK2_VERIFIED',
        } : {},
      );
    }
  }

  try {
    await queueDiskOperation(async () => {
      const targetState = await validateDocxExportTarget(outPath, payload);
      if (!targetState || targetState.ok !== true) {
        const error = new Error('REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN');
        error.reason = typeof targetState?.reason === 'string' && targetState.reason
          ? targetState.reason
          : 'REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN';
        throw error;
      }
      return writeBufferAtomic(outPath, documentBuffer);
    }, 'export review docx packet');
    updateStatus('Review DOCX экспортирован');
    // EXPORT-01 (P0-09): ACTIVATION phase. The authority store is persisted ONLY
    // after the published file is re-read and its sha256 matches the written
    // buffer byte-for-byte. A gate block, a write failure, or a readback
    // mismatch all leave ZERO durable authority for this round.
    const pendingAuthorityStore = isPlainObjectValue(source?.pendingAuthorityStore)
      ? source.pendingAuthorityStore
      : null;
    let activation = null;
    if (pendingAuthorityStore && activateReviewDocxExportAuthority) {
      const writtenDigest = crypto.createHash('sha256').update(documentBuffer).digest('hex');
      let readbackDigest = null;
      if (readWrittenBuffer) {
        const readBack = await readWrittenBuffer(outPath);
        if (Buffer.isBuffer(readBack)) {
          readbackDigest = crypto.createHash('sha256').update(readBack).digest('hex');
        }
      }
      if (!readbackDigest || readbackDigest !== writtenDigest) {
        return makeTypedReviewDocxExportError(
          'E_REVIEW_DOCX_EXPORT_ACTIVATION_READBACK_MISMATCH',
          'REVIEW_DOCX_EXPORT_ACTIVATION_READBACK_MISMATCH',
          { outPath, writtenDigest, readbackDigest },
        );
      }
      try {
        activation = await activateReviewDocxExportAuthority(pendingAuthorityStore);
      } catch (error) {
        return makeTypedReviewDocxExportError(
          'E_REVIEW_DOCX_EXPORT_ACTIVATION_FAILED',
          'REVIEW_DOCX_EXPORT_ACTIVATION_FAILED',
          { message: getErrorMessage(error), outPath },
        );
      }
    }
    return {
      ok: true,
      commandId: typeof deps.commandId === 'string' ? deps.commandId : 'cmd.project.review.exportDocxReviewPacket',
      exported: true,
      outPath,
      bytesWritten: documentBuffer.length,
      exportCapsule,
      activation,
      publicationGate: publicationGate ? {
        ok: publicationGate.ok === true,
        code: typeof publicationGate.code === 'string' ? publicationGate.code : '',
        publishAllowed: publicationGate.publishAllowed === true,
        finalArtifactSha256: typeof publicationGate.finalArtifactSha256 === 'string' ? publicationGate.finalArtifactSha256 : '',
        coreManifestDigest: typeof publicationGate.coreManifestDigest === 'string' ? publicationGate.coreManifestDigest : '',
        provisionalSelfParseVerified: publicationGate.provisionalSelfParse?.verified === true,
        finalSelfParseSemanticEquivalent: publicationGate.finalSelfParse?.semanticEquivalent === true,
        yrtk2Verified: publicationGate.yrtk2Verification?.code === 'RTK_RETURN_INTAKE_YRTK2_VERIFIED',
      } : null,
      canAutoApply: false,
      canWriteManuscript: false,
      canImportMutate: false,
    };
  } catch (error) {
    if (typeof error?.reason === 'string' && error.reason.startsWith('EXTERNAL_TARGET_')) {
      return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_TARGET_FORBIDDEN', error.reason);
    }
    return makeTypedReviewDocxExportError('E_REVIEW_DOCX_EXPORT_WRITE_FAILED', 'REVIEW_DOCX_EXPORT_WRITE_FAILED', {
      message: getErrorMessage(error),
      outPath,
    });
  }
}

module.exports = {
  runDocxReviewPacketExport,
  sanitizeReviewDocxExportCapsule,
};
