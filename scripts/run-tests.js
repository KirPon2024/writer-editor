const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function listTestFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      listTestFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(fullPath);
    }
  }

  return out;
}

const rootDir = path.resolve(__dirname, '..');
const mode = process.argv[2] === 'electron' ? 'electron' : 'unit';
const testDir = path.join(rootDir, 'test', mode);
const testFiles = fs.existsSync(testDir) ? listTestFiles(testDir).sort() : [];

if (testFiles.length === 0) {
  console.error(`No test files found in ./test/${mode} (expected **/*.test.js).`);
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  process.exitCode = result.status ?? 1;
}
