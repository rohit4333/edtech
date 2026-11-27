/* Shared IANA timezone picker used by account registration.
   The browser's ICU data is the authoritative list; the small embedded set is
   only a fallback for engines without Intl.supportedValuesOf. */
(function () {
  'use strict';

  var FALLBACK = [
    'Asia/Kolkata', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Doha', 'Asia/Kuwait',
    'Asia/Bahrain', 'Asia/Muscat', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
    'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Dhaka', 'Asia/Karachi',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York',
    'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney',
    'Africa/Johannesburg', 'Africa/Cairo', 'UTC'
  ];

  function local() {
    try {
      return (window.Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
    } catch (error) { return ''; }
  }

  function all() {
    var zones = [];
    try {
      if (window.Intl && typeof Intl.supportedValuesOf === 'function') {
        zones = Intl.supportedValuesOf('timeZone').slice();
      }
    } catch (error) { zones = []; }
    if (!zones.length) zones = FALLBACK.slice();
    if (zones.indexOf('UTC') === -1) zones.push('UTC');
    var own = local();
    if (own && zones.indexOf(own) === -1) zones.push(own);
    return zones.sort(function (left, right) { return left.localeCompare(right); });
  }

  function populate(select, preferred) {
    if (!select) return;
    var zones = all();
    var groupFor = function (zone) { return zone.indexOf('/') === -1 ? 'UTC' : zone.split('/')[0]; };
    var groups = {};
    zones.forEach(function (zone) {
      var label = groupFor(zone);
      if (!groups[label]) {
        var group = document.createElement('optgroup');
        group.label = label;
        select.appendChild(group);
        groups[label] = group;
      }
      var option = document.createElement('option');
      option.value = zone;
      option.textContent = zone;
      groups[label].appendChild(option);
    });
    var wanted = preferred || local() || 'Asia/Kolkata';
    if (wanted && !zones.some(function (zone) { return zone === wanted; })) {
      var option = document.createElement('option');
      option.value = wanted;
      option.textContent = wanted;
      select.appendChild(option);
    }
    select.value = wanted;
  }

  window.MathifyTimezones = { all: all, local: local, populate: populate };
}());
