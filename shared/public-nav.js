/* Close the checkbox-driven mobile menu after any navigation link is used. */
(function () {
  'use strict';
  var toggle = document.getElementById('navToggle');
  if (!toggle) return;
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () { toggle.checked = false; });
  });
})();
