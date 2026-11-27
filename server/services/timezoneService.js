/* IANA timezone handling for class times.
 *
 * A session stores one absolute UTC instant. Each recipient sees that instant
 * rendered in their own registered zone: the child's registration zone on the
 * student desk, the trainer's on the trainer desk, and the parent's on the
 * parent desk (falling back to the child's zone for a shared family login).
 * No browser-supplied zone is trusted for any other participant.
 */

const DEFAULT_ZONE = 'Asia/Kolkata';

function normalize(zone) {
  const value = String(zone || '').trim();
  if (!value || value.length > 64) return null;
  try {
    /* Validate with ICU, but keep the IANA label the account selected. Some
       ICU builds still report Asia/Calcutta for Asia/Kolkata; showing that
       alias back to a parent who chose India would be confusing. */
    return new Intl.DateTimeFormat('en-US', { timeZone: value })
      .resolvedOptions().timeZone ? value : null;
  } catch (error) {
    return null;
  }
}

/* Prefer the viewer's registration field, then the zone captured on the
   session from the child's registration, then the server default. */
function forUser(user, fallback) {
  const candidates = [
    user && user.timezone,
    fallback,
    DEFAULT_ZONE
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const zone = normalize(candidates[index]);
    if (zone) return zone;
  }
  return DEFAULT_ZONE;
}

function format(value, zone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const safeZone = forUser({ timezone: zone });
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: safeZone, weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).formatToParts(date);
    const map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    return {
      text: [map.weekday, map.day, map.month, map.hour + ':' + map.minute + ' ' + map.dayPeriod]
        .filter(Boolean).join(' ') + ' (' + safeZone + ')',
      zone: safeZone,
      iso: date.toISOString()
    };
  } catch (error) {
    return { text: date.toISOString(), zone: safeZone, iso: date.toISOString() };
  }
}

module.exports = { DEFAULT_ZONE, normalize, forUser, format };
