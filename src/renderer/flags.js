(() => {
  const qs = new URLSearchParams(window.location.search);
  // ?USE_TIPTAP=1  -> true
  window.__USE_TIPTAP = qs.get('USE_TIPTAP') === '1';
  console.log('[flags] __USE_TIPTAP =', window.__USE_TIPTAP);
})();
