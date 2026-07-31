const DEFAULT_AUTHORITY_PLATFORM_ID = 'node';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function buildPlatformCapabilityMap(matrixDoc) {
  const map = new Map();
  const items = Array.isArray(matrixDoc && matrixDoc.items) ? matrixDoc.items : [];
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const platformId = typeof item.platformId === 'string' ? item.platformId.trim() : '';
    if (!platformId) continue;
    const capabilities = isPlainObject(item.capabilities) ? item.capabilities : {};
    if (!map.has(platformId)) {
      map.set(platformId, capabilities);
    }
  }
  return map;
}

function makeCapabilityAuthorityDenied(commandId, code, reason, details = {}) {
  return {
    ok: false,
    error: {
      code,
      op: commandId || '',
      reason,
      details: {
        commandAuthority: 'CommandKernel',
        mutationApplied: false,
        storageWritten: false,
        ...details,
      },
    },
  };
}

function evaluateCommandCapabilityAuthority(input = {}) {
  const commandId = typeof input.commandId === 'string' ? input.commandId.trim() : '';
  const capabilityId = typeof input.capabilityId === 'string' ? input.capabilityId.trim() : '';
  const platformId = typeof input.platformId === 'string' && input.platformId.trim()
    ? input.platformId.trim()
    : DEFAULT_AUTHORITY_PLATFORM_ID;
  const matrixDoc = input.matrixDoc;

  if (!commandId || !capabilityId) {
    return makeCapabilityAuthorityDenied(
      commandId,
      'E_CAPABILITY_ENFORCEMENT_MISSING',
      'CAPABILITY_ENFORCEMENT_MISSING',
      { platformId, capabilityId, commandId },
    );
  }

  if (!isPlainObject(matrixDoc)) {
    return makeCapabilityAuthorityDenied(
      commandId,
      'E_CAPABILITY_MATRIX_UNAVAILABLE',
      'CAPABILITY_MATRIX_UNAVAILABLE',
      { platformId, capabilityId, commandId },
    );
  }

  const platformMap = buildPlatformCapabilityMap(matrixDoc);
  const capabilities = platformMap.get(platformId);
  if (!isPlainObject(capabilities)) {
    return makeCapabilityAuthorityDenied(
      commandId,
      'E_UNSUPPORTED_PLATFORM',
      'UNSUPPORTED_PLATFORM',
      { platformId, capabilityId, commandId },
    );
  }

  if (!(capabilityId in capabilities)) {
    return makeCapabilityAuthorityDenied(
      commandId,
      'E_CAPABILITY_MISSING',
      'CAPABILITY_MISSING',
      { platformId, capabilityId, commandId },
    );
  }

  if (capabilities[capabilityId] !== true) {
    return makeCapabilityAuthorityDenied(
      commandId,
      'E_CAPABILITY_DISABLED_FOR_COMMAND',
      'CAPABILITY_DISABLED_FOR_COMMAND',
      { platformId, capabilityId, commandId },
    );
  }

  return {
    ok: true,
    platformId,
    commandId,
    capabilityId,
  };
}

module.exports = Object.freeze({
  DEFAULT_AUTHORITY_PLATFORM_ID,
  evaluateCommandCapabilityAuthority,
});
