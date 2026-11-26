/* Founder-approved desk gate. A trainer or relationship manager may always
   finish onboarding and view the locked desk notice, but every student,
   session, batch, classroom and payout payload is refused until the founder
   grants access after KYC submission. */
const trainerAccess = require('../services/trainerAccessService');

module.exports = function requireTrainerAccess(options) {
  const settings = options || {};
  const roles = Array.isArray(settings.roles) ? settings.roles : ['trainer'];
  return function (req, res, next) {
    if (!req.user || roles.indexOf(req.user.role) === -1) return next();
    if (typeof settings.open === 'function' && settings.open(req.path)) return next();

    trainerAccess.evaluate(req.user).then(function (access) {
      req.trainerAccess = access;
      if (!access.granted) {
        return res.status(403).json(trainerAccess.lockedResponse(access));
      }
      return next();
    }).catch(next);
  };
};
