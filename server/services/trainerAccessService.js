/* Staff desk access is a founder decision.
 *
 * Trainers and relationship managers submit the same KYC onboarding. Submitting
 * KYC only creates a reviewable record: the staff member sees no student,
 * session, batch or payout data until the founder explicitly grants access.
 * The founder always has full access, including every enrolled class, because
 * the founder is the workspace administrator. */
const db = require('../db');

const KYC_STATUSES = ['submitted', 'corrected', 'approved'];
const ONBOARDABLE_ROLES = ['trainer', 'relationship_manager'];

async function evaluate(user) {
  if (!user) {
    return { granted: false, role: null, status: 'unauthenticated', kycSubmitted: false, founderGrant: false };
  }
  if (user.role === 'founder') {
    return { granted: true, role: 'founder', status: 'active', kycSubmitted: true, founderGrant: true };
  }
  if (ONBOARDABLE_ROLES.indexOf(user.role) === -1) {
    return { granted: true, role: user.role, status: user.status || 'active', kycSubmitted: true, founderGrant: true };
  }

  const stored = (await Promise.resolve(db.findUserById(user.id))) || user;
  const onboarding = await Promise.resolve(db.findTrainerOnboarding(user.id));
  const kycSubmitted = Boolean(onboarding && KYC_STATUSES.indexOf(onboarding.status) !== -1);
  const founderGrant = Boolean(stored.accessGrantedAt);
  const status = stored.status || 'pending';
  const granted = status === 'active' && founderGrant && kycSubmitted;
  const roleLabel = user.role === 'relationship_manager' ? 'Relationship manager' : 'Trainer';

  let reason = roleLabel + ' desk access is active.';
  if (!kycSubmitted) reason = 'Complete and submit your KYC details first.';
  else if (!founderGrant || status !== 'active') {
    reason = 'Your details are submitted. The founder must validate them and grant desk access.';
  }

  return {
    granted: granted,
    role: user.role,
    status: status,
    kycSubmitted: kycSubmitted,
    founderGrant: founderGrant,
    onboardingStatus: onboarding ? onboarding.status : null,
    reason: reason
  };
}

function lockedResponse(access) {
  return {
    error: 'TRAINER_ACCESS_PENDING',
    message: access.reason,
    access: access
  };
}

module.exports = {
  KYC_STATUSES: KYC_STATUSES,
  evaluate: evaluate,
  lockedResponse: lockedResponse
};
