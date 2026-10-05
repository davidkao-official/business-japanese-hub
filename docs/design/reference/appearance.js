/* global document */
/* Reference-only wiring for the Appearance radio group (design-system §5.5).
   Selecting an option changes application appearance only. The static
   references have no preference store, so nothing is persisted here. */
(function () {
  function sync(value) {
    document.querySelectorAll('.seg input[value="' + value + '"]').forEach(function (i) { i.checked = true; });
  }
  document.addEventListener('change', function (e) {
    var input = e.target.closest && e.target.closest('.seg input[type="radio"]');
    if (!input) return;
    var root = document.documentElement;
    if (input.value === 'system') delete root.dataset.theme; else root.dataset.theme = input.value;
    sync(input.value);
  });
  document.addEventListener('DOMContentLoaded', function () {
    var t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') sync(t);
  });
})();
