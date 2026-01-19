const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

function hasDirectoryContent(directoryPath) {
  try {
    const stat = fsSync.statSync(directoryPath);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const entries = fsSync.readdirSync(directoryPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function copyDirectoryContents(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }

    if (fsSync.existsSync(destinationPath)) {
      continue;
    }

    await fs.copyFile(sourcePath, destinationPath);
  }
}

module.exports = {
  hasDirectoryContent,
  copyDirectoryContents
};
