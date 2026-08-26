(() => {
  const qs = new URLSearchParams(window.location.search);
  // ?USE_TIPTAP=1  -> true
  window.__USE_TIPTAP = qs.get('USE_TIPTAP') === '1';
  window.__PRODUCT_PROFILE = qs.get('PRODUCT_PROFILE') === 'WRITER_LOCAL_V1'
    ? 'WRITER_LOCAL_V1'
    : '';

  const applyWriterLocalPresentationCut = () => {
    if (window.__PRODUCT_PROFILE !== 'WRITER_LOCAL_V1') return;
    document.body.dataset.productProfile = 'WRITER_LOCAL_V1';
    const selectors = [
      '[data-mode="plan"]',
      '[data-mode="review"]',
      '[data-right-tab="comments"]',
      '[data-right-tab="atlas"]',
      '[data-toolbar-item-key="review-comment"]',
      '[data-atlas-reachability-opener]',
    ];
    for (const element of document.querySelectorAll(selectors.join(','))) {
      element.hidden = true;
      element.disabled = true;
      element.tabIndex = -1;
      element.setAttribute('aria-hidden', 'true');
      element.style.setProperty('display', 'none', 'important');
    }
  };

  applyWriterLocalPresentationCut();
  document.addEventListener('DOMContentLoaded', applyWriterLocalPresentationCut, { once: true });
  console.log('[flags] __USE_TIPTAP =', window.__USE_TIPTAP);
})();
