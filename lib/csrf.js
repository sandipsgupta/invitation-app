// CSRF protection via the signed double-submit cookie pattern, applied to
// both the admin forms and the anonymous public RSVP form.
//
// This app is server-rendered (no SPA/fetch layer), so tokens are embedded
// as a hidden `_csrf` form field when a GET route renders a form, and read
// back from `req.body._csrf` on submit — not from a header.
//
// Guests never authenticate, so there is no real per-user session id to
// bind the token to. `getSessionIdentifier` returns a constant; the
// protection here still comes from the signed, same-origin cookie an
// attacker's page cannot read or forge, it just isn't additionally scoped
// per-session the way it would be for a logged-in SPA user.

const { doubleCsrf } = require('csrf-csrf');

function makeCsrf({ secret, isProduction }) {
  const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: () => 'family-rsvp',
    cookieName: isProduction ? '__Host-csrf-token' : 'csrf-token',
    cookieOptions: {
      sameSite: 'lax',
      secure: isProduction,
      httpOnly: true,
      path: '/'
    },
    getCsrfTokenFromRequest: (req) => req.body && req.body._csrf
  });

  function issueToken(req, res) {
    return generateCsrfToken(req, res);
  }

  return { csrfProtection: doubleCsrfProtection, issueToken, invalidCsrfTokenError };
}

module.exports = { makeCsrf };
