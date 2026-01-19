const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function listTestFiles(testDir) {
  const entries = fs.readdirSync(testDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.test.js')) continue;
    files.push(path.join(testDir, entry.name));
  }

  files.sort();
  return files;
}

const rootDir = path.resolve(__dirname, '..');
const testDir = path.join(rootDir, 'test');
const testFiles = fs.existsSync(testDir) ? listTestFiles(testDir) : [];

if (testFiles.length === 0) {
  console.error('No test files found in ./test (expected *.test.js).');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  process.exitCode = result.status ?? 1;
}

