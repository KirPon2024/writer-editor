const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { joinPathSegmentsWithinRoot, resolveValidatedPath } = require('../core/io/path-boundary');
const {
  ATOMIC_RECEIPT_BACKUP_TARGET_ROLES,
  OBSERVER_IDS,
  SAVE_AUTHORITY_ROUTES,
  createAuthorityObservation,
  executeAtomicReceiptBackupGatewayCutover,
} = require('../core/legacy-strangler-v1.cjs');
const fileManager = require('./fileManager');

async function writeReceiptOrBackupThroughAtomicGateway({
  targetPath,
  content,
  targetRole,
  subjectDigest,
}) {
  const request = { targetRole, subjectDigest, content };
  const observeLegacy = async (identity) => createAuthorityObservation({
    observerId: OBSERVER_IDS.LEGACY,
    requestDigest: identity.identityDigest,
    route: SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1,
  });
  const observeGateway = async (identity) => createAuthorityObservation({
    observerId: OBSERVER_IDS.GATEWAY,
    requestDigest: identity.identityDigest,
    route: SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1,
  });
  return executeAtomicReceiptBackupGatewayCutover({
    request,
    observeLegacy,
    observeGateway,
    executeGateway: async ({ authorityIdentity }) => {
      const writeResult = await fileManager.writeFileAtomic(targetPath, content);
      return {
        ...writeResult,
        targetRole: authorityIdentity.targetRole,
        subjectDigest: authorityIdentity.subjectDigest,
        contentDigest: authorityIdentity.contentDigest,
        byteCount: authorityIdentity.byteCount,
      };
    },
  });
}

function getBackupsRoot(basePath) {
  if (basePath) {
    return joinPathSegmentsWithinRoot(resolveValidatedPath(basePath, { mode: 'any' }), ['backups'], { resolveSymlinks: false });
  }
  const documentsPath = fileManager.getDocumentsPath();
  return joinPathSegmentsWithinRoot(documentsPath, ['.backups'], { resolveSymlinks: false });
}

async function ensureBackupsFolder(fileId, basePath) {
  const root = getBackupsRoot(basePath);
  const backupsPath = joinPathSegmentsWithinRoot(root, [fileId], { resolveSymlinks: false });
  await fs.mkdir(backupsPath, { recursive: true });
  return backupsPath;
}

async function createBackup(filePath, content, options = {}) {
  try {
    const basePath = options && options.basePath ? options.basePath : null;
    const safeFilePath = resolveValidatedPath(filePath, { mode: 'any' });
    const fileId = crypto.createHash('sha256').update(safeFilePath).digest('hex');
    const backupsPath = await ensureBackupsFolder(fileId, basePath);
    await writeMetaFile(backupsPath, safeFilePath, fileId);

    const fileName = path.basename(safeFilePath);
    const timestamp = Date.now();
    const backupFileName = `${timestamp}_${fileName}`;
    const backupPath = joinPathSegmentsWithinRoot(backupsPath, [backupFileName], { resolveSymlinks: false });
    const writeResult = await writeReceiptOrBackupThroughAtomicGateway({
      targetPath: backupPath,
      content,
      targetRole: ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.GENERIC_BACKUP_CONTENT,
      subjectDigest: fileId,
    });
    if (!writeResult.success) {
      return writeResult;
    }

    await cleanupOldBackups(backupsPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function cleanupOldBackups(backupsPath) {
  try {
    const files = await fs.readdir(backupsPath);
    const backupFiles = files.filter((file) => file !== 'meta.json');

    if (backupFiles.length > 50) {
      backupFiles.sort();
      const toDelete = backupFiles.slice(0, backupFiles.length - 50);
      for (const file of toDelete) {
        await fs.unlink(joinPathSegmentsWithinRoot(backupsPath, [file], { resolveSymlinks: false }));
      }
    }
  } catch (error) {
    // Тихая обработка ошибок
  }
}

async function writeMetaFile(backupsPath, filePath, subjectDigest) {
  try {
    const metaPath = joinPathSegmentsWithinRoot(backupsPath, ['meta.json'], { resolveSymlinks: false });
    const meta = {
      originalPath: filePath,
      baseName: path.basename(filePath)
    };
    await writeReceiptOrBackupThroughAtomicGateway({
      targetPath: metaPath,
      content: JSON.stringify(meta, null, 2),
      targetRole: ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.GENERIC_BACKUP_METADATA,
      subjectDigest,
    });
  } catch {
    // Игнорируем сбои записи meta
  }
}

module.exports = {
  ATOMIC_RECEIPT_BACKUP_TARGET_ROLES,
  getBackupsRoot,
  ensureBackupsFolder,
  createBackup,
  writeReceiptOrBackupThroughAtomicGateway,
};
