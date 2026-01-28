const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('main process does not use executeJavaScript', async () => {
  const mainPath = path.resolve(__dirname, '..', '..', 'src', 'main.js');
  const content = await fs.readFile(mainPath, 'utf8');
  assert.equal(content.includes('executeJavaScript'), false);
});

test('main process blocks new windows and external navigation', async () => {
  const mainPath = path.resolve(__dirname, '..', '..', 'src', 'main.js');
  const content = await fs.readFile(mainPath, 'utf8');

  assert.match(content, /setWindowOpenHandler/);
  assert.match(content, /setWindowOpenHandler[\s\S]*?action:\s*['"]deny['"]/);

  assert.match(content, /will-navigate/);
  assert.match(content, /will-redirect/);
  assert.match(content, /will-navigate[\s\S]*?blockExternalNavigation/);
  assert.match(content, /will-redirect[\s\S]*?blockExternalNavigation/);

  assert.match(content, /startsWith\(['"]file:\/\/['"]\)/);
  assert.match(content, /function\s+blockExternalNavigation[\s\S]*?preventDefault\(\)/);
});

test('main process sets Content-Security-Policy headers for file:// main frames', async () => {
  const mainPath = path.resolve(__dirname, '..', '..', 'src', 'main.js');
  const content = await fs.readFile(mainPath, 'utf8');

  assert.match(content, /onHeadersReceived/);
  assert.match(content, /Content-Security-Policy/);
  assert.match(
    content,
    /default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'/
  );
  assert.match(content, /resourceType\s*===\s*['"]mainFrame['"]/);
  assert.match(content, /startsWith\(['"]file:\/\/['"]\)/);
});
