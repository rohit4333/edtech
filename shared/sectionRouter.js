/* Dashboard section router.
   Each rail item is a real page URL. The server serves the desk document for
   that URL, and this client shows only the matching section so navigation is a
   page change rather than an in-page scroll. */
(function () {
  'use strict';

  var ROUTES = {
    '/trainer/today': { desk: 'Trainer console', label: 'Today', view: 'today' },
    '/trainer/sessions': { desk: 'Trainer console', label: 'Sessions', view: 'sessions' },
    '/trainer/leave': { desk: 'Trainer console', label: 'Leave', view: 'leave' },
    '/trainer/students': { desk: 'Trainer console', label: 'Students', view: 'students' },
    '/trainer/insights': { desk: 'Trainer console', label: 'Insights', view: 'insights' },

    '/student/home': { desk: 'Student desk', label: 'Home', id: 'overview' },
    '/student/recordings': { desk: 'Student desk', label: 'Recordings', id: 'recordings' },
    '/student/mastery': { desk: 'Student desk', label: 'Mastery', id: 'mastery-practice' },
    '/student/reports': { desk: 'Student desk', label: 'Reports', id: 'trophies' },
    '/student/schedule': { desk: 'Student desk', label: 'Schedule', id: 'schedule' },

    '/founder/overview': { desk: 'Founder settings', label: 'Overview', id: 'overview' },
    '/founder/policy': { desk: 'Founder settings', label: 'Class policy', id: 'policy' },
    '/founder/mastery': { desk: 'Founder settings', label: 'Mastery', id: 'mastery' },
    '/founder/trainer-policy': { desk: 'Founder settings', label: 'Trainer policy', id: 'trainer-policy' },
    '/founder/money': { desk: 'Founder settings', label: 'Money', id: 'money-readonly' },
    '/founder/announcements': { desk: 'Founder settings', label: 'Announcements', id: 'announcements' },
    '/founder/trainer-admin': { desk: 'Founder administration', label: 'Trainer administration', id: 'trainer-admin' },
    '/founder/student-admin': { desk: 'Founder administration', label: 'Student administration', id: 'student-admin' },
    '/founder/audit': { desk: 'Founder administration', label: 'Manager activity', id: 'audit-log' },

    /* The separate founder admin app keeps the same sections under its own
       gated entry path so it never shares a bundle with the unified desk. */
    '/founder-admin/overview': { desk: 'Founder admin', label: 'Overview', id: 'overview' },
    '/founder-admin/policy': { desk: 'Founder admin', label: 'Class policy', id: 'policy' },
    '/founder-admin/mastery': { desk: 'Founder admin', label: 'Mastery', id: 'mastery' },
    '/founder-admin/trainer-policy': { desk: 'Founder admin', label: 'Trainer policy', id: 'trainer-policy' },
    '/founder-admin/money': { desk: 'Founder admin', label: 'Money', id: 'money-readonly' },
    '/founder-admin/announcements': { desk: 'Founder admin', label: 'Announcements', id: 'announcements' },
    '/founder-admin/trainer-admin': { desk: 'Founder admin', label: 'Trainer administration', id: 'trainer-admin' },
    '/founder-admin/student-admin': { desk: 'Founder admin', label: 'Student administration', id: 'student-admin' },
    '/founder-admin/audit': { desk: 'Founder admin', label: 'Manager activity', id: 'audit-log' },

    '/rm/dashboard': { desk: 'Relationship manager', label: 'Dashboard', id: 'dashboard' },
    '/rm/trainers': { desk: 'Relationship manager', label: 'Trainers', id: 'rm-trainers' },
    '/rm/students': { desk: 'Relationship manager', label: 'Students', id: 'rm-students' },
    '/rm/penalties': { desk: 'Relationship manager', label: 'Penalties', id: 'rm-penalties' },
    '/rm/classes': { desk: 'Relationship manager', label: 'Classes', id: 'rm-classes' },

    '/parent/inbox': { desk: 'Parent inbox', label: 'Inbox', id: 'inbox' },
    '/parent/child': { desk: 'Parent inbox', label: 'My child', id: 'child' },
    '/parent/sessions': { desk: 'Parent inbox', label: '1-on-1 sessions', id: 'sessions' },
    '/parent/guidance': { desk: 'Parent inbox', label: 'Chat rules', id: 'guidance' },
    '/parent/policies': { desk: 'Parent inbox', label: 'Policies', id: 'policies' }
  };

  function setVisible(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    if (visible) node.style.removeProperty('display');
    else node.style.setProperty('display', 'none', 'important');
  }

  function topLevelChild(target, main) {
    var node = target;
    while (node && node.parentNode && node.parentNode !== main) node = node.parentNode;
    return node && node.parentNode === main ? node : target;
  }

  function apply() {
    var path = window.location.pathname.replace(/\/$/, '');
    var route = ROUTES[path];
    if (!route) return;

    document.body.setAttribute('data-section-route', path);
    document.title = 'Mathify — ' + route.desk + ' · ' + route.label;

    Array.prototype.forEach.call(document.querySelectorAll('.nav a[data-nav]'), function (link) {
      var active = link.getAttribute('href') === path;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    var main = document.getElementById('main');
    if (!main) return;

    if (route.view) {
      Array.prototype.forEach.call(main.querySelectorAll('[data-view]'), function (node) {
        var visible = node.getAttribute('data-view') === route.view;
        setVisible(node, visible);
        node.classList.toggle('is-active', visible);
      });
    } else {
      var target = document.getElementById(route.id);
      if (!target) return;
      var top = topLevelChild(target, main);
      Array.prototype.forEach.call(main.children, function (child) {
        setVisible(child, child === top);
      });
      if (target !== top && top) {
        Array.prototype.forEach.call(top.children, function (child) {
          var keep = child === target || /^(H1|H2|H3|H4|P|SPAN|HEADER)$/.test(child.tagName);
          setVisible(child, keep);
        });
        setVisible(target, true);
      }
      setVisible(top, true);
    }

    if (window.scrollTo) window.scrollTo(0, 0);
  }

  window.MATHIFY_SECTION_ROUTER = { apply: apply, routes: ROUTES };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
}());
