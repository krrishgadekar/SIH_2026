'use strict';

/**
 * requireAuth.js -- browser-session authentication (backend plan §A.6).
 *
 *   router.get('/x', requireAuth, requireRole('ophthalmologist'), handler)
 *
 * Reads the session JWT from the httpOnly cookie -- never from a header -- and
 * sets req.user = { userId, role }. On a state-changing method it also checks
 * the X-CSRF-Token header against the token bound inside the session (§A.2).
 *
 * Behaviour with AUTH_ENABLED=false (the default until the frontends ship a
 * login screen, §A.8): nothing is rejected, but a valid cookie is still read,
 * so a logged-in user is still attributed in the access log and on review
 * claims. That lets the frontend team build and test login end to end before
 * enforcement is switched on.
 *
 * Applied per route, not globally (§A.11): /auth/login and the PHC ingestion
 * routes must stay reachable without a browser session.
 */

const cfg = require('../services/authConfig');
const { verifySession, safeEqual } = require('../services/authTokens');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The verified session payload from the request's cookie, or null. */
function readSession(req) {
  return verifySession(req.cookies && req.cookies[cfg.SESSION_COOKIE]);
}

function requireAuth(req, res, next) {
  const session = readSession(req);
  if (session) req.user = { userId: session.userId, role: session.role };

  if (!cfg.AUTH_ENABLED) return next();

  if (!session) {
    return res.status(401).json({
      error: 'unauthenticated', message: 'Log in to continue.',
    });
  }

  if (!SAFE_METHODS.has(req.method) &&
      !safeEqual(req.get(cfg.CSRF_HEADER) || '', session.csrf)) {
    return res.status(403).json({
      error: 'csrf_invalid',
      message: 'Missing or invalid X-CSRF-Token header. Use the csrfToken from ' +
               'the login or /auth/me response.',
    });
  }

  return next();
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.readSession = readSession;
