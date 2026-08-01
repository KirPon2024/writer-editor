'use strict';

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
    return {
      ok: true,
      commandId: typeof deps.commandId === 'string' ? deps.commandId : 'cmd.project.review.exportDocxReviewPacket',
      exported: true,
      outPath,
      bytesWritten: documentBuffer.length,
      exportCapsule: sanitizeReviewDocxExportCapsule(built?.exportCapsule || source?.exportCapsule),
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
