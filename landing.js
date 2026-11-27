/* Mathify landing-only interactions. The shared two-step booking card and its
   complete submit flow live in shared/demo-booking.js so the home page and the
   contact page run the exact same working frame. */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if ('IntersectionObserver' in window && !reduceMotion) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (node) { observer.observe(node); });
  } else {
    reveals.forEach(function (node) { node.classList.add('is-visible'); });
  }
})();
