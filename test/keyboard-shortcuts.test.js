import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const REQUIRED_ROLES = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'];

test('menu template exposes edit role-items', async () => {
  const mainPath = join(process.cwd(), 'src', 'main.js');
  const content = await readFile(mainPath, 'utf8');
  const missing = REQUIRED_ROLES.filter((role) => {
    const regex = new RegExp(`role\\s*:\\s*['"]${role}['"]`);
    return !regex.test(content);
  });

  assert.ok(
    missing.length === 0,
    `Missing edit menu roles: ${missing.join(', ')}. Keep undo/redo/cut/copy/paste/selectAll present.`
  );
});
