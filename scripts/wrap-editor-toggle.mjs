import fs from 'node:fs';

const file = 'src/renderer/editor.js';
const src = fs.readFileSync(file, 'utf8');

if (src.includes('[tiptap] enabled — legacy editor skipped') || src.startsWith('if (window.__USE_TIPTAP)')) {
  console.log('[wrap] already wrapped, skip');
  process.exit(0);
}

const head =
`if (window.__USE_TIPTAP) {
  console.log('[tiptap] enabled — legacy editor skipped');
  const el = document.getElementById("editor");
  if (el) {
    el.textContent = "";
    el.contentEditable = "true";
    el.style.whiteSpace = "pre-wrap";
    el.style.outline = "none";
    el.setAttribute("data-mode", "tiptap-stub");
    el.addEventListener("input", () => {
      window.__TIPTAP_STUB_TEXT = el.textContent || "";
    });
  }
} else {
  console.log('[legacy] enabled');
`;

const out = head + '\n' + src + '\n}\n';
fs.writeFileSync(file, out, 'utf8');
console.log('[wrap] done:', file);
