/* global document, MutationObserver */
/* Reference-only wiring for the Appearance radio group (design-system §5.5).
   Selecting an option changes application appearance only. The static
   references have no preference store, so nothing is persisted here.
   One source of truth: the effective setting is <html data-theme> (absent =
   System). Radios write it; the page's URL/hash renderer may also write it.
   Every radio group is re-synced from that attribute after either path, so
   the displayed selection always matches the rendered theme. */
(function () {
  var root = document.documentElement;
  function effective() {
    var t = root.dataset.theme;
    return t === 'light' || t === 'dark' ? t : 'system';
  }
  function sync() {
    var value = effective();
    document.querySelectorAll('.seg input[type="radio"]').forEach(function (i) {
      i.checked = i.value === value;
    });
  }
  document.addEventListener('change', function (e) {
    var input = e.target.closest && e.target.closest('.seg input[type="radio"]');
    if (!input) return;
    if (input.value === 'system') delete root.dataset.theme; else root.dataset.theme = input.value;
    sync();
  });
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('DOMContentLoaded', sync);
})();
