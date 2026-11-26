/* Trainer-issued reward badges. The catalog is fixed policy: the trainer can
   choose a badge, but cannot write its label, point value or a note. Only safe
   trophy fields are serialized to the student dashboard and event stream. */

const appPolicy = require('../config/policy.json');

const FALLBACK = [
  { id: 'focus_star', label: 'Focus Star', points: 10, icon: 'star' },
  { id: 'sharp_thinking', label: 'Sharp Thinking', points: 20, icon: 'spark' },
  { id: 'steady_progress', label: 'Steady Progress', points: 15, icon: 'step' },
  { id: 'kind_partner', label: 'Kind Partner', points: 10, icon: 'heart' },
  { id: 'concept_master', label: 'Concept Master', points: 25, icon: 'trophy' }
];

function catalog() {
  const source = Array.isArray(appPolicy.badges) && appPolicy.badges.length ? appPolicy.badges : FALLBACK;
  return source.filter(function (item) {
    return item && typeof item.id === 'string' && typeof item.label === 'string' &&
      Number.isFinite(Number(item.points));
  }).map(function (item) {
    return {
      id: item.id,
      label: String(item.label).slice(0, 80),
      points: Math.max(1, Math.min(100, Math.round(Number(item.points)))),
      icon: typeof item.icon === 'string' ? item.icon : 'trophy'
    };
  });
}

function find(badgeId) {
  const id = String(badgeId || '');
  return catalog().find(function (item) { return item.id === id; }) || null;
}

function award(badgeId, sessionId, trainerId) {
  const item = find(badgeId);
  if (!item) return null;
  return {
    id: 'badge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    badgeId: item.id,
    label: item.label,
    points: item.points,
    icon: item.icon,
    sessionId: sessionId || null,
    awardedBy: trainerId || null,
    awardedAt: new Date().toISOString()
  };
}

/* Student-safe trophy view. No trainer id, no notes, no hidden policy. */
function forStudent(user) {
  const source = user && Array.isArray(user.badges) ? user.badges : [];
  return source.map(function (item) {
    return {
      id: String(item.id || item.badgeId || 'badge'),
      badgeId: String(item.badgeId || item.id || 'badge'),
      label: String(item.label || 'Badge').slice(0, 80),
      points: Math.max(0, Number(item.points) || 0),
      icon: typeof item.icon === 'string' ? item.icon : 'trophy',
      awardedAt: typeof item.awardedAt === 'string' ? item.awardedAt : null
    };
  });
}

function pointsFor(user) {
  return forStudent(user).reduce(function (total, item) { return total + item.points; }, 0);
}

function eventPayload(record) {
  return {
    badgeId: record.badgeId,
    label: record.label,
    points: record.points,
    awardedAt: record.awardedAt
  };
}

module.exports = { catalog, find, award, forStudent, pointsFor, eventPayload };
