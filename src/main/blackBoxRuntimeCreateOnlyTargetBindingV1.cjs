'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BLACK_BOX_RUNTIME_CREATE_ONLY_TARGET_BINDING_V1_ENV = Object.freeze({
  allowedRoot: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_TARGET_ALLOWED_ROOT_V1',
  targetDir: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_TARGET_DIR_V1',
});

const TARGET_SCHEMA = 'yalken.blackBoxDarwinDurablePublisher.target.v1';
const TARGET_NOT_CONFIGURED_CODE = 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_PORT_NOT_CONFIGURED';
const TARGET_REJECTED_CODE = 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED';
const SAFE_SEGMENT_PATTERN = /[^A-Za-z0-9._-]+/gu;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deny(code, reason, details = {}) {
  return deepFreeze({
    ok: false,
    code,
    reason,
    ...details,
  });
}

function readEnvPath(env, key) {
  const raw = typeof env?.[key] === 'string' ? env[key].trim() : '';
  if (!raw || /[\u0000-\u001F]/u.test(raw)) return '';
  return raw;
}

function isInsidePath(parentPath, childPath, pathModule = path) {
  const parent = pathModule.resolve(parentPath);
  const child = pathModule.resolve(childPath);
  const relative = pathModule.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !pathModule.isAbsolute(relative));
}

function realDirectory(rawPath, fsImpl = fs, pathModule = path) {
  if (typeof rawPath !== 'string' || !pathModule.isAbsolute(rawPath)) return '';
  const resolved = pathModule.resolve(rawPath);
  try {
    const lstat = fsImpl.lstatSync(resolved);
    if (!lstat.isDirectory() || lstat.isSymbolicLink()) return '';
    const real = fsImpl.realpathSync(resolved);
    const stat = fsImpl.statSync(real);
    if (!stat.isDirectory()) return '';
    return real;
  } catch {
    return '';
  }
}

function safeRequestSegment(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const sanitized = raw
    .replace(SAFE_SEGMENT_PATTERN, '-')
    .replace(/[-_.]{2,}/gu, '-')
    .replace(/^[-_.]+|[-_.]+$/gu, '');
  return sanitized.slice(0, 72) || 'request';
}

function contextDigest(context) {
  return crypto.createHash('sha256')
    .update(Buffer.from(stableJson({
      requestId: typeof context?.requestId === 'string' ? context.requestId : '',
      sourceSetDigest: typeof context?.sourceSetDigest === 'string' ? context.sourceSetDigest : '',
      recipientFingerprint: typeof context?.recipientFingerprint === 'string' ? context.recipientFingerprint : '',
      defaultFileName: typeof context?.defaultFileName === 'string' ? context.defaultFileName : '',
    }), 'utf8'))
    .digest('hex')
    .slice(0, 12);
}

function createFileName(context) {
  const segment = safeRequestSegment(context?.requestId);
  return `manual-core-${segment}-${contextDigest(context)}.yalken-capsule`;
}

function createBlackBoxRuntimeCreateOnlyTargetBindingV1(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fsImpl || fs;
  const pathModule = options.pathModule || path;
  const platform = typeof options.platform === 'string' ? options.platform : process.platform;
  const projectRoot = options.projectRoot;

  function selectCreateOnlyTarget(context = {}) {
    const allowedRaw = readEnvPath(env, BLACK_BOX_RUNTIME_CREATE_ONLY_TARGET_BINDING_V1_ENV.allowedRoot);
    const targetRaw = readEnvPath(env, BLACK_BOX_RUNTIME_CREATE_ONLY_TARGET_BINDING_V1_ENV.targetDir);
    if (!allowedRaw || !targetRaw) {
      return deny(TARGET_NOT_CONFIGURED_CODE, 'BLACK_BOX_PRODUCT_COMMAND_TARGET_PORT_NOT_CONFIGURED');
    }

    if (platform !== 'darwin') {
      return deny(TARGET_REJECTED_CODE, 'BLACK_BOX_PRODUCT_COMMAND_TARGET_PLATFORM_UNSUPPORTED', { platform });
    }

    const allowedRoot = realDirectory(allowedRaw, fsImpl, pathModule);
    const targetDir = realDirectory(targetRaw, fsImpl, pathModule);
    if (!allowedRoot || !targetDir || !isInsidePath(allowedRoot, targetDir, pathModule)) {
      return deny(TARGET_REJECTED_CODE, 'BLACK_BOX_PRODUCT_COMMAND_TARGET_OUTSIDE_ALLOWED_ROOT');
    }

    const projectRealPath = realDirectory(projectRoot, fsImpl, pathModule);
    if (projectRealPath && isInsidePath(projectRealPath, targetDir, pathModule)) {
      return deny(TARGET_REJECTED_CODE, 'BLACK_BOX_PRODUCT_COMMAND_TARGET_INSIDE_PROJECT_ROOT');
    }

    const fileName = createFileName(context);
    const targetPath = pathModule.join(targetDir, fileName);
    if (pathModule.dirname(targetPath) !== targetDir) {
      return deny(TARGET_REJECTED_CODE, 'BLACK_BOX_PRODUCT_COMMAND_TARGET_FILE_NAME_REJECTED');
    }

    try {
      const existing = fsImpl.lstatSync(targetPath);
      if (existing) {
        return deny(TARGET_REJECTED_CODE, existing.isSymbolicLink()
          ? 'BLACK_BOX_PRODUCT_COMMAND_TARGET_SYMLINK_REJECTED'
          : 'BLACK_BOX_PRODUCT_COMMAND_TARGET_EXISTS');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        return deny(TARGET_REJECTED_CODE, 'BLACK_BOX_PRODUCT_COMMAND_TARGET_STAT_FAILED', { statCode: error?.code || 'UNKNOWN' });
      }
    }

    return deepFreeze({
      schemaVersion: TARGET_SCHEMA,
      platform: 'darwin',
      directoryPath: targetDir,
      fileName,
    });
  }

  return deepFreeze({ selectCreateOnlyTarget });
}

module.exports = {
  BLACK_BOX_RUNTIME_CREATE_ONLY_TARGET_BINDING_V1_ENV,
  createBlackBoxRuntimeCreateOnlyTargetBindingV1,
};
